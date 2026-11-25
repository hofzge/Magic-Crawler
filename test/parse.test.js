import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecklist, cardKey, toText } from '../src/parse.js';

test('MTGO/Goldfish: Leerzeile trennt Sideboard', () => {
  const cards = parseDecklist('4 Lightning Bolt\r\n20 Mountain\r\n\r\n2 Smash to Smithereens\r\n');
  assert.deepEqual(cards, [
    { name: 'Lightning Bolt', qty: 4, board: 'main' },
    { name: 'Mountain', qty: 20, board: 'main' },
    { name: 'Smash to Smithereens', qty: 2, board: 'side' },
  ]);
});

test('MTGA-Format mit Headern, Set-Codes, 4x und SB:', () => {
  const cards = parseDecklist(`Commander\n1 Atraxa, Praetors' Voice (ONE) 196\n\nDeck\n1 Sol Ring (C21) 263\n4x Island\n\n1 Swamp *F*\nSideboard\n2 Duress [M21]\nSB: 1 Negate`);
  assert.deepEqual(cards.map((c) => [c.board, c.qty, c.name]), [
    ['commander', 1, "Atraxa, Praetors' Voice"],
    ['main', 1, 'Sol Ring'],
    ['main', 4, 'Island'],
    ['main', 1, 'Swamp'],
    ['side', 2, 'Duress'],
    ['side', 1, 'Negate'],
  ]);
});

test('Doppelte Zeilen werden addiert', () => {
  assert.equal(parseDecklist('2 Island\n2 island')[0].qty, 4);
});

test('cardKey vereinheitlicht DFC/Split und Akzente', () => {
  assert.equal(cardKey('Delver of Secrets // Insectile Aberration'), 'delver of secrets');
  assert.equal(cardKey('Fire/Ice'), cardKey('Fire // Ice'));
  assert.equal(cardKey('Lim-Dûl’s Vault'), "lim-dul's vault");
});

test('toText ist wieder parsebar', () => {
  const deck = { cards: parseDecklist('4 Bolt\n\n2 Duress') };
  assert.deepEqual(parseDecklist(toText(deck)), deck.cards);
});
