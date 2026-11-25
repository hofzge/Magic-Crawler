import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as archidekt from '../src/sources/archidekt.js';
import * as moxfield from '../src/sources/moxfield.js';
import * as goldfish from '../src/sources/goldfish.js';
import { simplifyCard } from '../src/scryfall.js';

const fixture = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('Archidekt: Boards aus Kategorien', () => {
  const d = archidekt.parseDeck(JSON.parse(fixture('archidekt-deck.json')));
  assert.equal(d.format, 'commander');
  assert.equal(d.author, 'planeswalker');
  assert.deepEqual(d.cards.map((c) => [c.board, c.qty, c.name]), [
    ['commander', 1, "Atraxa, Praetors' Voice"],
    ['main', 1, 'Sol Ring'],
    ['main', 10, 'Forest'],
    ['maybe', 1, 'Doubling Season'],
    ['side', 1, 'Swords to Plowshares'],
  ]);
});

test('Moxfield v3', () => {
  const d = moxfield.parseDeck(JSON.parse(fixture('moxfield-deck.json')));
  assert.equal(d.sourceId, 'AbC123');
  assert.deepEqual(d.cards.map((c) => [c.board, c.qty, c.name]), [
    ['main', 4, 'Lightning Bolt'], ['main', 16, 'Mountain'], ['side', 2, 'Smash to Smithereens'],
  ]);
});

test('MTGGoldfish: Metagame- und Archetyp-Seiten', () => {
  assert.deepEqual(goldfish.parseMetagame(fixture('goldfish-metagame.html')), ['modern-boros-energy', 'modern-ruby-storm']);
  const html = fixture('goldfish-archetype.html');
  assert.deepEqual(goldfish.parseDeckIds(html), ['6812345', '6812001']);
  assert.equal(goldfish.parseTitle(html), 'Boros Energy');
  assert.equal(goldfish.parseDeckMeta(html).listText, '4 Ragavan, Nimble-Pilferer\n4 Guide of Souls');
});

test('URL-Erkennung', () => {
  assert.equal('https://archidekt.com/decks/123456/atraxa'.match(archidekt.URL_RE)[1], '123456');
  assert.equal('https://moxfield.com/decks/AbC-12_3'.match(moxfield.URL_RE)[1], 'AbC-12_3');
  assert.equal('https://www.mtggoldfish.com/deck/6812345#paper'.match(goldfish.URL_RE)[1], '6812345');
  assert.equal('https://www.mtggoldfish.com/archetype/modern-boros-energy#paper'.match(goldfish.URL_RE)[1], 'modern-boros-energy');
});

test('Scryfall: doppelseitige Karten', () => {
  const c = simplifyCard({
    name: 'Delver of Secrets // Insectile Aberration', cmc: 1, scryfall_uri: 'u',
    card_faces: [
      { type_line: 'Creature — Human Wizard', mana_cost: '{U}', image_uris: { normal: 'front.jpg', small: 'f-s.jpg' } },
      { type_line: 'Creature — Human Insect', image_uris: { normal: 'back.jpg' } },
    ],
  });
  assert.equal(c.image, 'front.jpg');
  assert.equal(c.imageBack, 'back.jpg');
  assert.equal(c.manaCost, '{U}');
});
