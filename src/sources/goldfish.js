// MTGGoldfish: Metagame-Seiten crawlen (HTML) und Decks über den Text-Download laden.
import { getText } from '../http.js';
import { parseDecklist } from '../parse.js';

const BASE = 'https://www.mtggoldfish.com';
export const URL_RE = /mtggoldfish\.com\/(?:deck(?:\/download|\/arena_download)?|archetype)\/([\w-]+)/i;

const decodeEntities = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const unique = (xs) => [...new Set(xs)];

/** Archetyp-Links (/archetype/<slug>) aus einer Metagame-Seite. */
export function parseMetagame(html) {
  return unique([...html.matchAll(/href="\/archetype\/([\w-]+)(?:#\w+)?"/g)].map((m) => m[1]));
}

/** Deck-IDs aus einer Archetyp-, Turnier- oder Deckseite (bevorzugt Download-Links). */
export function parseDeckIds(html) {
  const dl = [...html.matchAll(/\/deck\/(?:download|arena_download)\/(\d+)/g)].map((m) => m[1]);
  const plain = [...html.matchAll(/href="\/deck\/(\d+)(?:#\w+)?"/g)].map((m) => m[1]);
  return unique([...dl, ...plain]);
}

export function parseTitle(html) {
  const t = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '';
  return decodeEntities(t).replace(/\s*[-|]\s*MTGGoldfish.*$/i, '')
    .replace(/\s+(?:Deck|Decklist)(?:\s+(?:for|by)\s+.+)?$/i, '')
    .trim();
}

/** Liest Spieler/Event aus einer Deckseite, falls vorhanden (optional). */
export function parseDeckMeta(html) {
  const author = html.match(/class=['"]author['"][^>]*>\s*(?:by\s*)?([^<]+)</i)?.[1]?.trim();
  const hidden = html.match(/name=["']deck_input\[deck\]["'][^>]*value=["']([^"']*)["']/i)?.[1];
  return { author: author ? decodeEntities(author) : null, listText: hidden ? decodeEntities(hidden) : null };
}

export async function fetchDeck(id, { name, format, archetype } = {}) {
  let cards = [];
  try {
    cards = parseDecklist(await getText(`${BASE}/deck/download/${id}`));
  } catch { /* Fallback unten */ }
  let title = name;
  let author = null;
  if (!cards.length) {
    // Fallback: Liste aus dem versteckten Formularfeld der Deckseite
    const html = await getText(`${BASE}/deck/${id}`);
    const meta = parseDeckMeta(html);
    cards = parseDecklist(meta.listText ?? '');
    title ||= parseTitle(html);
    author = meta.author;
    if (!cards.length) throw new Error(`Keine Decklist für MTGGoldfish-Deck ${id} gefunden (Seite evtl. durch Cloudflare geschützt – Archetyp-URL verwenden)`);
  }
  if (!title) {
    try {
      const html = await getText(`${BASE}/deck/${id}`);
      title = parseTitle(html);
      author = parseDeckMeta(html).author;
    } catch { /* Name ist optional */ }
  }
  return {
    source: 'mtggoldfish',
    sourceId: String(id),
    url: `${BASE}/deck/${id}`,
    name: title || `MTGGoldfish ${id}`,
    author,
    format: format ?? null,
    archetype: archetype ?? null,
    cards,
  };
}

/** Lädt das Beispieldeck eines Archetyps (Liste steht direkt auf der Archetyp-Seite). */
export async function fetchArchetype(slug, { format, perArchetype = 1 } = {}) {
  const html = await getText(`${BASE}/archetype/${slug}`);
  const archetype = parseTitle(html) || slug;
  const ids = parseDeckIds(html);
  const decks = [];
  const cards = parseDecklist(parseDeckMeta(html).listText ?? '');
  if (cards.length) {
    decks.push({
      source: 'mtggoldfish',
      sourceId: ids[0] ?? `archetype:${slug}`,
      url: ids[0] ? `${BASE}/deck/${ids[0]}` : `${BASE}/archetype/${slug}`,
      name: archetype,
      author: null,
      format: format ?? null,
      archetype,
      cards,
    });
  }
  // Weitere Listen liegen auf einzelnen Deckseiten (teils durch Cloudflare geschützt)
  for (const id of ids.slice(decks.length, perArchetype)) {
    try {
      decks.push(await fetchDeck(id, { name: archetype, format, archetype }));
    } catch { /* übersprungen */ }
  }
  if (!decks.length) throw new Error(`Keine Decklist auf der Archetyp-Seite ${slug} gefunden`);
  return decks;
}

/**
 * Crawlt die Metagame-Übersicht eines Formats (z. B. "modern", "pioneer", "standard")
 * und lädt pro Archetyp ein Deck.
 */
export async function crawl({ format = 'modern', query = '', limit = 10, perArchetype = 1, onProgress } = {}) {
  const fmt = format.toLowerCase();
  const html = await getText(`${BASE}/metagame/${fmt}/full`);
  let slugs = parseMetagame(html);
  if (query) slugs = slugs.filter((s) => s.includes(query.toLowerCase().replace(/\s+/g, '-')));
  slugs = slugs.slice(0, limit);
  const decks = [];
  for (const [i, slug] of slugs.entries()) {
    try {
      decks.push(...(await fetchArchetype(slug, { format: fmt, perArchetype })));
      onProgress?.(`MTGGoldfish ${i + 1}/${slugs.length}: ${slug}`);
    } catch (err) {
      onProgress?.(`MTGGoldfish ${slug} übersprungen: ${err.message}`);
    }
  }
  return decks;
}
