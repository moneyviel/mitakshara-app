// Mitakshara PDF reader, built on Mozilla PDF.js (Apache 2.0). Works the same on Windows and Mac.
import * as pdfjs from './pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = '/_app/pdfjs/pdf.worker.mjs';
const src = location.href.replace(/^mkfile:\/\/view\//, 'mkfile://raw/');
const $ = s => document.querySelector(s);
const pagesEl = $('#pages'); const info = $('#info'); const zoomEl = $('#zoom');
let doc = null, scale = 0, fit = true; const views = [];

function fitScale(page) { const vp = page.getViewport({ scale: 1 }); return Math.max(0.4, Math.min(1.5, (pagesEl.clientWidth - 40) / vp.width)); }
function renderPage(v) {
  if (v.rendered === scale && v.p) return v.p; v.rendered = scale; v.p = drawPage(v); return v.p;
}
async function drawPage(v) {
  const page = await doc.getPage(v.n); const vp = page.getViewport({ scale });
  const ratio = window.devicePixelRatio || 1;
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width * ratio); c.height = Math.floor(vp.height * ratio);
  c.style.width = Math.floor(vp.width) + 'px'; c.style.height = Math.floor(vp.height) + 'px';
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
  v.el.replaceChildren(c); v.el.dataset.done = '1';
}
async function layout() {
  const first = await doc.getPage(1);
  if (fit) scale = fitScale(first);
  zoomEl.textContent = Math.round(scale * 100) + '%';
  for (const v of views) {
    const p = v.n === 1 ? first : await doc.getPage(v.n); const vp = p.getViewport({ scale });
    v.el.style.width = Math.floor(vp.width) + 'px'; v.el.style.height = Math.floor(vp.height) + 'px'; v.rendered = 0; v.p = null;
  }
  views.forEach(v => { if (isNear(v.el)) renderPage(v); });
}
const isNear = el => { const r = el.getBoundingClientRect(); return r.bottom > -800 && r.top < innerHeight + 800; };
function onScroll() {
  let cur = 1; for (const v of views) { const r = v.el.getBoundingClientRect(); if (r.top < innerHeight / 2) cur = v.n; if (isNear(v.el)) renderPage(v); }
  info.textContent = `Page ${cur} of ${doc.numPages}`;
}
async function main() {
  try {
    doc = await pdfjs.getDocument({ url: src, cMapUrl: '/_app/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/_app/pdfjs/standard_fonts/', wasmUrl: '/_app/pdfjs/wasm/', iccUrl: '/_app/pdfjs/iccs/', isEvalSupported: false }).promise;
  } catch (e) {
    pagesEl.innerHTML = '<div class="msg"><b>This PDF could not be opened.</b><br>' + (/password/i.test(e.name + e.message) ? 'It is protected with a password.' : 'The file may be damaged.') + '<br>Use "Open in other app" above.</div>';
    document.body.dataset.state = 'error'; return;
  }
  for (let n = 1; n <= doc.numPages; n++) { const el = document.createElement('div'); el.className = 'pg'; pagesEl.appendChild(el); views.push({ n, el, rendered: 0 }); }
  await layout(); await renderPage(views[0]); onScroll(); document.body.dataset.state = 'ready'; document.body.dataset.pages = doc.numPages;
}
pagesEl.addEventListener('scroll', onScroll);
$('#zin').onclick = () => { fit = false; scale = Math.min(4, scale * 1.2); layout(); };
$('#zout').onclick = () => { fit = false; scale = Math.max(0.3, scale / 1.2); layout(); };
$('#zfit').onclick = () => { fit = true; layout(); };
addEventListener('resize', () => { if (fit && doc) layout(); });
main();
