// Einfache JSON-Datei-Persistenz für Decks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class JsonFile {
  constructor(file, fallback) {
    this.file = file;
    this.fallback = fallback;
    this.data = undefined;
  }
  load() {
    if (this.data !== undefined) return this.data;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.data = structuredClone(this.fallback);
    }
    return this.data;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
}

export class DeckStore {
  constructor(dir) {
    this.db = new JsonFile(path.join(dir, 'decks.json'), { decks: [] });
  }
  all() {
    return this.db.load().decks;
  }
  get(id) {
    return this.all().find((d) => d.id === id);
  }
  /** Fügt ein Deck hinzu oder aktualisiert es (Duplikat = gleiche Quelle + sourceId). */
  upsert(deck) {
    const decks = this.all();
    const idx = deck.sourceId
      ? decks.findIndex((d) => d.source === deck.source && d.sourceId === String(deck.sourceId))
      : -1;
    const stored = {
      ...deck,
      sourceId: deck.sourceId != null ? String(deck.sourceId) : undefined,
      id: idx >= 0 ? decks[idx].id : deck.id ?? crypto.randomUUID().slice(0, 8),
      crawledAt: new Date().toISOString(),
    };
    if (idx >= 0) decks[idx] = stored;
    else decks.push(stored);
    this.db.save();
    return stored;
  }
  remove(id) {
    const decks = this.all();
    const idx = decks.findIndex((d) => d.id === id);
    if (idx < 0) return false;
    decks.splice(idx, 1);
    this.db.save();
    return true;
  }
}
