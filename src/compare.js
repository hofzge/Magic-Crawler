// Ähnlichkeit und Diff zwischen Decklisten.
import { cardKey } from './parse.js';

/** Zählt Karten eines Decks; "main" umfasst Maindeck + Commander. */
export function countMap(deck, group = 'main') {
  const boards = group === 'main' ? ['main', 'commander'] : [group];
  const map = new Map();
  for (const c of deck.cards) {
    if (!boards.includes(c.board)) continue;
    const key = cardKey(c.name);
    const prev = map.get(key);
    map.set(key, { name: prev?.name ?? c.name, qty: (prev?.qty ?? 0) + c.qty });
  }
  return map;
}

/** Gewichtete Jaccard-Ähnlichkeit: Σ min(a,b) / Σ max(a,b). */
export function weightedJaccard(a, b) {
  let min = 0, max = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key)?.qty ?? 0;
    const y = b.get(key)?.qty ?? 0;
    min += Math.min(x, y);
    max += Math.max(x, y);
  }
  return max === 0 ? 0 : min / max;
}

/** Ähnlichkeit 0..1; Sideboard fließt mit 15 % ein, wenn beide eins haben. */
export function similarity(deckA, deckB) {
  const main = weightedJaccard(countMap(deckA), countMap(deckB));
  const sa = countMap(deckA, 'side');
  const sb = countMap(deckB, 'side');
  if (!sa.size || !sb.size) return main;
  return 0.85 * main + 0.15 * weightedJaccard(sa, sb);
}

/** Findet die ähnlichsten Decks zu `deck` in `candidates`. */
export function findSimilar(deck, candidates, { limit = 10, minScore = 0.05, sameFormat = false } = {}) {
  return candidates
    .filter((d) => d.id !== deck.id && (!sameFormat || !deck.format || d.format === deck.format))
    .map((d) => ({ deck: d, score: similarity(deck, d) }))
    .filter((r) => r.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

function diffMaps(a, b) {
  const rows = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const ea = a.get(key);
    const eb = b.get(key);
    const qa = ea?.qty ?? 0;
    const qb = eb?.qty ?? 0;
    rows.push({ key, name: ea?.name ?? eb.name, a: qa, b: qb, delta: qb - qa });
  }
  const byName = (x, y) => x.name.localeCompare(y.name);
  return {
    onlyA: rows.filter((r) => r.b === 0).sort(byName),
    onlyB: rows.filter((r) => r.a === 0).sort(byName),
    changed: rows.filter((r) => r.a && r.b && r.a !== r.b).sort(byName),
    same: rows.filter((r) => r.a === r.b).sort(byName),
  };
}

/** Diff zweier Decks, getrennt nach Main (inkl. Commander) und Sideboard. */
export function diffDecks(deckA, deckB) {
  const main = diffMaps(countMap(deckA), countMap(deckB));
  const side = diffMaps(countMap(deckA, 'side'), countMap(deckB, 'side'));
  const changedCards = (d) =>
    d.onlyA.reduce((s, r) => s + r.a, 0) + d.onlyB.reduce((s, r) => s + r.b, 0) +
    d.changed.reduce((s, r) => s + Math.abs(r.delta), 0);
  return {
    similarity: similarity(deckA, deckB),
    main,
    side,
    stats: { mainChanges: changedCards(main), sideChanges: changedCards(side) },
  };
}
