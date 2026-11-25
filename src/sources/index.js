// Einheitlicher Einstieg: Crawlen nach Quelle, Import per URL oder Text.
import * as archidekt from './archidekt.js';
import * as goldfish from './goldfish.js';
import * as moxfield from './moxfield.js';
import { getText } from '../http.js';
import { parseDecklist } from '../parse.js';

export const SOURCES = {
  archidekt: { label: 'Archidekt (Suche nach Name)', crawl: archidekt.crawl },
  mtggoldfish: { label: 'MTGGoldfish (Metagame eines Formats)', crawl: goldfish.crawl },
};

export async function crawl(source, opts) {
  const s = SOURCES[source];
  if (!s) throw new Error(`Unbekannte Quelle "${source}". Verfügbar: ${Object.keys(SOURCES).join(', ')}`);
  return s.crawl(opts);
}

/** Importiert ein einzelnes Deck (oder bei Archetyp-Links mehrere) über eine URL. */
export async function importUrl(url) {
  let m;
  if ((m = url.match(archidekt.URL_RE))) return [await archidekt.fetchDeck(m[1])];
  if ((m = url.match(moxfield.URL_RE))) return [await moxfield.fetchDeck(m[1])];
  if ((m = url.match(goldfish.URL_RE))) {
    if (/\/archetype\//.test(url)) return goldfish.fetchArchetype(m[1]);
    return [await goldfish.fetchDeck(m[1])];
  }
  // Generisch: URL liefert eine Textliste
  const text = await getText(url);
  const cards = parseDecklist(text);
  if (!cards.length) throw new Error('Unbekannte Seite und keine Decklist im Text gefunden.');
  return [{ source: 'url', sourceId: url, url, name: new URL(url).pathname.split('/').pop() || url, cards }];
}

export function importText(text, { name = 'Eigene Liste', format = null, author = null } = {}) {
  const cards = parseDecklist(text);
  if (!cards.length) throw new Error('Keine Karten erkannt. Format: "4 Lightning Bolt" pro Zeile.');
  return { source: 'text', name, format, author, cards };
}
