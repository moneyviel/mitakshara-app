'use strict';
/*
 * Digital signatures on PDFs (PAdES basic: adbe.pkcs7.detached, RSA-SHA256).
 * Providers: a DEMO certificate made on this computer (for practice, shows as "not trusted"),
 * and USB tokens (ProxKey, ePass, mToken, SafeNet, HyperPKI...) through their PKCS#11 driver.
 * Token signing needs the driver of the brand; switching brand = choosing another provider.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ---------- tiny DER encoder ---------- */
const len = n => n < 128 ? Buffer.from([n]) : (() => { const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); })();
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...a) => tlv(0x30, Buffer.concat(a));
const set = (...a) => tlv(0x31, Buffer.concat(a));
const setSorted = items => tlv(0x31, Buffer.concat([...items].sort(Buffer.compare)));
const int = v => { let b = Buffer.isBuffer(v) ? v : (() => { let h = BigInt(v).toString(16); if (h.length % 2) h = '0' + h; return Buffer.from(h, 'hex'); })(); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return tlv(0x02, b); };
const oid = s => { const p = s.split('.').map(Number); const out = [40 * p[0] + p[1]]; for (const n of p.slice(2)) { const t = []; let v = n; do { t.unshift(v & 127); v = Math.floor(v / 128); } while (v); for (let i = 0; i < t.length - 1; i++) t[i] |= 128; out.push(...t); } return tlv(0x06, Buffer.from(out)); };
const nul = Buffer.from([0x05, 0x00]);
const utf8 = s => tlv(0x0c, Buffer.from(s, 'utf8'));
const printable = s => tlv(0x13, Buffer.from(s, 'ascii'));
const octet = b => tlv(0x04, b);
const bits = b => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const ctx = (n, body, constructed = true) => tlv((constructed ? 0xa0 : 0x80) + n, body);
const utc = d => { const p = x => String(x).padStart(2, '0'); return tlv(0x17, Buffer.from(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`)); };
const OID = { sha256rsa: '1.2.840.113549.1.1.11', rsa: '1.2.840.113549.1.1.1', sha256: '2.16.840.1.101.3.4.2.1', data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2', contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5', cn: '2.5.4.3', o: '2.5.4.10', c: '2.5.4.6', keyUsage: '2.5.29.15' };
const algo = o => seq(oid(o), nul);
const name = (cn, org) => seq(set(seq(oid(OID.c), printable('IN'))), set(seq(oid(OID.o), utf8(org))), set(seq(oid(OID.cn), utf8(cn))));

/* ---------- demo certificate (self-signed, 2 years) ---------- */
function makeDemoIdentity(holder) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serial = crypto.randomBytes(12); serial[0] &= 0x7f;
  const subj = name(`${holder} (DEMO - not a real DSC)`, 'Mitakshara demo certificate');
  const from = new Date(); const to = new Date(from.getTime() + 2 * 365 * 86400000);
  const keyUsage = seq(oid(OID.keyUsage), tlv(0x01, Buffer.from([0xff])), octet(tlv(0x03, Buffer.from([0x06, 0xc0]))));
  const tbs = seq(ctx(0, int(2)), int(serial), algo(OID.sha256rsa), subj, seq(utc(from), utc(to)), subj, publicKey.export({ type: 'spki', format: 'der' }), ctx(3, seq(keyUsage)));
  const cert = seq(tbs, algo(OID.sha256rsa), bits(crypto.sign('sha256', tbs, privateKey)));
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert: cert.toString('base64'), holder, serial: serial.toString('hex'), validTo: to.toISOString(), created: from.toISOString() };
}
/* read issuer + serial out of a DER certificate (needed for the signer info) */
function readTLV(b, i) { const tag = b[i]; let l = b[i + 1], h = 2; if (l & 0x80) { const n = l & 0x7f; l = 0; for (let k = 0; k < n; k++) l = l * 256 + b[i + 2 + k]; h = 2 + n; } return { tag, start: i, hdr: h, len: l, end: i + h + l, body: b.subarray(i + h, i + h + l), raw: b.subarray(i, i + h + l) }; }
function certParts(der) {
  const c = readTLV(der, 0); const tbs = readTLV(c.body, 0); let p = 0; const items = [];
  while (p < tbs.body.length) { const t = readTLV(tbs.body, p); items.push(t); p = t.end; }
  const off = items[0].tag === 0xa0 ? 1 : 0;
  return { serial: items[off].raw, issuer: items[off + 2].raw };
}

/* ---------- CMS SignedData (detached) ---------- */
function cms(dataHash, certDer, signFn, when = new Date()) {
  const { serial, issuer } = certParts(certDer);
  const attrs = [seq(oid(OID.contentType), set(oid(OID.data))), seq(oid(OID.signingTime), set(utc(when))), seq(oid(OID.messageDigest), set(octet(dataHash)))];
  const signedAttrsSet = setSorted(attrs);
  const sig = signFn(signedAttrsSet);
  const signerInfo = seq(int(1), seq(issuer, serial), algo(OID.sha256), Buffer.concat([Buffer.from([0xa0]), signedAttrsSet.subarray(1)]), algo(OID.rsa), octet(sig));
  const sd = seq(int(1), set(algo(OID.sha256)), seq(oid(OID.data)), ctx(0, certDer), set(signerInfo));
  return seq(oid(OID.signedData), ctx(0, sd));
}

/* ---------- PDF incremental update ---------- */
const pdfStr = s => '(' + String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '?') + ')';
function pdfDate(d) { const p = x => String(x).padStart(2, '0'); const tz = -d.getTimezoneOffset(); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${tz >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(tz) / 60))}'${p(Math.abs(tz) % 60)}'`; }
function dictEnd(s, i) { let depth = 0; for (let k = i; k < s.length; k++) { if (s[k] === '<' && s[k + 1] === '<') { depth++; k++; } else if (s[k] === '>' && s[k + 1] === '>') { depth--; k++; if (!depth) return k + 1; } else if (s[k] === '(') { let d = 1; k++; while (k < s.length && d) { if (s[k] === '\\') k++; else if (s[k] === '(') d++; else if (s[k] === ')') d--; k++; } k--; } } return -1; }
function parsePdf(buf) {
  const s = buf.toString('latin1');
  const sx = s.lastIndexOf('startxref'); if (sx < 0) throw new Error('This PDF looks damaged.');
  const lastXref = parseInt(s.slice(sx + 9).trim(), 10);
  if (s.slice(lastXref, lastXref + 4) !== 'xref') throw new Error('UNSUPPORTED');
  const offsets = {}; let trailer = null; let x = lastXref; const seen = new Set();
  while (x != null && !seen.has(x)) {
    seen.add(x); if (s.slice(x, x + 4) !== 'xref') throw new Error('UNSUPPORTED');
    let p = x + 4; const tpos = s.indexOf('trailer', p); const table = s.slice(p, tpos).trim().split(/\r\n|\r|\n/); let start = 0, i = 0;
    while (i < table.length) { const hdr = table[i].trim().split(/\s+/); if (hdr.length === 2) { start = +hdr[0]; const cnt = +hdr[1]; for (let k = 0; k < cnt; k++) { const e = table[i + 1 + k].trim().split(/\s+/); const n = start + k; if (e[2] === 'n' && offsets[n] == null) offsets[n] = { off: +e[0], gen: +e[1] }; } i += 1 + cnt; } else i++; }
    const td0 = s.indexOf('<<', tpos); const td = s.slice(td0, dictEnd(s, td0));
    if (!trailer) trailer = td;
    const prev = /\/Prev\s+(\d+)/.exec(td); x = prev ? +prev[1] : null;
  }
  if (/\/Encrypt\b/.test(trailer)) throw new Error('This PDF is password-protected and cannot be signed.');
  const ref = (d, key) => { const m = new RegExp('/' + key + '\\s+(\\d+)\\s+(\\d+)\\s+R').exec(d); return m ? { n: +m[1], g: +m[2] } : null; };
  const obj = n => { const o = offsets[n]; if (!o) throw new Error('Missing object ' + n); const h = new RegExp(`^\\s*${n}\\s+${o.gen}\\s+obj`).exec(s.slice(o.off, o.off + 40)); if (!h) throw new Error('UNSUPPORTED'); const d0 = s.indexOf('<<', o.off); return { n, gen: o.gen, dict: s.slice(d0, dictEnd(s, d0)) }; };
  return { s, lastXref, trailer, size: +(/\/Size\s+(\d+)/.exec(trailer) || [])[1], root: ref(trailer, 'Root'), info: ref(trailer, 'Info'), obj, ref };
}
function addKey(dict, text) { return dict.replace(/>>\s*$/, ` ${text} >>`); }
function signPdf(buf, { certDer, signFn, signer, reason, location, when = new Date() }) {
  const P = parsePdf(buf); let next = P.size;
  const catalog = P.obj(P.root.n);
  // find pages (last page gets the visible stamp)
  const pages = []; const walk = (n, inh) => { const o = P.obj(n); const mb = /\/MediaBox\s*\[([^\]]+)\]/.exec(o.dict); const box = mb ? mb[1].trim().split(/\s+/).map(Number) : inh;
    if (/\/Type\s*\/Pages\b/.test(o.dict)) { const kids = /\/Kids\s*\[([^\]]*)\]/.exec(o.dict)[1].match(/(\d+)\s+\d+\s+R/g) || []; kids.forEach(k => walk(+k.split(/\s+/)[0], box)); } else pages.push({ o, box: box || [0, 0, 595, 842] }); };
  walk(P.ref(catalog.dict, 'Pages').n, null);
  const last = pages[pages.length - 1]; const [, , W] = last.box;
  const sigN = next++, apN = next++, fontN = next++, widN = next++;
  const already = (P.s.match(/\/FT\s*\/Sig\b/g) || []).length; // stack stamps of earlier signatures
  const rect = [W - 260, 28 + 64 * already, W - 28, 86 + 64 * already].map(v => Math.round(v));
  const fmt = d => d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const lines = [`Digitally signed by ${signer}`, `Date: ${fmt(when)}`, reason ? `Reason: ${reason}` : '', location ? `Location: ${location}` : ''].filter(Boolean);
  const stream = `q 0.95 0.93 0.88 rg 0 0 ${rect[2] - rect[0]} ${rect[3] - rect[1]} re f 0.69 0.55 0.34 RG 1 w 0.5 0.5 ${rect[2] - rect[0] - 1} ${rect[3] - rect[1] - 1} re S Q BT /F1 7.5 Tf 0.1 0.1 0.1 rg 6 ${rect[3] - rect[1] - 12} Td 9.5 TL ${lines.map(l => pdfStr(l.slice(0, 60)) + " '").join(' ')} ET`;
  const SIGLEN = 16384; // bytes reserved for the signature
  const objs = [];
  objs.push([sigN, 0, `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 0000000000 0000000000 0000000000] /Contents <${'0'.repeat(SIGLEN * 2)}> /M ${pdfStr(pdfDate(when))} /Name ${pdfStr(signer)}${reason ? ' /Reason ' + pdfStr(reason) : ''}${location ? ' /Location ' + pdfStr(location) : ''} >>`]);
  objs.push([apN, 0, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${rect[2] - rect[0]} ${rect[3] - rect[1]}] /Resources << /Font << /F1 ${fontN} 0 R >> >> /Length ${stream.length} >>\nstream\n${stream}\nendstream`]);
  objs.push([fontN, 0, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
  objs.push([widN, 0, `<< /Type /Annot /Subtype /Widget /FT /Sig /T ${pdfStr('Signature' + sigN)} /V ${sigN} 0 R /F 132 /Rect [${rect.join(' ')}] /P ${last.o.n} ${last.o.gen} R /AP << /N ${apN} 0 R >> >>`]);
  // page: add the widget to /Annots
  let pd = last.o.dict; const ann = /\/Annots\s*\[([^\]]*)\]/.exec(pd);
  if (ann) pd = pd.replace(ann[0], `/Annots [${ann[1]} ${widN} 0 R]`);
  else if (/\/Annots\s+\d+\s+\d+\s+R/.test(pd)) throw new Error('UNSUPPORTED');
  else pd = addKey(pd, `/Annots [${widN} 0 R]`);
  objs.push([last.o.n, last.o.gen, pd]);
  // catalog: AcroForm with the new field
  let cd = catalog.dict; const af = /\/AcroForm\s*<</.exec(cd);
  if (af) { const a0 = cd.indexOf('<<', af.index); const a1 = dictEnd(cd, a0); let ad = cd.slice(a0, a1); ad = /\/Fields\s*\[/.test(ad) ? ad.replace(/\/Fields\s*\[/, `/Fields [${widN} 0 R `) : addKey(ad, `/Fields [${widN} 0 R]`); ad = /\/SigFlags/.test(ad) ? ad.replace(/\/SigFlags\s+\d+/, '/SigFlags 3') : addKey(ad, '/SigFlags 3'); cd = cd.slice(0, a0) + ad + cd.slice(a1); }
  else if (/\/AcroForm\s+\d+\s+\d+\s+R/.test(cd)) { const r = P.ref(cd, 'AcroForm'); const ao = P.obj(r.n); let ad = ao.dict; ad = /\/Fields\s*\[/.test(ad) ? ad.replace(/\/Fields\s*\[/, `/Fields [${widN} 0 R `) : addKey(ad, `/Fields [${widN} 0 R]`); ad = /\/SigFlags/.test(ad) ? ad.replace(/\/SigFlags\s+\d+/, '/SigFlags 3') : addKey(ad, '/SigFlags 3'); objs.push([ao.n, ao.gen, ad]); }
  else cd = addKey(cd, `/AcroForm << /Fields [${widN} 0 R] /SigFlags 3 >>`);
  objs.push([catalog.n, catalog.gen, cd]);
  // write the update
  let out = P.s.endsWith('\n') ? '' : '\n'; const base = buf.length + out.length; const offs = [];
  for (const [n, g, body] of objs) { offs.push([n, g, base + Buffer.byteLength(out, 'latin1')]); out += `${n} ${g} obj\n${body}\nendobj\n`; }
  const xrefAt = base + Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 1\n0000000000 65535 f \n' + offs.sort((a, b) => a[0] - b[0]).map(([n, g, o]) => `${n} 1\n${String(o).padStart(10, '0')} ${String(g).padStart(5, '0')} n \n`).join('');
  out += `trailer\n<< /Size ${next} /Root ${P.root.n} ${P.root.g} R${P.info ? ` /Info ${P.info.n} ${P.info.g} R` : ''} /Prev ${P.lastXref} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  let pdf = Buffer.concat([buf, Buffer.from(P.s.endsWith('\n') ? '' : '\n', 'latin1'), Buffer.from(out.startsWith('\n') ? out.slice(1) : out, 'latin1')]);
  // byte range around the /Contents placeholder
  const ps = pdf.toString('latin1'); const cStart = ps.indexOf('/Contents <', ps.lastIndexOf(`${sigN} 0 obj`)) + 10; const cEnd = cStart + SIGLEN * 2 + 2;
  const br = [0, cStart, cEnd, pdf.length - cEnd]; const brText = `[${br.map((v, i) => i === 0 ? '0' : String(v).padStart(10, '0')).join(' ')}]`;
  const brPos = ps.indexOf('/ByteRange [0 0000000000 0000000000 0000000000]', ps.lastIndexOf(`${sigN} 0 obj`)) + 11;
  pdf.write(brText.padEnd(36, ' '), brPos, 'latin1');
  const hash = crypto.createHash('sha256').update(pdf.subarray(0, cStart)).update(pdf.subarray(cEnd)).digest();
  const der = cms(hash, certDer, signFn, when);
  if (der.length > SIGLEN) throw new Error('Signature too large');
  pdf.write(der.toString('hex').padEnd(SIGLEN * 2, '0'), cStart + 1, 'latin1');
  return pdf;
}

/* ---------- token brands (PKCS#11 drivers) ---------- */
const TOKENS = [
  { id: 'demo', name: 'Demo certificate (practice, made on this computer)', files: [] },
  { id: 'proxkey', name: 'ProxKey (Watchdata)', files: { win32: ['C:\\Windows\\System32\\wdpkcs.dll', 'C:\\Windows\\System32\\SignatureP11.dll'], darwin: ['/usr/local/lib/libwdpkcs.dylib', '/Library/Watchdata/ProxKey/libwdpkcs.dylib'] } },
  { id: 'epass', name: 'ePass 2003 (Longmai / HyperSecu)', files: { win32: ['C:\\Windows\\System32\\eps2003csp11.dll'], darwin: ['/usr/local/lib/libcastle.1.0.0.dylib'] } },
  { id: 'mtoken', name: 'mToken CryptoID (Longmai)', files: { win32: ['C:\\Windows\\System32\\CryptoIDA_pkcs11.dll'], darwin: ['/usr/local/lib/libcryptoid_pkcs11.dylib'] } },
  { id: 'safenet', name: 'SafeNet eToken (Thales)', files: { win32: ['C:\\Windows\\System32\\eTPKCS11.dll'], darwin: ['/usr/local/lib/libeTPkcs11.dylib'] } },
  { id: 'hyperpki', name: 'HyperPKI / other (choose driver file)', files: { win32: [], darwin: [] } },
];

module.exports = function (c) {
  const data = () => c.vault().data;
  const settings = () => data().dsc_settings || { provider: 'demo' };
  return {
    async dscInfo() {
      c.needOpen(); const st = settings(); const demo = data().dsc_demo;
      const tokens = TOKENS.map(t => { const list = t.id === st.provider && st.driver ? [st.driver] : (t.files[process.platform] || []); const found = list.find(f => { try { return fs.existsSync(f); } catch { return false; } }); return { id: t.id, name: t.name, driverFound: found || '', candidates: list }; });
      return { provider: st.provider, driver: st.driver || '', tokens, demo: demo ? { holder: demo.holder, validTo: demo.validTo, serial: demo.serial, created: demo.created } : null };
    },
    async dscSetProvider({ provider, driver }) { c.needOpen(); if (!TOKENS.some(t => t.id === provider)) throw new Error('Unknown token'); data().dsc_settings = { provider, driver: driver || '' }; c.vault().save(); return true; },
    async dscChooseDriver() { c.needOpen(); const { dialog } = require('electron'); const r = await dialog.showOpenDialog(c.win(), { title: 'Choose the PKCS#11 driver of your token', properties: ['openFile'], filters: [{ name: 'Driver', extensions: process.platform === 'win32' ? ['dll'] : ['dylib', 'so'] }] }); return r.canceled ? '' : r.filePaths[0]; },
    async dscMakeDemo({ holder }) { c.needOpen(); data().dsc_demo = makeDemoIdentity(String(holder || 'Advocate').slice(0, 80)); c.vault().save(); return true; },
    async dscSign({ fid, filename, reason, location }) {
      c.needOpen(); const st = settings();
      if (st.provider !== 'demo') throw new Error('Signing with the USB token will be switched on after a test with the real token. For now choose "Demo certificate" in Settings > Digital signature.');
      const demo = data().dsc_demo; if (!demo) throw new Error('Make the demo certificate first (Settings > Digital signature).');
      const key = crypto.createPrivateKey(demo.key);
      let out;
      try { out = signPdf(c.readStored(fid), { certDer: Buffer.from(demo.cert, 'base64'), signFn: d => crypto.sign('sha256', d, key), signer: demo.holder, reason: String(reason || '').slice(0, 120), location: String(location || '').slice(0, 80) }); }
      catch (e) { if (e.message === 'UNSUPPORTED') throw new Error('This PDF was made by another program in a newer internal format. Demo signing works on PDFs made in Mitakshara (bills, drafts) and most scanned PDFs. The token version will sign all PDFs.'); throw e; }
      const base = String(filename || 'document.pdf').replace(/\.pdf$/i, '');
      return c.storeBuffer(out, `${base} (signed).pdf`);
    },
  };
};
module.exports.signPdf = signPdf; module.exports.makeDemoIdentity = makeDemoIdentity;
