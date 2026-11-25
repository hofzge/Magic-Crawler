// Gemeinsame Logik für CLI und Webserver.
import { DeckStore } from './store.js';
import { CardResolver } from './scryfall.js';
import { findSimilar, diffDecks } from './compare.js';
import { cardKey } from './parse.js';
import * as sources from './sources/index.js';

export function summary(deck) {
  const count = (b) => deck.cards.filter((c) => b.includes(c.board)).reduce((s, c) => s + c.qty, 0);
  const { cards, ...rest } = deck;
  return { ...rest, mainCount: count(['main', 'commander']), sideCount: count(['side']) };
}

export class DeckApp {
  constructor(dataDir) {
    this.store = new DeckStore(dataDir);
    this.cards = new CardResolver(dataDir);
  }

  listDecks({ q, format } = {}) {
    const needle = q?.toLowerCase();
    return this.store.all()
      .filter((d) => !format || d.format === format)
      .filter((d) => !needle || [d.name, d.author, d.archetype, d.format, d.source]
        .some((v) => v?.toLowerCase().includes(needle)) ||
        d.cards.some((c) => c.name.toLowerCase().includes(needle)))
      .map(summary)
      .sort((a, b) => b.crawledAt.localeCompare(a.crawledAt));
  }

  getDeck(id) {
    const deck = this.store.get(id);
    if (!deck) throw Object.assign(new Error(`Deck ${id} nicht gefunden`), { status: 404 });
    return deck;
  }

  /** Deck inkl. Scryfall-Daten (Bild, Typ, Manakosten) pro Karte. */
  async getDeckWithCards(id) {
    const deck = this.getDeck(id);
    const info = await this.cards.resolve(deck.cards.map((c) => c.name));
    return { ...deck, cards: deck.cards.map((c) => ({ ...c, info: info[cardKey(c.name)] ?? null })) };
  }

  async crawl(source, opts) {
    const decks = await sources.crawl(source, opts);
    return decks.map((d) => summary(this.store.upsert(d)));
  }

  async importUrl(url) {
    const decks = await sources.importUrl(url);
    return decks.map((d) => summary(this.store.upsert(d)));
  }

  importText(text, meta) {
    return summary(this.store.upsert(sources.importText(text, meta)));
  }

  similar(id, opts) {
    const deck = this.getDeck(id);
    return findSimilar(deck, this.store.all(), opts).map((r) => ({ score: r.score, deck: summary(r.deck) }));
  }

  /** Diff inkl. Kartendaten für die Anzeige. */
  async diff(idA, idB, { withCards = true } = {}) {
    const a = this.getDeck(idA);
    const b = this.getDeck(idB);
    const diff = diffDecks(a, b);
    let cards = {};
    if (withCards) {
      cards = await this.cards.resolve([...a.cards, ...b.cards].map((c) => c.name));
    }
    return { a: summary(a), b: summary(b), ...diff, cards };
  }

  remove(id) {
    return this.store.remove(id);
  }
}
