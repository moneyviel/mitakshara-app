'use strict';
/* Mitakshara screen code. Talks to the app engine only through window.mk. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const ftime = d => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
const root = () => $('#root');

async function call(name, args) {
  const r = await window.mk.call(name, args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3500); }
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card"><button class="btn ghost sm x" data-x>Close</button>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-x')) m.remove(); });
  document.body.appendChild(m); m.close = () => m.remove();
  const f = m.querySelector('input'); if (f) setTimeout(() => f.focus(), 30);
  return m;
}
function busy(btn, text) { const o = btn.textContent; btn.disabled = true; btn.textContent = text; return () => { btn.disabled = false; btn.textContent = o; }; }
function pwField(id, ph = '') { return `<div class="pwwrap"><input id="${id}" type="password" autocomplete="off" placeholder="${ph}"><button type="button" data-show="${id}">Show</button></div>`; }
function wirePw() { $$('[data-show]').forEach(b => b.onclick = () => { const i = document.getElementById(b.dataset.show); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Show' : 'Hide'; }); }
const PW_RULES = [['10+ characters', p => p.length >= 10], ['Capital letter', p => /[A-Z]/.test(p)], ['Small letter', p => /[a-z]/.test(p)], ['Number', p => /[0-9]/.test(p)], ['Symbol', p => /[^A-Za-z0-9]/.test(p)]];
function pwChecks(inputId, boxId) {
  const draw = () => { const p = document.getElementById(inputId).value; document.getElementById(boxId).innerHTML = PW_RULES.map(([t, f]) => `<span class="${f(p) ? 'ok' : 'no'}">${f(p) ? '&#10003;' : '&#9675;'} ${t}</span>`).join(''); };
  document.getElementById(inputId).addEventListener('input', draw); draw();
}
function idBox(id) {
  return `<div class="idbox"><div class="flex between"><span class="small muted">Installation ID (unique to this installation)</span><button class="btn ghost sm" data-copy="${esc(id)}">Copy</button></div>
    <div class="barcode">${window.code128svg(id)}</div><div class="mono center bold navytext">${esc(id)}</div></div>`;
}
function wireCopy() { $$('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied.'); } catch { toast('Could not copy. Please select and copy the text.'); } }); }
const BRAND = (title, text, list) => `<div class="brand"><div class="logo"><div class="mark">M</div>Mitakshara</div>
  <div><h2>${title}</h2><p>${text}</p>${list ? `<ul>${list.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}</div>
  <div class="small">Your data stays on this computer, encrypted.</div></div>`;

let S = { status: null, tab: 'Today' };

async function start(msg) {
  S.status = await call('status');
  const st = S.status;
  if (!st.licence.valid) return activationView(msg);
  if (!st.vault.exists) return setupView();
  if (!st.vault.unlocked) return loginView(msg);
  return shellView();
}

/* ---------------- Activation ---------------- */
function activationView(msg) {
  const L = S.status.licence;
  const why = { 'other-computer': 'This licence belongs to another computer or installation. Please activate again.', tampered: 'The licence file was changed. Please activate again.', expired: 'Please connect to the internet once so Mitakshara can confirm your licence.', clock: 'This computer\'s date looks wrong. Please correct the date and time, then connect to the internet once.' }[L.reason];
  root().innerHTML = `<div class="entry">${BRAND('Activate Mitakshara', 'Enter the email address and licence key from your purchase email. Activation needs the internet once; after that Mitakshara works offline.', ['One licence key works on one computer at a time', 'Reinstalling on the same computer? Use the same key', 'New computer? Use “Move licence” on the old one first'])}
   <div class="formside"><div class="formbox">
    <h1>Activate</h1><div class="muted">Licence key format: MTK- followed by 8 groups of 6 characters.</div>
    ${why || msg ? `<div class="warnbox mt14">${esc(msg || why)}</div>` : ''}
    <label for="a_email">Email used for the purchase</label><input id="a_email" type="email" autocomplete="off" value="${esc(L.email || '')}">
    <label for="a_key">Licence key</label><input id="a_key" class="mono" autocomplete="off" spellcheck="false" placeholder="MTK-xxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx-xxxxxx">
    <div class="small muted mt8" id="a_count"></div>
    <button class="btn wide mt14" id="a_go">Activate</button>
    <div class="err" id="a_err"></div>
    ${idBox(L.installationId)}
   </div></div></div>`;
  wireCopy();
  const key = $('#a_key');
  key.addEventListener('input', () => { const n = key.value.replace(/^\s*MTK-/i, '').replace(/[\s-]/g, '').length; $('#a_count').textContent = n ? `${n} of 48 characters` : ''; });
  $('#a_go').onclick = async () => {
    const done = busy($('#a_go'), 'Checking...'); $('#a_err').textContent = '';
    try { const r = await call('activate', { email: $('#a_email').value, key: key.value }); if (!r.ok) throw new Error(r.error); toast('Mitakshara is activated on this computer.'); start(); }
    catch (e) { $('#a_err').textContent = e.message; done(); }
  };
}

