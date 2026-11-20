'use strict';
/* Stages 5-8 on screen: Drafting (templates + AI), digital signature, Law Library (updates, library,
   research), and Settings for practice details, DSC, AI, updates and backup. */

const _loadD5 = loadD;
loadD = async function (force) {
  const first = !D.loaded || force; await _loadD5(force);
  if (first) for (const k of ['templates', 'drafts', 'law_items', 'library']) D[k] = (await call('getData', { key: k })) || [];
  if (first) { D.law_sources = (await call('getData', { key: 'law_sources' })) || DEFAULT_LAW_SOURCES; D.research_sources = (await call('getData', { key: 'research_sources' })) || DEFAULT_RESEARCH.map(x => ({ ...x })); DEFAULT_RESEARCH.forEach((x, i) => { if (!D.research_sources.some(y => y.id === x.id)) D.research_sources.splice(i, 0, { ...x }); }); D.law_settings = (await call('getData', { key: 'law_settings' })) || { keywords: '' }; }
};
window.mk.onLocked(() => { D.templates = []; D.drafts = []; D.law_items = []; D.library = []; D.research_sources = []; });
const DEFAULT_LAW_SOURCES = [
  { id: 'egazette', name: 'e-Gazette of India (Central)', url: 'https://egazette.gov.in/', type: 'egazette', scope: 'Central', on: true },
];
const DEFAULT_RESEARCH = [
  { id: 'ecourtsindia', name: 'eCourts (eCourtsIndia) — case details by CNR', kind: 'api', token: '', link: 'https://services.ecourts.gov.in/ecourtindia_v6/', on: true },
  { id: 'indiankanoon', name: 'Indian Kanoon', kind: 'api', token: '', link: 'https://indiankanoon.org/search/?formInput={q}', on: true },
  { id: 'casemine', name: 'CaseMine', kind: 'link', link: 'https://www.casemine.com/search/in?q={q}', on: true },
  { id: 'supremetoday', name: 'SupremeToday', kind: 'link', link: 'https://supremetoday.ai/', on: true },
  { id: 'scconline', name: 'SCC Online', kind: 'link', link: 'https://www.scconline.com/', on: true },
  { id: 'manupatra', name: 'Manupatra', kind: 'link', link: 'https://www.manupatrafast.com/', on: true },
  { id: 'ecourts', name: 'eCourts case status', kind: 'link', link: 'https://services.ecourts.gov.in/ecourtindia_v6/', on: true },
  { id: 'indiacode', name: 'India Code (bare Acts)', kind: 'link', link: 'https://www.indiacode.nic.in/', on: true },
];
const LIB_KINDS = ['Act', 'Rules', 'Notification', 'Circular', 'Ordinance', 'Judgment', 'Article / note', 'Other'];
const ddmmyyyy = iso => { if (!iso) return '____'; const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const docGroupFor = want => L('doc_groups').includes(want) ? want : 'Others';

/* ===================== AI helper ===================== */
window.aiModal = function (f) {
  const isDoc = !!f.fid; const doc = f.docId ? D.documents.find(d => d.id === f.docId) : null;
  const m = modal(`<h2>Ask AI ${f.title ? '· ' + esc(f.title) : ''}</h2><div class="small muted">${esc(f.filename || '')} · The file is sent to your AI service only when you press Run.</div>
   <div class="grid g2 mt14"><div><label>What do you need?</label><select id="ai_task"><option value="summary">Case summary for me</option><option value="order">Explain this order / judgment</option><option value="dates">List dates, amounts and sections</option><option value="client">Explain to the client in simple words</option><option value="ask">Ask a question</option></select></div>
    <div><label>Language (for the client)</label><select id="ai_lang">${opts(['English', 'Hindi', 'Marathi', 'Gujarati', 'Punjabi', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Urdu'], 'Hindi')}</select></div>
    <div class="span2 hidden" id="ai_qw"><label>Your question</label><input id="ai_q" placeholder="e.g. When was the notice served?"></div></div>
   <div class="flex end mt14"><button class="btn" id="ai_go">Run</button></div><div id="ai_out" class="mt14"></div>`);
  m.querySelector('.card').classList.add('mwide');
  $('#ai_task').onchange = e => $('#ai_qw').classList.toggle('hidden', e.target.value !== 'ask');
  $('#ai_go').onclick = async () => {
    const done = busy($('#ai_go'), 'Reading the document...');
    try {
      const r = await call('aiRun', { task: $('#ai_task').value, lang: $('#ai_lang').value, question: $('#ai_q').value, fid: f.fid, filename: f.filename, text: f.text });
      $('#ai_out').innerHTML = `<label>Answer from ${esc(r.provider)} <span class="muted small">(check before relying on it)</span></label><textarea id="ai_res" rows="14">${esc(r.text)}</textarea>
        <div class="flex end mt8"><button class="btn ghost sm" id="ai_copy">Copy</button>${doc ? '<button class="btn ghost sm" id="ai_keep">Keep with this document (Word)</button>' : ''}</div>`;
      $('#ai_copy').onclick = async () => { await navigator.clipboard.writeText($('#ai_res').value); toast('Copied.'); };
      if (doc) $('#ai_keep').onclick = async () => { const text = $('#ai_res').value; const r2 = await call('makeDocx', { blocks: [{ text: 'AI notes: ' + (f.title || f.filename), style: 'heading' }, ...text.split('\n').map(t => ({ text: t }))], filename: `AI notes - ${String(f.filename).replace(/\.[^.]+$/, '')}`, mode: 'store' });
        doc.files = [...(doc.files || []), r2.file]; await saveD('documents'); toast('Saved with the document.'); };
    } catch (e) { $('#ai_out').innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
    done();
  };
  if (!isDoc && f.text) $('#ai_task').value = 'summary';
};

/* ===================== Digital signature ===================== */
window.signFile = async function (f, after) {
  let info; try { info = await call('dscInfo'); } catch (e) { return toast(e.message); }
  const tok = info.tokens.find(t => t.id === info.provider);
  const m = modal(`<h2>Sign with digital signature</h2><div class="small muted">${esc(f.filename)}</div>
   <div class="row mt8"><span class="muted">Signing with</span><span>${esc(tok ? tok.name : info.provider)}</span></div>
   ${info.provider === 'demo' ? `<div class="warnbox mt8">Demo certificate: the signature is real and tamper-proof, but readers will show "identity not verified" because it is not from a Certifying Authority. Use it to practise. ${info.demo ? '' : '<br><b>Make the demo certificate first in Settings &gt; Digital signature.</b>'}</div>` : ''}
   <div class="grid g2 mt14"><div><label>Reason</label><select id="sg_reason">${opts(['Filing in court', 'Approved', 'Authenticated copy', 'Sent to client', 'Other'], 'Filing in court')}</select></div><div><label>Place</label><input id="sg_loc" value="${esc(D.practice.city || '')}"></div></div>
   <div class="small muted mt8">A new signed copy is added next to the original; the original stays unchanged.</div><div class="err" id="sg_err"></div>
   <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="sg_go">Sign</button></div>`);
  m.querySelector('#sg_go').onclick = async () => {
    const done = busy($('#sg_go'), 'Signing...');
    try {
      const file = await call('dscSign', { fid: f.fid, filename: f.filename, reason: $('#sg_reason').value, location: $('#sg_loc').value });
      const doc = D.documents.find(d => d.id === f.docId); if (doc) { doc.files = [...(doc.files || []), file]; doc.updated = new Date().toISOString(); await saveD('documents'); }
      m.close(); toast('Signed copy added.'); after && after({ ...file, title: f.title, docId: f.docId });
    } catch (e) { $('#sg_err').textContent = e.message; done(); }
  };
};

/* ===================== Drafting ===================== */
S.dv = { mode: 'list', tab: 'Templates', q: '', cat: '' };
const allTemplates = () => [...TEMPLATES.map(t => ({ ...t, builtin: true })), ...D.templates];
function autoValues(c, k) {
  const P = D.practice; const n = k ? nextHearing(k.id) : null; c = c || {}; k = k || {};
  const adr = a => [a?.line, a?.city, a?.district, a?.state, a?.pin].filter(Boolean).join(', ');
  return { client_name: c.name || '', client_relation: c.relation || '', client_parent: c.parent_name || '', client_age: c.age || '', client_address: adr(c.addr), client_mobile: c.mobile || '', client_occupation: c.occupation || '',
    case_title: k.title || '', case_type: k.case_type || '', court: k.court_name || k.court_level || '', court_place: k.district || P.city || '', case_no: k.case_no || '____', case_year: k.case_year || String(new Date().getFullYear()), cnr: k.cnr || '',
    opposite_party: k.opposite_party || c.opposite_party || '', our_side: k.our_side || 'Applicant', our_side_upper: (k.our_side || 'Applicant').toUpperCase(), judge: k.judge || '',
    next_date: n ? ddmmyyyy(n.date) : '____', adv_name: P.advocate || S.status.vault.profile?.name || '', adv_enrolment: P.enrolment || '', adv_address: [P.address, P.city].filter(Boolean).join(', '), adv_phone: P.phone || '', adv_email: P.email || '',
    today: ddmmyyyy(todayISO()), place: k.district || P.city || '' };
}
function fillTemplate(body, vals) {
  let out = body;
  for (const [k, v] of Object.entries(vals)) if (/^[a-z_]+$/.test(k)) {
    const lines = String(v).split('\n').map(x => x.trim()).filter(Boolean);
    out = out.split(`{{${k}_numbered}}`).join(lines.map((x, i) => `${i + 2}. ${x}`).join('\n'));
    out = out.split(`{{${k}}}`).join(String(v).trim() === '' ? '____' : String(v));
  }
  out = out.replace(/\{\{[a-z_]+\}\}/g, '____');
  // renumber "N." lines inside blocks so lists stay in order
  return out.replace(/((?:^\d+\. .*\n?)+)/gm, blk => blk.split('\n').filter(Boolean).map((l, i) => l.replace(/^\d+\./, `${i + 1}.`)).join('\n') + '\n');
}
function draftHtml(text, title) {
  const body = esc(text).split('\n').map(l => l.startsWith('# ') ? `<div class="h">${l.slice(2)}</div>` : l.trim() === '' ? '<div class="sp"></div>' : `<div class="p">${l.replace(/ {3,}/g, m => '&nbsp;'.repeat(m.length))}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:0}body{margin:0;padding:64px 72px;font:13.5pt/1.65 'Times New Roman',Times,serif;color:#111}
   .h{text-align:center;font-weight:bold;margin:2px 0}.p{white-space:pre-wrap;text-align:justify}.sp{height:10px}</style></head><body>${body}</body></html>`;
}
const draftBlocks = text => text.split('\n').map(l => l.startsWith('# ') ? { text: l.slice(2), style: 'heading', align: 'center' } : { text: l, align: 'both' });

PAGES.Drafting = async () => {
  await loadD(); const V = S.dv;
  if (V.mode === 'edit') return draftEditor(V);
  const tabs = ['Templates', 'My drafts'];
  const cats = [...new Set(allTemplates().map(t => t.cat))].sort();
  let body = '';
  if (V.tab === 'Templates') {
    const list = allTemplates().filter(t => (!V.cat || t.cat === V.cat));
    body = `<div class="card mb14"><div class="filters"><div class="span2"><label>Search</label><input id="dt_q" value="${esc(V.q)}" placeholder="e.g. bail, notice, affidavit"></div><div><label>Category</label><select id="dt_cat">${opts(cats, V.cat, 'All')}</select></div><div><label>&nbsp;</label><button class="btn ghost wide" id="dt_new">+ My own template</button></div></div></div>
     <div class="tgrid">${list.map(t => `<button class="card tcard" data-tpl="${esc(t.id)}" data-s="${esc((t.name + ' ' + t.cat).toLowerCase())}"><span class="tag grey">${esc(t.cat)}</span><b>${esc(t.name)}</b><span class="small muted">${t.builtin ? 'Built in' : 'Your template'} · ${t.fields.length ? plural(t.fields.length, 'extra field') : 'fills itself'}</span></button>`).join('')}</div>`;
  } else {
    const list = [...D.drafts].sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created));
    body = `<div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Draft</th><th>Client / case</th><th>Last changed</th><th></th></tr></thead><tbody>${list.map(d => `<tr class="click" data-dopen="${d.id}"><td><b>${esc(d.title)}</b><div class="small muted">${esc(d.tname || '')}</div></td><td class="small">${esc((clientById(d.client_id) || {}).name || '-')}${d.case_id ? ' · ' + esc((caseById(d.case_id) || {}).code || '') : ''}</td><td class="small">${ftime(d.updated || d.created)}</td><td><button class="btn ghost sm" data-ddel="${d.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>No drafts yet.</b><div class="muted">Pick a template to start.</div></div>'}</div>`;
  }
  page(`<div class="top"><div><h1>Drafting</h1><div class="muted">Ready templates that fill themselves from the client and case. Edit, then save as Word or PDF, sign, or keep in the client's documents.</div></div></div>
   <div class="tabs">${tabs.map(t => `<button class="${V.tab === t ? 'on' : ''}" data-dtab="${t}">${t}${t === 'My drafts' ? ` <span class="cnt">${D.drafts.length}</span>` : ''}</button>`).join('')}</div>${body}`);
  $$('[data-dtab]').forEach(b => b.onclick = () => { V.tab = b.dataset.dtab; PAGES.Drafting(); });
  if ($('#dt_cat')) $('#dt_cat').onchange = e => { V.cat = e.target.value; PAGES.Drafting(); };
  if ($('#dt_q')) { const f = () => { V.q = $('#dt_q').value; const t = V.q.trim().toLowerCase(); $$('.tcard').forEach(c => c.classList.toggle('hidden', !!t && !c.dataset.s.includes(t))); }; $('#dt_q').oninput = f; f(); }
  if ($('#dt_new')) $('#dt_new').onclick = () => templateModal();
  $$('[data-tpl]').forEach(b => b.onclick = () => { S.dv = { ...V, mode: 'edit', tpl: b.dataset.tpl, draft: null }; PAGES.Drafting(); });
  $$('[data-dopen]').forEach(r => r.onclick = e => { if (e.target.dataset.ddel) return; S.dv = { ...V, mode: 'edit', draft: r.dataset.dopen }; PAGES.Drafting(); });
  $$('[data-ddel]').forEach(b => b.onclick = async () => { D.drafts = D.drafts.filter(d => d.id !== b.dataset.ddel); await saveD('drafts'); toast('Draft deleted.'); PAGES.Drafting(); });
};
function templateModal(text) {
  const m = modal(`<h2>My own template</h2><div class="grid g2"><div><label>Name *</label><input id="tm2_name"></div><div><label>Category</label><input id="tm2_cat" value="My templates"></div></div>
   <label>Text * <span class="small muted">Use {{client_name}}, {{case_title}}, {{court}}, {{case_no}}, {{next_date}}, {{adv_name}}, {{today}} and others. Any new {{word}} becomes a field to fill. Lines starting with "# " are centred headings.</span></label>
   <textarea id="tm2_body" rows="14">${esc(text || '')}</textarea><div class="err" id="tm2_err"></div><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="tm2_go">Save template</button></div>`);
  m.querySelector('.card').classList.add('mwide');
  m.querySelector('#tm2_go').onclick = async () => {
    const name = $('#tm2_name').value.trim(), body = $('#tm2_body').value; if (!name || !body.trim()) return $('#tm2_err').textContent = 'Name and text are needed.';
    const known = new Set(Object.keys(autoValues())); const extra = [...new Set([...body.matchAll(/\{\{([a-z_]+?)(?:_numbered)?\}\}/g)].map(x => x[1]))].filter(k => !known.has(k));
    D.templates.push({ id: 'my-' + uid(), name, cat: $('#tm2_cat').value.trim() || 'My templates', body, fields: extra.map(k => [k, k.replace(/_/g, ' '), '']) });
    await saveD('templates'); m.close(); toast('Template saved.'); redraw();
  };
}
function draftEditor(V) {
  const draft = V.draft ? D.drafts.find(d => d.id === V.draft) : null;
  const tpl = allTemplates().find(t => t.id === (draft ? draft.tpl : V.tpl)) || { id: 'blank', name: 'Blank', fields: [], body: '' };
  const st = { client_id: draft ? draft.client_id : (V.client || ''), case_id: draft ? draft.case_id : (V.case || ''), fields: draft ? { ...(draft.fields || {}) } : {} };
  const clientsSorted = [...D.clients].sort((a, b) => a.name.localeCompare(b.name));
  page(`<div class="top"><div><a id="de_back">&larr; Drafting</a><h1 class="mt8">${esc(draft ? draft.title : tpl.name)}</h1><div class="muted">Choose the client and case; the draft fills itself. You can edit every word on the right.</div></div>
    <div class="flex wrap"><button class="btn ghost" id="de_ai">Improve wording (AI)</button><button class="btn ghost" id="de_prev">Preview</button><button class="btn ghost" id="de_word">Word</button><button class="btn ghost" id="de_pdf">PDF</button><button class="btn ghost" id="de_keep">Keep in client's documents</button><button class="btn" id="de_save">Save draft</button></div></div>
   <div class="dedit"><div class="card"><h2>Details</h2><label>Client</label><select id="de_client"><option value="">Select client</option>${clientsSorted.map(c => `<option value="${c.id}" ${c.id === st.client_id ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select>
     <label>Case</label><select id="de_case"></select>
     ${tpl.fields.map(([k, label, def]) => `<label>${esc(label)}</label>${/one per line/i.test(label) ? `<textarea data-fk="${esc(k)}" rows="4">${esc(st.fields[k] ?? def)}</textarea>` : `<input data-fk="${esc(k)}" value="${esc(st.fields[k] ?? def)}">`}`).join('')}
     <button class="btn ghost sm mt14" id="de_fill">Fill the text again from these details</button><div class="small muted mt8">This replaces your edits on the right.</div></div>
    <div class="card"><div class="flex between"><h2 class="nomb">Text</h2><span class="small muted">Lines starting with "# " print centred and bold</span></div><textarea id="de_text" rows="32" class="mono-ish">${esc(draft ? draft.text : '')}</textarea></div></div>`);
  const fillCases = () => { $('#de_case').innerHTML = '<option value="">No case</option>' + D.cases.filter(k => k.client_id === $('#de_client').value).map(k => `<option value="${k.id}" ${k.id === st.case_id ? 'selected' : ''}>${esc(k.code + ' · ' + caseTitle(k))}</option>`).join(''); };
  const vals = () => { const v = autoValues(clientById($('#de_client').value), caseById($('#de_case').value)); const fv = {}; $$('[data-fk]').forEach(i => fv[i.dataset.fk] = fillTemplate(i.value, v).trim()); return { ...v, ...fv }; };
  const fill = () => { $('#de_text').value = fillTemplate(tpl.body, vals()).replace(/\n{3,}/g, '\n\n'); };
  fillCases(); if (!draft) fill();
  $('#de_client').onchange = () => { fillCases(); fill(); }; $('#de_case').onchange = fill;
  $('#de_fill').onclick = fill;
  const title = () => `${tpl.name}${clientById($('#de_client').value) ? ' - ' + clientById($('#de_client').value).name : ''}`;
  const save = async silent => { const now = new Date().toISOString(); const fields = {}; $$('[data-fk]').forEach(i => fields[i.dataset.fk] = i.value);
    const o = { id: draft ? draft.id : (V.newId || (V.newId = uid())), tpl: tpl.id, tname: tpl.name, title: title(), client_id: $('#de_client').value, case_id: $('#de_case').value, fields, text: $('#de_text').value, created: draft ? draft.created : now, updated: now };
    const i = D.drafts.findIndex(d => d.id === o.id); if (i >= 0) D.drafts[i] = o; else D.drafts.push(o); await saveD('drafts'); if (!silent) toast('Draft saved.'); return o; };
  $('#de_back').onclick = () => { S.dv = { mode: 'list', tab: draft ? 'My drafts' : 'Templates', q: '', cat: '' }; PAGES.Drafting(); };
  $('#de_save').onclick = () => save();
  const fname = () => title().replace(/[\\/:*?"<>|]/g, '_');
  $('#de_prev').onclick = async () => { const r = await call('makePdf', { html: draftHtml($('#de_text').value, title()), filename: fname(), mode: 'preview' }); openViewer([{ ...r.preview, title: title() }]); };
  $('#de_pdf').onclick = async () => { await save(true); const r = await call('makePdf', { html: draftHtml($('#de_text').value, title()), filename: fname(), mode: 'save' }); if (r.saved) toast('PDF saved.'); };
  $('#de_word').onclick = async () => { await save(true); const r = await call('makeDocx', { blocks: draftBlocks($('#de_text').value), filename: fname(), mode: 'save' }); if (r.saved) toast('Word file saved.'); };
  $('#de_keep').onclick = () => {
    const cid = $('#de_client').value; if (!cid) return toast('Choose the client first.');
    const m = modal(`<h2>Keep in client's documents</h2><div class="grid g2"><div><label>Format</label><select id="dk_fmt"><option>PDF</option><option>Word</option></select></div><div><label>Group</label><select id="dk_grp">${opts(L('doc_groups'), docGroupFor(tpl.cat === 'Notices & letters' ? 'Notices & Letters' : 'Court Filings'))}</select></div></div>
      <label class="check mt14"><input type="checkbox" id="dk_sign"> Sign it after saving (PDF only)</label><div class="flex end mt14"><button class="btn" id="dk_go">Save</button></div>`);
    m.querySelector('#dk_go').onclick = async () => { await save(true); const pdf = $('#dk_fmt').value === 'PDF';
      const r = pdf ? await call('makePdf', { html: draftHtml($('#de_text').value, title()), filename: fname(), mode: 'store' }) : await call('makeDocx', { blocks: draftBlocks($('#de_text').value), filename: fname(), mode: 'store' });
      const doc = { id: uid(), client_id: cid, case_id: $('#de_case').value || null, group: $('#dk_grp').value, name: tpl.name, date: todayISO(), status: 'Received', note: 'Drafted in Mitakshara', files: [r.file], created: new Date().toISOString() };
      D.documents.push(doc); await saveD('documents'); const sign = pdf && $('#dk_sign').checked; m.close(); toast('Saved in documents.');
      if (sign) window.signFile({ ...r.file, title: doc.name, docId: doc.id }, f2 => openViewer([f2])); };
  };
  $('#de_ai').onclick = async () => { const b = $('#de_ai'); const done = busy(b, 'Improving...'); try { const r = await call('aiRun', { task: 'polish', text: $('#de_text').value });
      const m = modal(`<h2>Improved wording</h2><div class="small muted">Check every fact before using. Nothing changes until you press Use this.</div><textarea id="ai_pol" rows="18">${esc(r.text)}</textarea><div class="flex end mt14"><button class="btn ghost" data-x>Keep mine</button><button class="btn" id="ai_use">Use this</button></div>`);
      m.querySelector('.card').classList.add('mwide'); m.querySelector('#ai_use').onclick = () => { $('#de_text').value = $('#ai_pol').value; m.close(); }; } catch (e) { toast(e.message); } done(); };
}

/* ===================== Law Library ===================== */
S.lv = { tab: 'Updates', q: '', src: '', show: 'new', kind: '', rq: '' };
let lawChecking = false;
async function lawCheckNow(quiet) {
  if (lawChecking) return; lawChecking = true;
  try {
    const res = await call('lawCheck', { sources: D.law_sources }); let added = 0; const now = new Date().toISOString();
    for (const r of res) { if (!r.ok) continue; for (const it of r.items) if (!D.law_items.some(x => x.id === it.id)) { D.law_items.push({ ...it, source: r.source, found: now, seen: false }); added++; } }
    D.law_items = D.law_items.sort((a, b) => (b.date || b.found).localeCompare(a.date || a.found)).slice(0, 3000);
    D.law_settings.last = now; D.law_settings.errors = res.filter(r => !r.ok).map(r => ({ source: r.source, error: r.error }));
    await saveD('law_items', 'law_settings'); if (!quiet) toast(added ? `${added} new update${added === 1 ? '' : 's'} found.` : 'No new updates.');
  } catch (e) { if (!quiet) toast(e.message); }
  lawChecking = false;
}
PAGES['Law Library'] = async () => {
  await loadD(); const V = S.lv;
  if (!D.law_settings.last || Date.now() - new Date(D.law_settings.last).getTime() > 6 * 3600e3) { lawCheckNow(true).then(() => { if (S.tab === 'Law Library' && V.tab === 'Updates') PAGES['Law Library'](); }); }
  const tabs = ['Updates', 'My library', 'Research', 'Sources'];
  const kw = (D.law_settings.keywords || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const srcName = id => (D.law_sources.find(s => s.id === id) || { name: id }).name;
  let body = '';
  if (V.tab === 'Updates') {
    const list = D.law_items.filter(i => (!V.src || i.source === V.src) && (V.show === 'all' || (V.show === 'new' ? !i.seen : V.show === 'match' ? kw.some(k => i.title.toLowerCase().includes(k)) : i.saved)));
    body = `<div class="card mb14"><div class="filters"><div class="span2"><label>Search</label><input id="lu_q" value="${esc(V.q)}" placeholder="Words in the title, ministry, gazette number"></div>
      <div><label>Show</label><select id="lu_show">${[['new', 'Not seen yet'], ['match', 'Matching my keywords'], ['saved', 'Saved to library'], ['all', 'All']].map(([k, t]) => `<option value="${k}" ${V.show === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label>Source</label><select id="lu_src"><option value="">All sources</option>${D.law_sources.map(s => `<option value="${s.id}" ${V.src === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><button class="btn wide" id="lu_check">Check now</button></div></div>
      <div class="small muted mt8">Last checked: ${D.law_settings.last ? ftime(D.law_settings.last) : 'never'} · checks again automatically every 6 hours while open · nothing is downloaded until you choose.${kw.length ? ' Keywords: ' + esc(kw.join(', ')) : ''}</div>
      ${(D.law_settings.errors || []).map(e => `<div class="warnbox mt8">${esc(srcName(e.source))}: ${esc(e.error)}</div>`).join('')}</div>
     <div class="card">${list.length ? `<div class="flex end mb14"><button class="btn ghost sm" id="lu_allseen">Mark all as seen</button></div>${list.slice(0, 300).map(i => `<div class="lurow ${i.seen ? '' : 'new'}" data-s="${esc((i.title + ' ' + (i.ref || '')).toLowerCase())}"><div class="grow"><b>${esc(i.title)}</b><div class="small muted">${esc([srcName(i.source), i.kind, i.ref, i.date ? fd(i.date) : ''].filter(Boolean).join(' · '))}${kw.some(k => i.title.toLowerCase().includes(k)) ? ' <span class="tag warn">keyword</span>' : ''}</div></div>
        <div class="flex">${i.saved ? '<span class="tag ok">In library</span>' : `<button class="btn ghost sm" data-ludl="${i.id}">${i.pdf ? 'Download to library' : 'Save page to library'}</button>`}<button class="btn ghost sm" data-luopen="${i.id}">Open website</button>${i.seen ? '' : `<button class="btn ghost sm" data-luseen="${i.id}">Seen</button>`}</div></div>`).join('')}`
      : `<div class="empty"><b>${D.law_items.length ? 'Nothing here with these filters.' : 'No updates yet.'}</b><div class="muted">Press <b>Check now</b> when the computer is online.</div></div>`}</div>`;
  }
  if (V.tab === 'My library') {
    const list = D.library.filter(i => !V.kind || i.kind === V.kind).sort((a, b) => (b.date || b.created).localeCompare(a.date || a.created));
    body = `<div class="card mb14"><div class="filters"><div class="span2"><label>Search</label><input id="ll_q" value="${esc(V.q)}" placeholder="Title, tag, note"></div><div><label>Type</label><select id="ll_kind">${opts(LIB_KINDS, V.kind, 'All')}</select></div><div><label>&nbsp;</label><button class="btn wide" id="ll_add">+ Add to library</button></div></div></div>
     <div class="card">${list.length ? `<table class="tbl" id="ll_tbl"><thead><tr><th>Title</th><th>Type</th><th>Scope</th><th>Date</th><th>Files</th><th></th></tr></thead><tbody>${list.map(i => `<tr data-s="${esc([i.title, i.tags, i.note, i.kind, i.state].join(' ').toLowerCase())}"><td><b>${esc(i.title)}</b>${i.tags ? `<div class="small muted">${esc(i.tags)}</div>` : ''}</td><td>${esc(i.kind)}</td><td class="small">${esc([i.scope, i.state].filter(Boolean).join(' · '))}</td><td class="small">${i.date ? fd(i.date) : '-'}</td>
       <td>${(i.files || []).map(f => `<span class="fchip"><a data-llv="${f.fid}" data-lli="${i.id}">${esc(f.filename)}</a></span>`).join('')}${i.url ? ` <a class="small" data-llurl="${i.id}">website</a>` : ''}</td><td><button class="btn ghost sm" data-lldel="${i.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><b>Your library is empty.</b><div class="muted">Download law updates or add your own Acts, rules and judgments.</div></div>'}</div>`;
  }
  if (V.tab === 'Research') {
    const ik = D.research_sources.find(s => s.id === 'indiankanoon');
    body = `<div class="card mb14"><label>Search judgments and law</label><div class="flex"><input id="rs_q" class="grow" value="${esc(V.rq)}" placeholder="e.g. anticipatory bail economic offence, section 138 NI Act limitation"><button class="btn" id="rs_go">${ik && ik.token ? 'Search Indian Kanoon' : 'Search'}</button></div>
      <div class="flex wrap mt14"><span class="small muted">Open the same search on:</span>${D.research_sources.filter(s => s.on !== false).map(s => `<button class="btn ghost sm" data-rsl="${s.id}">${esc(s.name)}</button>`).join('')}</div>
      ${ik && !ik.token ? '<div class="small muted mt8">Add your Indian Kanoon API token under Sources to see results inside Mitakshara.</div>' : ''}</div><div id="rs_out"></div>`;
  }
  if (V.tab === 'Sources') {
    body = `<div class="grid g2"><div class="card"><h2>Law update sources</h2><div class="small muted mb14">Official pages checked for new Acts, rules and notifications. Add your state's gazette page here.</div>
      ${D.law_sources.map(s => `<div class="row"><span><b>${esc(s.name)}</b><div class="small muted">${esc(s.url)} · ${esc(s.scope || '')}${s.state ? ' · ' + esc(s.state) : ''}</div></span><span class="flex"><label class="check"><input type="checkbox" data-lson="${s.id}" ${s.on !== false ? 'checked' : ''}> On</label><button class="btn ghost sm" data-lsdel="${s.id}">Remove</button></span></div>`).join('')}
      <h3 class="mt14">Add a source</h3><div class="grid g2"><div><label>Name</label><input id="ls_name" placeholder="e.g. Rajasthan State Gazette"></div><div><label>Web address (https)</label><input id="ls_url" placeholder="https://..."></div>
       <div><label>Scope</label><select id="ls_scope"><option>Central</option><option>State</option><option>Court</option></select></div><div><label>State</label><select id="ls_state">${opts(L('states'), '', 'Not state-specific')}</select></div>
       <div><label>Type</label><select id="ls_type"><option value="page">Web page with links / PDFs</option><option value="rss">RSS / news feed</option><option value="egazette">e-Gazette style list</option></select></div><div><label>&nbsp;</label><button class="btn ghost wide" id="ls_add">Add source</button></div></div>
      <h3 class="mt14">Keywords to highlight</h3><div class="flex"><input id="ls_kw" class="grow" value="${esc(D.law_settings.keywords || '')}" placeholder="e.g. Law and Justice, Rajasthan, BNSS, Home Affairs"><button class="btn ghost sm" id="ls_kwsave">Save</button></div></div>
     <div class="card"><h2>Research sources</h2><div class="small muted mb14">Your subscriptions and free sites. Tokens are stored encrypted on this computer.</div>
      ${D.research_sources.map(s => `<div class="row"><span><b>${esc(s.name)}</b><div class="small muted">${s.id === 'ecourtsindia' ? 'Fetches case details, dates and orders by CNR (in Cases)' : s.kind === 'api' ? 'Search inside Mitakshara with your API token' : 'Opens in your browser'}</div></span><span class="flex">${s.kind === 'api' ? `<input type="password" class="w-auto" data-rstok="${s.id}" placeholder="${s.token ? 'Token saved: ...' + esc(s.token.slice(-4)) : 'Paste API token'}">` : ''}<label class="check"><input type="checkbox" data-rson="${s.id}" ${s.on !== false ? 'checked' : ''}> On</label>${s.custom ? `<button class="btn ghost sm" data-rsdel="${s.id}">Remove</button>` : ''}</span></div>`).join('')}
      <div class="flex end mt8"><button class="btn ghost sm" id="rs_save">Save tokens</button></div>
      <h3 class="mt14">Add a research site</h3><div class="grid g2"><div><label>Name</label><input id="rn_name"></div><div><label>Search address ({q} = your words)</label><input id="rn_link" placeholder="https://site/search?q={q}"></div></div><div class="flex end mt8"><button class="btn ghost sm" id="rn_add">Add</button></div></div></div>`;
  }
  page(`<div class="top"><div><h1>Law Library</h1><div class="muted">New Acts and notifications from official gazettes, your own library, and research across your sources.</div></div></div>
   <div class="tabs">${tabs.map(t => `<button class="${V.tab === t ? 'on' : ''}" data-ltab="${t}">${t}${t === 'Updates' ? ` <span class="cnt ${D.law_items.some(i => !i.seen) ? 'red' : ''}">${D.law_items.filter(i => !i.seen).length}</span>` : t === 'My library' ? ` <span class="cnt">${D.library.length}</span>` : ''}</button>`).join('')}</div>${body}`);
  const go = () => PAGES['Law Library']();
  $$('[data-ltab]').forEach(b => b.onclick = () => { V.tab = b.dataset.ltab; go(); });
  const live = (inp, rows) => { if (!$(inp)) return; const f = () => { V.q = $(inp).value; const t = V.q.trim().toLowerCase(); $$(rows).forEach(r => r.classList.toggle('hidden', !!t && !r.dataset.s.includes(t))); }; $(inp).oninput = f; f(); };
  live('#lu_q', '.lurow'); live('#ll_q', '#ll_tbl tbody tr');
  if ($('#lu_show')) { $('#lu_show').onchange = e => { V.show = e.target.value; go(); }; $('#lu_src').onchange = e => { V.src = e.target.value; go(); }; $('#lu_check').onclick = async () => { const d = busy($('#lu_check'), 'Checking...'); await lawCheckNow(); d(); go(); }; }
  if ($('#lu_allseen')) $('#lu_allseen').onclick = async () => { D.law_items.forEach(i => i.seen = true); await saveD('law_items'); go(); };
  const item = id => D.law_items.find(i => i.id === id);
  $$('[data-luseen]').forEach(b => b.onclick = async () => { item(b.dataset.luseen).seen = true; await saveD('law_items'); go(); });
  $$('[data-luopen]').forEach(b => b.onclick = () => { const i = item(b.dataset.luopen); i.seen = true; saveD('law_items'); call('openLink', { url: i.url }).catch(e => toast(e.message)); });
  $$('[data-ludl]').forEach(b => b.onclick = async () => { const i = item(b.dataset.ludl); const d = busy(b, 'Downloading...');
    try { const file = await call('lawDownload', { url: i.url, filename: i.title.slice(0, 90) }); const src = D.law_sources.find(s => s.id === i.source) || {};
      D.library.push({ id: uid(), title: i.title, kind: /act\b/i.test(i.title) ? 'Act' : /rules?\b/i.test(i.title) ? 'Rules' : 'Notification', scope: src.scope || 'Central', state: src.state || '', date: i.date || todayISO(), tags: i.ref || '', url: i.url, files: [file], created: new Date().toISOString() });
      i.saved = true; i.seen = true; await saveD('library', 'law_items'); toast('Saved in your library.'); go(); } catch (e) { toast(e.message); d(); } });
  if ($('#ll_kind')) $('#ll_kind').onchange = e => { V.kind = e.target.value; go(); };
  if ($('#ll_add')) $('#ll_add').onclick = () => libraryModal();
  $$('[data-llv]').forEach(a => a.onclick = () => { const i = D.library.find(x => x.id === a.dataset.lli); openViewer(i.files.map(f => ({ ...f, title: i.title })), i.files.findIndex(f => f.fid === a.dataset.llv)); });
  $$('[data-llurl]').forEach(a => a.onclick = () => call('openLink', { url: D.library.find(x => x.id === a.dataset.llurl).url }).catch(e => toast(e.message)));
  $$('[data-lldel]').forEach(b => b.onclick = async () => { const i = D.library.find(x => x.id === b.dataset.lldel); for (const f of i.files || []) await call('deleteFile', { fid: f.fid }); D.library = D.library.filter(x => x !== i); await saveD('library'); toast('Removed from library.'); go(); });
  if ($('#rs_go')) {
    const run = async () => { V.rq = $('#rs_q').value.trim(); if (!V.rq) return; const ik = D.research_sources.find(s => s.id === 'indiankanoon');
      if (!ik || !ik.token) return call('openLink', { url: ik.link.replace('{q}', encodeURIComponent(V.rq)) }).catch(e => toast(e.message));
      $('#rs_out').innerHTML = '<div class="card muted">Searching...</div>';
      try { const r = await call('ikSearch', { q: V.rq });
        $('#rs_out').innerHTML = `<div class="card"><div class="small muted mb14">${esc(r.found || '')} · Indian Kanoon</div>${r.docs.map(d => `<div class="lurow"><div class="grow"><b>${esc(d.title)}</b><div class="small muted">${esc([d.source, d.date].filter(Boolean).join(' · '))}</div><div class="small">${esc(d.headline)}</div></div><div class="flex"><button class="btn ghost sm" data-ikr="${d.tid}" data-t="${esc(d.title)}">Read</button><button class="btn ghost sm" data-iks="${d.tid}" data-t="${esc(d.title)}">Save to case</button></div></div>`).join('') || '<div class="muted">No results.</div>'}</div>`;
        $$('[data-ikr]').forEach(b => b.onclick = async () => { try { const r2 = await call('ikDoc', { tid: b.dataset.ikr, title: b.dataset.t }); openViewer([{ ...r2.preview, title: b.dataset.t, text: true }]); } catch (e) { toast(e.message); } });
        $$('[data-iks]').forEach(b => b.onclick = () => saveJudgmentModal(b.dataset.iks, b.dataset.t));
      } catch (e) { $('#rs_out').innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; } };
    $('#rs_go').onclick = run; $('#rs_q').onkeydown = e => { if (e.key === 'Enter') run(); };
    $$('[data-rsl]').forEach(b => b.onclick = () => { const s = D.research_sources.find(x => x.id === b.dataset.rsl); const q = $('#rs_q').value.trim(); call('openLink', { url: s.link.includes('{q}') ? s.link.replace('{q}', encodeURIComponent(q)) : s.link }).catch(e => toast(e.message)); });
  }
  if (V.tab === 'Sources') {
    $$('[data-lson]').forEach(c => c.onchange = async () => { D.law_sources.find(s => s.id === c.dataset.lson).on = c.checked; await saveD('law_sources'); });
    $$('[data-lsdel]').forEach(b => b.onclick = async () => { D.law_sources = D.law_sources.filter(s => s.id !== b.dataset.lsdel); await saveD('law_sources'); go(); });
    $('#ls_add').onclick = async () => { const url = $('#ls_url').value.trim(), name = $('#ls_name').value.trim(); if (!name || !/^https:\/\/[^\s]+$/.test(url)) return toast('Enter a name and an address starting with https://');
      D.law_sources.push({ id: 's' + uid().slice(0, 8), name, url, type: $('#ls_type').value, scope: $('#ls_scope').value, state: $('#ls_state').value, on: true }); await saveD('law_sources'); toast('Source added.'); go(); };
    $('#ls_kwsave').onclick = async () => { D.law_settings.keywords = $('#ls_kw').value; await saveD('law_settings'); toast('Keywords saved.'); };
    $$('[data-rson]').forEach(c => c.onchange = async () => { D.research_sources.find(s => s.id === c.dataset.rson).on = c.checked; await saveD('research_sources'); });
    $$('[data-rsdel]').forEach(b => b.onclick = async () => { D.research_sources = D.research_sources.filter(s => s.id !== b.dataset.rsdel); await saveD('research_sources'); go(); });
    $('#rs_save').onclick = async () => { $$('[data-rstok]').forEach(i => { if (i.value.trim()) D.research_sources.find(s => s.id === i.dataset.rstok).token = i.value.trim(); }); await saveD('research_sources'); toast('Saved.'); go(); };
    $('#rn_add').onclick = async () => { const name = $('#rn_name').value.trim(), link = $('#rn_link').value.trim(); if (!name || !/^https:\/\//.test(link)) return toast('Enter a name and an https address.');
      D.research_sources.push({ id: 'r' + uid().slice(0, 8), name, kind: 'link', link, on: true, custom: true }); await saveD('research_sources'); go(); };
  }
};
function libraryModal() {
  const files = [];
  const m = modal(`<h2>Add to library</h2><div class="grid g2"><div class="span2"><label>Title *</label><input id="lm_title" placeholder="e.g. Bharatiya Nagarik Suraksha Sanhita, 2023"></div>
   <div><label>Type</label><select id="lm_kind">${opts(LIB_KINDS, 'Act')}</select></div><div><label>Scope</label><select id="lm_scope"><option>Central</option><option>State</option><option>Court</option></select></div>
   <div><label>State</label><select id="lm_state">${opts(L('states'), '', '-')}</select></div><div><label>Date</label><input id="lm_date" type="date"></div>
   <div class="span2"><label>Tags</label><input id="lm_tags" placeholder="e.g. criminal, bail, BNSS"></div></div>
   <div class="flex mt14"><button type="button" class="btn ghost sm" id="lm_att">Attach files</button><span class="small muted" id="lm_fl">No file</span></div><div class="err" id="lm_err"></div>
   <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="lm_go">Add</button></div>`);
  $('#lm_att').onclick = async () => { const got = await call('addFiles', {}); files.push(...got); $('#lm_fl').textContent = files.map(f => f.filename).join(', '); };
  m.addEventListener('click', async e => { if ((e.target === m || e.target.hasAttribute('data-x')) && files.length) for (const f of files) await call('deleteFile', { fid: f.fid }); }, true);
  $('#lm_go').onclick = async () => { const t = $('#lm_title').value.trim(); if (!t) return $('#lm_err').textContent = 'Enter the title.';
    D.library.push({ id: uid(), title: t, kind: $('#lm_kind').value, scope: $('#lm_scope').value, state: $('#lm_state').value, date: $('#lm_date').value, tags: $('#lm_tags').value.trim(), files: [...files], created: new Date().toISOString() });
    files.length = 0; await saveD('library'); m.close(); toast('Added to library.'); redraw(); };
}
function saveJudgmentModal(tid, title) {
  const m = modal(`<h2>Save judgment to a case</h2><div class="small muted">${esc(title)}</div><label>Case</label><select id="sj_case">${D.cases.map(k => `<option value="${k.id}">${esc(k.code + ' · ' + caseTitle(k))}</option>`).join('')}</select><div class="flex end mt14"><button class="btn" id="sj_go">Save</button></div>`);
  $('#sj_go').onclick = async () => { const k = caseById($('#sj_case').value); if (!k) return toast('Add a case first.');
    try { const r = await call('ikDoc', { tid, title }); const file = await call('keepTemp', { fid: r.preview.fid, filename: r.name });
      D.documents.push({ id: uid(), client_id: k.client_id, case_id: k.id, group: docGroupFor('Orders & Judgments'), name: title.slice(0, 150), date: '', status: 'Received', note: `Research: https://indiankanoon.org/doc/${tid}/`, files: [file], created: new Date().toISOString() });
      await saveD('documents'); m.close(); toast(`Saved to ${k.code}.`); } catch (e) { toast(e.message); } };
}

/* ===================== Settings additions ===================== */
const _settings5 = PAGES.Settings;
PAGES.Settings = async () => {
  await _settings5();
  const P = D.practice; const box = document.createElement('div'); box.className = 'grid g2 mt14'; box.id = 'set_more';
  box.innerHTML = `<div class="card"><h2>Practice details</h2><div class="small muted">Printed on bills, letters and drafts.</div>
     <div class="row"><span class="muted">Advocate</span><span>${esc(P.advocate || '-')}</span></div><div class="row"><span class="muted">Chamber</span><span>${esc(P.firm || '-')}</span></div><div class="row"><span class="muted">State</span><span>${esc(P.state || '-')}</span></div>
     <button class="btn ghost sm mt8" id="sm_prac">Edit practice details</button></div>
   <div class="card" id="sm_dsc"><h2>Digital signature (DSC)</h2><div class="muted">Loading...</div></div>
   <div class="card" id="sm_ai"><h2>AI assistant</h2><div class="muted">Loading...</div></div>
   <div class="card" id="sm_up"><h2>Updates and backup</h2><div class="muted">Loading...</div></div>`;
  $('#page').appendChild(box);
  $('#sm_prac').onclick = practiceModal;
  // DSC
  const drawDsc = async () => { const i = await call('dscInfo'); const el = $('#sm_dsc');
    el.innerHTML = `<h2>Digital signature (DSC)</h2><label>Token brand</label><select id="ds_prov">${i.tokens.map(t => `<option value="${t.id}" ${t.id === i.provider ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      ${i.provider !== 'demo' ? (() => { const t = i.tokens.find(x => x.id === i.provider); return `<div class="row"><span class="muted">Driver on this computer</span><span>${t.driverFound ? '<span class="tag ok">Found</span>' : '<span class="tag warn">Not found</span>'}</span></div><div class="small muted">${t.driverFound ? esc(t.driverFound) : 'Install the token software from the brand, or choose the driver file.'}</div><button class="btn ghost sm mt8" id="ds_drv">Choose driver file</button><div class="warnbox mt8">Signing with the USB token is switched on after one test with the real token. Until then use the demo certificate.</div>`; })() : ''}
      <div class="row mt8"><span class="muted">Demo certificate</span><span>${i.demo ? 'Valid till ' + fd(i.demo.validTo) : '<span class="tag grey">Not made</span>'}</span></div>
      <button class="btn ghost sm mt8" id="ds_demo">${i.demo ? 'Make a new demo certificate' : 'Make demo certificate'}</button>`;
    $('#ds_prov').onchange = async e => { await call('dscSetProvider', { provider: e.target.value, driver: '' }); drawDsc(); };
    if ($('#ds_drv')) $('#ds_drv').onclick = async () => { const f = await call('dscChooseDriver'); if (f) { await call('dscSetProvider', { provider: i.provider, driver: f }); drawDsc(); } };
    $('#ds_demo').onclick = async () => { await call('dscMakeDemo', { holder: P.advocate || S.status.vault.profile?.name }); toast('Demo certificate ready.'); drawDsc(); }; };
  // AI
  const drawAi = async () => { const a = await call('aiGet'); const el = $('#sm_ai');
    el.innerHTML = `<h2>AI assistant</h2><div class="small muted">Uses your own account with an AI company. Documents are sent only when you press Run.</div>
      <div class="grid g2 mt8"><div><label>Service</label><select id="ai_prov">${a.providers.map(p => `<option value="${p.id}" ${p.id === a.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div><div><label>Model (optional)</label><input id="ai_model" value="${esc(a.model)}" placeholder="${esc((a.providers.find(p => p.id === a.provider) || {}).model || '')}"></div>
       <div class="span2"><label>API key ${a.hasKey ? '<span class="tag ok">saved ' + esc(a.keyHint) + '</span>' : ''}</label><input id="ai_key" type="password" placeholder="${a.hasKey ? 'Leave empty to keep the saved key' : 'Paste your API key'}"></div></div>
      <label class="check mt8"><input type="checkbox" id="ai_consent" ${a.consent ? 'checked' : ''}> I agree that documents I choose are sent to this AI service for processing.</label>
      <div class="flex end mt8">${a.hasKey ? '<button class="btn ghost sm" id="ai_clear">Remove key</button>' : ''}<button class="btn ghost sm" id="ai_save">Save</button></div>`;
    $('#ai_save').onclick = async () => { await call('aiSet', { provider: $('#ai_prov').value, model: $('#ai_model').value.trim(), key: $('#ai_key').value.trim(), consent: $('#ai_consent').checked }); toast('AI settings saved.'); drawAi(); };
    if ($('#ai_clear')) $('#ai_clear').onclick = async () => { await call('aiSet', { clearKey: true }); drawAi(); }; };
  // Updates + backup
  const drawUp = async () => { const b = await call('backupInfo'); const el = $('#sm_up');
    el.innerHTML = `<h2>Updates and backup</h2><div class="row"><span>Version ${esc(S.status.version)}</span><button class="btn ghost sm" id="up_chk">Check for updates</button></div><div id="up_res" class="small"></div>
      <h3 class="mt14">Backup</h3><div class="small muted">The backup file stays encrypted. Keep it on a USB drive or in your Google Drive / OneDrive folder.</div>
      <div class="row"><span class="muted">Backup folder</span><span class="small">${esc(b.folder || 'Not chosen')}</span></div>
      <div class="row"><span class="muted">Last backup</span><span>${b.last ? ftime(b.last) : 'Never'}</span></div>
      <div class="row"><label class="check"><input type="checkbox" id="bk_auto" ${b.auto !== false ? 'checked' : ''}> Back up automatically once a day</label><span>Keep <select id="bk_keep" class="w-auto">${[5, 10, 20, 30].map(n => `<option ${+b.keep === n ? 'selected' : ''}>${n}</option>`).join('')}</select> copies</span></div>
      <div class="flex wrap mt8"><button class="btn ghost sm" id="bk_folder">Choose folder</button><button class="btn sm" id="bk_now">Back up now</button><span class="grow"></span><button class="btn ghost sm" id="bk_restore">Restore a backup</button></div>`;
    $('#up_chk').onclick = async () => { const d = busy($('#up_chk'), 'Checking...'); const r = await call('updateCheck'); d();
      if (!r.ok) return $('#up_res').innerHTML = `<div class="warnbox mt8">${esc(r.error)}</div>`;
      if (r.upToDate) return $('#up_res').innerHTML = '<div class="oktext mt8">You have the latest version.</div>';
      $('#up_res').innerHTML = `<div class="warnbox mt8"><b>Version ${esc(r.version)} is ready</b> (${fsize(r.size)}).<div class="small">${esc(r.notes || '').slice(0, 600)}</div><div class="flex end mt8"><button class="btn sm" id="up_get">Download and install</button></div></div>`;
      $('#up_get').onclick = async () => { const d2 = busy($('#up_get'), 'Downloading...'); try { await call('updateDownload'); const m = modal(`<h2>Update ready</h2><p>Mitakshara will close, install version ${esc(r.version)} and open again. Your data is not touched.</p><div class="flex end mt14"><button class="btn ghost" data-x>Later</button><button class="btn" id="up_inst">Install now</button></div>`); m.querySelector('#up_inst').onclick = () => call('updateInstall').catch(e => toast(e.message)); } catch (e) { toast(e.message); } d2(); }; };
    $('#bk_auto').onchange = $('#bk_keep').onchange = async () => { await call('backupSet', { auto: $('#bk_auto').checked, keep: +$('#bk_keep').value }); toast('Saved.'); };
    $('#bk_folder').onclick = async () => { await call('backupChooseFolder'); drawUp(); };
    $('#bk_now').onclick = async () => { const d = busy($('#bk_now'), 'Backing up...'); try { const r = await call('backupNow'); if (r) toast(`Backup saved (${fsize(r.size)}).`); } catch (e) { toast(e.message); } d(); drawUp(); };
    $('#bk_restore').onclick = () => { const m = modal(`<h2>Restore a backup?</h2><div class="warnbox">You will be signed out. The current workspace on this computer is put aside (not deleted) and replaced by the backup.</div><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="rb_go">Continue</button></div>`); m.querySelector('#rb_go').onclick = () => { m.close(); restoreFlow(); }; }; };
  drawDsc().catch(e => $('#sm_dsc').innerHTML = esc(e.message)); drawAi().catch(e => $('#sm_ai').innerHTML = esc(e.message)); drawUp().catch(e => $('#sm_up').innerHTML = esc(e.message));
  const about = [...$$('#page .card h2')].find(h => h.textContent === 'About');
  if (about) about.parentNode.insertAdjacentHTML('beforeend', '<div class="small muted mt8">PDF reader: PDF.js by Mozilla (Apache 2.0). PIN codes: India Post directory (data.gov.in, GODL-India). Templates are starting points; please check before filing.</div>');
};

/* ===================== Today: law updates ===================== */
const _today5 = PAGES.Today;
PAGES.Today = async () => {
  await _today5(); const n = (D.law_items || []).filter(i => !i.seen).length;
  const att = [...$$('#page .card h2')].find(h => h.textContent === 'Needs attention');
  if (att && n) { att.parentNode.insertAdjacentHTML('beforeend', `<div class="row"><span>New law updates</span><button class="btn ghost sm" id="t_law">${n} new</button></div>`); $('#t_law').onclick = () => { S.tab = 'Law Library'; S.lv.tab = 'Updates'; shellView(); }; }
};
