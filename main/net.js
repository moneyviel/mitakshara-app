'use strict';
/* Online features (all optional, all from this main process, https only):
   research search (Indian Kanoon API with the lawyer's own token; other sites open in the browser)
   and the Law Library watcher (official gazette pages; downloads only what the user chooses). */
const shell = { openExternal: u => require('electron').shell.openExternal(u) };
const crypto = require('crypto');
const UA = 'Mitakshara/1.0 (law practice desktop app)';
const okUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' || (process.env.MITAKSHARA_DEV === '1' && x.origin === 'http://127.0.0.1:8788'); } catch { return false; } };
async function get(url, opts = {}) {
  if (!okUrl(url)) throw new Error('Only secure (https) addresses are allowed.');
  const r = await fetch(url, { ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 30000), redirect: 'follow' });
  return r;
}
const decode = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const idOf = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

/* --- parsers --- */
function parseRss(xml, base) {
  const items = [];
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const it = m[0]; const t = (/<title[^>]*>([\s\S]*?)<\/title>/.exec(it) || [])[1] || '';
    let link = (/<link[^>]*>([\s\S]*?)<\/link>/.exec(it) || [])[1] || (/<link[^>]*href="([^"]+)"/.exec(it) || [])[1] || '';
    const d = (/<(pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/\1>/.exec(it) || [])[2] || '';
    link = decode(link.replace(/<!\[CDATA\[|\]\]>/g, '')); try { link = new URL(link, base).href; } catch {}
    const title = decode(t.replace(/<!\[CDATA\[|\]\]>/g, ''));
    if (title && link) items.push({ id: idOf(link), title, url: link, date: d ? new Date(d).toISOString().slice(0, 10) : '', pdf: /\.pdf(\?|$)/i.test(link) });
  }
  return items;
}
function parseEgazette(html) {
  // rows of "Recent Gazettes": Ministry | Subject | Gazette ID (CG-DL-E-ddmmyyyy-NNNNNN) | date | size
  const items = [];
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const row = m[0]; const idm = /\b(CG-[A-Z]{2}-[EW]-(\d{2})(\d{2})(\d{4})-(\d{5,7}))\b/.exec(decode(row)); if (!idm) continue;
    const cells = [...row.matchAll(/<td\b[\s\S]*?<\/td>/gi)].map(c => decode(c[0])).filter(Boolean);
    const title = cells.filter(c => !c.includes(idm[1]) && !/^\d+(\.\d+)?\s*(MB|KB)$/i.test(c) && !/^(download|view)$/i.test(c) && !/^\d{1,2}[-/]\w{2,3}[-/]\d{4}$/.test(c)).join(' · ').slice(0, 300) || idm[1];
    items.push({ id: idOf(idm[1]), title, ref: idm[1], date: `${idm[4]}-${idm[3]}-${idm[2]}`, url: `https://egazette.gov.in/WriteReadData/${idm[4]}/${idm[5]}.pdf`, pdf: true, kind: idm[1].includes('-E-') ? 'Extraordinary' : 'Weekly' });
  }
  const seen = new Set(); return items.filter(i => !seen.has(i.id) && seen.add(i.id));
}
function parseLinks(html, base) {
  const items = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(decode(m[1]), base).href; } catch { continue; }
    const title = decode(m[2]); if (!okUrl(url) || title.length < 8) continue;
    const pdf = /\.pdf(\?|$)/i.test(url);
    if (!pdf && !/(notification|gazette|act|rules|amend|ordinance|circular|judg)/i.test(title + ' ' + url)) continue;
    items.push({ id: idOf(url), title: title.slice(0, 300), url, pdf, date: '' });
  }
  const seen = new Set(); return items.filter(i => !seen.has(i.id) && seen.add(i.id)).slice(0, 200);
}

