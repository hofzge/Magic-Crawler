// Archidekt: öffentliche JSON-API.
import { getJson } from '../http.js';
import { addCard } from '../parse.js';

const BASE = 'https://archidekt.com/api';

export const FORMATS = {
  1: 'standard', 2: 'modern', 3: 'commander', 4: 'legacy', 5: 'vintage', 6: 'pauper',
  7: 'custom', 8: 'frontier', 9: 'future', 10: 'penny', 11: 'duel', 12: 'oldschool',
  13: 'brawl', 14: 'oathbreaker', 15: 'pioneer', 16: 'historic', 17: 'paupercommander',
  18: 'alchemy', 19: 'explorer', 20: 'historicbrawl', 21: 'gladiator', 22: 'premodern',
  23: 'predh', 24: 'timeless', 25: 'canlander',
};
const FORMAT_IDS = Object.fromEntries(Object.entries(FORMATS).map(([id, n]) => [n, id]));
FORMAT_IDS.edh = FORMAT_IDS.commander;

export const URL_RE = /archidekt\.com\/(?:api\/)?decks\/(\d+)/i;

/** Wandelt die Archidekt-Deck-JSON in unser Deckmodell. */
export function parseDeck(json) {
  const categories = new Map((json.categories ?? []).map((c) => [c.name, c]));
  const cards = [];
  for (const entry of json.cards ?? []) {
    const name = entry.card?.oracleCard?.name ?? entry.card?.name;
    if (!name) continue;
    const cats = entry.categories ?? [];
    let board = 'main';
    if (cats.includes('Commander') || cats.some((c) => categories.get(c)?.isPremier)) board = 'commander';
    else if (cats.includes('Sideboard')) board = 'side';
    else if (cats.includes('Maybeboard') || cats.some((c) => categories.get(c)?.includedInDeck === false)) board = 'maybe';
    addCard(cards, name, entry.quantity, board);
  }
  return {
    source: 'archidekt',
    sourceId: String(json.id),
    url: `https://archidekt.com/decks/${json.id}`,
    name: json.name ?? `Archidekt ${json.id}`,
    author: json.owner?.username ?? null,
    format: FORMATS[json.deckFormat ?? json.format] ?? null,
    cards,
  };
}

export async function fetchDeck(id) {
  return parseDeck(await getJson(`${BASE}/decks/${id}/`));
}

/** Sucht Decks nach Name (und optional Format) und lädt sie vollständig. */
export async function crawl({ query = '', format, limit = 10, onProgress } = {}) {
  const params = new URLSearchParams({ orderBy: '-viewCount', pageSize: String(Math.min(limit, 50)) });
  if (query) params.set('name', query);
  if (format && FORMAT_IDS[format.toLowerCase()]) params.set('deckFormat', FORMAT_IDS[format.toLowerCase()]);
  const ids = [];
  let url = `${BASE}/decks/v3/?${params}`;
  while (url && ids.length < limit) {
    const page = await getJson(url);
    for (const d of page.results ?? []) if (ids.length < limit) ids.push(d.id);
    url = page.next;
  }
  const decks = [];
  for (const [i, id] of ids.entries()) {
    try {
      decks.push(await fetchDeck(id));
      onProgress?.(`Archidekt ${i + 1}/${ids.length}: ${decks.at(-1).name}`);
    } catch (err) {
      onProgress?.(`Archidekt ${id} übersprungen: ${err.message}`);
    }
  }
  return decks;
}
