// Weboberfläche: Deckliste, Deckansicht mit Kartenbildern, ähnliche Decks, Diff.
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
const statusEl = $('#status');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => `${Math.round(x * 100)} %`;
const cardKey = (n) => n.split(/\s*\/\/?\s*/)[0].normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`´]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

let mode = localStorageGet('mode') ?? 'images';
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } }

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function setStatus(msg, error = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', error);
}

async function withStatus(form, msg, fn) {
  const btns = form ? [...form.querySelectorAll('button')] : [];
  btns.forEach((b) => (b.disabled = true));
  setStatus(msg);
  try {
    await fn();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// ---------- Karten ----------

const TYPE_ORDER = [
  ['Kreaturen', /Creature/], ['Planeswalker', /Planeswalker/], ['Schlachten', /Battle/],
  ['Spontanzauber', /Instant/], ['Hexereien', /Sorcery/], ['Artefakte', /Artifact/],
  ['Verzauberungen', /Enchantment/], ['Länder', /Land/],
];
function typeGroup(info) {
  const t = info?.typeLine?.split(' // ')[0] ?? '';
  return TYPE_ORDER.find(([, re]) => re.test(t))?.[0] ?? 'Sonstige';
}

function cardTile(name, info, badge, cls = '') {
  const img = info?.image;
  return `<div class="card ${cls}" ${img ? `data-img="${esc(img)}"` : ''} title="${esc(name)}">
    ${img ? `<a href="${esc(info.scryfallUri)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(info.imageSmall ?? img)}" alt="${esc(name)}"></a>`
      : `<div class="ph">${esc(name)}</div>`}
    ${badge != null ? `<span class="qty ${cls}">${esc(badge)}</span>` : ''}
  </div>`;
}

function cardsBlock(items) {
  if (!items.length) return '<p class="empty">Keine Karten</p>';
  if (mode === 'list') {
    return `<div class="list-view">${items.map((i) =>
      `<div class="row" ${i.info?.image ? `data-img="${esc(i.info.image)}"` : ''}><span>${esc(i.name)}</span><b>${esc(i.badge)}</b></div>`).join('')}</div>`;
  }
  return `<div class="cards">${items.map((i) => cardTile(i.name, i.info, i.badge, i.cls)).join('')}</div>`;
}

function modeToggle() {
  return `<button class="secondary" data-action="mode">${mode === 'images' ? 'Textansicht' : 'Bilderansicht'}</button>`;
}

// ---------- Ansichten ----------

async function renderList() {
  const q = $('#search').value.trim();
  const decks = await api(`/decks${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  view.innerHTML = `
    <h1>Decks</h1>
    <p class="meta">${decks.length} Deck(s) gespeichert${q ? ` · Filter „${esc(q)}“` : ''}</p>
    <div class="panel">${decks.length ? `<table>
      <thead><tr><th>Name</th><th>Format</th><th>Autor</th><th>Quelle</th><th class="num">Karten</th><th>Gecrawlt</th></tr></thead>
      <tbody>${decks.map((d) => `<tr class="click" data-href="#/deck/${d.id}">
        <td>${esc(d.name)}</td><td>${esc(d.format ?? '–')}</td><td>${esc(d.author ?? '–')}</td>
        <td><span class="tag">${esc(d.source)}</span></td><td class="num">${d.mainCount} + ${d.sideCount}</td>
        <td>${new Date(d.crawledAt).toLocaleDateString('de-DE')}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Noch keine Decks. Links crawlen oder eine Liste importieren.</p>'}</div>`;
}

async function renderDeck(id) {
  const [deck, similar, all] = await Promise.all([api(`/decks/${id}`), api(`/decks/${id}/similar?limit=12`), api('/decks')]);
  const board = (b) => deck.cards.filter((c) => c.board === b);
  const item = (c) => ({ name: c.name, info: c.info, badge: c.qty });
  const count = (cs) => cs.reduce((s, c) => s + c.qty, 0);

  const groups = new Map();
  for (const c of board('main')) {
    const g = typeGroup(c.info);
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const order = [...TYPE_ORDER.map(([n]) => n), 'Sonstige'];
  const byCmc = (a, b) => (a.info?.cmc ?? 0) - (b.info?.cmc ?? 0) || a.name.localeCompare(b.name);
  const section = (title, cards) => cards.length
    ? `<div class="group"><h3>${esc(title)} (${count(cards)})</h3>${cardsBlock([...cards].sort(byCmc).map(item))}</div>` : '';

  const others = all.filter((d) => d.id !== id);
  view.innerHTML = `
    <h1>${esc(deck.name)}</h1>
    <p class="meta">${[deck.format, deck.author && `von ${deck.author}`, deck.archetype, deck.source].filter(Boolean).map(esc).join(' · ')}
      ${deck.url ? ` · <a href="${esc(deck.url)}" target="_blank" rel="noopener">Original</a>` : ''}</p>
    <div class="toolbar">
      ${modeToggle()}
      <select id="cmp">${others.map((d) => `<option value="${d.id}">${esc(d.name)} (${esc(d.format ?? '–')})</option>`).join('')}</select>
      <button data-action="diff" ${others.length ? '' : 'disabled'}>Diff mit …</button>
      <button class="secondary" data-action="copy">Liste kopieren</button>
      <button class="secondary" data-action="delete">Löschen</button>
    </div>
    <div class="deck-grid">
      <div class="panel">
        ${section('Commander', board('commander'))}
        ${order.map((g) => section(g, groups.get(g) ?? [])).join('')}
        ${section('Sideboard', board('side'))}
        ${section('Maybeboard', board('maybe'))}
      </div>
      <div class="panel">
        <h3 style="margin-top:0">Ähnliche Decks</h3>
        ${similar.length ? `<div class="sim-list">${similar.map((s) => `
          <div class="sim">
            <b>${pct(s.score)}</b>
            <div><a href="#/deck/${s.deck.id}">${esc(s.deck.name)}</a> <span class="tag">${esc(s.deck.format ?? '–')}</span>
              <div class="bar"><div style="width:${s.score * 100}%"></div></div></div>
            <a href="#/diff/${id}/${s.deck.id}">Diff</a>
          </div>`).join('')}</div>` : '<p class="empty">Keine ähnlichen Decks gefunden.</p>'}
      </div>
    </div>`;

  view.onclick = async (e) => {
    const action = e.target.dataset.action;
    if (action === 'diff') location.hash = `#/diff/${id}/${$('#cmp').value}`;
    if (action === 'copy') {
      const lines = ['commander', 'main', 'side'].flatMap((b) => {
        const cs = board(b);
        return cs.length ? [{ commander: 'Commander', main: 'Deck', side: 'Sideboard' }[b], ...cs.map((c) => `${c.qty} ${c.name}`), ''] : [];
      });
      await navigator.clipboard.writeText(lines.join('\n'));
      setStatus('Liste in die Zwischenablage kopiert.');
    }
    if (action === 'delete' && confirm(`„${deck.name}“ löschen?`)) {
      await api(`/decks/${id}`, { method: 'DELETE' });
      location.hash = '#/';
    }
  };
}

async function renderDiff(a, b) {
  const d = await api(`/diff/${a}/${b}`);
  const info = (name) => d.cards[cardKey(name)];
  const rows = (part) => [
    ...part.onlyA.map((r) => ({ ...r, cls: 'rem', badge: `−${r.a}` })),
    ...part.changed.map((r) => ({ ...r, cls: 'chg', badge: `${r.a}→${r.b}` })),
    ...part.onlyB.map((r) => ({ ...r, cls: 'add', badge: `+${r.b}` })),
  ];

  const imageSection = (title, part) => {
    const groups = [
      ['Nur in A (in B entfernt)', part.onlyA.map((r) => ({ name: r.name, info: info(r.name), badge: `−${r.a}`, cls: 'rem' }))],
      ['Anzahl geändert', part.changed.map((r) => ({ name: r.name, info: info(r.name), badge: `${r.a}→${r.b}`, cls: 'chg' }))],
      ['Nur in B (neu)', part.onlyB.map((r) => ({ name: r.name, info: info(r.name), badge: `+${r.b}`, cls: 'add' }))],
    ];
    return `<div class="panel"><h2 style="margin-top:0">${title}</h2>
      ${groups.filter(([, items]) => items.length).map(([t, items]) => `<div class="group"><h3>${t} (${items.length})</h3>${cardsBlock(items)}</div>`).join('') || '<p class="empty">Keine Unterschiede</p>'}
      <details><summary>Gemeinsam (${part.same.length} Karten)</summary>
        ${cardsBlock(part.same.map((r) => ({ name: r.name, info: info(r.name), badge: r.a })))}</details></div>`;
  };

  const textSection = (title, part) => `<div class="panel"><h2 style="margin-top:0">${title}</h2>
    <table class="diff-text"><thead><tr><th>Karte</th><th class="num">A</th><th class="num">B</th><th class="num">Δ</th></tr></thead><tbody>
    ${[...rows(part), ...part.same].map((r) => `<tr class="${r.cls ?? ''}" ${info(r.name)?.image ? `data-img="${esc(info(r.name).image)}"` : ''}>
      <td>${esc(r.name)}</td><td class="a">${r.a}</td><td class="b">${r.b}</td>
      <td class="d">${r.delta ? (r.delta > 0 ? '+' : '−') + Math.abs(r.delta) : ''}</td></tr>`).join('')}
    </tbody></table></div>`;

  const section = mode === 'images' ? imageSection : textSection;
  view.innerHTML = `
    <h1>Diff</h1>
    <p class="meta">A: <a href="#/deck/${d.a.id}">${esc(d.a.name)}</a> · B: <a href="#/deck/${d.b.id}">${esc(d.b.name)}</a></p>
    <div class="toolbar">${modeToggle()} <a href="#/diff/${b}/${a}">A ↔ B tauschen</a></div>
    <div class="panel diff-summary">
      <div><b>${pct(d.similarity)}</b>Ähnlichkeit</div>
      <div><b>${d.stats.mainChanges}</b>Änderungen Main</div>
      <div><b>${d.stats.sideChanges}</b>Änderungen Sideboard</div>
      <div><b>${d.main.same.length}</b>gemeinsame Karten</div>
    </div>
    ${section('Maindeck', d.main)}
    ${d.side.onlyA.length + d.side.onlyB.length + d.side.changed.length + d.side.same.length ? section('Sideboard', d.side) : ''}`;
  view.onclick = null;
}

// ---------- Routing & Events ----------

async function route() {
  const [, page, a, b] = location.hash.split('/');
  try {
    if (page === 'deck' && a) await renderDeck(a);
    else if (page === 'diff' && a && b) await renderDiff(a, b);
    else await renderList();
  } catch (err) {
    view.innerHTML = `<p class="empty">Fehler: ${esc(err.message)}</p>`;
  }
}

window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  if (e.target.dataset.action === 'mode') {
    mode = mode === 'images' ? 'list' : 'images';
    localStorageSet('mode', mode);
    route();
  }
  const row = e.target.closest('tr[data-href]');
  if (row) location.hash = row.dataset.href;
});

let searchTimer;
$('#search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => (location.hash === '#/' || !location.hash ? renderList() : (location.hash = '#/')), 250);
});