/* ---------------- First-time setup ---------------- */
function setupView() {
  const email = S.status.licence.email || '';
  root().innerHTML = `<div class="entry">${BRAND('Set up your private workspace', 'Your sign-in is your email and a password. Everything you store is encrypted with it, on this computer.', ['Only you can open it', 'Nobody else, including us, can read your data', 'A 24-word Recovery Kit lets you back in if you forget the password'])}
   <div class="formside"><div class="formbox">
    <div class="steps"><span class="on"></span><span></span><span></span></div>
    <h1>Your details</h1><div class="muted">Step 1 of 3</div>
    <label for="s_name">Your name (as it should appear on invoices and letters)</label><input id="s_name" autocomplete="off">
    <label for="s_email">Email (this is your sign-in name)</label><input id="s_email" type="email" value="${esc(email)}" autocomplete="off">
    <label for="s_pw">Password</label>${pwField('s_pw')}
    <div class="checks" id="s_chk"></div>
    <label for="s_pw2">Type the password again</label>${pwField('s_pw2')}
    <button class="btn wide mt20" id="s_go">Continue</button><div class="err" id="s_err"></div>
   </div></div></div>`;
  wirePw(); pwChecks('s_pw', 's_chk');
  $('#s_go').onclick = async () => {
    $('#s_err').textContent = '';
    if (!$('#s_name').value.trim()) return $('#s_err').textContent = 'Please enter your name.';
    if ($('#s_pw').value !== $('#s_pw2').value) return $('#s_err').textContent = 'The two passwords do not match.';
    const done = busy($('#s_go'), 'Encrypting your workspace...');
    try { const r = await call('createAccount', { name: $('#s_name').value, email: $('#s_email').value, password: $('#s_pw').value }); S.status = await call('status'); kitView(r.phrase, true); }
    catch (e) { $('#s_err').textContent = e.message; done(); }
  };
}
function kitHtml(phrase) { return `<div class="words">${phrase.map((w, i) => `<div><span>${i + 1}</span>${esc(w)}</div>`).join('')}</div>`; }
function kitView(phrase, firstTime) {
  root().innerHTML = `<div class="entry">${BRAND('Your Recovery Kit', 'These 24 words are the only way back in if you forget your password. Keep them on paper, somewhere safe.', ['Write them down or print them', 'Never share them, never type them into any website', 'Mitakshara will never ask for them except to reset your password'])}
   <div class="formside"><div class="formbox">
    ${firstTime ? '<div class="steps"><span class="on"></span><span class="on"></span><span></span></div>' : ''}
    <h1>Write these 24 words down</h1><div class="muted">${firstTime ? 'Step 2 of 3' : 'Your new Recovery Kit. The old one no longer works.'}</div>
    <div class="warnbox mt14">If you forget your password and lose these words, your data cannot be opened by anyone, not even by Mitakshara support.</div>
    ${kitHtml(phrase)}
    <div class="flex"><button class="btn ghost" id="k_print">Save as PDF to print</button><span class="grow"></span><button class="btn" id="k_next">I have written them down</button></div>
    <div id="printkit" class="hidden"><div class="kit-title">Mitakshara Recovery Kit</div><p>Account: ${esc(S.status.vault.profile?.email || '')} &middot; Created ${fd(new Date())}</p>${kitHtml(phrase)}<p>Keep this paper safe. Anyone with these words and your computer can reset your password.</p></div>
   </div></div></div>`;
  $('#k_print').onclick = async () => { const done = busy($('#k_print'), 'Preparing PDF...'); try { const r = await call('saveKitPdf', { phrase }); if (r.saved) toast('Saved and opened. Print it, then delete the PDF file.'); } catch (e) { toast(e.message); } done(); };
  $('#k_next').onclick = () => confirmKitView(phrase, firstTime);
}
function confirmKitView(phrase, firstTime) {
  const picks = []; while (picks.length < 3) { const n = Math.floor(Math.random() * 24); if (!picks.includes(n)) picks.push(n); } picks.sort((a, b) => a - b);
  root().innerHTML = `<div class="entry">${BRAND('Quick check', 'Just to be sure the words were written correctly.', null)}
   <div class="formside"><div class="formbox">
    ${firstTime ? '<div class="steps"><span class="on"></span><span class="on"></span><span class="on"></span></div>' : ''}
    <h1>Confirm three words</h1><div class="muted">${firstTime ? 'Step 3 of 3' : ''}</div>
    ${picks.map(n => `<label for="c_${n}">Word number ${n + 1}</label><input id="c_${n}" autocomplete="off" spellcheck="false">`).join('')}
    <div class="flex mt20"><button class="btn ghost" id="c_back">Show the words again</button><span class="grow"></span><button class="btn" id="c_go">Confirm</button></div>
    <div class="err" id="c_err"></div></div></div></div>`;
  $('#c_back').onclick = () => kitView(phrase, firstTime);
  $('#c_go').onclick = () => {
    const bad = picks.filter(n => $('#c_' + n).value.trim().toLowerCase() !== phrase[n]);
    if (bad.length) return $('#c_err').textContent = `Word ${bad.map(n => n + 1).join(' and ')} does not match. Please check your paper.`;
    toast(firstTime ? 'Your workspace is ready.' : 'New Recovery Kit saved.'); start();
  };
}

