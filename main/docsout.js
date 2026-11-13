'use strict';
/* Making files: PDF from HTML (invoices, letters, templates), Word .docx, and CSV reports. */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { BrowserWindow, dialog, shell, app } = require('electron');

async function htmlToPdf(html, opts = {}) {
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
  try {
    await pw.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return await pw.webContents.printToPDF({ pageSize: opts.pageSize || 'A4', printBackground: true, margins: { marginType: 'none' } });
  } finally { pw.destroy(); }
}

/* --- minimal ZIP writer (for .docx) --- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, data0] of Object.entries(files)) {
    const data = Buffer.isBuffer(data0) ? data0 : Buffer.from(data0, 'utf8'); const comp = zlib.deflateRawSync(data); const nb = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, nb, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nb); off += 30 + nb.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); const n = Object.keys(files).length;
  end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
/* blocks: [{ text, style: 'title'|'heading'|'normal', align: 'left'|'center'|'right'|'both', bold }] */
function docx(blocks) {
  const para = b => {
    const jc = b.align && b.align !== 'left' ? `<w:jc w:val="${b.align}"/>` : '';
    const size = b.style === 'title' ? 32 : b.style === 'heading' ? 26 : 24; const bold = b.bold || b.style === 'title' || b.style === 'heading';
    const runs = String(b.text ?? '').split('\n').map((ln, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${x(ln)}</w:t></w:r>`).join('');
    return `<w:p><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/>${jc}</w:pPr>${runs}</w:p>`;
  };
  const body = blocks.map(para).join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1260" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  });
}

module.exports = function (ctx) {
  const safeName = n => String(n || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 150);
  async function deliver(buf, filename, mode, ext, filterName) {
    const out = {};
    if (mode === 'store' || mode === 'both') out.file = ctx.storeBuffer(buf, safeName(filename));
    if (mode === 'save' || mode === 'both') {
      const r = ctx.testOut() ? { filePath: path.join(ctx.testOut(), safeName(filename)) } : await dialog.showSaveDialog(ctx.win(), { title: 'Save', defaultPath: path.join(app.getPath('documents'), safeName(filename)), filters: [{ name: filterName, extensions: [ext] }] });
      if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, buf); out.saved = r.filePath; if (!ctx.testOut()) shell.openPath(r.filePath); }
    }
    if (mode === 'preview') out.preview = ctx.tempPut(buf, safeName(filename));
    return out;
  }
  return {
    async makePdf({ html, filename, mode }) { ctx.needOpen(); if (typeof html !== 'string' || html.length > 5e6) throw new Error('Bad document'); return deliver(await htmlToPdf(html), filename.endsWith('.pdf') ? filename : filename + '.pdf', mode, 'pdf', 'PDF'); },
    async makeDocx({ blocks, filename, mode }) { ctx.needOpen(); if (!Array.isArray(blocks)) throw new Error('Bad document'); return deliver(docx(blocks), filename.endsWith('.docx') ? filename : filename + '.docx', mode, 'docx', 'Word document'); },
    async saveText({ text, filename }) { ctx.needOpen(); return deliver(Buffer.from('﻿' + String(text), 'utf8'), filename, 'save', path.extname(filename).slice(1) || 'csv', 'File'); },
  };
};
module.exports.htmlToPdf = htmlToPdf;
module.exports.docx = docx;
module.exports.zip = zip;