module.exports = function (c) {
  const data = () => c.vault().data;
  const token = id => ((data().research_sources || []).find(s => s.id === id) || {}).token || '';
  return {
    async openLink({ url }) { if (!okUrl(url)) throw new Error('Only secure (https) links can be opened.'); await shell.openExternal(url); return true; },
    async ikSearch({ q, page }) {
      c.needOpen(); const t = token('indiankanoon'); if (!t) throw new Error('Add your Indian Kanoon API token in Law Library > Research sources.');
      const base = (c.DEV && process.env.MITAKSHARA_IK_URL) || 'https://api.indiankanoon.org';
      let r; try { r = await get(`${base}/search/?formInput=${encodeURIComponent(String(q).slice(0, 300))}&pagenum=${+page || 0}`, { method: 'POST', headers: { authorization: 'Token ' + t, accept: 'application/json' } }); }
      catch { throw new Error('Could not reach Indian Kanoon. Please check the internet connection.'); }
      if (r.status === 401 || r.status === 403) throw new Error('Indian Kanoon did not accept the token.');
      const j = await r.json().catch(() => null); if (!j) throw new Error('Indian Kanoon sent an unexpected answer.');
      return { found: decode(j.found || ''), docs: (j.docs || []).map(d => ({ tid: d.tid, title: decode(d.title || ''), headline: decode(d.headline || ''), source: decode(d.docsource || ''), date: d.publishdate || '', url: `https://indiankanoon.org/doc/${d.tid}/` })) };
    },
    async ikDoc({ tid, title }) {
      c.needOpen(); const t = token('indiankanoon'); if (!/^\d+$/.test(String(tid))) throw new Error('Bad document');
      const base = (c.DEV && process.env.MITAKSHARA_IK_URL) || 'https://api.indiankanoon.org';
      const r = await get(`${base}/doc/${tid}/`, { method: 'POST', headers: { authorization: 'Token ' + t, accept: 'application/json' } });
      const j = await r.json().catch(() => null); if (!j || !j.doc) throw new Error('Could not open this judgment.');
      const text = String(j.doc).replace(/<\/(p|div|h\d|blockquote|pre|li)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
      const name = String(title || j.title || 'Judgment').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) + '.txt';
      return { preview: c.tempPut(Buffer.from(decode(j.title || '') + '\n' + `https://indiankanoon.org/doc/${tid}/` + '\n\n' + text, 'utf8'), name), name };
    },
    async keepTemp({ fid, filename }) { c.needOpen(); return c.storeBuffer(c.readStored(fid), filename); },
    async lawCheck({ sources }) {
      c.needOpen(); const out = [];
      for (const s of (sources || []).filter(x => x.on !== false).slice(0, 30)) {
        try {
          const r = await get(s.url, { timeout: 25000 }); if (!r.ok) throw new Error('HTTP ' + r.status);
          const txt = (await r.text()).slice(0, 5e6);
          const items = s.type === 'rss' ? parseRss(txt, s.url) : s.type === 'egazette' ? parseEgazette(txt) : parseLinks(txt, s.url);
          out.push({ source: s.id, ok: true, items: items.slice(0, 150) });
        } catch (e) { out.push({ source: s.id, ok: false, error: /abort|timeout/i.test(e.message) ? 'The site took too long to answer.' : 'Could not read the site (' + e.message + ').' }); }
      }
      return out;
    },
    async lawDownload({ url, filename }) {
      c.needOpen(); let r; try { r = await get(url, { timeout: 120000 }); } catch { throw new Error('Download failed. Please try again later.'); }
      if (!r.ok) throw new Error('The site answered: ' + r.status);
      const len = +r.headers.get('content-length') || 0; if (len > 60 * 1024 * 1024) throw new Error('This file is larger than 60 MB.');
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 60 * 1024 * 1024) throw new Error('This file is larger than 60 MB.');
      const isPdf = buf.subarray(0, 5).toString() === '%PDF-';
      const name = String(filename || 'Law update').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) + (isPdf ? '.pdf' : /\.html?$/i.test(url) ? '.txt' : '');
      return c.storeBuffer(isPdf ? buf : Buffer.from(decode(buf.toString('utf8')), 'utf8'), name.endsWith('.pdf') || name.endsWith('.txt') ? name : name + '.txt');
    },
  };
};
module.exports.parseEgazette = parseEgazette; module.exports.parseRss = parseRss; module.exports.parseLinks = parseLinks;
