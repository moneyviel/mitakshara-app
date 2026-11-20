'use strict';
/* Diary: a real calendar. Month / Week / Year / Agenda views, colour-coded dates (hearings, outcome
   not recorded, appeal deadlines, bills due, reminders, court holidays), quick month & year jump,
   keyboard arrows, and a side panel for the chosen day. */
const _loadD8 = loadD;
loadD = async function (force) { const first = !D.loaded || force; await _loadD8(force); if (first) D.events = (await call('getData', { key: 'events' })) || []; };
window.mk.onLocked(() => { D.events = []; });
const EV_TYPES = ['Reminder', 'Meeting', 'Client visit', 'Filing deadline', 'Court holiday', 'Leave'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
S.dy = { view: 'month', date: null, member: '', court: '', show: { h: true, d: true, b: true, r: true } };
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const mondayIndex = d => (d.getDay() + 6) % 7;

/* everything that happens on a date, filtered */
function dayItems(iso) {
  const F = S.dy; const t0 = todayISO(); const out = [];
  if (F.show.h) for (const h of D.hearings) { if (h.date !== iso) continue; const cs = caseById(h.case_id); if (!cs) continue;
    if (F.member && !(h.assigned || []).includes(F.member) && !(h.attended || []).includes(F.member)) continue; if (F.court && cs.court_name !== F.court) continue;
    out.push({ kind: !h.done && h.date < t0 ? 'late' : h.done ? 'done' : 'hearing', h, cs, label: caseTitle(cs) }); }
  if (F.show.d && !F.member) for (const cs of D.cases) if (cs.appeal_by === iso) out.push({ kind: 'deadline', cs, label: 'Appeal limit · ' + cs.code });
  if (F.show.b && !F.member && !F.court && typeof invCalc === 'function') for (const i of D.invoices || []) if (i.due_date === iso && invCalc(i).due > 0) out.push({ kind: 'bill', inv: i, label: 'Bill due · ' + i.no });
  if (F.show.r && !F.court) for (const e of D.events) if (e.date === iso && (!F.member || e.member === F.member)) out.push({ kind: /holiday|leave/i.test(e.type) ? 'off' : 'event', ev: e, label: (e.time ? e.time + ' ' : '') + e.title });
  const order = { late: 0, hearing: 1, deadline: 2, bill: 3, event: 4, off: 5, done: 6 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (+(a.h?.item_no) || 999) - (+(b.h?.item_no) || 999));
}
const chip = it => `<span class="ev ev-${it.kind}" title="${esc(it.label)}">${esc(it.label)}</span>`;

PAGES.Diary = async () => {
  await loadD(); const F = S.dy; const t0 = todayISO(); if (!F.date) F.date = t0; if (!['month', 'week', 'year', 'upcoming', 'nu'].includes(F.view)) F.view = 'month'; F.show = F.show || { h: true, d: true, b: true, r: true };
  const d = new Date(F.date + 'T00:00:00'); const Y = d.getFullYear(), M = d.getMonth();
  const nu = notUpdated();
  const courts = [...new Set(D.cases.map(c => c.court_name).filter(Boolean))].sort();
  const years = []; for (let y = new Date().getFullYear() - 6; y <= new Date().getFullYear() + 4; y++) years.push(y);
  let body = '';
  if (F.view === 'month') {
    const first = new Date(Y, M, 1); const start = new Date(Y, M, 1 - mondayIndex(first)); const cells = [];
    for (let i = 0; i < 42; i++) { const x = new Date(start); x.setDate(start.getDate() + i); cells.push(x); }
    const maxH = Math.max(1, ...cells.map(x => dayItems(isoOf(x.getFullYear(), x.getMonth(), x.getDate())).filter(i => i.h).length));
    body = `<div class="cal"><div class="cal-head">${WD.map((w, i) => `<div class="${i > 4 ? 'we' : ''}">${w}</div>`).join('')}</div><div class="cal-grid">${cells.map(x => {
      const iso = isoOf(x.getFullYear(), x.getMonth(), x.getDate()); const its = dayItems(iso); const nh = its.filter(i => i.h).length; const off = its.some(i => i.kind === 'off');
      return `<div class="cal-cell ${x.getMonth() !== M ? 'out' : ''} ${iso === t0 ? 'today' : ''} ${iso === F.date ? 'sel' : ''} ${mondayIndex(x) > 4 ? 'we' : ''} ${off ? 'off' : ''} heat${nh ? Math.min(4, Math.ceil(4 * nh / maxH)) : 0}" data-day="${iso}">
        <div class="cal-n"><span>${x.getDate()}</span>${nh ? `<b class="cal-c">${nh}</b>` : ''}</div>${its.slice(0, 3).map(chip).join('')}${its.length > 3 ? `<span class="ev-more">+${its.length - 3} more</span>` : ''}
        <button class="cal-add" data-add="${iso}" title="Add a reminder on this date">+</button></div>`; }).join('')}</div></div>`;
  }
  if (F.view === 'week') {
    const s = new Date(d); s.setDate(d.getDate() - mondayIndex(d)); const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(s); x.setDate(s.getDate() + i); return isoOf(x.getFullYear(), x.getMonth(), x.getDate()); });
    body = `<div class="wk">${days.map(iso => { const its = dayItems(iso); const x = new Date(iso + 'T00:00:00'); return `<div class="wk-col ${iso === t0 ? 'today' : ''} ${iso === F.date ? 'sel' : ''}" data-day="${iso}"><div class="wk-h"><span>${WD[mondayIndex(x)]}</span><b>${x.getDate()}</b><span class="muted small">${MONTHS[x.getMonth()].slice(0, 3)}</span></div>${its.map(it => `<div class="wk-it ev-${it.kind}">${it.h && it.h.item_no ? `<i>#${esc(it.h.item_no)}</i> ` : ''}${esc(it.label)}${it.cs && it.h ? `<div class="small">${esc(it.cs.court_name || '')}</div>` : ''}</div>`).join('') || '<div class="muted small wk-empty">Free</div>'}</div>`; }).join('')}</div>`;
  }
  if (F.view === 'year') {
    const cnt = {}; D.hearings.forEach(h => { if (h.date.startsWith(String(Y))) cnt[h.date] = (cnt[h.date] || 0) + 1; }); const mx = Math.max(1, ...Object.values(cnt));
    body = `<div class="yr">${MONTHS.map((mn, m) => { const f = new Date(Y, m, 1); const pad = mondayIndex(f); const n = new Date(Y, m + 1, 0).getDate(); const tot = Object.entries(cnt).filter(([k]) => k.startsWith(isoOf(Y, m, 1).slice(0, 7))).reduce((a, [, v]) => a + v, 0);
      return `<div class="yr-m"><button class="yr-t" data-month="${m}">${mn} <span class="muted small">${tot ? plural(tot, 'hearing') : ''}</span></button><div class="yr-g">${WD.map(w => `<i>${w[0]}</i>`).join('')}${'<span></span>'.repeat(pad)}${Array.from({ length: n }, (_, i) => { const iso = isoOf(Y, m, i + 1); const c = cnt[iso] || 0; return `<span class="yd h${c ? Math.min(4, Math.ceil(4 * c / mx)) : 0} ${iso === t0 ? 'today' : ''}" data-day="${iso}" title="${fd(iso)}${c ? ': ' + plural(c, 'hearing') : ''}">${i + 1}</span>`; }).join('')}</div></div>`; }).join('')}</div>
     <div class="small muted mt8 legend"><span class="yd h1"></span><span class="yd h2"></span><span class="yd h3"></span><span class="yd h4"></span> fewer → more hearings</div>`;
  }
  if (F.view === 'upcoming' || F.view === 'nu') {
    const list = F.view === 'nu' ? nu.filter(h => dayItems(h.date).some(i => i.h === h)) : D.hearings.filter(h => !h.done && h.date >= t0 && h.date <= addDays(t0, 60)).filter(h => dayItems(h.date).some(i => i.h === h));
    list.sort((a, b) => a.date.localeCompare(b.date) || (+a.item_no || 999) - (+b.item_no || 999));
    const byDate = {}; list.forEach(h => (byDate[h.date] = byDate[h.date] || []).push(h));
    body = Object.keys(byDate).length ? Object.entries(byDate).map(([dt, hs]) => `<div class="card mb14 ag"><div class="ag-d"><b>${new Date(dt + 'T00:00:00').getDate()}</b><span>${MONTHS[+dt.slice(5, 7) - 1].slice(0, 3)} ${dt.slice(0, 4)}</span><i>${WD[mondayIndex(new Date(dt + 'T00:00:00'))]}</i></div><div class="grow">${hs.map(dyRow).join('')}</div></div>`).join('')
      : `<div class="card empty"><b>${F.view === 'nu' ? 'All hearings are up to date.' : 'No hearings in the next 60 days.'}</b></div>`;
  }
  const side = F.view === 'month' || F.view === 'week' ? dayPanel(F.date) : '';
  page(`<div class="top"><div><h1>Diary</h1><div class="muted">All your dates in one calendar. Use ← → to move, T for today.</div></div>
     <div class="flex"><button class="btn ghost" id="dy_ev">+ Reminder</button>${nu.length ? `<button class="btn red" data-dview="nu">${nu.length} outcome${nu.length === 1 ? '' : 's'} to record</button>` : ''}</div></div>
   <div class="calbar card"><div class="flex"><button class="btn ghost sm" id="dy_prev" title="Previous">&larr;</button><button class="btn ghost sm" id="dy_today">Today</button><button class="btn ghost sm" id="dy_next" title="Next">&rarr;</button>
      <select id="dy_m" class="w-auto">${MONTHS.map((n, i) => `<option value="${i}" ${i === M ? 'selected' : ''}>${n}</option>`).join('')}</select><select id="dy_y" class="w-auto">${years.map(y => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <input type="date" id="dy_jump" class="w-auto" value="${F.date}" title="Jump to a date"></div>
     <div class="seg sm vsw">${[['month', 'Month'], ['week', 'Week'], ['year', 'Year'], ['upcoming', 'Agenda']].map(([k, t]) => `<button class="${F.view === k ? 'on' : ''}" data-dview="${k}">${t}</button>`).join('')}</div></div>
   <div class="calbar2"><div class="flex wrap">${[['h', 'Hearings', 'hearing'], ['d', 'Appeal deadlines', 'deadline'], ['b', 'Bills due', 'bill'], ['r', 'Reminders & holidays', 'event']].map(([k, t, c]) => `<label class="flt ev-${c}"><input type="checkbox" data-show="${k}" ${F.show[k] ? 'checked' : ''}> ${t}</label>`).join('')}<span class="flt ev-late">Outcome not recorded</span></div>
     <div class="flex"><select id="dy_member" class="w-auto"><option value="">Everyone</option>${teamAll(true).filter(m => !m.deleted).map(x => `<option value="${x.id}" ${F.member === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><select id="dy_court" class="w-auto">${opts(courts, F.court, 'All courts')}</select></div></div>
   <div class="calwrap ${side ? 'withside' : ''}"><div>${body}</div>${side}</div>`);
  const go = () => PAGES.Diary();
  const shift = n => { const x = new Date(F.date + 'T00:00:00'); if (F.view === 'year') x.setFullYear(x.getFullYear() + n); else if (F.view === 'week') x.setDate(x.getDate() + 7 * n); else if (F.view === 'month') { x.setDate(1); x.setMonth(x.getMonth() + n); } else x.setDate(x.getDate() + 30 * n); F.date = isoOf(x.getFullYear(), x.getMonth(), x.getDate()); go(); };
  $('#dy_prev').onclick = () => shift(-1); $('#dy_next').onclick = () => shift(1); $('#dy_today').onclick = () => { F.date = t0; go(); };
  $('#dy_m').onchange = () => { F.date = isoOf(+$('#dy_y').value, +$('#dy_m').value, 1); if (F.view === 'year' || F.view === 'upcoming') F.view = 'month'; go(); };
  $('#dy_y').onchange = () => { F.date = isoOf(+$('#dy_y').value, +$('#dy_m').value, 1); go(); };
  $('#dy_jump').onchange = e => { if (e.target.value) { F.date = e.target.value; if (F.view === 'year') F.view = 'month'; go(); } };
  $$('[data-dview]').forEach(b => b.onclick = () => { F.view = b.dataset.dview; go(); });
  $$('[data-show]').forEach(c => c.onchange = () => { F.show[c.dataset.show] = c.checked; go(); });
  $('#dy_member').onchange = e => { F.member = e.target.value; go(); }; $('#dy_court').onchange = e => { F.court = e.target.value; go(); };
  $$('.cal-cell[data-day], .wk-col[data-day]').forEach(c => { c.onclick = e => { if (e.target.closest('[data-add]')) return; F.date = c.dataset.day; go(); }; c.ondblclick = () => eventModal(c.dataset.day); });
  $$('.yd[data-day]').forEach(c => c.onclick = () => { F.date = c.dataset.day; F.view = 'month'; go(); });
  $$('[data-month]').forEach(b => b.onclick = () => { F.date = isoOf(Y, +b.dataset.month, 1); F.view = 'month'; go(); });
  $$('[data-add]').forEach(b => b.onclick = e => { e.stopPropagation(); eventModal(b.dataset.add); });
  $('#dy_ev').onclick = () => eventModal(F.date);
  wireDayActions();
};
function dyRow(h) {
  const cs = caseById(h.case_id); const cl = clientById(cs.client_id) || {}; const p = ckProgress(h); const t0 = todayISO();
  return `<div class="dyrow"><div class="itemno">${esc(h.item_no || '-')}</div><div class="grow"><b>${esc(caseTitle(cs))}</b> <span class="codechip mono small">${esc(cs.code)}</span><div class="small muted">${esc([cl.name, cs.court_name, cs.case_no ? 'No. ' + cs.case_no + (cs.case_year ? '/' + cs.case_year : '') : '', h.purpose].filter(Boolean).join(' · '))}</div>
    <div class="small mt8">${h.done ? `<span class="tag ${isAdjourned(h.outcome) ? 'warn' : 'ok'}">${esc(h.outcome || 'Recorded')}</span> ${h.next_date ? 'Next: ' + fdd(h.next_date) : ''}` : `${h.assigned?.length ? 'Attending: <b>' + esc(namesOf(h.assigned)) + '</b> · ' : ''}<span class="${p.ready === p.need ? 'oktext' : 'warntext'}">Checklist ${p.ready}/${p.need} ready</span>`}</div></div>
    <div class="flex">${!h.done && h.date <= t0 ? `<button class="btn sm" data-rec="${h.id}">Record what happened</button>` : ''}<button class="btn ghost sm" data-gocase="${cs.id}">Open case</button></div></div>`;
}
function dayPanel(iso) {
  const its = dayItems(iso); const x = new Date(iso + 'T00:00:00');
  return `<aside class="card daypanel"><div class="dp-h"><div><div class="dp-big">${x.getDate()}</div><div class="muted">${WD[mondayIndex(x)]}, ${MONTHS[x.getMonth()]} ${x.getFullYear()}</div></div><button class="btn ghost sm" data-add="${iso}">+ Reminder</button></div>
    ${its.length ? its.map(it => it.h ? `<div class="dp-it ev-${it.kind}"><div class="flex between"><b>${esc(caseTitle(it.cs))}</b>${it.h.item_no ? `<span class="tag grey">#${esc(it.h.item_no)}</span>` : ''}</div><div class="small muted">${esc([it.cs.code, it.cs.court_name, it.h.purpose].filter(Boolean).join(' · '))}</div>
        <div class="small mt8">${it.h.done ? esc(it.h.outcome || 'Recorded') : it.kind === 'late' ? '<span class="badtext">Outcome not recorded</span>' : 'Attending: ' + esc(namesOf(it.h.assigned) || '-')}</div>
        <div class="flex mt8">${!it.h.done && it.h.date <= todayISO() ? `<button class="btn sm" data-rec="${it.h.id}">Record what happened</button>` : ''}<button class="btn ghost sm" data-gocase="${it.cs.id}">Open case</button></div></div>`
      : it.ev ? `<div class="dp-it ev-${it.kind}"><div class="flex between"><b>${esc(it.ev.title)}</b><span class="tag grey">${esc(it.ev.type)}</span></div>${it.ev.time ? `<div class="small">${esc(it.ev.time)}</div>` : ''}${it.ev.note ? `<div class="small muted">${esc(it.ev.note)}</div>` : ''}<div class="flex mt8"><button class="btn ghost sm" data-evedit="${it.ev.id}">Edit</button><button class="btn ghost sm" data-evdel="${it.ev.id}">Delete</button></div></div>`
      : it.inv ? `<div class="dp-it ev-bill"><b>${esc(it.label)}</b><div class="small muted">${esc((clientById(it.inv.client_id) || {}).name || '')} · due ${money(invCalc(it.inv).due)}</div><div class="flex mt8"><button class="btn ghost sm" data-inv="${it.inv.id}">Open bill</button></div></div>`
      : `<div class="dp-it ev-deadline"><b>${esc(it.label)}</b><div class="small muted">${esc(caseTitle(it.cs))}</div><div class="flex mt8"><button class="btn ghost sm" data-gocase="${it.cs.id}">Open case</button></div></div>`).join('')
    : '<div class="dp-empty"><b>Nothing on this day.</b><div class="muted small">Double-click any date to add a reminder.</div></div>'}</aside>`;
}
function wireDayActions() {
  $$('[data-rec]').forEach(b => b.onclick = () => recordHearing(b.dataset.rec));
  $$('[data-gocase]').forEach(b => b.onclick = () => { S.tab = 'Cases'; S.kv = { mode: 'detail', id: b.dataset.gocase, tab: 'Overview' }; shellView(); });
  $$('[data-evedit]').forEach(b => b.onclick = () => eventModal(null, b.dataset.evedit));
  $$('[data-evdel]').forEach(b => b.onclick = async () => { D.events = D.events.filter(e => e.id !== b.dataset.evdel); await saveD('events'); toast('Removed.'); redraw(); });
  $$('.daypanel [data-inv]').forEach(b => b.onclick = () => invoiceView(b.dataset.inv));
}
function eventModal(date, id) {
  const e = id ? D.events.find(x => x.id === id) : { date: date || todayISO(), type: 'Reminder' };
  const m = modal(`<h2>${id ? 'Edit' : 'Add to the diary'}</h2><div class="grid g2"><div class="span2"><label>What *</label><input id="ev_t" value="${esc(e.title || '')}" placeholder="e.g. Meet client Sunita Rao, file reply, court closed"></div>
    <div><label>Date *</label><input id="ev_d" type="date" value="${esc(e.date)}"></div><div><label>Time</label><input id="ev_tm" type="time" value="${esc(e.time || '')}"></div>
    <div><label>Type</label><select id="ev_ty">${opts(EV_TYPES, e.type)}</select></div><div><label>For</label><select id="ev_m"><option value="">Everyone</option>${teamAll().map(x => `<option value="${x.id}" ${e.member === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="span2"><label>Note</label><input id="ev_n" value="${esc(e.note || '')}"></div></div><div class="err" id="ev_err"></div>
    <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="ev_go">Save</button></div>`);

  m.querySelector('#ev_go').onclick = async () => {
    const o = { ...e, title: $('#ev_t').value.trim(), date: $('#ev_d').value, time: $('#ev_tm').value, type: $('#ev_ty').value, member: $('#ev_m').value, note: $('#ev_n').value.trim() };
    if (!o.title || !o.date) return $('#ev_err').textContent = 'Enter what and the date.';
    if (id) D.events[D.events.findIndex(x => x.id === id)] = o; else D.events.push({ ...o, id: uid(), created: new Date().toISOString() });
    await saveD('events'); m.close(); toast('Saved in the diary.'); if (S.tab === 'Diary') { S.dy.date = o.date; } redraw();
  };
}
window.eventModal = eventModal;
document.addEventListener('keydown', e => {
  if (S.tab !== 'Diary' || !$('.calbar') || document.querySelector('.modal,.viewer,.palette-ov') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') $('#dy_prev').click(); else if (e.key === 'ArrowRight') $('#dy_next').click(); else if (e.key.toLowerCase() === 't') $('#dy_today').click();
});
