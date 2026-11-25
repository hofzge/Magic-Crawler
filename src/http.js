// Höfliches HTTP: User-Agent, Mindestabstand pro Host, Retries bei 429/5xx.

const USER_AGENT = 'mtg-deck-crawler/1.0 (+https://github.com/ic87/ic87)';
const MIN_INTERVAL_MS = { 'api.scryfall.com': 100 };
const DEFAULT_INTERVAL_MS = 1000;
const lastRequest = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle(host) {
  const interval = MIN_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const prev = lastRequest.get(host) ?? 0;
  const wait = prev + interval - Date.now();
  lastRequest.set(host, Math.max(Date.now(), prev + interval));
  if (wait > 0) await sleep(wait);
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} für ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function request(url, { method = 'GET', headers = {}, body, retries = 3, accept = '*/*' } = {}) {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    await throttle(host);
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': USER_AGENT, Accept: accept, ...headers },
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error(`Netzwerkfehler bei ${url}: ${err.cause?.message ?? err.message}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ''));
    return res;
  }
}

export async function getJson(url, opts = {}) {
  const res = await request(url, { accept: 'application/json', ...opts });
  return res.json();
}

export async function getText(url, opts = {}) {
  const res = await request(url, { accept: 'text/html,text/plain,*/*', ...opts });
  return res.text();
}

export async function postJson(url, data, opts = {}) {
  const res = await request(url, {
    method: 'POST',
    accept: 'application/json',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...opts,
  });
  return res.json();
}
