'use strict';
/* Stage 2: Clients and their documents. */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const D = { loaded: false, clients: [], documents: [], lists: {} };
async function loadD(force) {
  if (D.loaded && !force) return;
  D.clients = (await call('getData', { key: 'clients' })) || [];
  D.documents = (await call('getData', { key: 'documents' })) || [];
  D.lists = { ...DEFAULT_LISTS, ...((await call('getData', { key: 'lists' })) || {}) };
  D.counters = (await call('getData', { key: 'counters' })) || {};
  D.cases = (await call('getData', { key: 'cases' })) || [];
  D.hearings = (await call('getData', { key: 'hearings' })) || [];
  D.team = (await call('getData', { key: 'team' })) || [];
  D.loaded = true;
  // give every client a permanent client code (older records get one now)
  const missing = D.clients.filter(c => !c.code).sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  if (missing.length) { missing.forEach(c => c.code = nextClientCode(c.created)); await saveD('clients', 'counters'); }
}
/* Client code: C + year joined + running number, e.g. C26-0001. Never changes, never reused. */
function nextClientCode(when) {
  const yy = String(new Date(when || Date.now()).getFullYear()).slice(2);
  const k = 'client_' + yy; D.counters[k] = (D.counters[k] || 0) + 1;
  return 'C' + yy + '-' + String(D.counters[k]).padStart(4, '0');
}
async function saveD(...keys) { for (const k of keys) await call('setData', { key: k, value: D[k] }); }
window.mk.onLocked(() => { D.loaded = false; D.clients = []; D.documents = []; D.cases = []; D.hearings = []; D.team = []; });
const redraw = () => (PAGES[S.tab] || PAGES.soon)();
const L = k => D.lists[k] || DEFAULT_LISTS[k] || [];
const opts = (list, val, blank) => (blank !== undefined ? `<option value="">${blank}</option>` : '') + list.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('');
const norm = s => String(s || '').toLowerCase().replace(/^(m\/s\.?|mr\.?|mrs\.?|ms\.?|shri|smt\.?|dr\.?)\s+/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const isOrg = t => t && t !== 'Individual';
const fsize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const today = () => new Date().toISOString().slice(0, 10);
function ageFrom(dob) { if (!dob) return ''; const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a >= 0 && a < 130 ? a : ''; }
const clientDocs = id => D.documents.filter(d => d.client_id === id);
const pendingDocs = id => clientDocs(id).filter(d => d.status === 'Pending');
const idsOf = c => c.ids || (c.id_type || c.id_last4 ? [{ type: c.id_type || '', last4: c.id_last4 || '' }] : []);
const idsText = c => idsOf(c).map(x => x.type + (x.last4 ? ' ending ' + x.last4 : '')).join(', ');
const cityOf = c => c.addr?.city || '';
const stateOf = c => c.addr?.state || '';

/* ---------- typing suggestions (like the research workflow) ---------- */
function docNameHistory() {
  const m = new Map();
  for (const d of D.documents) { const k = d.name.trim(); if (!k) continue; const e = m.get(k.toLowerCase()) || { name: k, group: d.group, n: 0, last: '' }; e.n++; if ((d.created || '') > e.last) { e.last = d.created || ''; e.group = d.group; } m.set(k.toLowerCase(), e); }
  for (const [g, names] of Object.entries(SEED_DOCS)) for (const n of names) if (!m.has(n.toLowerCase())) m.set(n.toLowerCase(), { name: n, group: g, n: 0, seed: true });
  return [...m.values()];
}
function suggestDocs(q, group) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const all = docNameHistory();
  const score = e => { const n = e.name.toLowerCase(); let s = n.startsWith(q) ? 3 : n.split(/[\s/()-]+/).some(w => w.startsWith(q)) ? 2 : (q.length > 1 && n.includes(q)) ? 1 : 0; if (!s) return 0; return s * 1000 + e.n * 10 + (group && e.group === group ? 5 : 0) + (e.seed ? 0 : 3); };
  return all.map(e => ({ e, s: score(e) })).filter(x => x.s).sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name)).slice(0, 8).map(x => x.e);
}
function attachSuggest(input, getItems, onPick) {
  const box = document.createElement('div'); box.className = 'sugg hidden'; input.parentNode.classList.add('suggwrap'); input.parentNode.appendChild(box);
  let items = [], idx = -1;
  const draw = () => {
    items = getItems(input.value); idx = -1;
    if (!items.length) return box.classList.add('hidden');
    box.innerHTML = items.map((it, i) => `<div class="sg" data-i="${i}"><span>${esc(it.name)}</span><span class="small muted">${esc(it.group || '')}${it.n ? ' &middot; used ' + it.n + 'x' : ''}</span></div>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('.sg').forEach(el => el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); });
  };
  const pick = i => { const it = items[i]; if (!it) return; input.value = it.name; box.classList.add('hidden'); onPick && onPick(it); };
  const mark = () => box.querySelectorAll('.sg').forEach((el, i) => el.classList.toggle('on', i === idx));
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', draw);
  input.addEventListener('focus', () => { if (input.value) draw(); });
  input.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 120));
  input.addEventListener('keydown', e => {
    if (box.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { idx = Math.min(items.length - 1, idx + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(0, idx - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && idx >= 0) { pick(idx); e.preventDefault(); }
    else if (e.key === 'Escape') box.classList.add('hidden');
  });
}

/* ---------- client list ---------- */
S.cf = { q: '', type: '', status: 'Active', state: '', city: '', lang: '', ref: '', docs: '', box: '' };
S.cv = { mode: 'list', id: null };
PAGES.Clients = async () => {
  await loadD();
  if (S.cv.mode === 'form') return clientForm(S.cv.id);
  if (S.cv.mode === 'detail') return clientDetail(S.cv.id);
  const F = S.cf; const C = D.clients;
  const monthStart = today().slice(0, 7);
  const boxes = [
    ['all', 'All clients', C.length, c => true],
    ['active', 'Active', C.filter(c => c.status !== 'Inactive').length, c => c.status !== 'Inactive'],
    ['ind', 'Individuals', C.filter(c => !isOrg(c.type)).length, c => !isOrg(c.type)],
    ['org', 'Businesses & others', C.filter(c => isOrg(c.type)).length, c => isOrg(c.type)],
    ['new', 'Added this month', C.filter(c => (c.created || '').startsWith(monthStart)).length, c => (c.created || '').startsWith(monthStart)],
    ['pending', 'With pending documents', C.filter(c => pendingDocs(c.id).length).length, c => pendingDocs(c.id).length > 0],
  ];
  const boxFn = (boxes.find(b => b[0] === F.box) || boxes[0])[3];
  const uniq = f => [...new Set(C.map(f).filter(Boolean))].sort();
  const list = C.filter(c => boxFn(c)
    && (!F.type || c.type === F.type) && (!F.status || (c.status || 'Active') === F.status) && (!F.state || stateOf(c) === F.state) && (!F.city || cityOf(c) === F.city)
    && (!F.lang || c.language === F.lang) && (!F.ref || c.referred_by === F.ref) && (!F.docs || (F.docs === 'pending' ? pendingDocs(c.id).length : !pendingDocs(c.id).length))
  ).sort((a, b) => a.name.localeCompare(b.name));
  const sel = (k, label, list, blank = 'All') => `<div><label>${label}</label><select data-cf="${k}">${opts(list, F[k], blank)}</select></div>`;
  page(`<div class="top"><div><h1>Clients</h1><div class="muted">Everything starts here. Search finds a client as you type.</div></div><button class="btn" id="c_add">Add client</button></div>
   <div class="kpis">${boxes.map(([k, t, n]) => `<button class="card kpi ${F.box === k || (!F.box && k === 'all') ? 'on' : ''}" data-box="${k}"><div class="muted small">${t}</div><div class="v">${n}</div></button>`).join('')}</div>
   <div class="card mb14"><div class="filters">
     <div class="span2"><label>Search</label><input id="c_q" value="${esc(F.q)}" placeholder="Client code, name, mobile, email, PAN, city or other side"></div>
     ${sel('type', 'Client type', L('client_types'))}${sel('status', 'Status', ['Active', 'Inactive'])}${sel('state', 'State', uniq(stateOf))}${sel('city', 'City', uniq(cityOf))}
     ${sel('lang', 'Language', uniq(c => c.language))}${sel('ref', 'Referred by', uniq(c => c.referred_by))}
     <div><label>Documents</label><select data-cf="docs"><option value="">All</option><option value="pending" ${F.docs === 'pending' ? 'selected' : ''}>Some pending</option><option value="complete" ${F.docs === 'complete' ? 'selected' : ''}>Nothing pending</option></select></div>
     <div><label>&nbsp;</label><button class="btn ghost wide" id="c_clear">Clear</button></div></div></div>
   <div class="card"><div class="flex between mb14"><h2 class="nomb">Client list</h2><span class="muted small"><span id="c_count">${list.length}</span> shown</span></div>
   ${C.length ? `<table class="tbl" id="c_tbl"><thead><tr><th>Code</th><th>Client</th><th>Mobile</th><th>City, State</th><th>Documents</th><th>Referred by</th><th>Added</th></tr></thead><tbody>
    ${list.map(c => { const docs = clientDocs(c.id), p = pendingDocs(c.id).length; return `<tr class="click" data-open="${c.id}" data-s="${esc([c.code, c.name, c.mobile, c.alt_mobile, c.email, c.pan, cityOf(c), stateOf(c), c.opposite_party, c.parent_name, c.signatory, c.addr?.district, c.addr?.pin, idsText(c)].join(' ').toLowerCase())}">
      <td class="mono small">${esc(c.code || '')}</td><td><b>${esc(c.name)}</b> ${isOrg(c.type) ? `<span class="tag grey">${esc(c.type)}</span>` : ''}${c.status === 'Inactive' ? ' <span class="tag warn">Inactive</span>' : ''}<div class="small muted">${esc(c.relation && c.parent_name ? c.relation + ' ' + c.parent_name : c.signatory ? 'Through ' + c.signatory : '')}</div></td>
      <td>${esc(c.mobile || '-')}</td><td>${esc([cityOf(c), stateOf(c)].filter(Boolean).join(', ') || '-')}</td>
      <td>${docs.length}${p ? ` <span class="tag warn">${p} pending</span>` : ''}</td><td>${esc(c.referred_by || '-')}</td><td>${fd(c.created)}</td></tr>`; }).join('')}
    </tbody></table><div class="muted center hidden mt14" id="c_none">No client matches the search.</div>` : `<div class="empty"><b>No clients yet.</b><div class="muted">Press <b>Add client</b> to add your first client with their documents.</div></div>`}</div>`);
  $('#c_add').onclick = () => { S.cv = { mode: 'form', id: null }; PAGES.Clients(); };
  $$('[data-box]').forEach(b => b.onclick = () => { F.box = b.dataset.box === 'all' ? '' : b.dataset.box; if (F.box === 'active') F.status = ''; PAGES.Clients(); });
  $$('[data-cf]').forEach(s => s.onchange = () => { F[s.dataset.cf] = s.value; PAGES.Clients(); });
  $('#c_clear').onclick = () => { Object.assign(F, { q: '', type: '', status: 'Active', state: '', city: '', lang: '', ref: '', docs: '', box: '' }); PAGES.Clients(); };
  $$('[data-open]').forEach(r => r.onclick = () => { S.cv = { mode: 'detail', id: r.dataset.open, tab: 'Overview' }; PAGES.Clients(); });
  const q = $('#c_q'); const filt = () => { F.q = q.value; const t = q.value.trim().toLowerCase(); let n = 0; $$('#c_tbl tbody tr').forEach(r => { const show = !t || r.dataset.s.includes(t); r.classList.toggle('hidden', !show); if (show) n++; }); if ($('#c_count')) $('#c_count').textContent = n; if ($('#c_none')) $('#c_none').classList.toggle('hidden', n > 0); };
  q.addEventListener('input', filt); filt(); if (F.q) { q.focus(); q.setSelectionRange(F.q.length, F.q.length); }
};

/* ---------- address with PIN-first auto-fill (India Post directory, offline) ---------- */
function addrFields(p, x, label) {
  x = x || {};
  return `<div class="span4"><label>${label} (house, street, area)</label><input id="${p}_line" value="${esc(x.line || '')}"></div>
   <div><label>PIN code</label><input id="${p}_pin" value="${esc(x.pin || '')}" inputmode="numeric" autocomplete="off" placeholder="6 digits: fills the rest"><div class="small pinmsg" id="${p}_pinmsg"></div></div>
   <div><label>State</label><select id="${p}_state">${opts(L('states'), x.state, 'Select state')}</select></div>
   <div><label>District</label><select id="${p}_district"><option value="">Select state first</option>${x.district ? `<option selected>${esc(x.district)}</option>` : ''}</select><input id="${p}_district_other" class="hidden mt8" placeholder="Type the district name"></div>
   <div><label>City / town / area</label><input id="${p}_city" value="${esc(x.city || '')}" list="${p}_cities" autocomplete="off" placeholder="Type or pick from the list"><datalist id="${p}_cities"></datalist></div>`;
}
async function wireAddr(p) {
  const el = s => document.getElementById(p + '_' + s);
  const pin = el('pin'), st = el('state'), di = el('district'), oth = el('district_other'), city = el('city'), dl = el('cities'), msg = el('pinmsg');
  let last = null; // last PIN result, used for the cross-check on save
  const fillDistricts = (list, chosen, hint) => {
    const L2 = [...list]; if (chosen && !L2.includes(chosen)) L2.unshift(chosen);
    di.innerHTML = `<option value="">${esc(hint || (st.value ? 'Select district' : 'Select state first'))}</option>` + L2.map(d => `<option ${d === chosen ? 'selected' : ''}>${esc(d)}</option>`).join('') + (st.value ? '<option value="__other">Other (type it)</option>' : '');
    oth.classList.toggle('hidden', di.value !== '__other');
  };
  const fillCities = (offices, districts) => { const seen = new Set(); dl.innerHTML = [...districts, ...offices].filter(o => !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase())).map(o => `<option value="${esc(o)}">`).join(''); };
  di.onchange = () => { oth.classList.toggle('hidden', di.value !== '__other'); if (di.value === '__other') oth.focus(); };
  st.onchange = async () => fillDistricts(st.value ? await call('districtsOf', { state: st.value }) : [], '');
  const say = (t, cls) => { msg.className = 'small pinmsg ' + (cls || ''); msg.textContent = t; };
  const look = async () => {
    const v = pin.value; last = null;
    if (v.length < 6) { say(v ? `${6 - v.length} more digit${6 - v.length === 1 ? '' : 's'}` : ''); return; }
    const r = await call('pinInfo', { pin: v });
    if (!r.found) { say('Not in the India Post list. Please choose the state and district yourself.', 'warntext'); return; }
    last = r;
    // state: fill only when the PIN belongs to exactly one state
    if (r.states.length === 1) st.value = r.states[0]; else if (!r.states.includes(st.value)) st.value = '';
    if (r.districts.length === 1) fillDistricts(await call('districtsOf', { state: st.value }), r.districts[0]);
    else fillDistricts(r.districts, '', `Choose one of ${r.districts.length} districts`);
    fillCities(r.offices, r.districts);
    if (!city.value && r.offices.length === 1) city.value = r.offices[0];
    const sure = r.states.length === 1 && r.districts.length === 1;
    say(sure ? `✓ ${r.districts[0]}, ${r.states[0]}. Pick the area from the City list (${r.offices.length} post office${r.offices.length === 1 ? '' : 's'}).`
             : `This PIN is shared by ${r.states.length > 1 ? r.states.join(' and ') : r.districts.join(', ')}. Please choose the right one.`, sure ? 'oktext' : 'warntext');
  };
  pin.addEventListener('input', () => { const c = pin.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6); if (c !== pin.value) pin.value = c; look(); });
  // existing record: show its districts and the PIN's areas, but never overwrite what was saved
  const keep = di.value;
  if (st.value) fillDistricts(await call('districtsOf', { state: st.value }), keep);
  if (/^[1-9]\d{5}$/.test(pin.value)) { const r = await call('pinInfo', { pin: pin.value }); if (r.found) { last = r; fillCities(r.offices, r.districts); } }
  return {
    read: () => ({ line: el('line').value.trim(), city: city.value.trim(), district: di.value === '__other' ? oth.value.trim() : di.value, state: st.value, pin: pin.value.trim() }),
    check: () => { const a = { state: st.value, district: di.value }; if (!last || !a.state) return ''; if (!last.states.includes(a.state)) return `PIN ${pin.value} belongs to ${last.states.join(' / ')}, but the state chosen is ${a.state}.`; if (a.district && a.district !== '__other' && !last.districts.includes(a.district)) return `PIN ${pin.value} is in ${last.districts.join(' / ')} district, but the district chosen is ${a.district}.`; return ''; },
  };
}

/* ---------- add / edit client ---------- */
function clientForm(id, draft) {
  const c = draft ? draft : id ? JSON.parse(JSON.stringify(D.clients.find(x => x.id === id))) : { type: 'Individual', relation: 'S/o', language: 'Hindi', addr: {}, addr2: {}, same_addr: true, status: 'Active', consent: false };
  const existingDocs = id ? clientDocs(id) : [];
  const rows = []; const newFiles = []; const idRows = []; const A = {};
  const v = k => esc(c[k] ?? '');
  const a = (k, which = 'addr') => esc((c[which] || {})[k] ?? '');
  const org = isOrg(c.type);
  page(`<div class="top"><div><a id="f_back">&larr; ${id ? 'Back to client' : 'All clients'}</a><h1 class="mt8">${id ? 'Edit client' : 'Add client'}</h1><div class="muted">Fields marked * are needed. The rest can be added later.</div></div>
    <div class="flex"><button class="btn ghost" id="f_cancel">Cancel</button><button class="btn" id="f_save">Save client</button></div></div>
   <div class="formgrid">
    <section class="card"><h2>1. Client type</h2><div class="seg" id="f_type">${L('client_types').map(t => `<button type="button" class="${t === c.type ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></section>
    <section class="card"><h2>2. ${org ? 'Organisation details' : 'Personal details'}</h2><div class="g4">
     <div class="span2"><label>${org ? 'Name of organisation *' : 'Full name (as on ID proof) *'}</label><input id="f_name" value="${v('name')}"></div>
     ${org ? `<div><label>Authorised signatory *</label><input id="f_signatory" value="${v('signatory')}"></div><div><label>Designation</label><input id="f_designation" value="${v('designation')}" placeholder="Director, Partner, Trustee"></div>
       <div><label>PAN</label><input id="f_pan" value="${v('pan')}" maxlength="10" class="upper"></div><div><label>GSTIN</label><input id="f_gstin" value="${v('gstin')}" maxlength="15" class="upper"></div><div class="span2"><label>CIN / registration number</label><input id="f_regno" value="${v('regno')}"></div>`
      : `<div><label>Relation</label><select id="f_relation">${opts(L('relations'), c.relation)}</select></div><div><label>Father's / husband's name</label><input id="f_parent_name" value="${v('parent_name')}"></div>
       <div><label>Date of birth</label><input id="f_dob" type="date" max="${today()}" value="${v('dob')}"></div><div><label>Age</label><input id="f_age" type="number" min="0" max="120" value="${v('age')}"></div>
       <div><label>Gender</label><select id="f_gender">${opts(L('genders'), c.gender, 'Select')}</select></div><div><label>Occupation</label><input id="f_occupation" value="${v('occupation')}"></div>
       <div><label>PAN (if needed for invoices)</label><input id="f_pan" value="${v('pan')}" maxlength="10" class="upper"></div>`}
    </div></section>
    <section class="card"><h2>3. Contact</h2><div class="g4">
     <div><label>Mobile *</label><input id="f_mobile" value="${v('mobile')}" inputmode="tel" placeholder="10-digit mobile"></div><div><label>Alternate mobile</label><input id="f_alt_mobile" value="${v('alt_mobile')}" inputmode="tel"></div>
     <div><label>Email</label><input id="f_email" type="email" value="${v('email')}"></div><div><label>Preferred language</label><select id="f_language">${opts(L('languages'), c.language, 'Select')}</select></div></div></section>
    <section class="card"><h2>4. Address</h2><div class="small muted">Courts need the complete address in the memo of parties. Type the PIN code first: state, district and area are filled from the India Post list.</div><div class="g4 mt8">
     ${addrFields('a', c.addr, org ? 'Registered office address' : 'Permanent address')}</div>
     <label class="check mt14"><input type="checkbox" id="f_same" ${c.same_addr !== false ? 'checked' : ''}> ${org ? 'Correspondence address is the same' : 'Current address is the same as permanent address'}</label>
     <div class="g4 mt8 ${c.same_addr !== false ? 'hidden' : ''}" id="addr2">${addrFields('b', c.addr2, org ? 'Correspondence address' : 'Current address')}</div></section>
    <section class="card"><h2>5. ID proof</h2><div class="small muted">Add every ID the client gave. For safety, only the last 4 characters are kept, never the full number. An attached copy is also saved under Documents (Identity &amp; KYC).</div>
     <div id="idrows" class="mt14"></div><button class="btn ghost" id="id_add" type="button">+ Add ID proof</button></section>
    <section class="card"><h2>6. Matter and contacts</h2><div class="g4">
     <div class="span2"><label>Other side / opposite party (used for conflict check)</label><input id="f_opposite_party" value="${v('opposite_party')}"></div>
     <div><label>Referred by</label><select id="f_referred_by">${opts(L('referral_sources'), c.referred_by, 'Select')}</select></div><div><label>Referred by: name</label><input id="f_referrer_name" value="${v('referrer_name')}"></div>
     <div><label>Family contact / pairokar</label><input id="f_fc_name" value="${v('fc_name')}"></div><div><label>Relation</label><select id="f_fc_relation">${opts(L('family_relations'), c.fc_relation, 'Select')}</select></div>
     <div><label>Their mobile</label><input id="f_fc_mobile" value="${v('fc_mobile')}" inputmode="tel"></div><div></div>
     <div class="span4"><label>Short note about the matter</label><textarea id="f_matter_note" rows="2">${v('matter_note')}</textarea></div></div></section>
    <section class="card"><h2>7. Documents</h2><div class="small muted">Add as many as needed. Start typing a name and earlier names are suggested. Files are stored encrypted.</div>
     ${existingDocs.length ? `<div class="mt8 small"><b>${existingDocs.length}</b> document${existingDocs.length === 1 ? '' : 's'} already saved for this client. Manage them on the client's Documents tab.</div>` : ''}
     <div id="docrows" class="mt14"></div><button class="btn ghost" id="d_add" type="button">+ Add document</button></section>
    <section class="card"><h2>8. Consent and notes</h2>
     <label class="check"><input type="checkbox" id="f_consent" ${c.consent ? 'checked' : ''}> The client agreed that their details and documents are kept for handling their matters (data protection consent).</label>
     <label>Private notes <span class="muted small">(kept off the memo of parties, letters and invoices)</span></label><textarea id="f_notes" rows="3">${v('notes')}</textarea></section>
   </div>
   <div class="flex end mt20"><button class="btn ghost" id="f_cancel2">Cancel</button><button class="btn" id="f_save2">Save client</button></div><div class="err center" id="f_err"></div>`);

  const collect = () => {
    const g = id => { const el = document.getElementById(id); return el ? el.value.trim() : undefined; };
    const o = { ...c };
    ['name', 'signatory', 'designation', 'pan', 'gstin', 'regno', 'relation', 'parent_name', 'dob', 'age', 'gender', 'occupation', 'mobile', 'alt_mobile', 'email', 'language', 'opposite_party', 'referred_by', 'referrer_name', 'fc_name', 'fc_relation', 'fc_mobile', 'matter_note', 'notes'].forEach(k => { const val = g('f_' + k); if (val !== undefined) o[k] = val; });
    if (o.pan) o.pan = o.pan.toUpperCase(); if (o.gstin) o.gstin = o.gstin.toUpperCase();
    o.addr = A.a ? A.a.read() : o.addr || {};
    o.same_addr = $('#f_same').checked;
    o.addr2 = o.same_addr ? {} : A.b ? A.b.read() : o.addr2 || {};
    o.ids = idRows.map(r => r.read()).filter(x => x.type || x.last4 || x.files.length).map(({ type, last4 }) => ({ type, last4: last4.toUpperCase() }));
    delete o.id_type; delete o.id_last4;
    o.consent = $('#f_consent').checked; if (o.consent && !c.consent) o.consent_at = new Date().toISOString();
    return o;
  };
  // switching type redraws the form but keeps what was typed
  $$('#f_type button').forEach(b => b.onclick = () => { const d = collect(); d.type = b.dataset.t; clientForm.keep = rows.map(r => r.read()); clientForm.keepIds = idRows.map(r => r.read()); clientForm.newFiles = [...newFiles]; clientForm(id, d); });
  const dob = $('#f_dob'); if (dob) dob.onchange = () => { const ag = ageFrom(dob.value); if (ag !== '') $('#f_age').value = ag; };
  $('#f_same').onchange = e => $('#addr2').classList.toggle('hidden', e.target.checked);

  function addRow(init = {}) {
    const r = { files: [...(init.files || [])], el: document.createElement('div') };
    r.el.className = 'docrow';
    r.el.innerHTML = `<div class="dgrid">
      <div><label>Group</label><select class="d_group">${opts(L('doc_groups'), init.group || '', 'Select group')}</select></div>
      <div class="dname"><label>Document name</label><input class="d_name" value="${esc(init.name || '')}" placeholder="Start typing, e.g. F for FIR Copy"></div>
      <div><label>Date on document</label><input class="d_date" type="date" value="${esc(init.date || '')}"></div>
      <div><label>Status</label><select class="d_status">${opts(L('doc_status'), init.status || 'Received')}</select></div>
      <div class="dfiles"><label>Files</label><div class="flex"><button type="button" class="btn ghost sm d_attach">Attach files</button><span class="small muted d_flist"></span></div></div>
      <div class="dnote"><label>Note</label><input class="d_note" value="${esc(init.note || '')}" placeholder="Optional"></div>
      <div class="dx"><label>&nbsp;</label><button type="button" class="btn ghost sm d_remove" title="Remove this document">Remove</button></div></div>
      <div class="drop small muted">or drag files here</div>`;
    $('#docrows').appendChild(r.el);
    const q = s => r.el.querySelector(s);
    const drawFiles = () => { q('.d_flist').innerHTML = r.files.length ? r.files.map((f, i) => `<span class="fchip"><a data-pv="${i}" title="Preview">${esc(f.filename)}</a> <span class="muted">${fsize(f.size)}</span><button type="button" data-rm="${f.fid}" title="Remove file">&times;</button></span>`).join('') : 'No file attached'; r.el.querySelectorAll('[data-pv]').forEach(a => a.onclick = () => openViewer(r.files.map(f => ({ ...f, title: q('.d_name').value.trim() })), +a.dataset.pv)); r.el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { r.files = r.files.filter(f => f.fid !== b.dataset.rm); if (newFiles.includes(b.dataset.rm)) await call('deleteFile', { fid: b.dataset.rm }); drawFiles(); }); };
    const addPaths = async paths => { try { const got = await call('addFiles', { paths }); got.forEach(f => newFiles.push(f.fid)); r.files.push(...got); drawFiles(); if (got.length && q('.d_status').value === 'Pending') q('.d_status').value = 'Received'; } catch (e) { toast(e.message); } };
    q('.d_attach').onclick = () => addPaths(null);
    r.el.addEventListener('dragover', e => { e.preventDefault(); r.el.classList.add('over'); });
    r.el.addEventListener('dragleave', () => r.el.classList.remove('over'));
    r.el.addEventListener('drop', e => { e.preventDefault(); r.el.classList.remove('over'); const ps = [...e.dataTransfer.files].map(f => window.mk.pathOf(f)).filter(Boolean); if (ps.length) addPaths(ps); });
    attachSuggest(q('.d_name'), t => suggestDocs(t, q('.d_group').value), it => { if (!q('.d_group').value && it.group) q('.d_group').value = it.group; });
    q('.d_remove').onclick = async () => { for (const f of r.files) if (newFiles.includes(f.fid)) await call('deleteFile', { fid: f.fid }); rows.splice(rows.indexOf(r), 1); r.el.remove(); };
    r.read = () => ({ group: q('.d_group').value, name: q('.d_name').value.trim(), date: q('.d_date').value, status: q('.d_status').value, note: q('.d_note').value.trim(), files: r.files });
    drawFiles(); rows.push(r);
    return r;
  }
  (clientForm.keep && clientForm.keep.length ? clientForm.keep : (id ? [] : [{}])).forEach(addRow);
  if (clientForm.newFiles) newFiles.push(...clientForm.newFiles);
  clientForm.keep = null; clientForm.newFiles = null;
  $('#d_add').onclick = () => { const r = addRow(); r.el.querySelector('.d_group').focus(); };

  function addIdRow(init = {}) {
    const r = { files: [...(init.files || [])], el: document.createElement('div') }; r.el.className = 'docrow idrow';
    r.el.innerHTML = `<div class="idgrid"><div><label>ID type</label><select class="i_type">${opts(L('id_types'), init.type || '', 'Select')}</select></div>
      <div><label>Last 4 characters only</label><input class="i_last4 upper" value="${esc(init.last4 || '')}" placeholder="e.g. 4821"></div>
      <div class="dfiles"><label>Copy of the ID (optional)</label><div class="flex"><button type="button" class="btn ghost sm i_attach">Attach copy</button><span class="small muted i_flist"></span></div></div>
      <div class="dx"><label>&nbsp;</label><button type="button" class="btn ghost sm i_remove">Remove</button></div></div>`;
    $('#idrows').appendChild(r.el); const q = s => r.el.querySelector(s);
    const draw = () => { q('.i_flist').innerHTML = r.files.length ? r.files.map((f, i) => `<span class="fchip"><a data-pv="${i}" title="Preview">${esc(f.filename)}</a> <span class="muted">${fsize(f.size)}</span><button type="button" data-rm="${f.fid}" title="Remove file">&times;</button></span>`).join('') : 'No copy attached';
      r.el.querySelectorAll('[data-pv]').forEach(a => a.onclick = () => openViewer(r.files.map(f => ({ ...f, title: (q('.i_type').value || 'ID') + ' copy' })), +a.dataset.pv));
      r.el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { r.files = r.files.filter(f => f.fid !== b.dataset.rm); if (newFiles.includes(b.dataset.rm)) await call('deleteFile', { fid: b.dataset.rm }); draw(); }); };
    const add = async paths => { try { const got = await call('addFiles', { paths }); got.forEach(f => newFiles.push(f.fid)); r.files.push(...got); draw(); } catch (e) { toast(e.message); } };
    q('.i_attach').onclick = () => add(null);
    r.el.addEventListener('dragover', e => { e.preventDefault(); r.el.classList.add('over'); }); r.el.addEventListener('dragleave', () => r.el.classList.remove('over'));
    r.el.addEventListener('drop', e => { e.preventDefault(); r.el.classList.remove('over'); const ps = [...e.dataTransfer.files].map(f => window.mk.pathOf(f)).filter(Boolean); if (ps.length) add(ps); });
    q('.i_last4').addEventListener('input', e => { const v = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4); if (v !== e.target.value) e.target.value = v; });
    q('.i_remove').onclick = async () => { for (const f of r.files) if (newFiles.includes(f.fid)) await call('deleteFile', { fid: f.fid }); idRows.splice(idRows.indexOf(r), 1); r.el.remove(); };
    r.read = () => ({ type: q('.i_type').value, last4: q('.i_last4').value.trim(), files: r.files });
    draw(); idRows.push(r); return r;
  }
  const startIds = clientForm.keepIds && clientForm.keepIds.length ? clientForm.keepIds : idsOf(c).length ? idsOf(c) : [{}];
  startIds.forEach(addIdRow); clientForm.keepIds = null;
  $('#id_add').onclick = () => { const r = addIdRow(); r.el.querySelector('.i_type').focus(); };
  wireAddr('a').then(x => A.a = x); wireAddr('b').then(x => A.b = x);

  const back = async () => { for (const fid of newFiles) await call('deleteFile', { fid }); S.cv = id ? { mode: 'detail', id, tab: 'Overview' } : { mode: 'list' }; PAGES.Clients(); };
  $('#f_back').onclick = back; $('#f_cancel').onclick = back; $('#f_cancel2').onclick = back;
  const save = async () => {
    const o = collect(); const err = [];
    const digits = s => String(s || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!o.name) err.push(org ? 'Enter the organisation name.' : 'Enter the client\'s full name.');
    if (org && !o.signatory) err.push('Enter the authorised signatory.');
    if (!o.mobile) err.push('Enter a mobile number.'); else if (digits(o.mobile).length !== 10) err.push('Mobile number should have 10 digits.');
    if (o.alt_mobile && digits(o.alt_mobile).length !== 10) err.push('Alternate mobile should have 10 digits.');
    if (o.fc_mobile && digits(o.fc_mobile).length !== 10) err.push('Family contact mobile should have 10 digits.');
    if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) err.push('Email address does not look right.');
    if (o.addr.pin && !/^[1-9]\d{5}$/.test(o.addr.pin)) err.push('PIN code should be exactly 6 digits.');
    if (o.addr2.pin && !/^[1-9]\d{5}$/.test(o.addr2.pin)) err.push('Second PIN code should be exactly 6 digits.');
    if (o.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(o.pan)) err.push('PAN should look like ABCDE1234F.');
    if (o.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(o.gstin)) err.push('GSTIN should be 15 characters, like 08ABCDE1234F1Z5.');
    const idl = idRows.map(r => r.read()).filter(x => x.type || x.last4 || x.files.length);
    idl.forEach((x, i) => { if (!x.type) err.push(`ID proof ${i + 1}: choose the ID type.`); if (x.last4 && !/^[A-Za-z0-9]{4}$/.test(x.last4)) err.push(`ID proof ${i + 1}: enter exactly the last 4 characters.`); });
    if (o.dob && o.dob > today()) err.push('Date of birth cannot be in the future.');
    const docs = rows.map(r => r.read()).filter(d => d.name || d.files.length || d.group);
    docs.forEach((d, i) => { if (!d.name) err.push(`Document ${i + 1}: enter a document name.`); if (!d.group) err.push(`Document ${i + 1}: choose a group.`); });
    if (err.length) { $('#f_err').innerHTML = err.map(esc).join('<br>'); $('#f_err').scrollIntoView({ block: 'center' }); return; }
    $('#f_err').textContent = '';
    // duplicate and conflict checks
    const others = D.clients.filter(x => x.id !== id);
    const warn = [];
    const dup = others.find(x => digits(x.mobile) === digits(o.mobile) || norm(x.name) === norm(o.name));
    if (dup) warn.push(`A client with the same ${digits(dup.mobile) === digits(o.mobile) ? 'mobile number' : 'name'} already exists: <b>${esc(dup.name)}</b>.`);
    if (o.opposite_party) others.filter(x => norm(x.name) && (norm(x.name) === norm(o.opposite_party))).forEach(x => warn.push(`Possible conflict: the other side, <b>${esc(o.opposite_party)}</b>, is your existing client.`));
    others.filter(x => x.opposite_party && norm(x.opposite_party) === norm(o.name)).forEach(x => warn.push(`Possible conflict: <b>${esc(o.name)}</b> is the other side for your client <b>${esc(x.name)}</b>.`));
    [A.a && A.a.check(), !o.same_addr && A.b && A.b.check()].filter(Boolean).forEach(t => warn.push(esc(t)));
    if (!o.consent) warn.push('The data protection consent box is not ticked.');
    if (warn.length && !save.confirmed) {
      const m = modal(`<h2>Please check before saving</h2>${warn.map(w => `<div class="warnbox mt8">${w}</div>`).join('')}<div class="flex end mt14"><button class="btn ghost" data-x>Go back</button><button class="btn" id="w_go">Save anyway</button></div>`);
      m.querySelector('#w_go').onclick = () => { m.close(); save.confirmed = true; save(); };
      return;
    }
    save.confirmed = false;
    const now = new Date().toISOString();
    if (!id) { o.id = uid(); o.created = now; o.code = nextClientCode(now); D.clients.push(o); } else { o.updated = now; D.clients[D.clients.findIndex(x => x.id === id)] = o; }
    for (const d of docs) D.documents.push({ id: uid(), client_id: o.id, case_id: null, ...d, created: now });
    for (const x of idl) if (x.files.length) D.documents.push({ id: uid(), client_id: o.id, case_id: null, group: 'Identity & KYC', name: x.type + ' copy', date: '', status: 'Received', note: x.last4 ? 'ending ' + x.last4 : '', files: x.files, created: now });
    await saveD('clients', 'documents', 'counters');
    newFiles.length = 0;
    const nd = docs.length + idl.filter(x => x.files.length).length;
    toast(id ? 'Client updated.' : `Client added${nd ? ' with ' + nd + ' document' + (nd === 1 ? '' : 's') : ''}.`);
    S.cv = { mode: 'detail', id: o.id, tab: 'Overview' }; PAGES.Clients();
  };
  $('#f_save').onclick = save; $('#f_save2').onclick = save;
  $('#page').addEventListener('input', () => { if ($('#f_err') && $('#f_err').textContent) $('#f_err').textContent = ''; });
  (document.getElementById('f_name')).focus();
}
/* ---------- client detail ---------- */
function clientDetail(id) {
  const c = D.clients.find(x => x.id === id); if (!c) { S.cv = { mode: 'list' }; return PAGES.Clients(); }
  const T = S.cv.tab || 'Overview'; const docs = clientDocs(id); const pend = docs.filter(d => d.status === 'Pending');
  const adr = x => [x?.line, x?.city, x?.district, x?.state, x?.pin].filter(Boolean).join(', ');
  const rowkv = (k, v) => v ? `<div class="row"><span class="muted">${k}</span><span class="right">${v}</span></div>` : '';
  let body = '';
  if (T === 'Overview') body = `<div class="grid g2">
     <div class="card"><h2>Details</h2>
      ${c.code ? `<div class="codebar"><div class="barcode">${window.code128svg(c.code)}</div><div class="small muted">Client code <b class="mono navytext">${esc(c.code)}</b> &middot; use it on files, folders and invoices</div></div>` : ''}
      ${rowkv('Client type', esc(c.type))}${rowkv(isOrg(c.type) ? 'Authorised signatory' : 'Relation', esc(isOrg(c.type) ? [c.signatory, c.designation].filter(Boolean).join(', ') : c.relation && c.parent_name ? c.relation + ' ' + c.parent_name : ''))}
      ${rowkv('Date of birth / age', esc([c.dob ? fd(c.dob) : '', c.age ? c.age + ' years' : ''].filter(Boolean).join(' · ')))}${rowkv('Gender', esc(c.gender))}${rowkv('Occupation', esc(c.occupation))}
      ${rowkv('PAN', esc(c.pan))}${rowkv('GSTIN', esc(c.gstin))}${rowkv('Registration no.', esc(c.regno))}${rowkv(idsOf(c).length > 1 ? 'ID proofs' : 'ID proof', esc(idsText(c)))}
      ${rowkv('Language', esc(c.language))}${rowkv('Client since', fd(c.created))}${rowkv('Data protection consent', c.consent ? 'Given ' + fd(c.consent_at || c.created) : '<span class="tag warn">Not recorded</span>')}</div>
     <div class="grid"><div class="card"><h2>Contact</h2>${rowkv('Mobile', esc(c.mobile))}${rowkv('Alternate', esc(c.alt_mobile))}${rowkv('Email', esc(c.email))}
       ${rowkv(isOrg(c.type) ? 'Registered office' : 'Permanent address', esc(adr(c.addr)))}${!c.same_addr ? rowkv(isOrg(c.type) ? 'Correspondence' : 'Current address', esc(adr(c.addr2))) : ''}
       ${rowkv('Family contact', esc([c.fc_name, c.fc_relation, c.fc_mobile].filter(Boolean).join(' · ')))}</div>
      <div class="card"><h2>Matter</h2>${rowkv('Other side', esc(c.opposite_party))}${rowkv('Referred by', esc([c.referred_by, c.referrer_name].filter(Boolean).join(': ')))}${c.matter_note ? `<div class="mt8">${esc(c.matter_note)}</div>` : ''}${c.notes ? `<div class="mt8 small muted"><b>Private notes:</b> ${esc(c.notes)}</div>` : ''}
       ${!c.opposite_party && !c.referred_by && !c.matter_note ? '<div class="muted">Nothing recorded yet.</div>' : ''}</div>
      <div class="card"><h2>Documents</h2><div class="row"><span>${docs.length} document${docs.length === 1 ? '' : 's'}</span>${pend.length ? `<span class="tag warn">${pend.length} pending</span>` : '<span class="tag ok">Nothing pending</span>'}</div>${pend.map(d => `<div class="row small"><span>${esc(d.name)}</span><span class="muted">${esc(d.group)}</span></div>`).join('')}<button class="btn ghost sm mt8" data-tab2="Documents">Open documents</button></div></div></div>`;
  if (T === 'Documents') body = docsTab(c, docs);
  if (T === 'Active cases' || T === 'Case history') body = `<div class="card soon"><h2>${T === 'Active cases' ? 'Active cases' : 'Completed cases'} come in Stage 3</h2><div class="muted">Each case will get its own case code linked to this client code (for example ${esc(c.code || 'C26-0001')}/01), with hearings, checklists, outcomes and insights.</div></div>`;
  page(`<div class="top"><div><a id="cd_back">&larr; All clients</a><h1 class="mt8">${esc(c.name)} <span class="codechip mono">${esc(c.code || '')}</span> ${c.status === 'Inactive' ? '<span class="tag warn">Inactive</span>' : ''}</h1>
     <div class="muted">${esc([isOrg(c.type) ? c.type : '', c.mobile, [cityOf(c), stateOf(c)].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div></div>
    <div class="flex"><button class="btn ghost" id="cd_status">${c.status === 'Inactive' ? 'Mark active' : 'Mark inactive'}</button><button class="btn ghost" id="cd_del">Delete</button><button class="btn" id="cd_edit">Edit client</button></div></div>
   <div class="tabs">${['Overview', 'Documents', 'Active cases', 'Case history'].map(t => `<button class="${t === T ? 'on' : ''}" data-tab2="${t}">${t}${t === 'Documents' ? ` <span class="cnt">${docs.length}</span>` : ''}</button>`).join('')}</div>${body}`);
  $('#cd_back').onclick = () => { S.cv = { mode: 'list' }; PAGES.Clients(); };
  $('#cd_edit').onclick = () => { S.cv = { mode: 'form', id }; PAGES.Clients(); };
  $$('[data-tab2]').forEach(b => b.onclick = () => { S.cv.tab = b.dataset.tab2; PAGES.Clients(); });
  $('#cd_status').onclick = async () => { c.status = c.status === 'Inactive' ? 'Active' : 'Inactive'; c.updated = new Date().toISOString(); await saveD('clients'); toast('Client marked ' + c.status.toLowerCase() + '.'); PAGES.Clients(); };
  $('#cd_del').onclick = () => {
    const m = modal(`<h2>Delete ${esc(c.name)}?</h2><div class="warnbox">This removes the client and all ${docs.length} document${docs.length === 1 ? '' : 's'} with their files. It cannot be undone. If the client is only no longer active, use <b>Mark inactive</b> instead.</div><label>Type DELETE to confirm</label><input id="del_txt"><div class="flex end mt14"><button class="btn red" id="del_go">Delete permanently</button></div>`);
    m.querySelector('#del_go').onclick = async () => {
      if ($('#del_txt').value.trim() !== 'DELETE') return toast('Type DELETE in capital letters to confirm.');
      for (const d of docs) for (const f of d.files || []) await call('deleteFile', { fid: f.fid });
      D.documents = D.documents.filter(d => d.client_id !== id); D.clients = D.clients.filter(x => x.id !== id);
      await saveD('clients', 'documents'); m.close(); toast('Client deleted.'); S.cv = { mode: 'list' }; PAGES.Clients();
    };
  };
  if (T === 'Documents') wireDocsTab(c);
}

function docsTab(c, docs, caseId) {
  const F = S.df || (S.df = { group: '', status: '', q: '' });
  const groups = L('doc_groups').filter(g => docs.some(d => d.group === g));
  const shown = docs.filter(d => (!F.group || d.group === F.group) && (!F.status || d.status === F.status));
  const byGroup = groups.map(g => [g, shown.filter(d => d.group === g)]).filter(x => x[1].length);
  const counts = s => docs.filter(d => d.status === s).length;
  return `<div class="kpis k4">${[['', 'All documents', docs.length], ['Received', 'Received', counts('Received')], ['Pending', 'Pending', counts('Pending')], ['Not required', 'Not required', counts('Not required')]].map(([k, t, n]) => `<button class="card kpi ${F.status === k ? 'on' : ''}" data-dst="${k}"><div class="muted small">${t}</div><div class="v">${n}</div></button>`).join('')}</div>
   <div class="card mb14"><div class="filters"><div class="span2"><label>Search documents</label><input id="dq" value="${esc(F.q)}" placeholder="Type a document name or note"></div>
    <div><label>Group</label><select id="dg">${opts(groups, F.group, 'All groups')}</select></div><div><label>&nbsp;</label><button class="btn wide" id="d_new">+ Add document</button></div></div></div>
   <div id="d_newbox"></div>
   ${byGroup.length ? byGroup.map(([g, list]) => `<div class="card mb14 dgroup"><h3>${esc(g)} <span class="muted small">${list.length}</span></h3>
     ${list.map(d => { const cs = !caseId && d.case_id && (D.cases || []).find(x => x.id === d.case_id); return `<div class="docline" data-id="${d.id}" data-s="${esc((d.name + ' ' + (d.note || '') + ' ' + g + ' ' + (cs ? cs.code : '')).toLowerCase())}"><div class="grow"><b>${esc(d.name)}</b>${cs ? ` <span class="codechip mono small">${esc(cs.code)}</span>` : ''}${d.date ? ` <span class="muted small">dated ${fd(d.date)}</span>` : ''}${d.note ? `<div class="small muted">${esc(d.note)}</div>` : ''}
        <div class="mt8">${(d.files || []).map(f => `<span class="fchip"><a data-view-f="${f.fid}" title="View inside Mitakshara">${esc(f.filename)}</a> <span class="muted">${fsize(f.size)}</span> <a data-view-f="${f.fid}">View</a> <a data-save-f="${f.fid}" data-n="${esc(f.filename)}">Save copy</a></span>`).join('') || '<span class="small muted">No file attached</span>'}
        <a class="small" data-more="${d.id}">+ Attach file</a></div></div>
       <select class="w-auto" data-dstatus="${d.id}">${opts(L('doc_status'), d.status)}</select><button class="btn ghost sm" data-ddel="${d.id}" title="Delete document">Delete</button></div>`; }).join('')}</div>`).join('')
    : `<div class="empty card"><b>${docs.length ? 'No document matches these filters.' : 'No documents yet.'}</b><div class="muted">Press <b>+ Add document</b> to add one.</div></div>`}`;
}
function wireDocsTab(c, caseId) {
  const F = S.df;
  $$('[data-dst]').forEach(b => b.onclick = () => { F.status = b.dataset.dst; redraw(); });
  $('#dg').onchange = e => { F.group = e.target.value; redraw(); };
  const q = $('#dq'); const filt = () => { F.q = q.value; const t = q.value.trim().toLowerCase(); $$('.docline').forEach(r => r.classList.toggle('hidden', !!t && !r.dataset.s.includes(t))); $$('.dgroup').forEach(g => g.classList.toggle('hidden', !g.querySelector('.docline:not(.hidden)'))); };
  q.addEventListener('input', filt); filt();
  // every visible file, in screen order, so Previous / Next walks through the client's documents
  const vis = () => { const out = []; $$('.docline:not(.hidden)').forEach(r => { const d = D.documents.find(x => x.id === r.dataset.id); (d.files || []).forEach(f => out.push({ ...f, title: d.name })); }); return out; };
  $$('[data-view-f]').forEach(a => a.onclick = () => { const list = vis(); openViewer(list, Math.max(0, list.findIndex(f => f.fid === a.dataset.viewF))); });
  $$('[data-save-f]').forEach(a => a.onclick = async () => { try { if (await call('exportFile', { fid: a.dataset.saveF, filename: a.dataset.n })) toast('Copy saved.'); } catch (e) { toast(e.message); } });
  $$('[data-dstatus]').forEach(s => s.onchange = async () => { const d = D.documents.find(x => x.id === s.dataset.dstatus); d.status = s.value; d.updated = new Date().toISOString(); await saveD('documents'); toast('Status updated.'); redraw(); });
  $$('[data-more]').forEach(a => a.onclick = async () => { const d = D.documents.find(x => x.id === a.dataset.more); try { const got = await call('addFiles', {}); if (!got.length) return; d.files = [...(d.files || []), ...got]; if (d.status === 'Pending') d.status = 'Received'; await saveD('documents'); toast('File attached.'); redraw(); } catch (e) { toast(e.message); } });
  $$('[data-ddel]').forEach(b => b.onclick = () => {
    const d = D.documents.find(x => x.id === b.dataset.ddel);
    const m = modal(`<h2>Delete "${esc(d.name)}"?</h2><p>The document and its ${(d.files || []).length} file(s) will be removed permanently.</p><div class="flex end mt14"><button class="btn ghost" data-x>Keep it</button><button class="btn red" id="dd_go">Delete</button></div>`);
    m.querySelector('#dd_go').onclick = async () => { for (const f of d.files || []) await call('deleteFile', { fid: f.fid }); D.documents = D.documents.filter(x => x.id !== d.id); await saveD('documents'); m.close(); toast('Document deleted.'); redraw(); };
  });
  $('#d_new').onclick = () => newDocsBox(c, caseId);
}
function newDocsBox(c, caseId) {
  // reuse the same row editor as the client form
  const host = $('#d_newbox'); if (host.dataset.open) return; host.dataset.open = '1';
  host.innerHTML = `<div class="card mb14"><h3>Add documents for ${esc(c.name)}</h3><div id="docrows"></div><div class="flex between"><button class="btn ghost" id="d_add" type="button">+ Another document</button><div class="flex"><button class="btn ghost" id="nd_cancel">Cancel</button><button class="btn" id="nd_save">Save documents</button></div></div><div class="err" id="nd_err"></div></div>`;
  const rows = [], newFiles = [];
  const addRow = () => {
    const r = { files: [], el: document.createElement('div') }; r.el.className = 'docrow';
    r.el.innerHTML = `<div class="dgrid"><div><label>Group</label><select class="d_group">${opts(L('doc_groups'), '', 'Select group')}</select></div>
      <div class="dname"><label>Document name</label><input class="d_name" placeholder="Start typing"></div><div><label>Date on document</label><input class="d_date" type="date"></div>
      <div><label>Status</label><select class="d_status">${opts(L('doc_status'), 'Received')}</select></div>
      <div class="dfiles"><label>Files</label><div class="flex"><button type="button" class="btn ghost sm d_attach">Attach files</button><span class="small muted d_flist">No file attached</span></div></div>
      <div class="dnote"><label>Note</label><input class="d_note" placeholder="Optional"></div><div class="dx"><label>&nbsp;</label><button type="button" class="btn ghost sm d_remove">Remove</button></div></div><div class="drop small muted">or drag files here</div>`;
    $('#docrows').appendChild(r.el); const q = s => r.el.querySelector(s);
    const draw = () => { q('.d_flist').innerHTML = r.files.length ? r.files.map((f, i) => `<span class="fchip"><a data-pv="${i}" title="Preview">${esc(f.filename)}</a> <span class="muted">${fsize(f.size)}</span></span>`).join('') : 'No file attached'; r.el.querySelectorAll('[data-pv]').forEach(a => a.onclick = () => openViewer(r.files.map(f => ({ ...f, title: q('.d_name').value.trim() })), +a.dataset.pv)); };
    const add = async paths => { try { const got = await call('addFiles', { paths }); got.forEach(f => newFiles.push(f.fid)); r.files.push(...got); draw(); } catch (e) { toast(e.message); } };
    q('.d_attach').onclick = () => add(null);
    r.el.addEventListener('dragover', e => { e.preventDefault(); r.el.classList.add('over'); }); r.el.addEventListener('dragleave', () => r.el.classList.remove('over'));
    r.el.addEventListener('drop', e => { e.preventDefault(); r.el.classList.remove('over'); const ps = [...e.dataTransfer.files].map(f => window.mk.pathOf(f)).filter(Boolean); if (ps.length) add(ps); });
    attachSuggest(q('.d_name'), t => suggestDocs(t, q('.d_group').value), it => { if (!q('.d_group').value && it.group) q('.d_group').value = it.group; });
    q('.d_remove').onclick = async () => { for (const f of r.files) await call('deleteFile', { fid: f.fid }); rows.splice(rows.indexOf(r), 1); r.el.remove(); };
    r.read = () => ({ group: q('.d_group').value, name: q('.d_name').value.trim(), date: q('.d_date').value, status: q('.d_status').value, note: q('.d_note').value.trim(), files: r.files });
    rows.push(r); q('.d_group').focus();
  };
  addRow();
  $('#d_add').onclick = addRow;
  $('#nd_cancel').onclick = async () => { for (const f of newFiles) await call('deleteFile', { fid: f }); redraw(); };
  $('#nd_save').onclick = async () => {
    const docs = rows.map(r => r.read()).filter(d => d.name || d.group || d.files.length);
    const err = []; docs.forEach((d, i) => { if (!d.name) err.push(`Document ${i + 1}: enter a name.`); if (!d.group) err.push(`Document ${i + 1}: choose a group.`); });
    if (!docs.length) err.push('Add at least one document.');
    if (err.length) return $('#nd_err').innerHTML = err.map(esc).join('<br>');
    const now = new Date().toISOString(); docs.forEach(d => D.documents.push({ id: uid(), client_id: c.id, case_id: caseId || null, ...d, created: now }));
    await saveD('documents'); toast(docs.length + ' document' + (docs.length === 1 ? '' : 's') + ' saved.'); redraw();
  };
}

/* ---------- Today: real numbers ---------- */
const _today = PAGES.Today;
PAGES.Today = async () => {
  await loadD(); _today();
  const pend = D.documents.filter(d => d.status === 'Pending');
  const box = document.createElement('div'); box.className = 'statgrid';
  box.innerHTML = `<button class="card stat click" data-go="clients"><div class="muted small">Clients</div><div class="v">${D.clients.filter(c => c.status !== 'Inactive').length}</div><div class="small muted">active · ${D.clients.length} in total</div></button>
   <button class="card stat click" data-go="docs"><div class="muted small">Documents stored</div><div class="v">${D.documents.length}</div><div class="small muted">${D.documents.reduce((n, d) => n + (d.files || []).length, 0)} files, all encrypted</div></button>
   <button class="card stat click" data-go="pending"><div class="muted small">Documents pending</div><div class="v">${pend.length}</div><div class="small muted">from ${new Set(pend.map(d => d.client_id)).size} clients</div></button>
   <button class="card stat click" data-go="add"><div class="muted small">Quick action</div><div class="v small-v">+ Add client</div><div class="small muted">with documents</div></button>`;
  const first = $('#page .statgrid'); first.parentNode.insertBefore(box, first.nextSibling);
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    S.tab = 'Clients';
    if (b.dataset.go === 'add') S.cv = { mode: 'form', id: null };
    else { S.cv = { mode: 'list' }; S.cf.box = b.dataset.go === 'pending' ? 'pending' : ''; }
    shellView();
  });
};

/* ---------- Settings: editable dropdown lists ---------- */
const _settings = PAGES.Settings;
PAGES.Settings = async () => {
  await loadD(); await _settings();
  const card = document.createElement('div'); card.className = 'card mt14';
  const draw = () => {
    card.innerHTML = `<h2>Lists used in dropdowns</h2><div class="muted small mb14">Add or remove options. Changes apply everywhere straight away. Removing an option does not change records that already use it.</div>
     <div class="grid g3">${Object.entries(LIST_LABELS).map(([k, t]) => `<div><h3>${t}</h3><div class="chips">${L(k).map((o, i) => `<span class="lchip">${esc(o)}<button data-lrm="${k}" data-i="${i}" title="Remove">&times;</button></span>`).join('')}</div>
       <div class="flex mt8"><input class="grow" data-lin="${k}" placeholder="Add an option"><button class="btn ghost sm" data-ladd="${k}">Add</button></div></div>`).join('')}</div>
     <div class="flex end mt14"><button class="btn ghost sm" id="l_reset">Restore original lists</button></div>`;
    card.querySelectorAll('[data-lrm]').forEach(b => b.onclick = async () => { const k = b.dataset.lrm; const arr = [...L(k)]; if (arr.length <= 1) return toast('Keep at least one option.'); arr.splice(+b.dataset.i, 1); D.lists[k] = arr; await call('setData', { key: 'lists', value: D.lists }); draw(); });
    card.querySelectorAll('[data-ladd]').forEach(b => { const k = b.dataset.ladd; const inp = card.querySelector(`[data-lin="${k}"]`);
      const add = async () => { const v = inp.value.trim(); if (!v) return; if (L(k).some(x => x.toLowerCase() === v.toLowerCase())) return toast('Already in the list.'); D.lists[k] = [...L(k), v]; await call('setData', { key: 'lists', value: D.lists }); toast('Added.'); draw(); };
      b.onclick = add; inp.onkeydown = e => { if (e.key === 'Enter') add(); }; });
    card.querySelector('#l_reset').onclick = async () => { D.lists = { ...DEFAULT_LISTS }; await call('setData', { key: 'lists', value: {} }); toast('Original lists restored.'); draw(); };
  };
  draw(); $('#page').appendChild(card);
  const src = document.createElement('div'); src.className = 'small muted mt14';
  src.textContent = 'PIN code data: ' + (await call('pinSource')) + '. Works offline.';
  $('#page').appendChild(src);
};
