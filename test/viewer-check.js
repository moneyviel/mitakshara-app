'use strict';
// CI check: the in-app viewer opens PDFs (with spaces in the name) and text files on this OS.
// Uses the real protocol code, window settings and network filter of the app. Run: electron test/viewer-check.js
const { app, BrowserWindow, protocol, session } = require('electron');
const path = require('path');
const viewproto = require('../main/viewproto');
protocol.registerSchemesAsPrivileged([viewproto.PRIVILEGES]);
app.enableSandbox();
app.on('window-all-closed', () => {}); // keep running between windows
const FILES = {};
const FID_PDF = '11111111-2222-3333-4444-555555555555', FID_TXT = '66666666-7777-8888-9999-000000000000';
const fail = msg => { console.log('VIEWER CHECK FAILED: ' + msg); app.exit(1); };
setTimeout(() => fail('timed out'), 60000);
app.whenReady().then(async () => {
  const blocked = [];
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => { const bad = !/^(file|devtools|data|blob|mkfile):/.test(d.url); if (bad) blocked.push(d.url); cb({ cancel: bad }); });
  // make a 3-page PDF to view
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  await pw.loadURL('data:text/html,' + encodeURIComponent('<h1>Mitakshara viewer check</h1>' + '<p style="page-break-after:always">page</p>'.repeat(3)));
  FILES[FID_PDF] = await pw.webContents.printToPDF({}); pw.destroy();
  FILES[FID_TXT] = Buffer.from('Plain text preview works.');
  protocol.handle('mkfile', viewproto.makeHandler({ isOpen: () => true, getBuffer: fid => FILES[fid] }));
  const win = new BrowserWindow({ width: 1000, height: 800, show: true, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  const logs = []; win.webContents.on('console-message', (_e, _l, m) => logs.push(m));
  win.webContents.on('did-fail-load', (_e, c, d, u) => console.log('fail-load', c, d, u));
  await win.loadFile(path.join(__dirname, 'viewer-check.html')).catch(e => console.log('load error', e.message, blocked));
  const frameState = async (url, probe) => {
    await win.webContents.executeJavaScript(`document.getElementById('f').src = ${JSON.stringify(url)}; true`);
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      const fr = win.webContents.mainFrame.frames[0];
      if (!fr || !fr.url.startsWith('mkfile:')) continue;
      try { const v = await fr.executeJavaScript(probe); if (v) return v; } catch {}
    }
    return null;
  };
  const pdf = await frameState(`mkfile://view/${FID_PDF}/Aldar Properties Results 9M 2026.pdf`, `document.body.dataset.state === 'ready' ? 'pages=' + document.body.dataset.pages + ' canvas=' + document.querySelectorAll('canvas').length : document.body.dataset.state === 'error' ? 'ERROR' : ''`);
  console.log('PDF: ' + pdf);
  const txt = await frameState(`mkfile://view/${FID_TXT}/note file.txt`, `document.body.innerText.includes('Plain text preview works') ? 'ok' : ''`);
  console.log('TEXT: ' + txt);
  if (blocked.length) console.log('Blocked requests: ' + blocked.join(', '));
  if (logs.length) console.log('Console: ' + logs.join(' | '));
  if (!pdf || pdf === 'ERROR' || !/canvas=[1-9]/.test(pdf)) return fail('PDF did not render');
  if (txt !== 'ok') return fail('text preview did not render');
  console.log('VIEWER CHECK PASSED on ' + process.platform); app.exit(0);
});
