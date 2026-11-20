'use strict';
/* App chrome: our own title bar (search everything, "+ New", alerts, account), a modern sidebar with
   line icons, counters and collapse, and a command palette (Ctrl/Cmd+K). */
const PLAT = window.mk.platform || 'win32';
const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  Today: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  Clients: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.8.2 5 2 5 5"/>',
  Cases: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M3 12.5h18"/>',
  Diary: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17.5h2"/>',
  Team: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.6 3.5-6 7-6s6.4 2.4 7 6"/>',
  Drafting: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>',
  'Law Library': '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  Accounts: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  Settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  collapse: '<path d="M15 6l-6 6 6 6"/>', expand: '<path d="M9 6l6 6-6 6"/>', doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
};
S.collapsed = false;

function renderTB(full) {
  const tb = $('#tb'); if (!tb) return;
  tb.className = 'tb ' + (PLAT === 'darwin' ? 'mac' : 'win');
  if (!full) { tb.innerHTML = `<div class="tb-brand"><span class="mark sm">M</span>Mitakshara</div>`; return; }
  const p = S.status.vault.profile || {}; const ini = (p.name || 'M').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
  tb.innerHTML = `<div class="tb-brand"><span class="mark sm">M</span>Mitakshara</div>
    <button class="tb-search nodrag" id="tb_search">${svg(IC.search, 16)}<span>Search clients, cases, documents, bills…</span><kbd>${PLAT === 'darwin' ? '⌘' : 'Ctrl'} K</kbd></button>
    <div class="tb-right nodrag"><button class="tb-btn tb-new" id="tb_new">${svg(IC.plus, 16)} New</button>
     <button class="tb-btn tb-icon" id="tb_bell" title="Needs attention">${svg(IC.bell, 18)}<i class="tb-dot hidden" id="tb_dot"></i></button>
     <button class="tb-avatar" id="tb_me" title="${esc(p.name || '')}">${esc(ini)}</button></div>`;
  $('#tb_search').onclick = () => palette();
  $('#tb_new').onclick = e => newMenu(e.currentTarget);
  $('#tb_bell').onclick = e => attentionMenu(e.currentTarget);
  $('#tb_me').onclick = e => meMenu(e.currentTarget);
}

