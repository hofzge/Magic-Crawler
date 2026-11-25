// Parser für Decklisten im Textformat (MTGO, MTGA, MTGGoldfish-Download, "4x Karte" ...).

export const BOARDS = ['commander', 'main', 'side', 'maybe'];

/** Vergleichsschlüssel: Vorderseite, Kleinbuchstaben, vereinheitlichte Leerzeichen/Apostrophe. */
export function cardKey(name) {
  return String(name)
    .split(/\s*\/\/?\s*/)[0]
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEADERS = [
  [/^(commander|commanders|befehlshaber)$/i, 'commander'],
  [/^(companion|gefährte)$/i, 'side'],
  [/^(deck|main|maindeck|mainboard|main deck)$/i, 'main'],
  [/^(sideboard|side|sb)$/i, 'side'],
  [/^(maybeboard|maybe|considering)$/i, 'maybe'],
];

/**
 * Parst eine Textliste in [{ name, qty, board }].
 * Leerzeile nach dem Maindeck = Beginn des Sideboards (MTGO/Goldfish-Konvention).
 */
export function parseDecklist(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const cards = [];
  let board = 'main';
  let seenMain = false;
  let explicitHeaders = false;

  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) {
      if (!line && seenMain && !explicitHeaders && board === 'main') board = 'side';
      continue;
    }
    if (line.startsWith('//')) line = line.slice(2).trim();

    const header = line.replace(/:$/, '').replace(/\s*\(\d+\)$/, '').trim();
    const hit = HEADERS.find(([re]) => re.test(header));
    if (hit) { board = hit[1]; explicitHeaders = true; continue; }

    let sb = false;
    if (/^SB:\s*/i.test(line)) { sb = true; line = line.replace(/^SB:\s*/i, ''); }

    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    if (!m) continue;
    let name = m[2]
      .replace(/\s+\*[^*]+\*$/, '')          // *F* Foil-Marker
      .replace(/\s+\([A-Z0-9]{2,6}\)(\s+\S+)?$/i, '') // (SET) 123
      .replace(/\s+\[[^\]]*\]$/, '')          // [SET]
      .trim();
    if (!name) continue;
    const target = sb ? 'side' : board;
    if (target === 'main') seenMain = true;
    addCard(cards, name, Number(m[1]), target);
  }
  return cards;
}

export function addCard(cards, name, qty, board = 'main') {
  if (!qty || qty < 1) return;
  const key = cardKey(name);
  const existing = cards.find((c) => c.board === board && cardKey(c.name) === key);
  if (existing) existing.qty += qty;
  else cards.push({ name, qty, board });
}

export function toText(deck) {
  const out = [];
  for (const board of BOARDS) {
    const list = deck.cards.filter((c) => c.board === board);
    if (!list.length) continue;
    out.push({ commander: 'Commander', main: 'Deck', side: 'Sideboard', maybe: 'Maybeboard' }[board]);
    for (const c of list) out.push(`${c.qty} ${c.name}`);
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
