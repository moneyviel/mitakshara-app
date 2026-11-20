'use strict';
/* eCourts by CNR: start a new case from its CNR, and update any case from eCourts.
   Always asks first (shows when it was last fetched), and the lawyer confirms every change. */
const ecWhen = iso => iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';
const cleanCnr = v => String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Of|And|Vs|The)\b/g, m => m.toLowerCase());
function guessLevel(cnr, court) { const c = String(court || ''); if (/^[A-Z]{2}HC/.test(cnr) || /high court/i.test(c)) return 'High Court'; if (/supreme/i.test(c)) return 'Supreme Court'; if (/family/i.test(c)) return 'Family Court'; if (/consumer/i.test(c)) return 'Consumer Commission'; if (/labour|industrial/i.test(c)) return 'Labour Court / Tribunal'; if (/magistrate|civil judge|munsif|jmfc|cjm|acjm/i.test(c)) return 'Civil Judge / Magistrate'; if (/session|district judge|adj|addl/i.test(c)) return 'District & Sessions Court'; return ''; }
function guessCategory(t) { t = String(t || '').toUpperCase(); if (/138|N\.?I\.?\s*ACT|NIA|CHEQUE/.test(t)) return 'Cheque bounce (NI Act)'; if (/MACT|M\.?A\.?C|MOTOR/.test(t)) return 'Motor accident (MACT)'; if (/HMA|DIVORCE|MATRIMON|MAINT|GW|GUARDIAN|D\.?V|FAMILY/.test(t)) return 'Family / Matrimonial'; if (/W\.?P|WRIT/.test(t)) return 'Writ / Constitutional'; if (/BAIL|CRL|CRIM|SESSION|S\.?C\b|CT CASE|COMPLAINT|FIR|POCSO|NDPS|\bCR\b/.test(t)) return 'Criminal'; if (/CONSUMER|CC\b/.test(t)) return 'Consumer'; if (/LABOUR|I\.?D|INDUSTRIAL/.test(t)) return 'Labour'; if (/ARB/.test(t)) return 'Arbitration'; if (/C\.?S|SUIT|CIVIL|O\.?S|EXECUTION|RCA|MISC/.test(t)) return 'Civil'; return ''; }
function matchList(list, v) { if (!v) return ''; const s = v.toLowerCase(); return list.find(x => x.toLowerCase() === s) || list.find(x => s.includes(x.toLowerCase()) || x.toLowerCase().includes(s)) || ''; }
function setSel(el, v) { if (!el || !v) return; if (![...el.options].some(o => o.value === v)) { const o = document.createElement('option'); o.value = o.textContent = v; el.appendChild(o); } el.value = v; }
async function waitOptions(el, ms = 1500) { const t = Date.now(); while (Date.now() - t < ms && el.options.length <= 1) await new Promise(r => setTimeout(r, 50)); }

