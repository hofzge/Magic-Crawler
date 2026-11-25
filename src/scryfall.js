// Kartendaten + Bild-URLs von Scryfall, mit lokalem Cache.
import path from 'node:path';
import { JsonFile } from './store.js';
import { cardKey } from './parse.js';
import { getJson, postJson, HttpError } from './http.js';

const API = 'https://api.scryfall.com';
const CACHE_DAYS = 30;

/** Reduziert ein Scryfall-Kartenobjekt auf das, was wir brauchen. */
export function simplifyCard(card) {
  const faces = card.card_faces ?? [];
  const img = (o) => o?.image_uris ?? null;
  const front = img(card) ?? img(faces[0]);
  const back = img(card) ? null : img(faces[1]);
  return {
    name: card.name,
    typeLine: card.type_line ?? faces.map((f) => f.type_line).join(' // '),
    manaCost: card.mana_cost ?? faces[0]?.mana_cost ?? '',
    cmc: card.cmc ?? 0,
    colors: card.colors ?? faces[0]?.colors ?? [],
    image: front?.normal ?? null,
    imageSmall: front?.small ?? null,
    imageBack: back?.normal ?? null,
    scryfallUri: card.scryfall_uri,
    priceEur: card.prices?.eur ?? null,
    priceUsd: card.prices?.usd ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

export class CardResolver {
  constructor(dir) {
    this.cache = new JsonFile(path.join(dir, 'cards.json'), {});
  }

  fresh(entry) {
    if (!entry) return false;
    const ageDays = (Date.now() - Date.parse(entry.fetchedAt)) / 864e5;
    return entry.notFound ? ageDays < 1 : ageDays < CACHE_DAYS;
  }

  /** Liefert { key: kartendaten } für alle Namen; lädt Fehlendes nach. */
  async resolve(names) {
    const cache = this.cache.load();
    const keys = new Map();
    for (const n of names) keys.set(cardKey(n), n);
    const missing = [...keys].filter(([k]) => !this.fresh(cache[k]));

    if (missing.length) {
      try {
        await this.fetchMissing(missing, cache);
      } catch (err) {
        console.warn(`[scryfall] ${err.message}`);
      }
      this.cache.save();
    }
    const out = {};
    for (const [k] of keys) if (cache[k] && !cache[k].notFound) out[k] = cache[k];
    return out;
  }

  async fetchMissing(missing, cache) {
    const notFound = [];
    for (let i = 0; i < missing.length; i += 75) {
      const chunk = missing.slice(i, i + 75);
      const res = await postJson(`${API}/cards/collection`, {
        identifiers: chunk.map(([, name]) => ({ name: name.split(/\s*\/\/\s*/)[0] })),
      });
      for (const card of res.data ?? []) {
        const simple = simplifyCard(card);
        cache[cardKey(card.name)] = simple;
        // Auch unter dem angefragten Namen ablegen (z. B. Rückseiten-/Alternativnamen)
        for (const [k, n] of chunk) if (cardKey(n) === cardKey(card.name)) cache[k] = simple;
      }
      for (const nf of res.not_found ?? []) {
        const hit = chunk.find(([k]) => k === cardKey(nf.name));
        if (hit) notFound.push(hit);
      }
    }
    // Fallback: unscharfe Suche pro Karte
    for (const [k, name] of notFound) {
      try {
        cache[k] = simplifyCard(await getJson(`${API}/cards/named?fuzzy=${encodeURIComponent(name)}`));
      } catch (err) {
        if (!(err instanceof HttpError && err.status === 404)) throw err;
        cache[k] = { notFound: true, fetchedAt: new Date().toISOString() };
      }
    }
  }
}
