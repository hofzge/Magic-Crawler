#!/usr/bin/env node
// Webserver: JSON-API + statische Weboberfläche.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeckApp } from './src/app.js';
import { SOURCES } from './src/sources/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 3000);
const app = new DeckApp(process.env.DATA_DIR ?? path.join(ROOT, 'data'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2e6) throw Object.assign(new Error('Anfrage zu groß'), { status: 413 });
  }
  return body ? JSON.parse(body) : {};
}

const routes = [
  ['GET', /^\/api\/sources$/, () => Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.label]))],
  ['GET', /^\/api\/decks$/, (_, q) => app.listDecks({ q: q.get('q'), format: q.get('format') })],
  ['GET', /^\/api\/decks\/([\w-]+)$/, ([id]) => app.getDeckWithCards(id)],
  ['DELETE', /^\/api\/decks\/([\w-]+)$/, ([id]) => ({ deleted: app.remove(id) })],
  ['GET', /^\/api\/decks\/([\w-]+)\/similar$/, ([id], q) =>
    app.similar(id, { limit: Number(q.get('limit') ?? 10), sameFormat: q.get('sameFormat') === '1' })],
  ['GET', /^\/api\/diff\/([\w-]+)\/([\w-]+)$/, ([a, b]) => app.diff(a, b)],
  ['POST', /^\/api\/crawl$/, async (_, __, body) =>
    app.crawl(body.source, { query: body.query, format: body.format, limit: Math.min(Number(body.limit) || 10, 50) })],
  ['POST', /^\/api\/import$/, async (_, __, body) =>
    body.url ? app.importUrl(body.url) : [app.importText(body.text ?? '', body)]],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const [method, re, handler] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          const body = method === 'POST' ? await readBody(req) : null;
          return send(res, 200, await handler(m.slice(1), url.searchParams, body));
        }
      }
      return send(res, 404, { error: 'Unbekannter Endpunkt' });
    }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    send(res, err.status ?? 500, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Deck-Crawler läuft auf http://localhost:${PORT}`));