/* ---------- ask first ---------- */
async function ecConfirm(cnr, last) {
  const info = await call('ecInfo');
  if (!info.hasKey) {
    const m = modal(`<h2>Fetch from eCourts</h2><p>To fetch case details automatically, add your <b>eCourtsIndia API key</b> once.</p>
      <ol class="steps"><li>Open <b>ecourtsindia.com</b>, sign up and open <b>Dashboard &gt; Settings &gt; API</b> (new accounts get ₹200 of free credits).</li><li>Copy the key (it starts with <span class="mono">eci_live_</span>).</li><li>In Mitakshara open <b>Law Library &gt; Sources</b>, paste it next to <b>eCourts (eCourtsIndia)</b> and press <b>Save tokens</b>.</li></ol>
      <div class="small muted">Free alternative: open the official eCourts site and type the CNR yourself.</div>
      <div class="flex end mt14"><button class="btn ghost" id="ec_off">Open official eCourts (free)</button><button class="btn ghost" id="ec_src">Go to Sources</button><button class="btn" data-x>Close</button></div>`);
    m.querySelector('#ec_off').onclick = async () => { try { await navigator.clipboard.writeText(cnr); } catch {} call('openLink', { url: 'https://services.ecourts.gov.in/ecourtindia_v6/' }).catch(e => toast(e.message)); toast('CNR copied. Paste it on the eCourts site.'); };
    m.querySelector('#ec_src').onclick = () => { m.close(); S.tab = 'Law Library'; S.lv.tab = 'Sources'; shellView(); };
    return false;
  }
  return new Promise(res => {
    const m = modal(`<h2>Fetch case details from eCourts?</h2>
      <div class="row"><span class="muted">CNR</span><b class="mono">${esc(cnr)}</b></div>
      <div class="row"><span class="muted">Last fetched</span><b>${esc(ecWhen(last))}</b></div>
      ${last && Date.now() - new Date(last).getTime() < 12 * 3600e3 ? '<div class="warnbox mt8">This case was fetched in the last 12 hours. Courts rarely change a record twice a day.</div>' : ''}
      <div class="small muted mt8">Takes about 15 seconds. Uses your eCourtsIndia credits (about ₹1.65 per fetch). Nothing is changed until you confirm.</div>
      <div class="flex end mt14"><button class="btn ghost" id="ec_no">Cancel</button><button class="btn" id="ec_yes">Fetch now</button></div>`);
    m.querySelector('#ec_no').onclick = () => { m.close(); res(false); };
    m.querySelector('#ec_yes').onclick = () => { m.close(); res(true); };
    m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-x')) res(false); });
  });
}
async function ecRun(cnr) {
  const w = modal(`<div class="center"><div class="spinner"></div><h2 class="mt14">Fetching from eCourts…</h2><div class="muted">CNR ${esc(cnr)} · about 15 seconds</div></div>`);
  w.querySelector('.card').classList.add('narrow');
  try { return await call('ecFetch', { cnr }); } catch (e) { toast(e.message === 'NO_KEY' ? 'Add your eCourtsIndia key in Law Library > Sources.' : e.message); return null; } finally { w.close(); }
}
const partyLine = (arr, adv) => arr.length ? esc(arr.join(', ')) + (adv && adv.length ? `<div class="small muted">Adv. ${esc(adv.join(', '))}</div>` : '') : '<span class="muted">-</span>';

