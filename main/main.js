'use strict';
const { app, BrowserWindow, ipcMain, Menu, shell, session, powerMonitor, dialog } = require('electron');
const path = require('path');
const { Vault } = require('./vault');
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
