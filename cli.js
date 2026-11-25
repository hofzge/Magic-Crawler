#!/usr/bin/env node
// Kommandozeile für den Deck-Crawler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeckApp } from './src/app.js';
import { toText } from './src/parse.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const app = new DeckApp(process.env.DATA_DIR ?? path.join(ROOT, 'data'));

const HELP = `Verwendung: node cli.js <befehl> [optionen]

  crawl archidekt [suche] [--format commander] [--limit 10] [--recent] [--min-cards 100]
  crawl mtggoldfish [--format modern] [--limit 10] [archetyp-filter]
  import <url>                       Archidekt-, Moxfield- oder MTGGoldfish-URL
  import-file <datei> [--name X] [--format Y]
  list [suche]
  show <id>                          Deckliste ausgeben
  similar <id> [--limit 10] [--same-format]
  diff <idA> <idB>
  remove <id>`;

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      opts[key] = next && !next.startsWith('--') ? (i++, next) : true;
    } else pos.push(a);
  }
  return { pos, opts };
}

const pct = (x) => `${(x * 100).toFixed(1)} %`;
const line = (d) =>
  `${d.id}  ${d.name.padEnd(40).slice(0, 40)}  ${(d.format ?? '-').padEnd(10)}  ${String(d.mainCount).padStart(3)}+${String(d.sideCount).padEnd(3)} ${d.source}`;

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opts } = parseArgs(rest);
const progress = (msg) => console.error(msg);

try {
  switch (cmd) {
    case 'crawl': {
      const [source, ...query] = pos;
      const decks = await app.crawl(source, {
        query: query.join(' '), format: opts.format, limit: Number(opts.limit ?? 10), onProgress: progress,
        orderBy: opts.recent ? '-updatedAt' : undefined, minCards: Number(opts.minCards ?? 0),
      });
      console.log(`${decks.length} Deck(s) gespeichert:`);
      decks.forEach((d) => console.log(line(d)));
      break;
    }
    case 'import': {
      const decks = await app.importUrl(pos[0]);
      decks.forEach((d) => console.log(line(d)));
      break;
    }
    case 'import-file': {
      const text = fs.readFileSync(pos[0], 'utf8');
      console.log(line(app.importText(text, {
        name: opts.name ?? path.basename(pos[0]).replace(/\.\w+$/, ''), format: opts.format ?? null,
      })));
      break;
    }
    case 'list':
      app.listDecks({ q: pos.join(' ') || undefined }).forEach((d) => console.log(line(d)));
      break;
    case 'show':
      process.stdout.write(toText(app.getDeck(pos[0])));
      break;
    case 'similar':
      for (const r of app.similar(pos[0], { limit: Number(opts.limit ?? 10), sameFormat: !!opts.sameFormat })) {
        console.log(`${pct(r.score).padStart(8)}  ${line(r.deck)}`);
      }
      break;
    case 'diff': {
      const d = await app.diff(pos[0], pos[1], { withCards: false });
      console.log(`A: ${d.a.name}\nB: ${d.b.name}\nÄhnlichkeit: ${pct(d.similarity)}`);
      for (const [label, part] of [['Main', d.main], ['Sideboard', d.side]]) {
        const rows = [...part.onlyA, ...part.changed, ...part.onlyB];
        if (!rows.length) continue;
        console.log(`\n== ${label} ==`);
        for (const r of rows) {
          const sign = r.delta > 0 ? '+' : '-';
          console.log(`${sign}${String(Math.abs(r.delta)).padStart(2)}  ${r.name}  (${r.a} → ${r.b})`);
        }
      }
      break;
    }
    case 'remove':
      console.log(app.remove(pos[0]) ? 'Gelöscht.' : 'Nicht gefunden.');
      break;
    default:
      console.log(HELP);
  }
} catch (err) {
  console.error(`Fehler: ${err.message}`);
  process.exit(1);
}
