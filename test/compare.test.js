import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecklist } from '../src/parse.js';
import { similarity, diffDecks, findSimilar } from '../src/compare.js';

const deck = (id, text, format = 'modern') => ({ id, format, cards: parseDecklist(text) });
const A = deck('a', '4 Lightning Bolt\n4 Goblin Guide\n12 Mountain\n\n2 Duress');
const B = deck('b', '4 Lightning Bolt\n2 Goblin Guide\n2 Monastery Swiftspear\n12 Mountain\n\n2 Duress');
const C = deck('c', '4 Counterspell\n16 Island');

test('Ähnlichkeit: identisch = 1, disjunkt = 0', () => {
  assert.equal(similarity(A, A), 1);
  assert.equal(similarity(A, C), 0);
  const s = similarity(A, B);
  // Main: min 18 / max 22, Side identisch
  assert.ok(Math.abs(s - (0.85 * 18 / 22 + 0.15)) < 1e-9);
});

test('Diff gruppiert korrekt', () => {
  const d = diffDecks(A, B);
  assert.deepEqual(d.main.onlyB.map((r) => [r.name, r.b]), [['Monastery Swiftspear', 2]]);
  assert.deepEqual(d.main.changed.map((r) => [r.name, r.a, r.b, r.delta]), [['Goblin Guide', 4, 2, -2]]);
  assert.equal(d.main.onlyA.length, 0);
  assert.deepEqual(d.main.same.map((r) => r.name), ['Lightning Bolt', 'Mountain']);
  assert.equal(d.stats.mainChanges, 4);
  assert.equal(d.stats.sideChanges, 0);
});

test('findSimilar sortiert und filtert', () => {
  const res = findSimilar(A, [A, B, C]);
  assert.deepEqual(res.map((r) => r.deck.id), ['b']);
});