/* ---------- new case: start with the CNR ---------- */
const _caseForm7 = caseForm;
caseForm = function (id, presetClient) {
  _caseForm7(id, presetClient);
  const grid = $('#page .formgrid'); if (!grid) return;
  const cs = id ? caseById(id) : null;
  const hero = document.createElement('section'); hero.className = 'card cnrhero';
  hero.innerHTML = `<div class="cnr-l"><div class="eyebrow">${id ? 'Refresh from eCourts' : 'Fastest way'}</div><h2>${id ? 'Update this case from eCourts' : 'Start with the CNR number'}</h2><div class="muted small">Court, case number, parties, judge, stage, hearing history, next date and orders fill in by themselves. You add only what is missing.</div></div>
    <div class="cnr-r"><div class="flex"><input id="cnr_in" class="mono upper" placeholder="e.g. RJJP010012342026" value="${esc(cs?.cnr || '')}" autocomplete="off" spellcheck="false"><button class="btn" id="cnr_go">Fetch case details</button></div>
    <div class="small muted mt8" id="cnr_msg">${cs?.ecourts ? 'Last fetched ' + esc(ecWhen(cs.ecourts.fetched_at)) : '16 characters, printed on court papers and the cause list. Or fill the form by hand below.'}</div></div>
    <div id="cnr_out" class="cnr-out hidden"></div>`;
  grid.parentNode.insertBefore(hero, grid);
  const inp = $('#cnr_in');
  inp.addEventListener('input', () => { const v = cleanCnr(inp.value); if (v !== inp.value) inp.value = v; $('#k_cnr').value = v; });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('#cnr_go').click(); });
  $('#cnr_go').onclick = async () => {
    const cnr = cleanCnr(inp.value); if (!/^[A-Z]{4}\d{12}$/.test(cnr)) { $('#cnr_msg').textContent = 'A CNR has 16 characters: 4 letters then 12 digits.'; $('#cnr_msg').className = 'small mt8 warntext'; return; }
    const dup = D.cases.find(k => k.cnr === cnr && k.id !== id); if (dup) { toast(`This CNR is already saved as ${dup.code}.`); }
    if (!(await ecConfirm(cnr, cs?.ecourts?.fetched_at))) return;
    const f = await ecRun(cnr); if (!f) return;
    await fillFromEcourts(f, id); window.__ecPending = { cnr, f, id };
  };
};
async function fillFromEcourts(f, id) {
  const setv = (k, v) => { const el = document.getElementById('k_' + k); if (el && v && !el.disabled) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  setv('cnr', f.cnr); setv('court_name', titleCase(f.court_name)); setv('case_no', f.case_no); setv('case_year', /^\d{4}$/.test(f.case_year) ? f.case_year : ''); setv('filing_date', f.filing_date);
  setv('judge', f.judges.map(titleCase).join(', ')); setv('case_type', titleCase(f.case_type));
  const lvl = guessLevel(f.cnr, f.court_name); if (lvl) setSel($('#k_court_level'), lvl);
  const cat = guessCategory(f.case_type + ' ' + f.acts); if (cat && !id) setSel($('#k_category'), cat);
  const stg = matchList(L('case_stages'), f.stage); if (stg) $('#k_stage').value = stg;
  const st = matchList(L('states'), f.state); if (st) { $('#k_state').value = st; $('#k_state').dispatchEvent(new Event('change')); await waitOptions($('#k_district')); const ds = [...$('#k_district').options].map(o => o.value); setSel($('#k_district'), matchList(ds, f.district) || titleCase(f.district)); }
  if (f.next_hearing && f.next_hearing >= todayISO() && $('#k_h_date')) { $('#k_h_date').value = f.next_hearing; const p = matchList(L('hearing_purposes'), f.stage); if (p) $('#k_h_purpose').value = p; }
  // which side is our client?
  const pickSide = side => {
    const ours = side === 'pet' ? f.petitioners : f.respondents, theirs = side === 'pet' ? f.respondents : f.petitioners;
    const crim = /criminal|cheque/i.test($('#k_category').value);
    const appl = /BAIL|ANTICIPAT|REVISION|APPEAL|QUASH|482|528|APPLICATION/i.test($('#k_case_type').value);
    setSel($('#k_our_side'), side === 'pet' ? (crim ? (appl ? 'Applicant' : 'Complainant') : 'Petitioner') : (crim ? (appl ? 'Respondent' : 'Accused') : 'Respondent'));
    $('#k_our_side').dispatchEvent(new Event('change'));
    $('#k_opposite_party').value = titleCase(theirs.join(', ')); $('#k_opposite_party').dispatchEvent(new Event('input'));
    $('#k_opp_advocate').value = titleCase((side === 'pet' ? f.res_advocates : f.pet_advocates).join(', '));
    const nm = titleCase(ours[0] || ''); const ex = D.clients.find(c => c.name.toLowerCase() === nm.toLowerCase());
    if (!id && ex) { $('#k_client_id').value = ex.id; $('#k_client_id').dispatchEvent(new Event('change')); }
    $$('#cnr_out [data-side]').forEach(b => b.classList.toggle('on', b.dataset.side === side));
    $('#cnr_side_hint').innerHTML = ex || id ? '' : `Client <b>${esc(nm)}</b> is not saved yet. <a id="cnr_qc">Add as a new client</a> (you can complete the details later), or choose an existing client in section 1.`;
    if ($('#cnr_qc')) $('#cnr_qc').onclick = async () => { const now = new Date().toISOString(); const c = { id: uid(), code: nextClientCode(now), type: 'Individual', name: nm, status: 'Active', created: now, addr: {}, ids: [], note_from: 'eCourts' }; D.clients.push(c); await saveD('clients', 'counters'); const o = document.createElement('option'); o.value = c.id; o.textContent = c.code + ' · ' + c.name; $('#k_client_id').appendChild(o); $('#k_client_id').value = c.id; $('#k_client_id').dispatchEvent(new Event('change')); $('#cnr_side_hint').innerHTML = `<span class="oktext">✓ ${esc(c.name)} added as client ${esc(c.code)}.</span>`; };
  };
  const out = $('#cnr_out'); out.classList.remove('hidden');
  const newOrders = f.orders.length;
  out.innerHTML = `<div class="cnr-ok">✓ Fetched ${esc(ecWhen(f.fetched_at))}${f.source_modified ? ` · eCourts record of ${esc(ecWhen(f.source_modified))}` : ''}</div>
    <div class="cnr-grid"><div><span class="muted small">Status</span><b>${esc(f.status || '-')}</b></div><div><span class="muted small">Next date</span><b>${f.next_hearing ? fdd(f.next_hearing) : '-'}</b></div><div><span class="muted small">Hearings on record</span><b>${f.history.length}</b></div><div><span class="muted small">Orders</span><b>${newOrders}</b></div></div>
    <div class="cnr-parties"><div><span class="muted small">Petitioner side</span>${partyLine(f.petitioners, f.pet_advocates)}</div><div><span class="muted small">Respondent side</span>${partyLine(f.respondents, f.res_advocates)}</div></div>
    ${!id ? `<div class="mt8"><b>Our client is on the:</b> <span class="seg sm inline"><button type="button" data-side="pet">Petitioner side</button><button type="button" data-side="res">Respondent side</button></span></div><div class="small mt8" id="cnr_side_hint"></div>` : ''}
    <div class="flex wrap mt8">${f.history.length ? `<label class="check"><input type="checkbox" id="cnr_hist" checked> Add the ${f.history.length} past hearing${f.history.length === 1 ? '' : 's'} to this case</label>` : ''}${newOrders ? `<label class="check"><input type="checkbox" id="cnr_ord" checked> Save the ${newOrders} order${newOrders === 1 ? '' : 's'} into Documents</label>` : ''}</div>
    ${f.fir.number ? `<div class="small muted mt8">FIR ${esc(f.fir.number)}${f.fir.year ? '/' + esc(f.fir.year) : ''}${f.fir.police_station ? ', PS ' + esc(titleCase(f.fir.police_station)) : ''}</div>` : ''}
    <div class="small muted mt8">Please check the filled details, add anything missing, then press <b>Save case</b>.</div>`;
  $$('#cnr_out [data-side]').forEach(b => b.onclick = () => pickSide(b.dataset.side));
  if (!id) { const cl = clientById($('#k_client_id').value); const inPet = cl && f.petitioners.some(p => p.toLowerCase().includes(cl.name.toLowerCase())); const inRes = cl && f.respondents.some(p => p.toLowerCase().includes(cl.name.toLowerCase())); if (inPet || inRes) pickSide(inPet ? 'pet' : 'res'); }
  if ($('#cnr_hist')) $('#cnr_hist').onchange = e => window.__ecPending && (window.__ecPending.hist = e.target.checked);
  if ($('#cnr_ord')) $('#cnr_ord').onchange = e => window.__ecPending && (window.__ecPending.ord = e.target.checked);
}

/* ---------- apply fetched data to a saved case ---------- */
async function ecApply(cs, f, { hist = true, ord = true, next = true } = {}) {
  const now = new Date().toISOString(); let added = 0, saved = 0;
  if (hist) for (const h of f.history) {
    if (h.date >= todayISO() || D.hearings.some(x => x.case_id === cs.id && x.date === h.date)) continue;
    D.hearings.push({ id: uid(), case_id: cs.id, date: h.date, purpose: matchList(L('hearing_purposes'), h.purpose) || titleCase(h.purpose), done: true, attended: [], outcome: h.next ? 'Heard, next date given' : 'Heard, next date given', note: [h.business, h.judge ? 'Before ' + titleCase(h.judge) : ''].filter(Boolean).join(' · '), next_date: h.next || '', from_ecourts: true, checklist: [], created: now, recorded_at: now }); added++;
  }
  if (next && f.next_hearing && f.next_hearing >= todayISO() && !D.hearings.some(x => x.case_id === cs.id && x.date === f.next_hearing)) {
    const prev = caseHearings(cs.id).filter(x => x.done).pop();
    D.hearings.push({ id: uid(), case_id: cs.id, date: f.next_hearing, purpose: matchList(L('hearing_purposes'), f.stage) || titleCase(f.stage), assigned: [cs.lead || 'me'], checklist: newChecklist(prev), done: false, from_ecourts: true, created: now }); added++;
  }
  const known = new Set((cs.ecourts?.orders || []).filter(o => o.fid).map(o => o.url));
  const orders = f.orders.map(o => ({ ...o }));
  if (ord) for (const o of orders) {
    if (!o.url || known.has(o.url)) { const k = (cs.ecourts?.orders || []).find(x => x.url === o.url); if (k) o.fid = k.fid; continue; }
    try { const file = await call('ecOrder', { url: o.url, filename: `${o.kind} ${o.date || ''} ${cs.code}`.trim().replace(/\//g, '-') });
      D.documents.push({ id: uid(), client_id: cs.client_id, case_id: cs.id, group: L('doc_groups').includes('Orders & Judgments') ? 'Orders & Judgments' : 'Others', name: `${o.kind} dated ${o.date ? fd(o.date) : '-'}`, date: o.date || '', status: 'Received', note: 'From eCourts', files: [file], created: now });
      o.fid = file.fid; saved++; } catch (e) { o.error = e.message; }
  }
  cs.ecourts = { fetched_at: f.fetched_at, source_modified: f.source_modified, status: f.status, stage: f.stage, next_hearing: f.next_hearing, judges: f.judges, petitioners: f.petitioners, respondents: f.respondents, pet_advocates: f.pet_advocates, res_advocates: f.res_advocates, decision_date: f.decision_date, nature_of_disposal: f.nature_of_disposal, orders: orders.map(({ date, url, kind, fid }) => ({ date, url, kind, fid })) };
  await saveD('cases', 'hearings', 'documents');
  return { added, saved, failed: orders.filter(o => o.error).length };
}
const _caseDetail7 = caseDetail;
caseDetail = function (id) {
  const pend = window.__ecPending; const cs0 = caseById(id);
  if (pend && cs0 && cs0.cnr === pend.cnr && (!pend.id || pend.id === id)) {
    window.__ecPending = null;
    ecApply(cs0, pend.f, { hist: pend.hist !== false, ord: pend.ord !== false, next: true }).then(r => { toast(`eCourts data saved: ${r.added} date${r.added === 1 ? '' : 's'}, ${r.saved} order${r.saved === 1 ? '' : 's'}${r.failed ? `, ${r.failed} order${r.failed === 1 ? '' : 's'} could not be downloaded` : ''}.`); if (S.kv.mode === 'detail' && S.kv.id === id) caseDetail(id); });
  }
  _caseDetail7(id); const cs = caseById(id); if (!cs) return;
  const bar = $('#page .top .flex'); if (!bar) return;
  const b = document.createElement('button'); b.className = 'btn ghost'; b.id = 'kd_ec'; b.innerHTML = cs.cnr ? 'Update from eCourts' : 'Add CNR & fetch'; b.title = cs.ecourts ? 'Last fetched ' + ecWhen(cs.ecourts.fetched_at) : 'Not fetched yet';
  bar.prepend(b);
  b.onclick = async () => { if (!cs.cnr) { S.kv = { mode: 'form', id }; return PAGES.Cases(); } if (!(await ecConfirm(cs.cnr, cs.ecourts?.fetched_at))) return; const f = await ecRun(cs.cnr); if (f) ecReview(cs, f); };
  const det = [...$$('#page .card h2')].find(h => h.textContent === 'Case details');
  if (det && cs.ecourts) det.parentNode.insertAdjacentHTML('beforeend', `<div class="row"><span class="muted">eCourts status</span><span>${esc(cs.ecourts.status || '-')} <span class="small muted">· fetched ${esc(ecWhen(cs.ecourts.fetched_at))}</span></span></div>`);
};
function ecReview(cs, f) {
  const nh = nextHearing(cs.id); const ch = [];
  const newHist = f.history.filter(h => h.date < todayISO() && !D.hearings.some(x => x.case_id === cs.id && x.date === h.date));
  const known = new Set((cs.ecourts?.orders || []).filter(o => o.fid).map(o => o.url)); const newOrd = f.orders.filter(o => o.url && !known.has(o.url));
  if (f.next_hearing && f.next_hearing >= todayISO() && (!nh || nh.date !== f.next_hearing)) ch.push(['next', `Next date: <b>${fdd(f.next_hearing)}</b>${nh ? ` <span class="muted">(yours: ${fdd(nh.date)})</span>` : ''}`]);
  const stg = matchList(L('case_stages'), f.stage); if (stg && stg !== cs.stage) ch.push(['stage', `Stage: <b>${esc(stg)}</b> <span class="muted">(yours: ${esc(cs.stage || '-')})</span>`]);
  const jd = f.judges.map(titleCase).join(', '); if (jd && jd !== cs.judge) ch.push(['judge', `Judge: <b>${esc(jd)}</b> <span class="muted">(yours: ${esc(cs.judge || '-')})</span>`]);
  if (newHist.length) ch.push(['hist', `${newHist.length} past hearing${newHist.length === 1 ? '' : 's'} not in your record`]);
  if (newOrd.length) ch.push(['ord', `${newOrd.length} new order${newOrd.length === 1 ? '' : 's'} to save into Documents`]);
  const disposed = /dispos|decided|closed/i.test(f.status) && cs.status !== 'Completed';
  const m = modal(`<h2>Changes from eCourts</h2><div class="small muted">${esc(cs.code)} · fetched ${esc(ecWhen(f.fetched_at))} · eCourts status: <b>${esc(f.status || '-')}</b></div>
    ${ch.length ? `<div class="mt14">${ch.map(([k, t]) => `<label class="check chrow"><input type="checkbox" data-ch="${k}" checked> <span>${t}</span></label>`).join('')}</div>` : '<div class="oktext mt14">Your record already matches eCourts. Nothing new.</div>'}
    ${disposed ? `<div class="warnbox mt14">eCourts shows this case as <b>${esc(f.status)}</b>${f.decision_date ? ' on ' + fdd(f.decision_date) : ''}${f.nature_of_disposal ? ' (' + esc(f.nature_of_disposal) + ')' : ''}. Use <b>Close case</b> to record the result for your client.</div>` : ''}
    <div class="flex end mt14"><button class="btn ghost" data-x>Close</button>${ch.length ? '<button class="btn" id="ecr_go">Apply selected</button>' : ''}</div>`);
  m.querySelector('.card').classList.add('mwide');
  if (m.querySelector('#ecr_go')) m.querySelector('#ecr_go').onclick = async () => {
    const on = k => { const x = m.querySelector(`[data-ch="${k}"]`); return !!(x && x.checked); };
    if (on('stage')) cs.stage = stg; if (on('judge')) cs.judge = jd;
    const done = busy(m.querySelector('#ecr_go'), 'Saving…');
    const r = await ecApply(cs, f, { hist: on('hist'), ord: on('ord'), next: on('next') }); done(); m.close();
    toast(`Updated: ${r.added} date${r.added === 1 ? '' : 's'}, ${r.saved} order${r.saved === 1 ? '' : 's'}${r.failed ? `, ${r.failed} order${r.failed === 1 ? '' : 's'} could not be downloaded` : ''}.`); caseDetail(cs.id);
  };
  if (!ch.length) { cs.ecourts = { ...(cs.ecourts || {}), fetched_at: f.fetched_at, status: f.status }; saveD('cases'); }
}