/* ---------------- Sign in, recovery ---------------- */
function loginView(msg) {
  const p = S.status.vault.profile;
  const why = { idle: 'Locked after a period of no activity.', screen: 'Locked because the screen was locked.', sleep: 'Locked because the computer went to sleep.', manual: 'Locked.' }[msg] || msg;
  root().innerHTML = `<div class="entry">${BRAND('Welcome back' + (p?.name ? ', ' + esc(p.name.split(' ')[0]) : ''), 'Sign in to open your encrypted workspace.', null)}
   <div class="formside"><div class="formbox">
    <h1>Sign in</h1>${why ? `<div class="muted">${esc(why)}</div>` : ''}
    <label for="l_email">Email</label><input id="l_email" type="email" value="${esc(p?.email || '')}" autocomplete="off">
    <label for="l_pw">Password</label>${pwField('l_pw')}
    <button class="btn wide mt20" id="l_go">Sign in</button><div class="err" id="l_err"></div>
    <div class="center mt14"><a id="l_forgot">Forgot password? Use your Recovery Kit</a></div></div></div></div>`;
  wirePw(); (p?.email ? $('#l_pw') : $('#l_email')).focus();
  const go = async () => {
    const done = busy($('#l_go'), 'Opening...'); $('#l_err').textContent = '';
    try { await call('unlock', { email: $('#l_email').value, password: $('#l_pw').value }); start(); }
    catch (e) { $('#l_err').textContent = e.message; done(); $('#l_pw').select(); }
  };
  $('#l_go').onclick = go; $('#l_pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#l_forgot').onclick = recoverView;
}
function recoverView() {
  root().innerHTML = `<div class="entry">${BRAND('Reset with your Recovery Kit', 'Type your 24 words in order, separated by spaces, then choose a new password.', null)}
   <div class="formside"><div class="formbox">
    <h1>Reset password</h1>
    <label for="r_words">Your 24 Recovery Kit words</label><textarea id="r_words" rows="4" spellcheck="false" autocomplete="off"></textarea>
    <label for="r_pw">New password</label>${pwField('r_pw')}<div class="checks" id="r_chk"></div>
    <label for="r_pw2">Type the new password again</label>${pwField('r_pw2')}
    <div class="flex mt20"><button class="btn ghost" id="r_back">Back to sign in</button><span class="grow"></span><button class="btn" id="r_go">Reset and sign in</button></div>
    <div class="err" id="r_err"></div></div></div></div>`;
  wirePw(); pwChecks('r_pw', 'r_chk');
  $('#r_back').onclick = () => loginView();
  $('#r_go').onclick = async () => {
    $('#r_err').textContent = '';
    if ($('#r_pw').value !== $('#r_pw2').value) return $('#r_err').textContent = 'The two passwords do not match.';
    const done = busy($('#r_go'), 'Checking...');
    try { await call('recover', { phrase: $('#r_words').value, password: $('#r_pw').value }); toast('Password reset. You are signed in.'); start(); }
    catch (e) { $('#r_err').textContent = e.message; done(); }
  };
}

