'use strict';
/* Team (v0.6): full details with PIN-first address, active / inactive, and removal that keeps history. */
const mName = x => x.first_name ? `${x.first_name} ${x.last_name || ''}`.trim() : (x.name || '');
PAGES.Team = async () => {
  await loadD(); const t0 = todayISO(); S.tf = S.tf || { show: 'Active', q: '' };
  const stat = id => { const att = D.hearings.filter(h => h.done && (h.attended || []).includes(id)); return { total: att.length, month: att.filter(h => h.date >= addDays(t0, -30)).length, up: D.hearings.filter(h => !h.done && h.date >= t0 && (h.assigned || []).includes(id)).length, lead: D.cases.filter(c => c.status !== 'Completed' && c.lead === id).length }; };
  const all = teamAll(true).filter(x => !x.deleted && (S.tf.show === 'All' || (S.tf.show === 'Active' ? x.active !== false : x.active === false)));
  const inact = D.team.filter(x => !x.deleted && x.active === false).length;
  page(`<div class="top"><div><h1>Team</h1><div class="muted">Juniors, associates and staff. Each has a role with set duties. Choose who attends each hearing.</div></div><button class="btn" id="tm_add">+ Add team member</button></div>
   <div class="card mb14"><div class="filters"><div class="span2"><label>Search</label><input id="tm_q" value="${esc(S.tf.q)}" placeholder="Name, role, mobile"></div><div><label>Show</label><select id="tm_show">${['Active', 'Inactive', 'All'].map(o => `<option ${S.tf.show === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>${inact && S.tf.show === 'Active' ? `<div class="small muted mt8">${plural(inact, 'inactive member')} hidden. Choose "Inactive" to see them.</div>` : ''}</div>
   <div class="card"><div class="tblwrap"><table class="tbl" id="tm_tbl"><thead><tr><th>Name</th><th>Role</th><th>Duties</th><th>Mobile</th><th>Lead in</th><th>Attended</th><th>Last 30 days</th><th>Coming dates</th><th></th></tr></thead><tbody>
   ${all.map(x => { const s = stat(x.id); return `<tr class="${x.active === false ? 'muted' : ''}" data-s="${esc([mName(x), x.role, x.mobile].join(' ').toLowerCase())}"><td><div class="flex"><span class="avatar">${esc(mName(x).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span><div><b>${esc(mName(x))}</b>${x.active === false ? ' <span class="tag grey">Inactive</span>' : ''}${x.enrolment ? `<div class="small muted">Enrolment ${esc(x.enrolment)}</div>` : ''}</div></div></td><td>${esc(x.role)}</td>
     <td>${(x.duties || []).map(d => `<span class="tag grey">${esc(d)}</span>`).join(' ') || '<span class="small muted">All</span>'}</td><td>${esc(x.mobile || '-')}</td><td>${plural(s.lead, 'case')}</td><td>${s.total}</td><td>${s.month}</td><td>${s.up}</td>
     <td>${x.id === 'me' ? '<span class="small muted">You</span>' : `<div class="flex"><button class="btn ghost sm" data-tmedit="${x.id}">Edit</button>${x.active === false ? `<button class="btn ghost sm" data-tmact="${x.id}">Make active</button>` : `<button class="btn ghost sm" data-tmoff="${x.id}">Make inactive</button>`}<button class="btn ghost sm red-text" data-tmdel="${x.id}">Remove</button></div>`}</td></tr>`; }).join('')}</tbody></table></div></div>`);
  $('#tm_add').onclick = () => teamModal();
  $('#tm_show').onchange = e => { S.tf.show = e.target.value; PAGES.Team(); };
  const f = () => { S.tf.q = $('#tm_q').value; const t = S.tf.q.trim().toLowerCase(); $$('#tm_tbl tbody tr[data-s]').forEach(r => r.classList.toggle('hidden', !!t && !r.dataset.s.includes(t))); }; $('#tm_q').oninput = f; f();
  $$('[data-tmedit]').forEach(b => b.onclick = () => teamModal(b.dataset.tmedit));
  $$('[data-tmoff]').forEach(b => b.onclick = () => setInactive(b.dataset.tmoff, true));
  $$('[data-tmact]').forEach(b => b.onclick = () => setInactive(b.dataset.tmact, false));
  $$('[data-tmdel]').forEach(b => b.onclick = () => removeMember(b.dataset.tmdel));
};
async function setInactive(id, off) {
  const x = D.team.find(t => t.id === id); const t0 = todayISO();
  const up = D.hearings.filter(h => !h.done && h.date >= t0 && (h.assigned || []).includes(id)); const lead = D.cases.filter(c => c.status !== 'Completed' && c.lead === id);
  const apply = async () => { x.active = !off; x.inactive_since = off ? t0 : ''; await saveD('team'); toast(off ? `${mName(x)} is now inactive. Past records keep the name.` : `${mName(x)} is active again.`); redraw(); };
  if (!off || (!up.length && !lead.length)) return apply();
  const m = modal(`<h2>Make ${esc(mName(x))} inactive?</h2><div class="warnbox">${up.length ? `${plural(up.length, 'coming hearing')} ${up.length === 1 ? 'is' : 'are'} assigned to ${esc(x.first_name || mName(x))}. ` : ''}${lead.length ? `Lead advocate in ${plural(lead.length, 'active case')}.` : ''}</div>
    <label>Give this work to</label><select id="ia_to">${teamAll().filter(t => t.id !== id).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
    <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="ia_go">Move work and make inactive</button></div>`);
  m.querySelector('#ia_go').onclick = async () => { const to = $('#ia_to').value; up.forEach(h => h.assigned = (h.assigned || []).map(a => a === id ? to : a)); lead.forEach(c => c.lead = to); await saveD('hearings', 'cases'); m.close(); apply(); };
}
function removeMember(id) {
  const x = D.team.find(t => t.id === id); const used = D.hearings.some(h => (h.attended || []).includes(id) || (h.assigned || []).includes(id)) || D.cases.some(c => c.lead === id);
  const m = modal(`<h2>Remove ${esc(mName(x))}?</h2><p>${used ? 'This person appears in past hearings or cases. Their name stays in those records, but they will no longer appear anywhere else.' : 'This person will be removed from the team.'}</p>
    ${used ? '<div class="small muted">Tip: "Make inactive" keeps them in the list for later, e.g. a junior on leave.</div>' : ''}
    <label>Type REMOVE to confirm</label><input id="rm_t"><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn red" id="rm_go">Remove</button></div>`);
  m.querySelector('#rm_go').onclick = async () => {
    if ($('#rm_t').value.trim() !== 'REMOVE') return toast('Type REMOVE in capital letters.');
    const t0 = todayISO(); D.hearings.forEach(h => { if (!h.done && h.date >= t0 && (h.assigned || []).includes(id)) h.assigned = h.assigned.filter(a => a !== id).concat(h.assigned.length === 1 ? ['me'] : []); });
    D.cases.forEach(c => { if (c.status !== 'Completed' && c.lead === id) c.lead = 'me'; });
    if (used) Object.assign(x, { deleted: true, active: false, removed_on: t0, mobile: '', email: '', pan: '', aadhaar_last4: '', addr: {}, dob: '', emergency_name: '', emergency_mobile: '' });
    else D.team = D.team.filter(t => t.id !== id);
    await saveD('team', 'hearings', 'cases'); m.close(); toast('Removed.'); redraw();
  };
}
teamModal = function (id) {
  const x = id ? D.team.find(t => t.id === id) : { role: 'Junior Advocate', duties: [...ROLE_DUTIES['Junior Advocate']], active: true, addr: {} };
  if (id && !x.first_name && x.name) { const p = x.name.trim().split(/\s+/); x.first_name = p.shift(); x.last_name = p.join(' '); }
  const v = k => esc(x[k] || '');
  const m = modal(`<h2>${id ? 'Edit team member' : 'Add team member'}</h2>
   <h3>Personal</h3><div class="grid g4c">
    <div><label>First name *</label><input id="tm_first" value="${v('first_name')}"></div><div><label>Last name *</label><input id="tm_last" value="${v('last_name')}"></div>
    <div><label>Father's / spouse's name</label><input id="tm_parent" value="${v('parent_name')}"></div><div><label>Date of birth</label><input id="tm_dob" type="date" max="${todayISO()}" value="${v('dob')}"></div>
    <div><label>Gender</label><select id="tm_gender">${opts(L('genders'), x.gender, 'Select')}</select></div><div><label>Mobile *</label><input id="tm_mobile" value="${v('mobile')}" inputmode="tel" maxlength="14"></div>
    <div><label>Other mobile</label><input id="tm_mobile2" value="${v('mobile2')}" inputmode="tel" maxlength="14"></div><div><label>Email</label><input id="tm_email" type="email" value="${v('email')}"></div></div>
   <h3 class="mt14">Work</h3><div class="grid g4c">
    <div><label>Role *</label><select id="tm_role">${opts(L('team_roles'), x.role)}</select></div><div><label>Joined on</label><input id="tm_joined" type="date" value="${v('joined')}"></div>
    <div><label>Bar enrolment no. (advocates)</label><input id="tm_enrol" value="${v('enrolment')}" placeholder="e.g. R/1234/2020"></div><div><label>Monthly stipend / salary (₹)</label><input id="tm_pay" value="${v('pay')}" inputmode="numeric"></div></div>
   <label class="mt8">Duties <span class="small muted">(filled from the role; tap to change)</span></label><div class="seg" id="tm_duties">${L('duties').map(d => `<button type="button" data-d="${esc(d)}" class="${(x.duties || []).includes(d) ? 'on' : ''}">${esc(d)}</button>`).join('')}</div>
   <h3 class="mt14">Identity</h3><div class="grid g4c">
    <div><label>PAN</label><input id="tm_pan" class="upper" value="${v('pan')}" maxlength="10" placeholder="ABCDE1234F"></div><div><label>Aadhaar (last 4 digits only)</label><input id="tm_aad" value="${v('aadhaar_last4')}" maxlength="4" inputmode="numeric" placeholder="e.g. 4821"></div>
    <div class="span2 small muted pt20">For safety only the last 4 Aadhaar digits are kept. Attach ID copies under the member's documents if needed.</div></div>
   <h3 class="mt14">Address</h3><div class="g4">${addrFields('tm', x.addr, 'Address')}</div>
   <h3 class="mt14">In an emergency, call</h3><div class="grid g4c"><div class="span2"><label>Name and relation</label><input id="tm_emn" value="${v('emergency_name')}" placeholder="e.g. Suresh Sharma (father)"></div><div><label>Mobile</label><input id="tm_emm" value="${v('emergency_mobile')}" inputmode="tel" maxlength="14"></div></div>
   <label class="mt14">Notes</label><input id="tm_note" value="${v('note')}">
   <div class="err" id="tm_err"></div>
   <div class="flex between mt14"><span>${id ? `<label class="check"><input type="checkbox" id="tm_active" ${x.active !== false ? 'checked' : ''}> Active</label>` : ''}</span><div class="flex"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="tm_go">Save</button></div></div>`);
  m.querySelector('.card').classList.add('mwide');
  let duties = [...(x.duties || [])]; let A = null; wireAddr('tm').then(r => A = r);
  const drawD = () => m.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', duties.includes(b.dataset.d)));
  m.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const d = b.dataset.d; duties = duties.includes(d) ? duties.filter(y => y !== d) : [...duties, d]; drawD(); });
  m.querySelector('#tm_role').onchange = e => { duties = [...(ROLE_DUTIES[e.target.value] || [])]; drawD(); };
  const digits = (el, n) => el.addEventListener('input', () => { const c = el.value.replace(/[^\d+]/g, '').slice(0, n); if (c !== el.value) el.value = c; });
  ['tm_mobile', 'tm_mobile2', 'tm_emm'].forEach(i => digits($('#' + i), 14)); digits($('#tm_aad'), 4); digits($('#tm_pay'), 9);
  $('#tm_pan').addEventListener('input', e => { const c = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10); if (c !== e.target.value) e.target.value = c; });

  m.querySelector('#tm_go').onclick = async () => {
    const g = i => $('#' + i).value.trim(); const mob = s => s.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    const o = { ...x, first_name: g('tm_first'), last_name: g('tm_last'), parent_name: g('tm_parent'), dob: g('tm_dob'), gender: g('tm_gender'), mobile: g('tm_mobile'), mobile2: g('tm_mobile2'), email: g('tm_email'), role: g('tm_role'), joined: g('tm_joined'), enrolment: g('tm_enrol'), pay: g('tm_pay'), pan: g('tm_pan'), aadhaar_last4: g('tm_aad'), emergency_name: g('tm_emn'), emergency_mobile: g('tm_emm'), note: g('tm_note'), duties, addr: A ? A.read() : x.addr, active: id ? $('#tm_active').checked : true };
    o.name = `${o.first_name} ${o.last_name}`.trim();
    const e = [];
    if (!o.first_name) e.push('Enter the first name.'); if (!o.last_name) e.push('Enter the last name.');
    if (mob(o.mobile).length !== 10) e.push('Mobile number should have 10 digits.');
    if (o.mobile2 && mob(o.mobile2).length !== 10) e.push('Other mobile should have 10 digits.');
    if (o.emergency_mobile && mob(o.emergency_mobile).length !== 10) e.push('Emergency mobile should have 10 digits.');
    if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) e.push('Email does not look right.');
    if (o.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(o.pan)) e.push('PAN should look like ABCDE1234F.');
    if (o.aadhaar_last4 && !/^\d{4}$/.test(o.aadhaar_last4)) e.push('Aadhaar: enter exactly the last 4 digits.');
    if (o.addr && o.addr.pin && !/^[1-9]\d{5}$/.test(o.addr.pin)) e.push('PIN code should be exactly 6 digits.');
    if (o.dob && o.dob > addDays(todayISO(), -14 * 365)) e.push('Date of birth looks too recent.');
    if (D.team.some(t => t.id !== id && !t.deleted && t.mobile && mob(t.mobile) === mob(o.mobile))) e.push('Another team member has this mobile number.');
    if (e.length) return $('#tm_err').innerHTML = e.map(esc).join('<br>');
    if (id) D.team[D.team.findIndex(t => t.id === id)] = o; else { o.id = uid(); o.created = new Date().toISOString(); D.team.push(o); }
    await saveD('team'); m.close(); toast('Team updated.'); redraw();
  };
};
