'use strict';
const { app, BrowserWindow, ipcMain, Menu, shell, session, powerMonitor, dialog, protocol } = require('electron');
const docview = require('./docview');
const code128svg = require('../renderer/barcode.js');
// in-app viewer: files are decrypted in memory only and served to the viewer frame
const viewproto = require('./viewproto');
protocol.registerSchemesAsPrivileged([viewproto.PRIVILEGES]);
const path = require('path');
const { Vault } = require('./vault');
const WORDS = require('./words');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
let openTemp = null; // folder for files opened for viewing; wiped on lock and quit
let viewCache = null; // { fid, buf } last file decrypted for viewing
function wipeTemp() { viewCache = null; if (typeof tempFiles !== 'undefined') tempFiles.clear(); if (openTemp) { try { fs.rmSync(openTemp, { recursive: true, force: true }); } catch {} openTemp = null; } }
const MAX_FILE = 250 * 1024 * 1024;
function docsDir() { const d = path.join(vault.dir, 'docs'); fs.mkdirSync(d, { recursive: true }); return d; }
function storeFile(p) {
  const st = fs.statSync(p);
  if (!st.isFile()) throw new Error('Not a file: ' + path.basename(p));
  if (st.size > MAX_FILE) throw new Error(path.basename(p) + ' is larger than 250 MB.');
  const buf = fs.readFileSync(p);
  const fid = crypto.randomUUID();
  fs.writeFileSync(path.join(docsDir(), fid + '.enc'), vault.encryptBlob(buf, 'file:' + fid), { mode: 0o600 });
  return { fid, filename: path.basename(p), size: st.size, sha256: crypto.createHash('sha256').update(buf).digest('hex'), added: new Date().toISOString() };
}
function storeBuffer(buf, filename) {
  if (buf.length > MAX_FILE) throw new Error(filename + ' is larger than 250 MB.');
  const fid = crypto.randomUUID();
  fs.writeFileSync(path.join(docsDir(), fid + '.enc'), vault.encryptBlob(buf, 'file:' + fid), { mode: 0o600 });
  return { fid, filename, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), added: new Date().toISOString() };
}
const tempFiles = new Map(); // previews made by the app (not saved); cleared on lock
function tempPut(buf, filename) { const fid = crypto.randomUUID(); tempFiles.set(fid, buf); if (tempFiles.size > 20) tempFiles.delete(tempFiles.keys().next().value); return { fid, filename, size: buf.length }; }
function readStored(fid) {
  if (tempFiles.has(fid)) return tempFiles.get(fid);
  if (!/^[0-9a-f-]{36}$/.test(fid)) throw new Error('Bad file id');
  return vault.decryptBlob(fs.readFileSync(path.join(docsDir(), fid + '.enc')), 'file:' + fid);
}
const { Licence } = require('./licence');