$('#crawl-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));
  withStatus(form, 'Crawle … (das kann je nach Anzahl ein paar Minuten dauern)', async () => {
    const decks = await api('/crawl', { method: 'POST', body });
    setStatus(`${decks.length} Deck(s) gespeichert.`);
    location.hash = '#/';
    renderList();
  });
});

$('#url-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  withStatus(form, 'Importiere …', async () => {
    const decks = await api('/import', { method: 'POST', body: { url: form.url.value } });
    setStatus(`${decks.length} Deck(s) importiert.`);
    form.reset();
    location.hash = decks.length === 1 ? `#/deck/${decks[0].id}` : '#/';
  });
});

$('#text-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  withStatus(form, 'Importiere …', async () => {
    const body = Object.fromEntries(new FormData(form));
    if (!body.format) body.format = null;
    const [deck] = await api('/import', { method: 'POST', body });
    setStatus('Liste importiert.');
    form.reset();
    location.hash = `#/deck/${deck.id}`;
  });
});

// Große Kartenvorschau beim Hovern
const preview = $('#preview');
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-img]');
  if (!el) { preview.hidden = true; return; }
  $('img', preview).src = el.dataset.img;
  preview.hidden = false;
});
document.addEventListener('mousemove', (e) => {
  if (preview.hidden) return;
  const w = 290, h = 400;
  preview.style.left = `${e.clientX + w + 20 > innerWidth ? e.clientX - w - 10 : e.clientX + 20}px`;
  preview.style.top = `${Math.max(10, Math.min(e.clientY - h / 2, innerHeight - h - 10))}px`;
});

route();
