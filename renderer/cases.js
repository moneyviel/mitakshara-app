'use strict';
/* Stage 3: cases, hearings (checklist + after-hearing steps), diary, team and insights. */

/* ---------- helpers ---------- */
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const fdd = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clientById = id => D.clients.find(c => c.id === id);
const caseById = id => D.cases.find(c => c.id === id);
const clientCases = id => D.cases.filter(c => c.client_id === id);
const caseHearings = id => D.hearings.filter(h => h.case_id === id).sort((a, b) => a.date.localeCompare(b.date));
const caseDocsOf = id => D.documents.filter(d => d.case_id === id);
const isFinalOutcome = o => /case ends/i.test(o || '');
const isAdjourned = o => o === 'Adjourned';
const notUpdated = () => D.hearings.filter(h => !h.done && h.date < todayISO() && caseById(h.case_id)?.status !== 'Completed');
function nextHearing(cid) { const hs = caseHearings(cid).filter(h => !h.done); return hs[0] || null; }
function teamAll(includeInactive) {
  const me = { id: 'me', name: (S.status.vault.profile?.name || 'Me'), role: 'Advocate (you)', duties: [] };
  return [me, ...D.team.filter(t => includeInactive || t.active !== false)];
}
const memberName = id => (teamAll(true).find(m => m.id === id) || { name: 'Former member' }).name;
const namesOf = ids => (ids || []).map(memberName).join(', ');
function caseCode(client, category) {
  const k = 'case_' + client.id; D.counters[k] = (D.counters[k] || 0) + 1;
  const tag = CAT_CODE[category] || String(category || 'OT').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase().padEnd(2, 'X');
  return `${client.code}/${String(D.counters[k]).padStart(2, '0')}-${tag}`;
}
const caseTitle = cs => cs.title || '(untitled case)';
const courtOf = cs => [cs.court_name || cs.court_level, cs.district].filter(Boolean).join(', ');
const newChecklist = prev => L('checklist_items').map(item => {
  const p = prev && (prev.checklist || []).find(x => x.item === item);
  return { item, state: p && p.state === 'Not required' ? 'Not required' : 'Pending' };
});
const ckProgress = h => { const c = h.checklist || []; const need = c.filter(x => x.state !== 'Not required'); return { ready: need.filter(x => x.state === 'Ready').length, need: need.length }; };
async function saveAll() { await saveD('cases', 'hearings', 'documents', 'counters', 'team'); }

/* ---------- insights ---------- */
function caseInsights(cs) {
  const hs = caseHearings(cs.id); const done = hs.filter(h => h.done);
  const adj = done.filter(h => isAdjourned(h.outcome));
  const why = {}; adj.forEach(h => { const r = h.adj_reason || 'Not noted'; why[r] = (why[r] || 0) + 1; });
  const ours = adj.filter(h => h.adj_reason === 'At our request').length;
  const theirs = adj.filter(h => h.adj_reason === "At other side's request").length;
  const att = {}; done.forEach(h => (h.attended || []).forEach(m => att[m] = (att[m] || 0) + 1));
  const start = cs.filing_date || (cs.created || '').slice(0, 10);
  const end = cs.status === 'Completed' ? (cs.result_date || todayISO()) : todayISO();
  const gaps = []; for (let i = 1; i < done.length; i++) gaps.push(daysBetween(done[i - 1].date, done[i].date));
  return {
    age: start ? daysBetween(start, end) : 0, held: done.length, adj: adj.length, why, ours, theirs,
    effective: done.length ? Math.round(100 * (done.length - adj.length) / done.length) : 0,
    att, avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0,
    next: nextHearing(cs.id), docs: caseDocsOf(cs.id), pend: caseDocsOf(cs.id).filter(d => d.status === 'Pending').length,
  };
}
function clientInsights(c) {
  const cs = clientCases(c.id); const act = cs.filter(x => x.status !== 'Completed'); const fin = cs.filter(x => x.status === 'Completed');
  const won = fin.filter(x => x.result === 'Won').length, part = fin.filter(x => x.result === 'Partly won').length, lost = fin.filter(x => x.result === 'Lost').length;
  const decided = won + part + lost;
  const durs = fin.map(x => daysBetween(x.filing_date || x.created.slice(0, 10), x.result_date || todayISO())).filter(n => n >= 0);
  const hs = D.hearings.filter(h => cs.some(x => x.id === h.case_id));
  const nexts = hs.filter(h => !h.done && h.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date));
  const lastTouch = [...hs.filter(h => h.done).map(h => h.date), ...clientDocs(c.id).map(d => (d.created || '').slice(0, 10))].sort().pop();
  return {
    total: cs.length, active: act.length, done: fin.length, won, part, lost, settled: fin.filter(x => x.result === 'Settled / compromise').length,
    rate: decided ? Math.round(100 * (won + part * 0.5) / decided) : null, avgDays: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
    hearings: hs.filter(h => h.done).length, next: nexts[0], lastTouch,
  };
}