/* ---------------- App shell ---------------- */
const TABS = [
  ['Today', '&#9728;'], ['Clients', '&#128101;'], ['Cases', '&#128193;'], ['Diary', '&#128197;'], ['Team', '&#128100;'],
  ['Law Library', '&#128214;'], ['Accounts', '&#8377;'], ['Settings', '&#9881;'],
];
const DONE_STAGES = 3;
const STAGES = [
  ['Secure app, licence and encrypted storage', 'Done'],
  ['Clients and documents, with typing suggestions', 'Clients'],
  ['Cases, hearing checklist and after-hearing steps', 'Cases'],
  ['Accounts and GST invoices (any type)', 'Accounts'],
  ['Digital signature (DSC) on PDFs', 'Cases'],
  ['AI assistant and easy templates', 'Cases'],
  ['Research sources and Law Library updates', 'Law Library'],
  ['Backup, auto-update, download page and licence admin', 'Settings'],
];
function shellView() {
  const p = S.status.vault.profile;
  root().innerHTML = `<div class="shell"><aside class="side"><div class="logo"><div class="mark">M</div>Mitakshara</div>
    <nav class="nav">${TABS.map(([t, i]) => `<button data-tab="${t}" class="${S.tab === t ? 'on' : ''}"><span class="ic">${i}</span>${t}</button>`).join('')}</nav>
    <div class="sidefoot">Signed in as<br><b class="sidename">${esc(p?.name || '')}</b><br><button class="btn ghost sm" id="lockbtn">Lock (Ctrl/Cmd+L)</button></div></aside>
    <main class="main" id="page"></main></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; shellView(); });
  $('#lockbtn').onclick = async () => { await call('lock'); start('manual'); };
  (PAGES[S.tab] || PAGES.soon)();
}
const page = html => { $('#page').innerHTML = html; };
const PAGES = {};
PAGES.Today = () => {
  const st = S.status; const L = st.licence; const name = (st.vault.profile?.name || '').split(' ')[0];
  const h = new Date().getHours(); const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  page(`<div class="top"><div><h1>${greet}${name ? ', ' + esc(name) : ''}</h1><div class="muted">${fd(new Date())}</div></div></div>
   <div id="t_slot"></div>
   <div class="card"><h2>Building Mitakshara, stage by stage</h2>
    ${STAGES.map(([t], i) => `<div class="stage ${i < DONE_STAGES ? 'done' : i === DONE_STAGES ? 'now' : ''}"><div class="n">${i < DONE_STAGES ? '&#10003;' : i + 1}</div><div><b>${t}</b><div class="small muted">${i < DONE_STAGES ? 'Ready to use' : i === DONE_STAGES ? 'Next' : 'Planned'}</div></div></div>`).join('')}</div>`);
};
PAGES.soon = () => {
  const i = STAGES.findIndex(s => s[1] === S.tab && s[1] !== 'Done');
  const items = STAGES.map((s, n) => ({ s, n })).filter(x => x.s[1] === S.tab);
  page(`<div class="top"><div><h1>${esc(S.tab)}</h1><div class="muted">This section is being built.</div></div></div>
   <div class="card soon"><h2>Coming in ${items.map(x => 'Stage ' + (x.n + 1)).join(' and ') || 'a later stage'}</h2>${items.map(x => `<div class="row"><span>${esc(x.s[0])}</span><span class="tag grey">Stage ${x.n + 1}</span></div>`).join('')}</div>`);
};
['Cases', 'Diary', 'Law Library', 'Accounts'].forEach(t => PAGES[t] = PAGES.soon);
PAGES.Settings = async () => {
  const st = S.status; const L = st.licence;
  page(`<div class="top"><div><h1>Settings</h1><div class="muted">Security, licence, practice details and lists.</div></div></div>
   <div class="minis">
    <div class="mini"><span>Workspace</span><b>Encrypted</b><i>AES-256, locked with your password</i></div>
    <div class="mini"><span>Auto-lock</span><b>${st.vault.autoLockMin} min</b><i>Also on sleep and screen lock</i></div>
    <div class="mini"><span>Licence</span><b>Active</b><i>Works offline until ${fd(L.offlineUntil)}</i></div>
    <div class="mini"><span>Version</span><b>${esc(st.version)}</b><i>Updates: see "Updates and backup"</i></div></div>
   <div class="grid g2" id="set_grid">
    <div class="card"><h2>Security</h2>
     <div class="row"><div><b>Password</b><div class="small muted">Used to unlock your encrypted workspace</div></div><button class="btn ghost sm" id="set_pw">Change</button></div>
     <div class="row"><div><b>Auto-lock after no activity</b><div class="small muted">Also locks when the computer sleeps or the screen locks</div></div>
      <select id="set_lock" class="w-auto">${[2, 5, 10, 15, 30, 60].map(m => `<option value="${m}" ${m === st.vault.autoLockMin ? 'selected' : ''}>${m} minutes</option>`).join('')}</select></div>
     <div class="row"><div><b>Recovery Kit</b><div class="small muted">Make a new 24-word kit if the old paper is lost</div></div><button class="btn ghost sm" id="set_kit">New kit</button></div>
     <div class="row"><div><b>Encryption</b><div class="small muted">AES-256-GCM, key protected with scrypt</div></div><span class="tag ok">On</span></div></div>
    <div class="card"><h2>Licence</h2>
     <div class="row"><span class="muted">Status</span><span class="tag ok">Active</span></div>
     <div class="row"><span class="muted">Licensed to</span><span>${esc(L.email)}</span></div>
     <div class="row"><span class="muted">Key ending</span><span class="mono">...${esc(L.hint)}</span></div>
     <div class="row"><span class="muted">Last confirmed online</span><span>${ftime(L.checkedAt)}</span></div>
     <div class="row"><span class="muted">Works offline until</span><span>${fd(L.offlineUntil)}</span></div>
     ${idBox(L.installationId)}
     <div class="flex mt14"><button class="btn ghost sm" id="set_chk">Check licence now</button><span class="grow"></span><button class="btn ghost sm" id="set_move">Move licence to another computer</button></div></div>
    <div class="card"><h2>About</h2><div class="row"><span class="muted">Version</span><span>${esc(st.version)}</span></div><div class="row"><span class="muted">Your name</span><span>${esc(st.vault.profile?.name)}</span></div><div class="row"><span class="muted">Sign-in email</span><span>${esc(st.vault.profile?.email)}</span></div><div class="row"><span class="muted">Workspace created</span><span>${fd(st.vault.profile?.created)}</span></div></div>
   </div>`);
  wireCopy();
  $('#set_lock').onchange = async e => { await call('setAutoLock', { minutes: +e.target.value }); S.status = await call('status'); toast('Auto-lock set to ' + e.target.value + ' minutes.'); };
  $('#set_pw').onclick = () => {
    const m = modal(`<h2>Change password</h2><label>Current password</label>${pwField('cp_old')}<label>New password</label>${pwField('cp_new')}<div class="checks" id="cp_chk"></div><label>Type the new password again</label>${pwField('cp_new2')}<div class="flex end mt14"><button class="btn" id="cp_go">Change password</button></div><div class="err" id="cp_err"></div>`);
    wirePw(); pwChecks('cp_new', 'cp_chk');
    m.querySelector('#cp_go').onclick = async () => {
      if ($('#cp_new').value !== $('#cp_new2').value) return $('#cp_err').textContent = 'The two new passwords do not match.';
      const done = busy($('#cp_go'), 'Saving...');
      try { await call('changePassword', { oldPassword: $('#cp_old').value, newPassword: $('#cp_new').value }); m.close(); toast('Password changed. Your Recovery Kit still works.'); }
      catch (e) { $('#cp_err').textContent = e.message; done(); }
    };
  };
  $('#set_kit').onclick = () => {
    const m = modal(`<h2>New Recovery Kit</h2><div class="warnbox">The old 24 words will stop working.</div><label>Your password</label>${pwField('nk_pw')}<div class="flex end mt14"><button class="btn" id="nk_go">Make new kit</button></div><div class="err" id="nk_err"></div>`);
    wirePw();
    m.querySelector('#nk_go').onclick = async () => { const done = busy($('#nk_go'), 'Working...'); try { const r = await call('newRecoveryKit', { password: $('#nk_pw').value }); m.close(); kitView(r.phrase, false); } catch (e) { $('#nk_err').textContent = e.message; done(); } };
  };
  $('#set_chk').onclick = async () => { const done = busy($('#set_chk'), 'Checking...'); const r = await call('refreshLicence'); S.status = await call('status'); if (r.ended) return start(r.ended); toast(r.valid ? 'Licence confirmed.' : 'Could not confirm right now.'); shellView(); };
  $('#set_move').onclick = () => {
    const m = modal(`<h2>Move licence</h2><p>This releases the licence from this computer so you can activate it on another one. Mitakshara will stop working here until activated again.</p><div class="warnbox">Before moving, keep your data safe. (In Stage 8 a one-click backup and restore will move your data too.) Each licence can be moved 3 times; after that, contact support.</div><label>Your password, to confirm</label>${pwField('mv_pw')}<div class="flex end mt14"><button class="btn red" id="mv_go">Release this computer</button></div><div class="err" id="mv_err"></div>`);
    wirePw();
    m.querySelector('#mv_go').onclick = async () => { const done = busy($('#mv_go'), 'Releasing...'); try { const r = await call('releaseLicence', { password: $('#mv_pw').value }); if (!r.ok) throw new Error(r.error); m.close(); toast('Licence released from this computer.'); start(); } catch (e) { $('#mv_err').textContent = e.message; done(); } };
  };
};

window.mk.onLocked(reason => { document.querySelectorAll('.modal').forEach(m => m.remove()); start(reason); });
window.mk.onLicenceEnded(msg => start(msg));
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l' && S.status?.vault?.unlocked) { e.preventDefault(); call('lock').then(() => start('manual')); } });