/* ---- PIN codes (India Post directory, bundled; works offline) ---- */
let PINS = null;
function pins() { if (!PINS) PINS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pincodes.json'), 'utf8')); return PINS; }
function pinLookup(pin) {
  pin = String(pin || '');
  if (!/^[1-9]\d{5}$/.test(pin)) return { found: false };
  const P = pins(); const r = P.pins[pin];
  if (!r) return { found: false };
  const st = (Array.isArray(r[0]) ? r[0] : [r[0]]).map(i => P.states[i]);
  return { found: true, states: st, districts: r[1].map(i => P.dnames[i]), offices: r[2] };
}

/* ---- viewer protocol (see viewproto.js) ---- */
function viewBuf(fid) {
  if (viewCache && viewCache.fid === fid) return viewCache.buf;
  const buf = readStored(fid); viewCache = { fid, buf }; return buf;
}
const serveFile = viewproto.makeHandler({ isOpen: () => !!(vault && vault.isUnlocked()), getBuffer: viewBuf });

const DEV = process.env.MITAKSHARA_DEV === '1';
if (process.env.MITAKSHARA_DATA) app.setPath('userData', process.env.MITAKSHARA_DATA);
app.enableSandbox();
app.commandLine.appendSwitch('lang', 'en-IN'); // Indian date format (dd/mm/yyyy) in date fields
if (!app.requestSingleInstanceLock()) { app.quit(); }

let win = null, vault = null, licence = null, idleTimer = null;
const VERSION = app.getVersion();

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false,
    title: 'Mitakshara', backgroundColor: '#0F2A44',
    // our own title bar: the app's top bar holds search and actions; Windows keeps its native min/max/close buttons
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#0F2A44', symbolColor: '#E9DCC4', height: 46 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
      devTools: DEV, spellcheck: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); }); // always open full-size
  // never navigate away from the app, never open new windows inside it
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // keyboard shortcuts (Windows has no menu bar any more)
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || !(i.control || i.meta)) return;
    const k = i.key.toLowerCase(); const wc = win.webContents;
    if (k === 'l' && !i.shift) { e.preventDefault(); lockNow('manual'); }
    else if (k === '=' || k === '+') { e.preventDefault(); wc.setZoomLevel(Math.min(3, wc.getZoomLevel() + 0.5)); }
    else if (k === '-') { e.preventDefault(); wc.setZoomLevel(Math.max(-3, wc.getZoomLevel() - 0.5)); }
    else if (k === '0') { e.preventDefault(); wc.setZoomLevel(0); }
    else if (DEV && i.shift && k === 'i') { e.preventDefault(); wc.toggleDevTools(); }
  });
}

function menu() {
  const mac = process.platform === 'darwin';
  if (!mac) { Menu.setApplicationMenu(null); return; } // Windows: clean window, no 1990s menu bar
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Lock now', accelerator: 'CmdOrCtrl+L', click: () => lockNow('manual') }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(DEV ? [{ role: 'toggleDevTools' }] : [])] },
    { role: 'windowMenu' },
  ]));
}