/* ---------- case list ---------- */
S.kv = { mode: 'list' };
S.kf = { q: '', status: 'Active', cat: '', type: '', level: '', court: '', stage: '', lead: '', box: '' };
PAGES.Cases = async () => {
  await loadD();
  if (S.kv.mode === 'form') return caseForm(S.kv.id, S.kv.client);
  if (S.kv.mode === 'detail') return caseDetail(S.kv.id);
  const F = S.kf; const C = D.cases; const t0 = todayISO(); const yr = t0.slice(0, 4);
  const nu = new Set(notUpdated().map(h => h.case_id));
  const nxt = cs => nextHearing(cs.id);
  const boxes = [
    ['', 'All cases', c => true],
    ['active', 'Active', c => c.status !== 'Completed'],
    ['week', 'Hearing in next 7 days', c => { const n = nxt(c); return n && n.date >= t0 && n.date <= addDays(t0, 7); }],
    ['nu', 'Outcome not recorded', c => nu.has(c.id)],
    ['nodate', 'Active, no next date', c => c.status !== 'Completed' && !nxt(c)],
    ['doneyr', 'Completed this year', c => c.status === 'Completed' && (c.result_date || '').startsWith(yr)],
  ];
  const boxFn = (boxes.find(b => b[0] === F.box) || boxes[0])[2];
  const uniq = f => [...new Set(C.map(f).filter(Boolean))].sort();
  const list = C.filter(c => boxFn(c) && (!F.status || (F.status === 'Active' ? c.status !== 'Completed' : c.status === 'Completed'))
    && (!F.cat || c.category === F.cat) && (!F.type || c.case_type === F.type) && (!F.level || c.court_level === F.level) && (!F.court || c.court_name === F.court)
    && (!F.stage || c.stage === F.stage) && (!F.lead || c.lead === F.lead))
    .sort((a, b) => ((nxt(a) || {}).date || '9999').localeCompare((nxt(b) || {}).date || '9999') || a.code.localeCompare(b.code));
  const sel = (k, label, arr, blank = 'All') => `<div><label>${label}</label><select data-kf="${k}">${opts(arr, F[k], blank)}</select></div>`;
  page(`<div class="top"><div><h1>Cases</h1><div class="muted">Every case has its own code, linked to the client code.</div></div><button class="btn" id="k_add">New case</button></div>
   <div class="kpis">${boxes.map(([k, t, f]) => `<button class="card kpi ${F.box === k ? 'on' : ''} ${k === 'nu' && C.filter(f).length ? 'alert' : ''}" data-kbox="${k}"><div class="muted small">${t}</div><div class="v">${C.filter(f).length}</div></button>`).join('')}</div>
   <div class="card mb14"><div class="filters">
    <div class="span2"><label>Search</label><input id="k_q" value="${esc(F.q)}" placeholder="Case code, title, case number, CNR, client, other side, judge"></div>
    <div><label>Status</label><select data-kf="status"><option value="">All</option>${['Active', 'Completed'].map(o => `<option ${F.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
    ${sel('cat', 'Category', L('case_categories'))}${sel('type', 'Case type', uniq(c => c.case_type))}${sel('level', 'Court level', uniq(c => c.court_level))}${sel('court', 'Court', uniq(c => c.court_name))}${sel('stage', 'Stage', L('case_stages'))}
    <div><label>Lead</label><select data-kf="lead"><option value="">Anyone</option>${teamAll(true).map(m => `<option value="${m.id}" ${F.lead === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
    <div><label>&nbsp;</label><button class="btn ghost wide" id="k_clear">Clear</button></div></div></div>
   <div class="card"><div class="flex between mb14"><h2 class="nomb">Case list</h2><span class="muted small"><span id="k_count">${list.length}</span> shown</span></div>
   ${C.length ? `<div class="tblwrap"><table class="tbl" id="k_tbl"><thead><tr><th>Code</th><th>Case</th><th>Client</th><th>Court</th><th>Stage</th><th>Next date</th><th>Lead</th></tr></thead><tbody>
    ${list.map(c => { const cl = clientById(c.client_id) || {}; const n = nxt(c); return `<tr class="click" data-kopen="${c.id}" data-s="${esc([c.code, c.title, c.case_type, c.case_no, c.case_year, c.cnr, cl.name, cl.code, c.opposite_party, c.judge, c.court_name].join(' ').toLowerCase())}">
     <td class="mono small">${esc(c.code)}</td><td><b>${esc(caseTitle(c))}</b><div class="small muted">${esc([c.case_type, c.case_no ? 'No. ' + c.case_no + (c.case_year ? '/' + c.case_year : '') : ''].filter(Boolean).join(' · '))}</div></td>
     <td>${esc(cl.name || '-')}</td><td class="small">${esc(courtOf(c) || '-')}</td><td class="small">${esc(c.status === 'Completed' ? 'Completed: ' + (c.result || '') : c.stage || '-')}</td>
     <td class="small">${n ? `${fdd(n.date)}${n.date < t0 ? ' <span class="tag bad">update</span>' : n.date === t0 ? ' <span class="tag warn">today</span>' : ''}` : c.status === 'Completed' ? '-' : '<span class="tag grey">not fixed</span>'}</td>
     <td class="small">${esc(c.lead ? memberName(c.lead) : '-')}</td></tr>`; }).join('')}</tbody></table></div><div class="muted center hidden mt14" id="k_none">No case matches the search.</div>`
    : `<div class="empty"><b>No cases yet.</b><div class="muted">Press <b>New case</b>. Every case is linked to a client.</div></div>`}</div>`);
  $('#k_add').onclick = () => { S.kv = { mode: 'form' }; PAGES.Cases(); };
  $$('[data-kbox]').forEach(b => b.onclick = () => { F.box = b.dataset.kbox; if (['nu', 'nodate', 'week'].includes(F.box)) F.status = 'Active'; if (F.box === 'doneyr') F.status = 'Completed'; PAGES.Cases(); });
  $$('[data-kf]').forEach(s => s.onchange = () => { F[s.dataset.kf] = s.value; PAGES.Cases(); });
  $('#k_clear').onclick = () => { Object.assign(F, { q: '', status: 'Active', cat: '', type: '', level: '', court: '', stage: '', lead: '', box: '' }); PAGES.Cases(); };
  $$('[data-kopen]').forEach(r => r.onclick = () => { S.kv = { mode: 'detail', id: r.dataset.kopen, tab: 'Overview' }; PAGES.Cases(); });
  const q = $('#k_q'); const filt = () => { F.q = q.value; const t = q.value.trim().toLowerCase(); let n = 0; $$('#k_tbl tbody tr').forEach(r => { const s = !t || r.dataset.s.includes(t); r.classList.toggle('hidden', !s); if (s) n++; }); if ($('#k_count')) $('#k_count').textContent = n; if ($('#k_none')) $('#k_none').classList.toggle('hidden', n > 0); };
  q.addEventListener('input', filt); filt(); if (F.q) { q.focus(); q.setSelectionRange(F.q.length, F.q.length); }
};

/* ---------- new / edit case ---------- */
function caseForm(id, presetClient) {
  if (!D.clients.length) { page(`<div class="top"><div><a id="kf_back">&larr; Cases</a><h1 class="mt8">New case</h1></div></div><div class="card empty"><b>Add a client first.</b><div class="muted">Every case belongs to a client.</div><button class="btn mt14" id="kf_cl">Add client</button></div>`);
    $('#kf_back').onclick = () => { S.kv = { mode: 'list' }; PAGES.Cases(); }; $('#kf_cl').onclick = () => { S.tab = 'Clients'; S.cv = { mode: 'form' }; shellView(); }; return; }
  const cs = id ? JSON.parse(JSON.stringify(caseById(id))) : { client_id: presetClient || '', category: 'Criminal', our_side: '', status: 'Active', stage: 'Filing', lead: 'me' };
  const v = k => esc(cs[k] ?? '');
  const courts = [...new Set(D.cases.map(c => c.court_name).filter(Boolean))].sort();
  const types = [...new Set([...L('case_types'), ...D.cases.map(c => c.case_type).filter(Boolean)])];
  const clientsSorted = [...D.clients].sort((a, b) => a.name.localeCompare(b.name));
  const thisYear = new Date().getFullYear();
  page(`<div class="top"><div><a id="kf_back">&larr; ${id ? 'Back to case' : 'Cases'}</a><h1 class="mt8">${id ? 'Edit case <span class="codechip mono">' + esc(cs.code) + '</span>' : 'New case'}</h1><div class="muted">Fields marked * are needed. The case code is made automatically from the client code.</div></div>
    <div class="flex"><button class="btn ghost" id="kf_cancel">Cancel</button><button class="btn" id="kf_save">Save case</button></div></div>
   <div class="formgrid">
    <section class="card"><h2>1. Client and type</h2><div class="g4">
     <div class="span2"><label>Client *</label><select id="k_client_id" ${id ? 'disabled' : ''}><option value="">Select client</option>${clientsSorted.map(c => `<option value="${c.id}" ${c.id === cs.client_id ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select>${id ? '<div class="small muted">The client of a saved case cannot change, because the case code is built from the client code.</div>' : ''}</div>
     <div><label>Category *</label><select id="k_category" ${id ? 'disabled' : ''}>${opts(L('case_categories'), cs.category)}</select></div>
     <div><label>Case type *</label><input id="k_case_type" list="k_types" value="${v('case_type')}" placeholder="Type or pick"><datalist id="k_types">${types.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
     <div><label>Our client is the *</label><select id="k_our_side">${opts(L('our_sides'), cs.our_side, 'Select')}</select></div>
     <div class="span2"><label>Other side / opposite party</label><input id="k_opposite_party" value="${v('opposite_party')}" placeholder="e.g. State of Rajasthan"></div>
     <div><label>Other side's advocate</label><input id="k_opp_advocate" value="${v('opp_advocate')}"></div>
     <div class="span4"><label>Case title (as in the cause list)</label><input id="k_title" value="${v('title')}" placeholder="Filled automatically, e.g. State vs Sunita Rao"></div></div></section>
    <section class="card"><h2>2. Court</h2><div class="g4">
     <div><label>Court level *</label><select id="k_court_level">${opts(L('court_levels'), cs.court_level, 'Select')}</select></div>
     <div class="span2"><label>Court name</label><input id="k_court_name" list="k_courts" value="${v('court_name')}" placeholder="e.g. ADJ No. 3, Jaipur Metropolitan"><datalist id="k_courts">${courts.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
     <div><label>Judge / court room</label><input id="k_judge" value="${v('judge')}"></div>
     <div><label>State</label><select id="k_state">${opts(L('states'), cs.state, 'Select state')}</select></div>
     <div><label>District</label><select id="k_district"><option value="">Select state first</option>${cs.district ? `<option selected>${esc(cs.district)}</option>` : ''}</select></div>
     <div><label>Case number</label><input id="k_case_no" value="${v('case_no')}" placeholder="e.g. 412"></div>
     <div><label>Year</label><input id="k_case_year" value="${v('case_year')}" inputmode="numeric" maxlength="4" placeholder="${thisYear}"></div>
     <div><label>CNR number (eCourts)</label><input id="k_cnr" value="${v('cnr')}" class="upper" placeholder="16 characters, e.g. RJJP010012342026"></div>
     <div><label>Filing date</label><input id="k_filing_date" type="date" max="${todayISO()}" value="${v('filing_date')}"></div>
     <div><label>Stage now</label><select id="k_stage">${opts(L('case_stages'), cs.stage)}</select></div>
     <div><label>Lead advocate</label><select id="k_lead">${teamAll().map(m => `<option value="${m.id}" ${m.id === cs.lead ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div></section>
    ${id ? '' : `<section class="card"><h2>3. First / next hearing</h2><div class="small muted">A pre-hearing checklist is made for this date automatically.</div><div class="g4 mt8">
     <div><label>Date</label><input id="k_h_date" type="date"></div><div><label>Purpose</label><select id="k_h_purpose">${opts(L('hearing_purposes'), '', 'Select')}</select></div>
     <div><label>Who will attend</label><select id="k_h_assigned">${teamAll().map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div><div><label>Item no. (cause list)</label><input id="k_h_item" inputmode="numeric"></div></div></section>`}
    <section class="card"><h2>${id ? '3' : '4'}. Fee and notes</h2><div class="g4">
     <div><label>Fee agreed (&#8377;)</label><input id="k_fee" value="${v('fee')}" inputmode="numeric" placeholder="Optional"></div>
     <div class="span3"><label>Private notes</label><input id="k_notes" value="${v('notes')}" placeholder="Strategy, reminders (never printed)"></div></div></section>
   </div>
   <div class="flex end mt20"><button class="btn ghost" id="kf_cancel2">Cancel</button><button class="btn" id="kf_save2">Save case</button></div><div class="err center" id="kf_err"></div>`);
  const g = k => { const el = document.getElementById('k_' + k); return el ? el.value.trim() : ''; };
  // automatic title, until the user types their own
  let titleTouched = !!cs.title;
  $('#k_title').addEventListener('input', () => titleTouched = !!$('#k_title').value.trim());
  const autoTitle = () => { if (titleTouched) return; const c = clientById(g('client_id')); const opp = g('opposite_party'); if (!c) return;
    const theyFirst = ['Respondent', 'Defendant', 'Accused', 'Opposite Party'].includes(g('our_side'));
    $('#k_title').value = opp ? (theyFirst ? `${opp} vs ${c.name}` : `${c.name} vs ${opp}`) : c.name; };
  ['client_id', 'our_side', 'opposite_party'].forEach(k => document.getElementById('k_' + k).addEventListener(k === 'opposite_party' ? 'input' : 'change', autoTitle));
  $('#k_client_id').addEventListener('change', () => { const c = clientById(g('client_id')); if (c && !g('opposite_party') && c.opposite_party) { $('#k_opposite_party').value = c.opposite_party; } if (c && !$('#k_state').value && c.addr?.state) { $('#k_state').value = c.addr.state; fillDist(c.addr.district || ''); } autoTitle(); });
  // district list follows the state
  const fillDist = async keep => { const st = $('#k_state').value; const ds = st ? await call('districtsOf', { state: st }) : []; const all = keep && !ds.includes(keep) ? [keep, ...ds] : ds;
    $('#k_district').innerHTML = `<option value="">${st ? 'Select district' : 'Select state first'}</option>` + all.map(d => `<option ${d === keep ? 'selected' : ''}>${esc(d)}</option>`).join(''); };
  $('#k_state').onchange = () => fillDist(''); fillDist(cs.district);
  if (!id && cs.client_id) $('#k_client_id').dispatchEvent(new Event('change'));
  $('#k_cnr').addEventListener('input', e => { const x = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16); if (x !== e.target.value) e.target.value = x; });
  $('#k_case_year').addEventListener('input', e => { const x = e.target.value.replace(/\D/g, '').slice(0, 4); if (x !== e.target.value) e.target.value = x; });
  $('#k_fee').addEventListener('input', e => { const x = e.target.value.replace(/[^\d]/g, ''); if (x !== e.target.value) e.target.value = x; });
  const back = () => { S.kv = id ? { mode: 'detail', id, tab: 'Overview' } : presetClient ? null : { mode: 'list' }; if (!S.kv) { S.kv = { mode: 'list' }; S.tab = 'Clients'; S.cv = { mode: 'detail', id: presetClient, tab: 'Active cases' }; return shellView(); } PAGES.Cases(); };
  $('#kf_back').onclick = back; $('#kf_cancel').onclick = back; $('#kf_cancel2').onclick = back;
  const save = async () => {
    const o = { ...cs }; const err = [];
    ['case_type', 'our_side', 'opposite_party', 'opp_advocate', 'title', 'court_level', 'court_name', 'judge', 'state', 'district', 'case_no', 'case_year', 'cnr', 'filing_date', 'stage', 'lead', 'fee', 'notes'].forEach(k => o[k] = g(k));
    if (!id) { o.client_id = g('client_id'); o.category = g('category'); }
    if (!o.client_id) err.push('Choose the client.');
    if (!o.case_type) err.push('Enter the case type.');
    if (!o.our_side) err.push('Choose which side our client is.');
    if (!o.court_level) err.push('Choose the court level.');
    if (o.case_year && (!/^\d{4}$/.test(o.case_year) || +o.case_year < 1950 || +o.case_year > thisYear + 1)) err.push('Year should be 4 digits, like ' + thisYear + '.');
    if (o.cnr && !/^[A-Z]{4}\d{12}$/.test(o.cnr)) err.push('CNR should be 16 characters: 4 letters then 12 digits.');
    if (o.filing_date && o.filing_date > todayISO()) err.push('Filing date cannot be in the future.');
    const hd = !id ? g('h_date') : '';
    if (hd && o.filing_date && hd < o.filing_date) err.push('The hearing date is before the filing date.');
    if (err.length) { $('#kf_err').innerHTML = err.map(esc).join('<br>'); $('#kf_err').scrollIntoView({ block: 'center' }); return; }
    if (!o.title) { const c = clientById(o.client_id); o.title = o.opposite_party ? `${c.name} vs ${o.opposite_party}` : c.name; }
    const dup = o.case_no && D.cases.find(x => x.id !== id && x.case_no === o.case_no && x.case_year === o.case_year && (x.court_name || '') === (o.court_name || ''));
    if (dup && !save.ok) { const m = modal(`<h2>Same case number already saved</h2><div class="warnbox">${esc(dup.code)} · ${esc(caseTitle(dup))} has case number ${esc(o.case_no)}/${esc(o.case_year || '')} in the same court.</div><div class="flex end mt14"><button class="btn ghost" data-x>Go back</button><button class="btn" id="dk_go">Save anyway</button></div>`); m.querySelector('#dk_go').onclick = () => { m.close(); save.ok = true; save(); }; return; }
    save.ok = false;
    const now = new Date().toISOString();
    if (!id) {
      o.id = uid(); o.created = now; o.status = 'Active'; o.code = caseCode(clientById(o.client_id), o.category); D.cases.push(o);
      if (hd) D.hearings.push({ id: uid(), case_id: o.id, date: hd, purpose: g('h_purpose'), item_no: g('h_item'), assigned: [g('h_assigned')].filter(Boolean), checklist: newChecklist(), done: false, created: now });
    } else { o.updated = now; D.cases[D.cases.findIndex(x => x.id === id)] = o; }
    await saveAll(); toast(id ? 'Case updated.' : `Case ${o.code} created.`);
    S.tab = 'Cases'; S.kv = { mode: 'detail', id: o.id, tab: 'Overview' }; shellView();
  };
  $('#kf_save').onclick = save; $('#kf_save2').onclick = save;
  $('#page').addEventListener('input', () => { if ($('#kf_err')) $('#kf_err').textContent = ''; });
}

/* ---------- checklist block (shared by case page and diary) ---------- */
function checklistHtml(h) {
  const p = ckProgress(h);
  return `<div class="cklist" data-ck="${h.id}"><div class="flex between"><b>Pre-hearing checklist</b><span class="small ${p.ready === p.need ? 'oktext' : 'muted'}">${p.ready} of ${p.need} ready</span></div>
   ${(h.checklist || []).map((x, i) => `<div class="ckrow ${x.state === 'Not required' ? 'na' : ''}"><span>${esc(x.item)}</span><span class="seg sm">${['Ready', 'Pending', 'Not required'].map(s => `<button type="button" class="${x.state === s ? 'on ' + s.replace(' ', '').toLowerCase() : ''}" data-cki="${i}" data-cks="${s}">${s}</button>`).join('')}</span></div>`).join('')}
   <div class="flex mt8"><input class="grow ck_new" placeholder="Add an item for this date only"><button type="button" class="btn ghost sm ck_add">Add</button></div></div>`;
}
function wireChecklists() {
  $$('[data-ck]').forEach(box => {
    const h = D.hearings.find(x => x.id === box.dataset.ck);
    box.querySelectorAll('[data-cki]').forEach(b => b.onclick = async () => { h.checklist[+b.dataset.cki].state = b.dataset.cks; await saveD('hearings'); redraw(); });
    const add = async () => { const t = box.querySelector('.ck_new').value.trim(); if (!t) return; h.checklist.push({ item: t, state: 'Pending' }); await saveD('hearings'); redraw(); };
    box.querySelector('.ck_add').onclick = add; box.querySelector('.ck_new').onkeydown = e => { if (e.key === 'Enter') add(); };
  });
}

/* ---------- case detail ---------- */
function caseDetail(id) {
  const cs = caseById(id); if (!cs) { S.kv = { mode: 'list' }; return PAGES.Cases(); }
  const cl = clientById(cs.client_id) || { name: '?' }; const T = S.kv.tab || 'Overview'; const I = caseInsights(cs); const t0 = todayISO();
  const hs = caseHearings(id); const rowkv = (k, v) => v ? `<div class="row"><span class="muted">${k}</span><span class="right">${v}</span></div>` : '';
  let body = '';
  if (T === 'Overview') {
    const n = I.next;
    const nextCard = cs.status === 'Completed'
      ? `<div class="card"><h2>Result</h2><div class="bigres ${cs.result === 'Won' ? 'oktext' : cs.result === 'Lost' ? 'badtext' : ''}">${esc(cs.result || 'Completed')}</div><div class="muted">on ${fdd(cs.result_date)}</div>
         ${cs.appeal_by ? `<div class="warnbox mt14">Last date for appeal / revision: <b>${fdd(cs.appeal_by)}</b> (${cs.appeal_by >= t0 ? plural(daysBetween(t0, cs.appeal_by), 'day') + ' left' : 'passed'})</div>` : ''}
         <button class="btn ghost sm mt14" id="kd_reopen">Reopen case (appeal, restoration)</button></div>`
      : n ? `<div class="card"><div class="flex between"><h2 class="nomb">Next hearing</h2>${n.date <= t0 ? '<button class="btn" data-rec="' + n.id + '">Record what happened</button>' : `<button class="btn ghost sm" data-hedit="${n.id}">Change date</button>`}</div>
         <div class="nexth mt8"><div class="d">${fdd(n.date)}</div><div class="muted">${esc([n.purpose, n.item_no ? 'Item ' + n.item_no : '', n.assigned?.length ? 'Attending: ' + namesOf(n.assigned) : ''].filter(Boolean).join(' · '))}</div>
         ${n.date < t0 ? '<span class="tag bad mt8">Date passed: please record what happened</span>' : n.date === t0 ? '<span class="tag warn mt8">Today</span>' : `<span class="tag grey mt8">in ${plural(daysBetween(t0, n.date), 'day')}</span>`}</div>
         <div class="mt14">${checklistHtml(n)}</div></div>`
      : `<div class="card"><h2>Next hearing</h2><div class="muted">No date fixed yet.</div><button class="btn mt14" id="kd_addh">+ Add next date</button></div>`;
    body = `<div class="grid g2"><div class="grid">${nextCard}
      <div class="card"><h2>Insights</h2><div class="kpis k4 inner">
        <div class="kpi"><div class="muted small">Case age</div><div class="v">${I.age}</div><div class="small muted">days</div></div>
        <div class="kpi"><div class="muted small">Hearings held</div><div class="v">${I.held}</div><div class="small muted">${I.avgGap ? 'every ' + I.avgGap + ' days' : '&nbsp;'}</div></div>
        <div class="kpi"><div class="muted small">Adjournments</div><div class="v">${I.adj}</div><div class="small muted">${I.ours} ours · ${I.theirs} other side</div></div>
        <div class="kpi"><div class="muted small">Effective hearings</div><div class="v">${I.held ? I.effective + '%' : '-'}</div><div class="small muted">not adjourned</div></div></div>
       ${Object.keys(I.why).length ? `<h3 class="mt14">Why adjourned</h3>${Object.entries(I.why).sort((a, b) => b[1] - a[1]).map(([k, n2]) => `<div class="barrow"><span>${esc(k)}</span><span class="bar"><i data-w="${Math.round(100 * n2 / I.adj)}"></i></span><b>${n2}</b></div>`).join('')}` : ''}
       ${Object.keys(I.att).length ? `<h3 class="mt14">Who attended</h3>${Object.entries(I.att).sort((a, b) => b[1] - a[1]).map(([m, n2]) => `<div class="row small"><span>${esc(memberName(m))}</span><b>${plural(n2, 'hearing')}</b></div>`).join('')}` : ''}</div></div>
     <div class="grid"><div class="card"><h2>Case details</h2>
       <div class="codebar"><div class="barcode">${window.code128svg(cs.code)}</div><div class="small muted">Case code <b class="mono navytext">${esc(cs.code)}</b> · client ${esc(cl.code || '')}</div></div>
       ${rowkv('Client', `<a data-goclient="${cl.id}">${esc(cl.name)}</a> (${esc(cs.our_side)})`)}${rowkv('Other side', esc([cs.opposite_party, cs.opp_advocate ? 'Adv. ' + cs.opp_advocate : ''].filter(Boolean).join(' · ')))}
       ${rowkv('Category / type', esc([cs.category, cs.case_type].filter(Boolean).join(' · ')))}${rowkv('Court', esc([cs.court_level, cs.court_name].filter(Boolean).join(' · ')))}${rowkv('Judge / room', esc(cs.judge))}
       ${rowkv('Place', esc([cs.district, cs.state].filter(Boolean).join(', ')))}${rowkv('Case number', esc(cs.case_no ? cs.case_no + (cs.case_year ? '/' + cs.case_year : '') : ''))}${rowkv('CNR', `<span class="mono">${esc(cs.cnr)}</span>`.replace('<span class="mono"></span>', ''))}
       ${rowkv('Filed on', cs.filing_date ? fdd(cs.filing_date) : '')}${rowkv('Stage', esc(cs.stage))}${rowkv('Lead advocate', esc(cs.lead ? memberName(cs.lead) : ''))}${rowkv('Fee agreed', cs.fee ? '&#8377; ' + Number(cs.fee).toLocaleString('en-IN') : '')}
       ${cs.notes ? `<div class="mt8 small muted"><b>Private notes:</b> ${esc(cs.notes)}</div>` : ''}</div>
      <div class="card"><h2>Documents</h2><div class="row"><span>${plural(I.docs.length, 'document')}</span>${I.pend ? `<span class="tag warn">${I.pend} pending</span>` : '<span class="tag ok">Nothing pending</span>'}</div><button class="btn ghost sm mt8" data-ktab="Documents">Open documents</button></div></div></div>`;
  }
  if (T === 'Hearings') {
    body = `<div class="flex end mb14"><button class="btn ghost" id="kd_addh2">+ Add a date</button></div>${hs.length ? `<div class="timeline">${[...hs].reverse().map(h => {
      const hd = D.documents.filter(d => d.hearing_id === h.id);
      return `<div class="tl ${h.done ? 'done' : h.date < t0 ? 'late' : 'up'}"><div class="tldate"><b>${fdd(h.date)}</b><div class="small muted">${esc(h.purpose || '')}${h.item_no ? ' · Item ' + esc(h.item_no) : ''}</div></div>
       <div class="card grow">${h.done ? `<div class="flex between"><div><span class="tag ${isFinalOutcome(h.outcome) ? 'ok' : isAdjourned(h.outcome) ? 'warn' : 'grey'}">${esc(h.outcome)}</span>${h.adj_reason ? ` <span class="small muted">${esc(h.adj_reason)}</span>` : ''}</div><span class="small muted">${h.no_appearance ? 'No one appeared' : 'Attended by ' + esc(namesOf(h.attended))}</span></div>
         ${h.note ? `<div class="mt8">${esc(h.note)}</div>` : ''}${h.stage_after ? `<div class="small muted mt8">Stage after this date: ${esc(h.stage_after)}</div>` : ''}
         ${hd.length ? `<div class="mt8">${hd.map(d => `<span class="fchip">${esc(d.name)} <span class="tag ${d.status === 'Pending' ? 'warn' : 'grey'}">${esc(d.status)}</span> ${(d.files || []).map(f => `<a data-hview="${f.fid}">View</a>`).join(' ')}</span>`).join('')}</div>` : ''}
         ${h.next_date ? `<div class="small mt8">Next date given: <b>${fdd(h.next_date)}</b></div>` : ''}`
        : `<div class="flex between"><span>${h.date < t0 ? '<span class="tag bad">Outcome not recorded</span>' : h.date === t0 ? '<span class="tag warn">Today</span>' : '<span class="tag grey">Upcoming</span>'} <span class="small muted">${h.assigned?.length ? 'Attending: ' + esc(namesOf(h.assigned)) : ''}</span></span>
          <span class="flex">${h.date <= t0 ? `<button class="btn sm" data-rec="${h.id}">Record what happened</button>` : ''}<button class="btn ghost sm" data-hedit="${h.id}">Change</button></span></div>
          <div class="small muted mt8">Checklist: ${ckProgress(h).ready} of ${ckProgress(h).need} ready</div>`}</div></div>`; }).join('')}</div>` : '<div class="card empty"><b>No dates yet.</b><div class="muted">Add the first hearing date.</div></div>'}`;
  }
  if (T === 'Documents') body = docsTab(cl, caseDocsOf(id), id);
  page(`<div class="top"><div><a id="kd_back">&larr; ${S.kv.from === 'client' ? 'Back to client' : 'All cases'}</a><h1 class="mt8">${esc(caseTitle(cs))} <span class="codechip mono">${esc(cs.code)}</span> ${cs.status === 'Completed' ? '<span class="tag ok">Completed</span>' : ''}</h1>
     <div class="muted">${esc([cl.name, cs.case_type, courtOf(cs), cs.case_no ? 'No. ' + cs.case_no + (cs.case_year ? '/' + cs.case_year : '') : ''].filter(Boolean).join(' · '))}</div></div>
    <div class="flex"><button class="btn ghost" id="kd_label">Print file label</button>${cs.status !== 'Completed' ? '<button class="btn ghost" id="kd_close">Close case</button>' : ''}<button class="btn ghost" id="kd_del">Delete</button><button class="btn" id="kd_edit">Edit case</button></div></div>
   <div class="tabs">${['Overview', 'Hearings', 'Documents'].map(t => `<button class="${t === T ? 'on' : ''}" data-ktab="${t}">${t} ${t === 'Hearings' ? `<span class="cnt">${hs.length}</span>` : t === 'Documents' ? `<span class="cnt">${I.docs.length}</span>` : ''}</button>`).join('')}</div>${body}`);
  $('#kd_back').onclick = () => { if (S.kv.from === 'client') { S.tab = 'Clients'; S.cv = { mode: 'detail', id: cl.id, tab: cs.status === 'Completed' ? 'Case history' : 'Active cases' }; S.kv = { mode: 'list' }; return shellView(); } S.kv = { mode: 'list' }; PAGES.Cases(); };
  $('#kd_edit').onclick = () => { S.kv = { mode: 'form', id }; PAGES.Cases(); };
  $$('[data-ktab]').forEach(b => b.onclick = () => { S.kv.tab = b.dataset.ktab; PAGES.Cases(); });
  $$('[data-goclient]').forEach(a => a.onclick = () => { S.tab = 'Clients'; S.cv = { mode: 'detail', id: a.dataset.goclient, tab: 'Overview' }; shellView(); });
  $$('[data-rec]').forEach(b => b.onclick = () => recordHearing(b.dataset.rec));
  $$('[data-hedit]').forEach(b => b.onclick = () => hearingModal(id, b.dataset.hedit));
  $$('[data-hview]').forEach(a => a.onclick = () => { const files = caseDocsOf(id).flatMap(d => (d.files || []).map(f => ({ ...f, title: d.name }))); openViewer(files, files.findIndex(f => f.fid === a.dataset.hview)); });
  ['#kd_addh', '#kd_addh2'].forEach(s => { const b = $(s); if (b) b.onclick = () => hearingModal(id); });
  if ($('#kd_reopen')) $('#kd_reopen').onclick = async () => { cs.status = 'Active'; cs.reopened = new Date().toISOString(); await saveD('cases'); toast('Case reopened. Add the next date.'); redraw(); };
  if ($('#kd_close')) $('#kd_close').onclick = () => closeCaseModal(cs);
  $('#kd_label').onclick = async () => { try { const r = await call('saveLabelPdf', { code: cs.code, title: caseTitle(cs), client: cl.name, court: courtOf(cs), caseno: cs.case_no ? cs.case_no + (cs.case_year ? '/' + cs.case_year : '') : '' }); if (r.saved) toast('Label sheet saved as PDF.'); } catch (e) { toast(e.message); } };
  $('#kd_del').onclick = () => {
    const m = modal(`<h2>Delete case ${esc(cs.code)}?</h2><div class="warnbox">This removes the case and its ${plural(hs.length, 'hearing')}. Its documents stay with the client. It cannot be undone. If the case is over, use <b>Close case</b> instead.</div><label>Type DELETE to confirm</label><input id="kdel_txt"><div class="flex end mt14"><button class="btn red" id="kdel_go">Delete permanently</button></div>`);
    m.querySelector('#kdel_go').onclick = async () => {
      if ($('#kdel_txt').value.trim() !== 'DELETE') return toast('Type DELETE in capital letters to confirm.');
      D.documents.forEach(d => { if (d.case_id === id) { d.case_id = null; d.hearing_id = null; } });
      D.hearings = D.hearings.filter(h => h.case_id !== id); D.cases = D.cases.filter(x => x.id !== id);
      await saveAll(); m.close(); toast('Case deleted.'); S.kv = { mode: 'list' }; PAGES.Cases();
    };
  };
  $$('[data-w]').forEach(i => i.style.width = i.dataset.w + '%');
  if (T === 'Overview') wireChecklists();
  if (T === 'Documents') wireDocsTab(cl, id);
}

/* ---------- add / change a hearing date ---------- */
function hearingModal(caseId, hid) {
  const h = hid ? D.hearings.find(x => x.id === hid) : null; const cs = caseById(caseId);
  const m = modal(`<h2>${h ? 'Change hearing date' : 'Add a hearing date'}</h2><div class="small muted">${esc(cs.code + ' · ' + caseTitle(cs))}</div>
    <div class="g2 grid mt14"><div><label>Date *</label><input id="hm_date" type="date" value="${esc(h ? h.date : '')}"></div><div><label>Purpose</label><select id="hm_purpose">${opts(L('hearing_purposes'), h ? h.purpose : '', 'Select')}</select></div>
    <div><label>Who will attend</label><select id="hm_assigned">${teamAll().map(x => `<option value="${x.id}" ${(h ? h.assigned || [] : [cs.lead]).includes(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div><div><label>Item no. (cause list)</label><input id="hm_item" value="${esc(h ? h.item_no || '' : '')}" inputmode="numeric"></div></div>
    <div class="err" id="hm_err"></div><div class="flex between mt14">${h ? '<button class="btn ghost red-text" id="hm_del">Remove this date</button>' : '<span></span>'}<div class="flex"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="hm_go">Save date</button></div></div>`);
  m.querySelector('#hm_go').onclick = async () => {
    const date = $('#hm_date').value; if (!date) return $('#hm_err').textContent = 'Choose the date.';
    if (!h && D.hearings.some(x => x.case_id === caseId && x.date === date && !x.done)) return $('#hm_err').textContent = 'This date is already in the diary for this case.';
    const vals = { date, purpose: $('#hm_purpose').value, assigned: [$('#hm_assigned').value], item_no: $('#hm_item').value.trim() };
    if (h) Object.assign(h, vals, { updated: new Date().toISOString() });
    else { const prev = caseHearings(caseId).filter(x => x.done).pop(); D.hearings.push({ id: uid(), case_id: caseId, ...vals, checklist: newChecklist(prev), done: false, created: new Date().toISOString() }); }
    if (cs.status === 'Completed' && !h) cs.status = 'Active';
    await saveAll(); m.close(); toast('Date saved in the diary.'); redraw();
  };
  if (h) m.querySelector('#hm_del').onclick = async () => { D.hearings = D.hearings.filter(x => x.id !== h.id); await saveD('hearings'); m.close(); toast('Date removed.'); redraw(); };
}

/* ---------- after the hearing: 4 steps ---------- */
function recordHearing(hid) {
  const h = D.hearings.find(x => x.id === hid); const cs = caseById(h.case_id); const cl = clientById(cs.client_id);
  const st = { step: 1, attended: [...(h.attended || h.assigned || [])], none: false, outcome: '', adj_reason: '', stage_after: cs.stage, note: '', docs: [], noDocs: false,
    next_date: '', next_purpose: '', next_assigned: (h.assigned || [])[0] || cs.lead || 'me', noNext: false, result: '', result_date: h.date, appeal: '30', newFiles: [] };
  const m = modal(`<div id="rw"></div>`); m.querySelector('.card').classList.add('mwide');
  // closing without saving removes files attached in this wizard
  const cleanup = async () => { for (const f of st.newFiles) await call('deleteFile', { fid: f }); };
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-x')) cleanup(); }, true);
  const steps = ['Who attended', 'What happened', 'Documents', isFinalOutcome(st.outcome) ? 'Result' : 'Next date'];
  const draw = () => {
    steps[3] = isFinalOutcome(st.outcome) ? 'Result' : 'Next date';
    let html = `<h2>After the hearing of ${fdd(h.date)}</h2><div class="small muted">${esc(cs.code + ' · ' + caseTitle(cs))}</div>
      <div class="wsteps">${steps.map((t, i) => `<div class="${i + 1 === st.step ? 'on' : i + 1 < st.step ? 'done' : ''}"><span>${i + 1 < st.step ? '&#10003;' : i + 1}</span>${t}</div>`).join('')}</div>`;
    if (st.step === 1) html += `<label>Who attended this hearing for us?</label><div class="seg" id="rw_att">${teamAll().map(x => `<button type="button" data-m="${x.id}" class="${st.attended.includes(x.id) ? 'on' : ''}">${esc(x.name)}<span class="small"> · ${esc(x.role)}</span></button>`).join('')}</div>
      <label class="check mt14"><input type="checkbox" id="rw_none" ${st.none ? 'checked' : ''}> No one appeared for us</label>`;
    if (st.step === 2) html += `<div class="grid g2"><div><label>What happened? *</label><select id="rw_out">${opts(L('hearing_outcomes'), st.outcome, 'Select')}</select></div>
      <div class="${isAdjourned(st.outcome) ? '' : 'hidden'}" id="rw_adjw"><label>Why adjourned? *</label><select id="rw_adj">${opts(L('adjourn_reasons'), st.adj_reason, 'Select')}</select></div>
      <div><label>Stage of the case now</label><select id="rw_stage">${opts(L('case_stages'), st.stage_after)}</select></div></div>
      <label>Short note of the order / proceedings</label><textarea id="rw_note" rows="3" placeholder="e.g. Reply filed, arguments heard in part">${esc(st.note)}</textarea>`;
    if (st.step === 3) html += `<div class="small muted">Add the order sheet or any paper from this date. Mark it Pending if the copy is not received yet.</div><div id="rw_docs" class="mt8"></div>
      <div class="flex between"><button type="button" class="btn ghost sm" id="rw_dadd">+ Add document</button><label class="check"><input type="checkbox" id="rw_nodocs" ${st.noDocs ? 'checked' : ''}> No documents from this hearing</label></div>`;
    if (st.step === 4 && !isFinalOutcome(st.outcome)) html += `<div class="grid g2"><div><label>Next date *</label><input id="rw_nd" type="date" min="${addDays(h.date, 1)}" value="${esc(st.next_date)}"></div><div><label>Purpose</label><select id="rw_np">${opts(L('hearing_purposes'), st.next_purpose, 'Select')}</select></div>
      <div><label>Who will attend</label><select id="rw_na">${teamAll().map(x => `<option value="${x.id}" ${x.id === st.next_assigned ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
      <label class="check mt14"><input type="checkbox" id="rw_nonext" ${st.noNext ? 'checked' : ''}> No next date given yet (it will show under "Active, no next date")</label>
      <div class="small muted mt8">A fresh pre-hearing checklist is made for the next date. Items marked "Not required" this time stay "Not required".</div>`;
    if (st.step === 4 && isFinalOutcome(st.outcome)) html += `<div class="grid g2"><div><label>Result for our client *</label><select id="rw_res">${opts(L('final_results'), st.result, 'Select')}</select></div><div><label>Date of order / judgment</label><input id="rw_rd" type="date" value="${esc(st.result_date)}"></div>
      <div><label>Appeal / revision limit</label><select id="rw_ap">${[['', 'No reminder'], ['30', '30 days'], ['60', '60 days'], ['90', '90 days']].map(([v2, t]) => `<option value="${v2}" ${st.appeal === v2 ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="small muted pt20" id="rw_apd"></div></div>
      <div class="warnbox mt14">The case will move to Completed. Please check the exact limitation period for this order; the reminder is only a help.</div>`;
    html += `<div class="err" id="rw_err"></div><div class="flex between mt14"><button class="btn ghost" id="rw_back" ${st.step === 1 ? 'disabled' : ''}>&larr; Back</button><button class="btn" id="rw_next">${st.step === 4 ? 'Save' : 'Next &rarr;'}</button></div>`;
    m.querySelector('#rw').innerHTML = html;
    wire();
  };
  const err = t => { m.querySelector('#rw_err').textContent = t; return false; };
  const read = () => {
    if (st.step === 2) { st.outcome = $('#rw_out').value; st.adj_reason = isAdjourned(st.outcome) ? $('#rw_adj').value : ''; st.stage_after = $('#rw_stage').value; st.note = $('#rw_note').value.trim(); }
    if (st.step === 3) { st.noDocs = $('#rw_nodocs').checked; st.docs.forEach(r => Object.assign(r, r.read())); }
    if (st.step === 4 && !isFinalOutcome(st.outcome)) { st.next_date = $('#rw_nd').value; st.next_purpose = $('#rw_np').value; st.next_assigned = $('#rw_na').value; st.noNext = $('#rw_nonext').checked; }
    if (st.step === 4 && isFinalOutcome(st.outcome)) { st.result = $('#rw_res').value; st.result_date = $('#rw_rd').value; st.appeal = $('#rw_ap').value; }
  };
  const valid = () => {
    if (st.step === 1 && !st.none && !st.attended.length) return err('Choose who attended, or tick "No one appeared for us".');
    if (st.step === 2 && !st.outcome) return err('Choose what happened.');
    if (st.step === 2 && isAdjourned(st.outcome) && !st.adj_reason) return err('Choose why it was adjourned. This builds your adjournment insights.');
    if (st.step === 3) { const real = st.docs.filter(d => d.name || d.files.length); if (!real.length && !st.noDocs) return err('Add a document, or tick "No documents from this hearing".'); if (real.some(d => !d.name)) return err('Every document needs a name.'); }
    if (st.step === 4 && !isFinalOutcome(st.outcome) && !st.noNext && !st.next_date) return err('Enter the next date, or tick "No next date given yet".');
    if (st.step === 4 && !isFinalOutcome(st.outcome) && st.next_date && st.next_date <= h.date) return err('The next date must be after ' + fdd(h.date) + '.');
    if (st.step === 4 && isFinalOutcome(st.outcome) && !st.result) return err('Choose the result for our client.');
    return true;
  };
  const docRow = init => {
    const r = { name: init.name || '', group: init.group || 'Orders & Judgments', status: init.status || 'Received', files: init.files || [], el: document.createElement('div') }; r.el.className = 'docrow';
    r.el.innerHTML = `<div class="dgrid3"><div class="dname"><label>Document</label><input class="w_name" value="${esc(r.name)}"></div><div><label>Group</label><select class="w_group">${opts(L('doc_groups'), r.group)}</select></div>
      <div><label>Status</label><select class="w_status">${opts(L('doc_status'), r.status)}</select></div><div class="dx"><label>&nbsp;</label><button type="button" class="btn ghost sm w_rm">Remove</button></div></div>
      <div class="flex mt8"><button type="button" class="btn ghost sm w_att">Attach files</button><span class="small muted w_fl"></span></div>`;
    const q = s => r.el.querySelector(s);
    const drawF = () => { q('.w_fl').innerHTML = r.files.length ? r.files.map((f, i) => `<span class="fchip"><a data-pv="${i}">${esc(f.filename)}</a> <span class="muted">${fsize(f.size)}</span></span>`).join('') : 'No file attached'; r.el.querySelectorAll('[data-pv]').forEach(a => a.onclick = () => openViewer(r.files.map(f => ({ ...f, title: q('.w_name').value })), +a.dataset.pv)); };
    q('.w_att').onclick = async () => { try { const got = await call('addFiles', {}); got.forEach(f => st.newFiles.push(f.fid)); r.files.push(...got); if (got.length) q('.w_status').value = 'Received'; drawF(); } catch (e) { toast(e.message); } };
    r.el.addEventListener('dragover', e => { e.preventDefault(); r.el.classList.add('over'); }); r.el.addEventListener('dragleave', () => r.el.classList.remove('over'));
    r.el.addEventListener('drop', async e => { e.preventDefault(); r.el.classList.remove('over'); const ps = [...e.dataTransfer.files].map(f => window.mk.pathOf(f)).filter(Boolean); if (!ps.length) return; try { const got = await call('addFiles', { paths: ps }); got.forEach(f => st.newFiles.push(f.fid)); r.files.push(...got); drawF(); } catch (er) { toast(er.message); } });
    q('.w_rm').onclick = () => { st.docs.splice(st.docs.indexOf(r), 1); r.el.remove(); };
    attachSuggest(q('.w_name'), t => suggestDocs(t, q('.w_group').value), it => { if (it.group) q('.w_group').value = it.group; });
    r.read = () => ({ name: q('.w_name').value.trim(), group: q('.w_group').value, status: q('.w_status').value });
    drawF(); return r;
  };
  const wire = () => {
    m.querySelector('#rw_back').onclick = () => { read(); st.step--; draw(); };
    m.querySelector('#rw_next').onclick = async () => { read(); if (!valid()) return; if (st.step < 4) { st.step++; draw(); } else await finish(); };
    if (st.step === 1) { m.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const id = b.dataset.m; st.attended = st.attended.includes(id) ? st.attended.filter(x => x !== id) : [...st.attended, id]; st.none = false; draw(); });
      m.querySelector('#rw_none').onchange = e => { st.none = e.target.checked; if (st.none) st.attended = []; draw(); }; }
    if (st.step === 2) m.querySelector('#rw_out').onchange = e => m.querySelector('#rw_adjw').classList.toggle('hidden', !isAdjourned(e.target.value));
    if (st.step === 3) {
      if (!st.docs.length && !st.noDocs) st.docs.push(docRow({ name: `Order sheet dated ${fd(h.date)}` }));
      st.docs.forEach(r => m.querySelector('#rw_docs').appendChild(r.el));
      m.querySelector('#rw_dadd').onclick = () => { const r = docRow({ name: '' }); st.docs.push(r); m.querySelector('#rw_docs').appendChild(r.el); r.el.querySelector('.w_name').focus(); m.querySelector('#rw_nodocs').checked = false; };
      m.querySelector('#rw_nodocs').onchange = e => { if (e.target.checked) { st.docs.forEach(r => r.el.remove()); st.docs = []; } };
    }
    if (st.step === 4 && isFinalOutcome(st.outcome)) { const upd = () => { const d = $('#rw_rd').value, a = $('#rw_ap').value; $('#rw_apd').textContent = d && a ? 'Last date: ' + fdd(addDays(d, +a)) : ''; }; $('#rw_rd').onchange = upd; $('#rw_ap').onchange = upd; upd(); }
  };
  const finish = async () => {
    const now = new Date().toISOString();
    Object.assign(h, { done: true, attended: st.none ? [] : st.attended, no_appearance: st.none, outcome: st.outcome, adj_reason: st.adj_reason, stage_after: st.stage_after, note: st.note, recorded_at: now });
    cs.stage = st.stage_after; cs.updated = now;
    for (const d of st.docs.filter(x => x.name)) D.documents.push({ id: uid(), client_id: cs.client_id, case_id: cs.id, hearing_id: h.id, group: d.group, name: d.name, date: h.date, status: d.status, note: '', files: d.files, created: now });
    if (isFinalOutcome(st.outcome)) {
      Object.assign(cs, { status: 'Completed', result: st.result, result_date: st.result_date, appeal_days: st.appeal, appeal_by: st.appeal && st.result_date ? addDays(st.result_date, +st.appeal) : '' });
      D.hearings = D.hearings.filter(x => !(x.case_id === cs.id && !x.done && x.id !== h.id)); // later dates no longer needed
    } else if (!st.noNext) {
      h.next_date = st.next_date;
      if (!D.hearings.some(x => x.case_id === cs.id && x.date === st.next_date && !x.done))
        D.hearings.push({ id: uid(), case_id: cs.id, date: st.next_date, purpose: st.next_purpose, assigned: [st.next_assigned], checklist: newChecklist(h), done: false, created: now });
    }
    st.newFiles = [];
    await saveAll(); m.close();
    toast(isFinalOutcome(st.outcome) ? `Case completed: ${st.result}.` : st.noNext ? 'Hearing recorded.' : `Hearing recorded. Next date ${fdd(st.next_date)} is in the diary.`);
    redraw();
  };
  draw();
}
function closeCaseModal(cs) {
  const m = modal(`<h2>Close case ${esc(cs.code)}</h2><div class="small muted">Use this when the case ended without a hearing being recorded here (for example, withdrawn or settled out of court).</div>
   <div class="grid g2 mt14"><div><label>Result for our client *</label><select id="cc_res">${opts(L('final_results'), '', 'Select')}</select></div><div><label>Date</label><input id="cc_date" type="date" value="${todayISO()}"></div>
   <div><label>Appeal / revision limit</label><select id="cc_ap"><option value="">No reminder</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></div></div>
   <div class="err" id="cc_err"></div><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="cc_go">Close case</button></div>`);
  m.querySelector('#cc_go').onclick = async () => {
    const res = $('#cc_res').value, d = $('#cc_date').value, ap = $('#cc_ap').value; if (!res) return $('#cc_err').textContent = 'Choose the result.';
    Object.assign(cs, { status: 'Completed', result: res, result_date: d, appeal_days: ap, appeal_by: ap && d ? addDays(d, +ap) : '', updated: new Date().toISOString() });
    D.hearings = D.hearings.filter(x => !(x.case_id === cs.id && !x.done));
    await saveAll(); m.close(); toast('Case closed.'); redraw();
  };
}

/* ---------- diary ---------- */
S.dy = { view: 'day', date: null, member: '', court: '' };
PAGES.Diary = async () => {
  await loadD(); const F = S.dy; const t0 = todayISO(); if (!F.date) F.date = t0;
  const match = h => { const cs = caseById(h.case_id); return cs && (!F.member || (h.assigned || []).includes(F.member) || (h.attended || []).includes(F.member)) && (!F.court || cs.court_name === F.court); };
  const nu = notUpdated().filter(match);
  let list = [];
  if (F.view === 'day') list = D.hearings.filter(h => h.date === F.date && match(h));
  if (F.view === 'upcoming') list = D.hearings.filter(h => !h.done && h.date >= t0 && h.date <= addDays(t0, 30) && match(h));
  if (F.view === 'nu') list = nu;
  list.sort((a, b) => a.date.localeCompare(b.date) || (caseById(a.case_id).court_name || '').localeCompare(caseById(b.case_id).court_name || '') || (+a.item_no || 999) - (+b.item_no || 999));
  const groups = []; list.forEach(h => { const cs = caseById(h.case_id); const k = (F.view === 'day' ? '' : h.date + '|') + (cs.court_name || cs.court_level || 'Court not set'); let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, date: h.date, court: cs.court_name || cs.court_level || 'Court not set', items: [] }); g.items.push(h); });
  const courts = [...new Set(D.cases.map(c => c.court_name).filter(Boolean))].sort();
  const cnt = d => D.hearings.filter(h => h.date === d && match(h)).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(F.date, i - 3));
  page(`<div class="top"><div><h1>Diary</h1><div class="muted">Hearing dates of all cases. Record what happened after each date.</div></div></div>
   <div class="tabs">${[['day', 'Day'], ['upcoming', 'Next 30 days'], ['nu', `Outcome not recorded <span class="cnt ${nu.length ? 'red' : ''}">${nu.length}</span>`]].map(([k, t]) => `<button class="${F.view === k ? 'on' : ''}" data-dview="${k}">${t}</button>`).join('')}</div>
   <div class="card mb14"><div class="filters">
    ${F.view === 'day' ? `<div class="span2"><label>Date</label><div class="flex"><button class="btn ghost sm" id="dy_prev" title="Previous day">&larr;</button><input type="date" id="dy_date" value="${F.date}"><button class="btn ghost sm" id="dy_next" title="Next day">&rarr;</button><button class="btn ghost sm" id="dy_today">Today</button></div></div>` : ''}
    <div><label>Team member</label><select id="dy_member"><option value="">Everyone</option>${teamAll(true).map(x => `<option value="${x.id}" ${F.member === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div><label>Court</label><select id="dy_court">${opts(courts, F.court, 'All courts')}</select></div></div>
    ${F.view === 'day' ? `<div class="weekstrip mt14">${week.map(d => `<button class="${d === F.date ? 'on' : ''} ${d === t0 ? 'today' : ''}" data-dday="${d}"><span class="small">${new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })}</span><b>${+d.slice(8)}</b><span class="small">${cnt(d) ? plural(cnt(d), 'case') : '&nbsp;'}</span></button>`).join('')}</div>` : ''}</div>
   ${F.view === 'day' ? `<h2>${fdd(F.date)} <span class="muted small">${plural(list.length, 'case')}</span></h2>` : ''}
   ${groups.length ? groups.map(g => `<div class="card mb14"><h3>${F.view !== 'day' ? fdd(g.date) + ' · ' : ''}${esc(g.court)} <span class="muted small">${g.items.length}</span></h3>${g.items.map(h => { const cs = caseById(h.case_id); const cl = clientById(cs.client_id) || {}; const p = ckProgress(h);
     return `<div class="dyrow"><div class="itemno">${esc(h.item_no || '-')}</div><div class="grow"><b>${esc(caseTitle(cs))}</b> <span class="codechip mono small">${esc(cs.code)}</span><div class="small muted">${esc([cl.name, cs.case_type, cs.case_no ? 'No. ' + cs.case_no + (cs.case_year ? '/' + cs.case_year : '') : '', h.purpose].filter(Boolean).join(' · '))}</div>
       <div class="small mt8">${h.done ? `<span class="tag ${isAdjourned(h.outcome) ? 'warn' : 'ok'}">${esc(h.outcome)}</span> ${h.next_date ? 'Next: ' + fdd(h.next_date) : ''} <span class="muted">${h.no_appearance ? 'No one appeared' : 'by ' + esc(namesOf(h.attended))}</span>`
         : `${h.assigned?.length ? 'Attending: <b>' + esc(namesOf(h.assigned)) + '</b> · ' : ''}<span class="${p.ready === p.need ? 'oktext' : 'warntext'}">Checklist ${p.ready}/${p.need} ready</span>`}</div></div>
       <div class="flex">${!h.done && h.date <= t0 ? `<button class="btn sm" data-rec="${h.id}">Record what happened</button>` : ''}<button class="btn ghost sm" data-gocase="${cs.id}">Open case</button></div></div>`; }).join('')}</div>`).join('')
    : `<div class="card empty"><b>${F.view === 'nu' ? 'All hearings are up to date.' : 'No hearings ' + (F.view === 'day' ? 'on this date.' : 'in the next 30 days.')}</b><div class="muted">${F.view === 'nu' ? 'Well done.' : 'Dates are added from each case.'}</div></div>`}`);
  $$('[data-dview]').forEach(b => b.onclick = () => { F.view = b.dataset.dview; PAGES.Diary(); });
  $$('[data-dday]').forEach(b => b.onclick = () => { F.date = b.dataset.dday; PAGES.Diary(); });
  if ($('#dy_date')) { $('#dy_date').onchange = e => { if (e.target.value) { F.date = e.target.value; PAGES.Diary(); } }; $('#dy_prev').onclick = () => { F.date = addDays(F.date, -1); PAGES.Diary(); }; $('#dy_next').onclick = () => { F.date = addDays(F.date, 1); PAGES.Diary(); }; $('#dy_today').onclick = () => { F.date = t0; PAGES.Diary(); }; }
  $('#dy_member').onchange = e => { F.member = e.target.value; PAGES.Diary(); };
  $('#dy_court').onchange = e => { F.court = e.target.value; PAGES.Diary(); };
  $$('[data-rec]').forEach(b => b.onclick = () => recordHearing(b.dataset.rec));
  $$('[data-gocase]').forEach(b => b.onclick = () => { S.tab = 'Cases'; S.kv = { mode: 'detail', id: b.dataset.gocase, tab: 'Overview' }; shellView(); });
};

/* ---------- team ---------- */
PAGES.Team = async () => {
  await loadD(); const t0 = todayISO();
  const stat = id => { const att = D.hearings.filter(h => h.done && (h.attended || []).includes(id)); return { total: att.length, month: att.filter(h => h.date >= addDays(t0, -30)).length, up: D.hearings.filter(h => !h.done && h.date >= t0 && (h.assigned || []).includes(id)).length, lead: D.cases.filter(c => c.status !== 'Completed' && c.lead === id).length }; };
  const all = teamAll(true);
  page(`<div class="top"><div><h1>Team</h1><div class="muted">Juniors, associates and staff. Each has a role with set duties. Choose who attends each hearing.</div></div><button class="btn" id="tm_add">Add team member</button></div>
   <div class="card"><div class="tblwrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Duties</th><th>Mobile</th><th>Lead in</th><th>Attended</th><th>Last 30 days</th><th>Coming dates</th><th></th></tr></thead><tbody>
   ${all.map(x => { const s = stat(x.id); return `<tr class="${x.active === false ? 'muted' : ''}"><td><b>${esc(x.name)}</b>${x.active === false ? ' <span class="tag grey">Inactive</span>' : ''}${x.enrolment ? `<div class="small muted">Enrolment ${esc(x.enrolment)}</div>` : ''}</td><td>${esc(x.role)}</td>
     <td>${(x.duties || []).map(d => `<span class="tag grey">${esc(d)}</span>`).join(' ') || '<span class="small muted">All</span>'}</td><td>${esc(x.mobile || '-')}</td><td>${plural(s.lead, 'case')}</td><td>${s.total}</td><td>${s.month}</td><td>${s.up}</td>
     <td>${x.id === 'me' ? '' : `<button class="btn ghost sm" data-tmedit="${x.id}">Edit</button>`}</td></tr>`; }).join('')}</tbody></table></div>
   ${D.team.length ? '' : '<div class="muted small mt14">Only you so far. Add juniors and staff to assign hearings and see who attended what.</div>'}</div>`);
  $('#tm_add').onclick = () => teamModal();
  $$('[data-tmedit]').forEach(b => b.onclick = () => teamModal(b.dataset.tmedit));
};
function teamModal(id) {
  const x = id ? D.team.find(t => t.id === id) : { role: 'Junior Advocate', duties: [...ROLE_DUTIES['Junior Advocate']], active: true };
  const m = modal(`<h2>${id ? 'Edit team member' : 'Add team member'}</h2><div class="grid g2">
    <div><label>Full name *</label><input id="tm_name" value="${esc(x.name || '')}"></div><div><label>Role *</label><select id="tm_role">${opts(L('team_roles'), x.role)}</select></div>
    <div><label>Mobile</label><input id="tm_mobile" value="${esc(x.mobile || '')}" inputmode="tel"></div><div><label>Bar enrolment no. (advocates)</label><input id="tm_enrol" value="${esc(x.enrolment || '')}" placeholder="e.g. R/1234/2020"></div></div>
    <label class="mt14">Duties <span class="small muted">(filled from the role; tap to change)</span></label><div class="seg" id="tm_duties">${L('duties').map(d => `<button type="button" data-d="${esc(d)}" class="${(x.duties || []).includes(d) ? 'on' : ''}">${esc(d)}</button>`).join('')}</div>
    ${id ? `<label class="check mt14"><input type="checkbox" id="tm_active" ${x.active !== false ? 'checked' : ''}> Active (inactive members stay in past records)</label>` : ''}
    <div class="err" id="tm_err"></div><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="tm_go">Save</button></div>`);
  let duties = [...(x.duties || [])];
  const drawD = () => m.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', duties.includes(b.dataset.d)));
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d; duties = duties.includes(d) ? duties.filter(y => y !== d) : [...duties, d]; drawD(); });
  m.querySelector('#tm_role').onchange = e => { duties = [...(ROLE_DUTIES[e.target.value] || [])]; drawD(); };
  m.querySelector('#tm_go').onclick = async () => {
    const name = $('#tm_name').value.trim(); const mob = $('#tm_mobile').value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    if (!name) return $('#tm_err').textContent = 'Enter the name.';
    if ($('#tm_mobile').value.trim() && mob.length !== 10) return $('#tm_err').textContent = 'Mobile number should have 10 digits.';
    const o = { ...x, name, role: $('#tm_role').value, mobile: $('#tm_mobile').value.trim(), enrolment: $('#tm_enrol').value.trim(), duties, active: id ? $('#tm_active').checked : true };
    if (id) D.team[D.team.findIndex(t => t.id === id)] = o; else { o.id = uid(); o.created = new Date().toISOString(); D.team.push(o); }
    await saveD('team'); m.close(); toast('Team updated.'); redraw();
  };
}

/* ---------- client page: cases tabs + insights ---------- */
const _clientDetail = clientDetail;
clientDetail = function (id) {
  const c = D.clients.find(x => x.id === id); const T = S.cv.tab || 'Overview';
  _clientDetail(id); if (!c) return;
  const cs = clientCases(id); const act = cs.filter(x => x.status !== 'Completed'), fin = cs.filter(x => x.status === 'Completed');
  // case counts on the tab buttons
  $$('[data-tab2]').forEach(b => { if (b.dataset.tab2 === 'Active cases') b.innerHTML = `Active cases <span class="cnt">${act.length}</span>`; if (b.dataset.tab2 === 'Case history') b.innerHTML = `Case history <span class="cnt">${fin.length}</span>`; });
  if (T === 'Active cases' || T === 'Case history') {
    const list = T === 'Active cases' ? act : fin; const t0 = todayISO();
    const soon = $('#page .soon'); const box = document.createElement('div');
    box.innerHTML = `<div class="flex between mb14"><div class="muted">${T === 'Active cases' ? 'Cases going on now.' : 'Completed cases, with their results.'}</div><button class="btn" id="cl_newcase">+ New case for ${esc(c.name)}</button></div>
     ${list.length ? `<div class="card"><table class="tbl"><thead><tr><th>Code</th><th>Case</th><th>Court</th>${T === 'Active cases' ? '<th>Stage</th><th>Next date</th>' : '<th>Result</th><th>Completed</th><th>Appeal by</th>'}</tr></thead><tbody>
      ${list.map(k => { const n = nextHearing(k.id); return `<tr class="click" data-clcase="${k.id}"><td class="mono small">${esc(k.code)}</td><td><b>${esc(caseTitle(k))}</b><div class="small muted">${esc(k.case_type || '')}</div></td><td class="small">${esc(courtOf(k))}</td>
        ${T === 'Active cases' ? `<td class="small">${esc(k.stage || '')}</td><td class="small">${n ? fdd(n.date) + (n.date < t0 ? ' <span class="tag bad">update</span>' : '') : '<span class="tag grey">not fixed</span>'}</td>`
          : `<td><span class="tag ${k.result === 'Won' ? 'ok' : k.result === 'Lost' ? 'bad' : 'grey'}">${esc(k.result || '')}</span></td><td class="small">${fdd(k.result_date)}</td><td class="small">${k.appeal_by ? fdd(k.appeal_by) + (k.appeal_by >= t0 ? '' : ' (passed)') : '-'}</td>`}</tr>`; }).join('')}</tbody></table></div>`
      : `<div class="card empty"><b>${T === 'Active cases' ? 'No active cases.' : 'No completed cases yet.'}</b></div>`}`;
    soon.replaceWith(box);
    $('#cl_newcase').onclick = () => { S.tab = 'Cases'; S.kv = { mode: 'form', client: id }; shellView(); };
    $$('[data-clcase]').forEach(r => r.onclick = () => { S.tab = 'Cases'; S.kv = { mode: 'detail', id: r.dataset.clcase, tab: 'Overview', from: 'client' }; shellView(); });
  }
  if (T === 'Overview') {
    const I = clientInsights(c); const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h2>Insights</h2><div class="kpis k4 inner">
      <div class="kpi"><div class="muted small">Cases</div><div class="v">${I.total}</div><div class="small muted">${I.active} active · ${I.done} completed</div></div>
      <div class="kpi"><div class="muted small">Success rate</div><div class="v">${I.rate === null ? '-' : I.rate + '%'}</div><div class="small muted">${I.won} won · ${I.part} partly · ${I.lost} lost</div></div>
      <div class="kpi"><div class="muted small">Average case length</div><div class="v">${I.avgDays === null ? '-' : I.avgDays}</div><div class="small muted">days (completed)</div></div>
      <div class="kpi"><div class="muted small">Hearings attended</div><div class="v">${I.hearings}</div><div class="small muted">all cases</div></div></div>
      <div class="row mt8"><span class="muted">Next hearing</span><span>${I.next ? fdd(I.next.date) + ' · ' + esc(caseById(I.next.case_id).code) : '-'}</span></div>
      <div class="row"><span class="muted">Last activity</span><span>${I.lastTouch ? fdd(I.lastTouch) : '-'}</span></div>`;
    const col = $('#page .grid.g2 > .grid'); if (col) col.prepend(card);
  }
};

/* ---------- Today: hearings first ---------- */
const _today2 = PAGES.Today;
PAGES.Today = async () => {
  await _today2(); const t0 = todayISO();
  const tod = D.hearings.filter(h => h.date === t0).sort((a, b) => (caseById(a.case_id)?.court_name || '').localeCompare(caseById(b.case_id)?.court_name || ''));
  const nu = notUpdated(); const week = D.hearings.filter(h => !h.done && h.date > t0 && h.date <= addDays(t0, 7));
  const ap = D.cases.filter(c => c.status === 'Completed' && c.appeal_by && c.appeal_by >= t0 && c.appeal_by <= addDays(t0, 30)).sort((a, b) => a.appeal_by.localeCompare(b.appeal_by));
  const unready = D.hearings.filter(h => !h.done && h.date >= t0 && h.date <= addDays(t0, 2) && ckProgress(h).ready < ckProgress(h).need);
  const box = document.createElement('div'); box.className = 'grid g2 mb14';
  box.innerHTML = `<div class="card"><div class="flex between"><h2 class="nomb">Today's hearings <span class="muted small">${tod.length}</span></h2><button class="btn ghost sm" data-godiary="day">Open diary</button></div>
     ${tod.length ? tod.map(h => { const cs = caseById(h.case_id); return `<div class="row"><span><b>${esc(caseTitle(cs))}</b> <span class="codechip mono small">${esc(cs.code)}</span><div class="small muted">${esc([cs.court_name, h.purpose, h.assigned?.length ? namesOf(h.assigned) : ''].filter(Boolean).join(' · '))}</div></span>${h.done ? `<span class="tag ${isAdjourned(h.outcome) ? 'warn' : 'ok'}">${esc(isFinalOutcome(h.outcome) ? 'Completed: ' + (cs.result || '') : h.outcome)}</span>` : `<button class="btn sm" data-rec="${h.id}">Record</button>`}</div>`; }).join('') : '<div class="muted mt8">No hearings today.</div>'}</div>
   <div class="card"><h2>Needs attention</h2>
     <div class="row"><span>Outcome not recorded</span>${nu.length ? `<button class="btn sm red" data-godiary="nu">${nu.length} to update</button>` : '<span class="tag ok">All up to date</span>'}</div>
     <div class="row"><span>Hearings in the next 7 days</span><b>${week.length}</b></div>
     <div class="row"><span>Checklist not ready (next 2 days)</span>${unready.length ? `<span class="tag warn">${unready.length}</span>` : '<span class="tag ok">Ready</span>'}</div>
     ${ap.map(c => `<div class="row"><span>Appeal limit: ${esc(c.code)}</span><span class="tag warn">${fdd(c.appeal_by)}</span></div>`).join('')}</div>`;
  const anchor = $('#page .statgrid'); anchor.parentNode.insertBefore(box, anchor);
  box.querySelectorAll('[data-godiary]').forEach(b => b.onclick = () => { S.tab = 'Diary'; S.dy.view = b.dataset.godiary; S.dy.date = t0; shellView(); });
  box.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => recordHearing(b.dataset.rec));
};