/* ---------- sidebar shell ---------- */
shellView = function () {
  renderTB(true);
  const p = S.status.vault.profile;
  root().innerHTML = `<div class="shell ${S.collapsed ? 'collapsed' : ''}"><aside class="side">
    <nav class="nav">${TABS.map(([t]) => `<button data-tab="${t}" class="${S.tab === t ? 'on' : ''}" title="${t}"><span class="ic">${svg(IC[t] || IC.doc)}</span><span class="lbl">${t}</span><span class="badge hidden" data-badge="${t}"></span></button>`).join('')}</nav>
    <div class="sidefoot"><button class="side-toggle" id="side_toggle" title="${S.collapsed ? 'Expand menu' : 'Collapse menu'}">${svg(S.collapsed ? IC.expand : IC.collapse, 16)}<span class="lbl">Collapse</span></button>
     <div class="who lbl">Signed in as<b class="sidename">${esc(p?.name || '')}</b></div>
     <button class="side-lock" id="lockbtn" title="Lock (${PLAT === 'darwin' ? '⌘' : 'Ctrl'}+L)">${svg(IC.lock, 16)}<span class="lbl">Lock</span></button></div></aside>
    <main class="main" id="page"></main></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; shellView(); });
  $('#lockbtn').onclick = async () => { await call('lock'); start('manual'); };
  $('#side_toggle').onclick = () => { S.collapsed = !S.collapsed; shellView(); };
  Promise.resolve((PAGES[S.tab] || PAGES.soon)()).finally(refreshBadges);
};
function attention() {
  if (typeof D === 'undefined' || !D.loaded) return [];
  const out = []; const t0 = todayISO();
  const nu = (typeof notUpdated === 'function') ? notUpdated() : [];
  if (nu.length) out.push({ n: nu.length, t: 'hearing outcome' + (nu.length === 1 ? '' : 's') + ' not recorded', go: () => { S.tab = 'Diary'; S.dy.view = 'nu'; } });
  const today = (D.hearings || []).filter(h => h.date === t0 && !h.done).length;
  if (today) out.push({ n: today, t: 'hearing' + (today === 1 ? '' : 's') + ' today', go: () => { S.tab = 'Diary'; S.dy.view = 'day'; S.dy.date = t0; } });
  const od = (D.invoices || []).filter(i => typeof invCalc === 'function' && invCalc(i).status === 'Overdue').length;
  if (od) out.push({ n: od, t: 'overdue bill' + (od === 1 ? '' : 's'), go: () => { S.tab = 'Accounts'; S.av = { tab: 'Invoices' }; S.af.status = 'Overdue'; } });
  const law = (D.law_items || []).filter(i => !i.seen).length;
  if (law) out.push({ n: law, t: 'new law update' + (law === 1 ? '' : 's'), go: () => { S.tab = 'Law Library'; S.lv.tab = 'Updates'; } });
  const ap = (D.cases || []).filter(c => c.status === 'Completed' && c.appeal_by && c.appeal_by >= t0 && c.appeal_by <= addDays(t0, 15)).length;
  if (ap) out.push({ n: ap, t: 'appeal deadline' + (ap === 1 ? '' : 's') + ' within 15 days', go: () => { S.tab = 'Cases'; S.kv = { mode: 'list' }; S.kf.status = 'Completed'; } });
  return out;
}
function refreshBadges() {
  if (typeof D === 'undefined' || !D.loaded) return;
  const set = (t, n, red) => { const b = document.querySelector(`[data-badge="${t}"]`); if (!b) return; b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); b.classList.toggle('red', !!red); };
  const nu = notUpdated().length; const t0 = todayISO();
  set('Diary', nu || (D.hearings || []).filter(h => h.date === t0 && !h.done).length, !!nu);
  set('Law Library', (D.law_items || []).filter(i => !i.seen).length);
  set('Accounts', (D.invoices || []).filter(i => invCalc(i).status === 'Overdue').length, true);
  const dot = $('#tb_dot'); if (dot) dot.classList.toggle('hidden', !attention().length);
}
setInterval(() => { if ($('.shell')) refreshBadges(); }, 15000);

/* ---------- small dropdown menus ---------- */
function popMenu(anchor, items) {
  document.querySelectorAll('.popmenu').forEach(x => x.remove());
  const m = document.createElement('div'); m.className = 'popmenu'; m.style.zIndex = ++topZ;
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}">${it.icon ? svg(it.icon, 16) : ''}<span>${esc(it.t)}</span>${it.k ? `<kbd>${esc(it.k)}</kbd>` : ''}${it.n ? `<b class="pm-n">${it.n}</b>` : ''}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
  m.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { m.remove(); items[+b.dataset.i].go(); });
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
}
const goTo = fn => () => { fn(); shellView(); };
const NEW_ITEMS = () => [
  { t: 'New client', icon: IC.Clients, go: goTo(() => { S.tab = 'Clients'; S.cv = { mode: 'form', id: null }; }) },
  { t: 'New case', icon: IC.Cases, go: goTo(() => { S.tab = 'Cases'; S.kv = { mode: 'form' }; }) },
  { t: 'New bill', icon: IC.bill, go: goTo(() => { S.tab = 'Accounts'; S.av = { tab: 'Invoices', mode: 'inv', id: null }; }) },
  { t: 'New draft', icon: IC.Drafting, go: goTo(() => { S.tab = 'Drafting'; S.dv = { mode: 'list', tab: 'Templates', q: '', cat: '' }; }) },
  { t: 'Reminder in the diary', icon: IC.Diary, go: () => { S.tab = 'Diary'; shellView(); setTimeout(() => window.eventModal && window.eventModal(todayISO()), 50); } },
  { t: 'Team member', icon: IC.Team, go: () => { S.tab = 'Team'; shellView(); setTimeout(() => teamModal(), 50); } },
];
function newMenu(a) { popMenu(a, NEW_ITEMS()); }
function attentionMenu(a) { const at = attention(); popMenu(a, at.length ? at.map(x => ({ t: x.t, n: x.n, go: goTo(x.go) })) : [{ t: 'Nothing needs attention. Well done.', go: () => {} }]); }
function meMenu(a) {
  popMenu(a, [{ t: 'Settings', icon: IC.Settings, go: goTo(() => { S.tab = 'Settings'; }) }, { t: 'Practice details', icon: IC.doc, go: () => practiceModal() }, '-',
    { t: 'Lock now', icon: IC.lock, k: (PLAT === 'darwin' ? '⌘' : 'Ctrl') + '+L', go: async () => { await call('lock'); start('manual'); } }]);
}

/* ---------- command palette ---------- */
function palette() {
  if ($('.palette')) return;
  const ov = document.createElement('div'); ov.className = 'palette-ov'; ov.style.zIndex = ++topZ;
  ov.innerHTML = `<div class="palette"><div class="pl-in">${svg(IC.search, 18)}<input id="pl_q" placeholder="Type a name, client code, case number, CNR, bill number or an action…" autocomplete="off"><kbd>Esc</kbd></div><div class="pl-list" id="pl_list"></div><div class="pl-foot">↑ ↓ to move · Enter to open · Esc to close</div></div>`;
  document.body.appendChild(ov);
  const q = ov.querySelector('#pl_q'); let items = [], sel = 0;
  const close = () => ov.remove();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const has = (s, toks) => { s = String(s || '').toLowerCase(); return toks.every(t => s.includes(t)); };
  const build = () => {
    const toks = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean); const out = [];
    const acts = [...NEW_ITEMS().map(x => ({ ...x, kind: 'Action' })), { t: 'Open today in the diary', icon: IC.Diary, kind: 'Action', go: goTo(() => { S.tab = 'Diary'; S.dy.view = 'day'; S.dy.date = todayISO(); }) },
      { t: 'All documents', icon: IC.doc, kind: 'Action', go: goTo(() => { S.tab = 'Clients'; S.cv = { mode: 'alldocs', status: '' }; }) },
      { t: 'Back up now', icon: IC.Settings, kind: 'Action', go: async () => { try { const r = await call('backupNow'); if (r) toast('Backup saved.'); } catch (e) { toast(e.message); } } },
      { t: 'Lock now', icon: IC.lock, kind: 'Action', go: async () => { await call('lock'); start('manual'); } },
      ...TABS.map(([t]) => ({ t: 'Go to ' + t, icon: IC[t], kind: 'Page', go: goTo(() => { S.tab = t; }) }))];
    acts.filter(a => !toks.length || has(a.t, toks)).slice(0, toks.length ? 5 : 8).forEach(a => out.push(a));
    if (toks.length && typeof D !== 'undefined' && D.loaded) {
      D.clients.filter(c => has([c.name, c.code, c.mobile, c.email, c.signatory].join(' '), toks)).slice(0, 6).forEach(c => out.push({ kind: 'Client', icon: IC.Clients, t: c.name, sub: [c.code, c.mobile].filter(Boolean).join(' · '), go: goTo(() => { S.tab = 'Clients'; S.cv = { mode: 'detail', id: c.id, tab: 'Overview' }; }) }));
      D.cases.filter(k => has([k.code, k.title, k.case_no, k.case_year, k.cnr, k.court_name, k.opposite_party].join(' '), toks)).slice(0, 6).forEach(k => out.push({ kind: 'Case', icon: IC.Cases, t: caseTitle(k), sub: [k.code, k.case_no ? 'No. ' + k.case_no + (k.case_year ? '/' + k.case_year : '') : '', k.court_name].filter(Boolean).join(' · '), go: goTo(() => { S.tab = 'Cases'; S.kv = { mode: 'detail', id: k.id, tab: 'Overview' }; }) }));
      D.documents.filter(d => has([d.name, d.note, ...(d.files || []).map(f => f.filename)].join(' '), toks)).slice(0, 6).forEach(d => out.push({ kind: 'Document', icon: IC.doc, t: d.name, sub: (clientById(d.client_id) || {}).name || '', go: () => { close(); const f = (d.files || []).map(x => ({ ...x, title: d.name, docId: d.id })); if (f.length) openViewer(f, 0); else { S.tab = 'Clients'; S.cv = { mode: 'detail', id: d.client_id, tab: 'Documents' }; shellView(); } } }));
      (D.invoices || []).filter(i => has([i.no, (clientById(i.client_id) || {}).name].join(' '), toks)).slice(0, 4).forEach(i => out.push({ kind: 'Bill', icon: IC.bill, t: i.no, sub: (clientById(i.client_id) || {}).name || '', go: () => invoiceView(i.id) }));
      (D.drafts || []).filter(d => has(d.title, toks)).slice(0, 4).forEach(d => out.push({ kind: 'Draft', icon: IC.Drafting, t: d.title, go: goTo(() => { S.tab = 'Drafting'; S.dv = { mode: 'edit', draft: d.id, tab: 'My drafts' }; }) }));
      (D.team || []).filter(m => !m.deleted && has([m.name, m.first_name, m.last_name, m.role].join(' '), toks)).slice(0, 3).forEach(m => out.push({ kind: 'Team', icon: IC.Team, t: m.name, sub: m.role, go: () => { S.tab = 'Team'; shellView(); setTimeout(() => teamModal(m.id), 50); } }));
    }
    items = out; sel = Math.min(sel, Math.max(0, items.length - 1));
    ov.querySelector('#pl_list').innerHTML = items.length ? items.map((it, i) => `<button class="pl-it ${i === sel ? 'on' : ''}" data-i="${i}">${svg(it.icon || IC.doc, 16)}<span class="pl-t"><b>${esc(it.t)}</b>${it.sub ? `<i>${esc(it.sub)}</i>` : ''}</span><span class="pl-k">${esc(it.kind)}</span></button>`).join('') : '<div class="pl-none">Nothing found.</div>';
    ov.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => { const it = items[+b.dataset.i]; close(); it.go(); }; b.onmousemove = () => { if (sel !== +b.dataset.i) { sel = +b.dataset.i; mark(); } }; });
  };
  const mark = () => ov.querySelectorAll('.pl-it').forEach((b, i) => { b.classList.toggle('on', i === sel); if (i === sel) b.scrollIntoView({ block: 'nearest' }); });
  q.addEventListener('input', () => { sel = 0; build(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && items[sel]) { const it = items[sel]; close(); it.go(); }
  });
  build(); q.focus();
}
document.addEventListener('keydown', e => {
  if (!$('.shell')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); const b = $('#tb_new'); if (b) newMenu(b); }
});

/* title bar on sign-in screens too (the window must stay draggable) */
const _start6 = start;
start = async function (msg) { renderTB(false); return _start6(msg); };
