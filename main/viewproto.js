'use strict';
/* mkfile:// protocol: the in-app viewer. Files are decrypted in memory only.
   mkfile://view/<fid>/<name>  viewer page    mkfile://raw/<fid>/<name>  file bytes
   /_app/pdfjs/...      the bundled PDF reader (PDF.js)                        */
const fs = require('fs');
const path = require('path');
const docview = require('./docview');
const ab = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length); // exact bytes, never a shared pool
const PDFJS = path.join(__dirname, '..', 'renderer', 'pdfjs');
const APP_TYPES = { mjs: 'text/javascript', js: 'text/javascript', css: 'text/css', wasm: 'application/wasm', bcmap: 'application/octet-stream', pfb: 'application/octet-stream', ttf: 'font/ttf', icc: 'application/octet-stream' };
const PDF_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/_app/pdfjs/pdfview.css"></head><body data-state="loading">
<div id="bar"><span id="info">Opening&hellip;</span><button id="zout" title="Zoom out">&minus;</button><span id="zoom"></span><button id="zin" title="Zoom in">+</button><button id="zfit">Fit width</button></div>
<div id="pages"></div><script type="module" src="/_app/pdfjs/pdfview.mjs"></script></body></html>`;
const CSP_PDF = "default-src 'none'; script-src mkfile: 'wasm-unsafe-eval'; worker-src mkfile:; connect-src mkfile:; img-src mkfile: data: blob:; style-src mkfile: 'unsafe-inline'; font-src mkfile: data:";
const CSP_PAGE = "default-src 'none'; img-src mkfile:; media-src mkfile:; style-src 'unsafe-inline'";

function makeHandler({ isOpen, getBuffer }) {
  return async function serve(req) {
    try {
      const u = new URL(req.url);
      if (u.host === 'view' && u.pathname.startsWith('/_app/pdfjs/')) {
        const rel = decodeURIComponent(u.pathname).replace(/^\/_app\/pdfjs\//, '');
        const full = path.join(PDFJS, rel);
        if (!full.startsWith(PDFJS + path.sep) || !fs.existsSync(full)) return new Response('Not found', { status: 404 });
        const ext = path.extname(full).slice(1).toLowerCase();
        return new Response(ab(fs.readFileSync(full)), { headers: { 'content-type': APP_TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-store' } });
      }
      if (!isOpen()) return new Response('Locked', { status: 403 });
      const [, fid, ...rest] = u.pathname.split('/');
      const name = decodeURIComponent(rest.join('/') || 'file');
      if (!/^[0-9a-f-]{36}$/.test(fid || '')) return new Response('Not found', { status: 404 });
      if (u.host === 'view') {
        if (docview.kindOf(name) === 'pdf') return new Response(PDF_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP_PDF } });
        const html = docview.viewPage(name, getBuffer(fid), `mkfile://raw/${fid}/${encodeURIComponent(name)}`);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP_PAGE } });
      }
      if (u.host !== 'raw') return new Response('Not found', { status: 404 });
      const buf = getBuffer(fid);
      const ext = docview.extOf(name);
      const type = docview.MIME[ext] || (docview.kindOf(name) === 'text' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
      const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src mkfile: data:" };
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
      if (range && (range[1] || range[2])) {
        const a = range[1] ? +range[1] : buf.length - +range[2]; const b = range[1] && range[2] ? Math.min(+range[2], buf.length - 1) : buf.length - 1;
        if (a >= buf.length || a > b) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${buf.length}` } });
        return new Response(ab(buf.subarray(a, b + 1)), { status: 206, headers: { ...base, 'content-range': `bytes ${a}-${b}/${buf.length}`, 'content-length': String(b - a + 1) } });
      }
      return new Response(ab(buf), { headers: { ...base, 'content-length': String(buf.length) } });
    } catch (e) { return new Response('Could not open this file.', { status: 500 }); }
  };
}
const PRIVILEGES = { scheme: 'mkfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } };
module.exports = { makeHandler, PRIVILEGES };
