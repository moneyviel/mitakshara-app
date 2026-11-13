'use strict';
/*
 * In-app document viewer support.
 * PDFs, images, audio and video are shown by the built-in Chromium engine.
 * Word (.docx) and Excel (.xlsx) files are converted to safe, script-free HTML here,
 * so they can be read inside Mitakshara without Microsoft Office.
 */
const zlib = require('zlib');
const path = require('path');

const MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
};
const TEXT = new Set(['txt', 'csv', 'tsv', 'json', 'xml', 'md', 'log', 'html', 'htm', 'svg', 'eml', 'rtf']);
const extOf = n => (path.extname(String(n || '')).slice(1) || '').toLowerCase();
function kindOf(name) {
  const e = extOf(name);
  if (e === 'pdf') return 'pdf';
  if (/^(png|jpe?g|gif|webp|bmp)$/.test(e)) return 'image';
  if (MIME[e] && MIME[e].startsWith('audio')) return 'audio';
  if (MIME[e] && MIME[e].startsWith('video')) return 'video';
  if (e === 'docx') return 'docx';
  if (e === 'xlsx') return 'xlsx';
  if (TEXT.has(e)) return 'text';
  return 'other';
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unxml = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');

/* minimal ZIP reader (docx/xlsx are zip files) */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid Office file.');
  const n = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16); const files = {};
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    files[name] = () => {
      const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28); const data = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
      if (method === 0) return data; if (method === 8) return zlib.inflateRawSync(data); throw new Error('Unsupported compression');
    };
    p += 46 + nlen + xlen + clen;
  }
  return files;
}

function docxToHtml(buf) {
  const z = unzip(buf); if (!z['word/document.xml']) throw new Error('This Word file could not be read.');
  const xml = z['word/document.xml']().toString('utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
  const run = r => {
    let t = ''; r.replace(/<w:(t|tab|br|cr)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/w:t>)/g, (m, tag, txt) => { t += tag === 't' ? esc(unxml(txt || '')) : tag === 'tab' ? '&emsp;' : '<br>'; return m; });
    if (!t) return '';
    const pr = (r.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/) || [, ''])[1];
    if (/<w:b(?:\s+w:val="(?:1|true)")?\s*\/>/.test(pr)) t = `<b>${t}</b>`;
    if (/<w:i(?:\s+w:val="(?:1|true)")?\s*\/>/.test(pr)) t = `<i>${t}</i>`;
    if (/<w:u\s+w:val="(?!none)/.test(pr)) t = `<u>${t}</u>`;
    return t;
  };
  const para = p => {
    const style = (p.match(/<w:pStyle\s+w:val="([^"]+)"/) || [, ''])[1];
    const align = (p.match(/<w:jc\s+w:val="([^"]+)"/) || [, ''])[1];
    const html = (p.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || []).map(run).join('');
    const tag = /^(Heading1|Title)$/i.test(style) ? 'h1' : /^Heading2$/i.test(style) ? 'h2' : /^Heading[3-9]$/i.test(style) ? 'h3' : 'p';
    const st = align === 'center' ? ' style="text-align:center"' : align === 'right' || align === 'end' ? ' style="text-align:right"' : align === 'both' ? ' style="text-align:justify"' : '';
    return `<${tag}${st}>${html || '&nbsp;'}</${tag}>`;
  };
  const table = t => '<table>' + (t.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []).map(tr => '<tr>' + (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []).map(tc => '<td>' + (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) || []).map(para).join('') + '</td>').join('') + '</tr>').join('') + '</table>';
  let out = '';
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g; let m;
  while ((m = re.exec(body))) out += m[0].startsWith('<w:tbl') ? table(m[0]) : para(m[0]);
  const imgs = Object.keys(z).filter(k => k.startsWith('word/media/')).length;
  return { html: out, note: imgs ? `This document has ${imgs} picture${imgs === 1 ? '' : 's'}, which are not shown in the preview. Use "Open in other app" to see them.` : '' };
}

