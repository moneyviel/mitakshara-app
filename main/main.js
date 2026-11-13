'use strict';
const { app, BrowserWindow, ipcMain, Menu, shell, session, powerMonitor, dialog } = require('electron');
const path = require('path');
const { Vault } = require('./vault');
const WORDS = require('./words');
const fs = require('fs');
const { Licence } = require('./licence');

const DEV = process.env.MITAKSHARA_DEV === '1';
if (process.env.MITAKSHARA_DATA) app.setPath('userData', process.env.MITAKSHARA_DATA);
app.enableSandbox();
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, vault = null, licence = null, idleTimer = null;
const VERSION = app.getVersion();

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false,
    title: 'Mitakshara', backgroundColor: '#F7F5F0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      devTools: DEV, spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // never navigate away from the app, never open new windows inside it
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

function menu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Lock now', accelerator: 'CmdOrCtrl+L', click: () => lockNow('manual') }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(DEV ? [{ role: 'toggleDevTools' }] : [])] },
    { role: 'windowMenu' },
  ]));
}

function lockNow(reason) {
  if (vault && vault.isUnlocked()) { vault.lock(); if (win) win.webContents.send('locked', reason); }
}
function startIdleWatch() {
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (!vault || !vault.isUnlocked()) return;
    const min = vault.meta().autoLockMin || 10;
    if (powerMonitor.getSystemIdleTime() >= min * 60) lockNow('idle');
  }, 15000);
}

/* ---- safe bridge: every call is checked here; the screen never sees keys ---- */
const handlers = {
  async status() {
    const lic = await licence.status();
    const exists = vault.exists();
    return {
      version: VERSION, platform: process.platform,
      licence: lic,
      vault: { exists, unlocked: vault.isUnlocked(), profile: vault.profile(), autoLockMin: exists ? (vault.meta().autoLockMin || 10) : 10 },
    };
  },
  async activate({ email, key }) { return licence.activate(email, key); },
  async refreshLicence() { return licence.refresh(); },
  async releaseLicence({ password }) {
    const p = vault.profile();
    if (!vault.isUnlocked() || !p) throw new Error('Please sign in first.');
    // confirm it is really the owner
    const tmp = new Vault(vault.dir); tmp.unlock(p.email, password); tmp.lock();
    return licence.release();
  },
  async createAccount({ name, email, password }) { await needLicence(); return { phrase: vault.create({ name, email, password }) }; },
  async unlock({ email, password }) { await needLicence(); vault.unlock(email, password); return true; },
  async lock() { lockNow('manual'); return true; },
  async recover({ phrase, password }) { await needLicence(); vault.recover(phrase, password); return true; },
  async changePassword({ oldPassword, newPassword }) { vault.changePassword(oldPassword, newPassword); return true; },
  async newRecoveryKit({ password }) { return { phrase: vault.newRecoveryKit(password) }; },
  async setAutoLock({ minutes }) { vault.setAutoLock(minutes); return true; },
  async saveKitPdf({ phrase }) {
    // Recovery Kit as a PDF the user can see and print. Only real kit words are accepted.
    if (!Array.isArray(phrase) || phrase.length !== 24 || !phrase.every(w => WORDS.includes(w))) throw new Error('Invalid kit');
    const p = vault.profile() || {};
    const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1F2933;margin:46px}
      h1{font:600 26px Georgia,serif;color:#0F2A44;margin:0 0 6px}.sub{color:#555;margin-bottom:22px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0 26px}
      .w{border:1px solid #CFC6B4;border-radius:8px;padding:10px 12px;font-size:16px;font-weight:bold}.w span{color:#888;font-weight:normal;font-size:12px;margin-right:8px}
      .box{border:2px solid #B08D57;border-radius:10px;padding:14px 16px;background:#FBF8F2;font-size:13px;line-height:1.6}
      .foot{margin-top:28px;font-size:12px;color:#777}</style></head><body>
      <h1>Mitakshara Recovery Kit</h1><div class="sub">Account: <b>${esc(p.email)}</b> &nbsp;&middot;&nbsp; Name: ${esc(p.name)} &nbsp;&middot;&nbsp; Created: ${date}</div>
      <div class="grid">${phrase.map((w, i) => `<div class="w"><span>${i + 1}</span>${w}</div>`).join('')}</div>
      <div class="box"><b>Keep this paper safe and private.</b><br>These 24 words are the only way to reset your Mitakshara password. Anyone who has them and your computer can open your data. Never photograph them, email them, or type them into any website.<br><br><b>Recommended:</b> print this page, then delete this PDF file.</div>
      <div class="foot">If you make a new Recovery Kit in Settings, this one stops working.</div></body></html>`;
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    try {
      await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
      const r = (DEV && process.env.MITAKSHARA_KIT_OUT) ? { filePath: process.env.MITAKSHARA_KIT_OUT } : await dialog.showSaveDialog(win, { title: 'Save Recovery Kit', defaultPath: path.join(app.getPath('documents'), 'Mitakshara-Recovery-Kit.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { saved: false };
      fs.writeFileSync(r.filePath, pdf);
      if (!DEV) shell.openPath(r.filePath);
      return { saved: true, file: r.filePath };
    } finally { pw.destroy(); }
  },
  async getData({ key }) { needOpen(); return vault.data[key] ?? null; },
  async setData({ key, value }) { needOpen(); if (!/^[a-z_]{2,40}$/.test(key)) throw new Error('bad key'); vault.data[key] = value; vault.save(); return true; },
};
async function needLicence() { const s = await licence.status(); if (!s.valid) throw new Error('Please activate Mitakshara first.'); }
function needOpen() { if (!vault.isUnlocked()) throw new Error('Mitakshara is locked. Please sign in again.'); }

ipcMain.handle('mk', async (e, name, args) => {
  if (!win || e.sender !== win.webContents) throw new Error('Not allowed');
  if (!Object.prototype.hasOwnProperty.call(handlers, name)) throw new Error('Unknown request');
  try { return { ok: true, value: await handlers[name](args || {}) }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  vault = new Vault(path.join(dir, 'vault'));
  licence = new Licence(path.join(dir, 'licence'), VERSION);
  // deny camera, microphone, location etc. unless a later feature asks for it explicitly
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/.test(d.url) }));
  menu(); createWindow(); startIdleWatch();
  powerMonitor.on('lock-screen', () => lockNow('screen'));
  powerMonitor.on('suspend', () => lockNow('sleep'));
  // quiet licence check when online
  setTimeout(async () => { try { const s = await licence.status(); if (s.valid && s.needsRefresh) { const r = await licence.refresh(); if (r.ended && win) win.webContents.send('licence-ended', r.ended); } } catch {} }, 5000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (vault) vault.lock(); app.quit(); });
app.on('web-contents-created', (_e, wc) => { wc.on('will-attach-webview', ev => ev.preventDefault()); });
