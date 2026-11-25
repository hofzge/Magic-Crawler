// Moxfield: inoffizielle API (kann durch Cloudflare blockiert werden).
import { getJson } from '../http.js';
import { addCard } from '../parse.js';

export const URL_RE = /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i;

const BOARD_MAP = {
  mainboard: 'main', commanders: 'commander', companions: 'side',
  sideboard: 'side', maybeboard: 'maybe', signatureSpells: 'main',
};

export function parseDeck(json) {
  const cards = [];
  // v3: json.boards.<board>.cards.<id> = { quantity, card: { name } }
  // v2: json.<board>.<name> = { quantity, card: { name } }
  for (const [boardName, board] of Object.entries(BOARD_MAP)) {
    const entries = json.boards?.[boardName]?.cards ?? json[boardName] ?? {};
    for (const [key, e] of Object.entries(entries)) addCard(cards, e.card?.name ?? key, e.quantity, board);
  }
  return {
    source: 'moxfield',
    sourceId: json.publicId,
    url: json.publicUrl ?? `https://www.moxfield.com/decks/${json.publicId}`,
    name: json.name,
    author: json.createdByUser?.userName ?? json.authors?.[0]?.userName ?? null,
    format: json.format ?? null,
    cards,
  };
}

export async function fetchDeck(publicId) {
  return parseDeck(await getJson(`https://api2.moxfield.com/v3/decks/all/${publicId}`));
}