function xlsxToHtml(buf) {
  const z = unzip(buf); const rd = n => z[n] ? z[n]().toString('utf8') : '';
  const shared = (rd('xl/sharedStrings.xml').match(/<si>[\s\S]*?<\/si>/g) || []).map(si => (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map(t => unxml(t.replace(/<[^>]+>/g, ''))).join(''));
  const wb = rd('xl/workbook.xml'); const rels = rd('xl/_rels/workbook.xml.rels');
  const sheets = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map(m => { const target = (rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`)) || [, ''])[1]; return { name: unxml(m[1]), file: 'xl/' + target.replace(/^\/?xl\//, '') }; });
  const col = r => { let n = 0; for (const ch of r.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  let out = '';
  for (const sh of sheets.slice(0, 20)) {
    const x = rd(sh.file); const rows = [];
    for (const row of (x.match(/<row\b[\s\S]*?<\/row>/g) || []).slice(0, 3000)) {
      const cells = [];
      for (const c of row.match(/<c\b[\s\S]*?(?:\/>|<\/c>)/g) || []) {
        const ref = (c.match(/r="([A-Z]+\d+)"/) || [, 'A1'])[1]; const t = (c.match(/\st="([^"]+)"/) || [, ''])[1];
        let v = (c.match(/<v>([\s\S]*?)<\/v>/) || [, ''])[1];
        if (t === 's') v = shared[+v] ?? ''; else if (t === 'inlineStr') v = unxml(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [, ''])[1])); else v = unxml(v);
        cells[col(ref)] = v;
      }
      rows.push(cells);
    }
    const w = Math.min(60, Math.max(0, ...rows.map(r => r.length)));
    out += `<h2>${esc(sh.name)}</h2><table>${rows.map(r => '<tr>' + Array.from({ length: w }, (_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('') + '</tr>').join('')}</table>`;
  }
  return { html: out || '<p>This spreadsheet is empty.</p>', note: '' };
}

const PAGE_CSS = `body{font:15px/1.6 -apple-system,"Segoe UI",Arial,sans-serif;color:#1F2933;margin:0;background:#EDEAE3}
.page{background:#fff;max-width:860px;margin:24px auto;padding:48px 56px;box-shadow:0 2px 14px rgba(0,0,0,.12);border-radius:4px}
.wide{max-width:none;margin:16px;padding:20px}h1{font-size:22px}h2{font-size:17px;margin-top:22px}p{margin:0 0 8px}
table{border-collapse:collapse;margin:10px 0;font-size:13.5px}td{border:1px solid #D8D3C8;padding:5px 8px;vertical-align:top}
pre{white-space:pre-wrap;word-wrap:break-word;font:13.5px/1.55 Menlo,Consolas,monospace;margin:0}
.note{background:#FFF7E6;border:1px solid #F2DC9B;color:#6B4E00;border-radius:8px;padding:10px 14px;margin:16px auto;max-width:860px;font-size:13.5px}
.center{display:flex;align-items:center;justify-content:center;min-height:96vh}img{max-width:100%;max-height:94vh;box-shadow:0 2px 14px rgba(0,0,0,.15);background:#fff}
.box{background:#fff;border-radius:12px;padding:30px 36px;text-align:center;max-width:460px}audio,video{max-width:96%;max-height:90vh}`;
const wrap = (inner, wide) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>${inner}</body></html>`;

/* Builds the viewer page for one file. rawUrl serves the file bytes (for pdf/image/audio/video). */
function viewPage(name, buf, rawUrl) {
  const k = kindOf(name);
  if (k === 'image') return wrap(`<div class="center"><img src="${rawUrl}" alt="${esc(name)}"></div>`);
  if (k === 'audio') return wrap(`<div class="center"><div class="box"><p><b>${esc(name)}</b></p><audio controls autoplay src="${rawUrl}"></audio></div></div>`);
  if (k === 'video') return wrap(`<div class="center"><video controls src="${rawUrl}"></video></div>`);
  if (k === 'text') { let t = buf.toString('utf8'); if (t.length > 2e6) t = t.slice(0, 2e6) + '\n\n[Preview shortened]'; return wrap(`<div class="page"><pre>${esc(t)}</pre></div>`); }
  if (k === 'docx' || k === 'xlsx') {
    try { const r = k === 'docx' ? docxToHtml(buf) : xlsxToHtml(buf); return wrap(`${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}<div class="page${k === 'xlsx' ? ' wide' : ''}">${r.html}</div>`); }
    catch (e) { return wrap(`<div class="center"><div class="box"><p><b>This file could not be previewed.</b></p><p>${esc(e.message)}</p><p>Use "Open in other app".</p></div></div>`); }
  }
  const e = extOf(name);
  const hint = /^(doc|xls|ppt|pptx)$/.test(e) ? 'Older Word, Excel and PowerPoint formats cannot be previewed here.' : 'This type of file cannot be previewed here.';
  return wrap(`<div class="center"><div class="box"><p><b>${esc(name)}</b></p><p>${hint}</p><p>Use "Open in other app" or "Save copy" above.</p></div></div>`);
}
module.exports = { kindOf, viewPage, MIME, extOf, docxToHtml, xlsxToHtml };