function lockNow(reason) {
  wipeTemp();
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
  async unlock({ email, password }) { await needLicence(); vault.unlock(email, password); setTimeout(() => handlers.backupAutoTick().catch(() => {}), 60000); return true; },
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
  async addFiles({ paths }) {
    needOpen();
    let list = paths;
    if ((!list || !list.length) && DEV && process.env.MITAKSHARA_TEST_FILES) list = process.env.MITAKSHARA_TEST_FILES.split(',');
    if (!list || !list.length) {
      const r = await dialog.showOpenDialog(win, { title: 'Attach files', properties: ['openFile', 'multiSelections'] });
      if (r.canceled) return [];
      list = r.filePaths;
    }
    if (!Array.isArray(list) || list.length > 50) throw new Error('Please attach up to 50 files at a time.');
    return list.map(p => storeFile(String(p)));
  },
  async openFile({ fid, filename }) {
    needOpen();
    if (!openTemp) openTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'mitakshara-'));
    const safe = String(filename || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
    const out = path.join(openTemp, fid.slice(0, 8) + '-' + safe);
    fs.writeFileSync(out, readStored(fid), { mode: 0o600 });
    const err = await shell.openPath(out);
    if (err) throw new Error('Could not open: ' + err);
    return true;
  },
  async saveLabelPdf({ code, title, client, court, caseno }) {
    // A4 sheet of 8 file labels with the case barcode (for file covers and almirah shelves)
    needOpen();
    if (!/^C\d{2}-\d{4}\/\d{2}-[A-Z]{2}$/.test(String(code))) throw new Error('Invalid case code');
    const e = t => String(t || '').slice(0, 140).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const svg = code128svg(code, 50);
    const one = `<div class="l"><div class="t">${e(title)}</div><div class="s">${e(client)}${caseno ? ' · No. ' + e(caseno) : ''}</div><div class="s">${e(court)}</div><div class="b">${svg}</div><div class="c">${e(code)}</div></div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:10mm}body{margin:0;font-family:Arial,sans-serif;color:#111}
      .g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.l{border:1px dashed #999;border-radius:3mm;padding:4mm 5mm;height:58mm;box-sizing:border-box;overflow:hidden}
      .t{font-weight:bold;font-size:13pt;line-height:1.25;max-height:2.6em;overflow:hidden}.s{font-size:9.5pt;color:#333;margin-top:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .b{height:15mm;margin-top:3mm}.b svg{width:100%;height:100%}.c{font:bold 12pt monospace;text-align:center;margin-top:1mm;letter-spacing:1px}</style></head><body><div class="g">${one.repeat(8)}</div></body></html>`;
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    try {
      await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
      const r = (DEV && process.env.MITAKSHARA_KIT_OUT) ? { filePath: process.env.MITAKSHARA_KIT_OUT.replace(/\.pdf$/, '-label.pdf') } : await dialog.showSaveDialog(win, { title: 'Save file labels', defaultPath: path.join(app.getPath('documents'), 'Label ' + code.replace(/\//g, '_') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { saved: false };
      fs.writeFileSync(r.filePath, pdf); if (!DEV) shell.openPath(r.filePath);
      return { saved: true, file: r.filePath };
    } finally { pw.destroy(); }
  },
  async pinInfo({ pin }) { return pinLookup(pin); },
  async districtsOf({ state }) { const P = pins(); return P.districts[state] || []; },
  async pinSource() { return pins().source; },
  async exportFile({ fid, filename }) {
    needOpen();
    const r = await dialog.showSaveDialog(win, { title: 'Save a copy', defaultPath: path.join(app.getPath('downloads'), String(filename || 'file')) });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, readStored(fid));
    return true;
  },
  async deleteFile({ fid }) {
    needOpen();
    if (!/^[0-9a-f-]{36}$/.test(fid)) throw new Error('Bad file id');
    fs.rmSync(path.join(docsDir(), fid + '.enc'), { force: true });
    return true;
  },
  async getData({ key }) { needOpen(); return vault.data[key] ?? null; },
  async setData({ key, value }) { needOpen(); if (!/^[a-z_]{2,40}$/.test(key)) throw new Error('bad key'); vault.data[key] = value; vault.save(); return true; },
};
async function needLicence() { const s = await licence.status(); if (!s.valid) throw new Error('Please activate Mitakshara first.'); }
function needOpen() { if (!vault.isUnlocked()) throw new Error('Mitakshara is locked. Please sign in again.'); }

const ctx = { needOpen, storeBuffer, readStored, tempPut, win: () => win, vault: () => vault, licence: () => licence, DEV, testOut: () => (DEV && process.env.MITAKSHARA_TEST_OUT) || '', version: VERSION };
for (const mod of ['./docsout', './dsc', './ai', './net', './backup', './update', './ecourts']) Object.assign(handlers, require(mod)(ctx));
setInterval(() => { handlers.backupAutoTick().catch(() => {}); }, 30 * 60000);

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
  protocol.handle('mkfile', serveFile);
  // only local content: the app's own files and the in-app viewer
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob|mkfile):/.test(d.url) }));
  menu(); createWindow(); startIdleWatch();
  powerMonitor.on('lock-screen', () => lockNow('screen'));
  powerMonitor.on('suspend', () => lockNow('sleep'));
  // quiet licence check when online
  setTimeout(async () => { try { const s = await licence.status(); if (s.valid && s.needsRefresh) { const r = await licence.refresh(); if (r.ended && win) win.webContents.send('licence-ended', r.ended); } } catch {} }, 5000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { wipeTemp(); if (vault) vault.lock(); app.quit(); });
app.on('will-quit', wipeTemp);
app.on('web-contents-created', (_e, wc) => { wc.on('will-attach-webview', ev => ev.preventDefault()); });
