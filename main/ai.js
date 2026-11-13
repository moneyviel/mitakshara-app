'use strict';
/* AI helper: summaries, order explanations, client letters in simple language, draft polishing.
   Uses the lawyer's own API key (Anthropic Claude or OpenAI), kept encrypted in the vault.
   Documents go to the chosen provider only when the user presses the button. */
const docview = require('./docview');
const PROVIDERS = {
  anthropic: { name: 'Anthropic Claude', url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-5-5' },
  openai: { name: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-5-mini' },
};
const TASKS = {
  summary: 'Summarise this document for an Indian advocate preparing the case. Use short headings: Type of document; Parties; Court and case number (if any); Key dates (as a list, dd.mm.yyyy); Sections / provisions cited; Facts in brief; Relief sought or order passed; Points in our favour; Points against us; What to do next. Quote numbers and dates exactly. If something is not in the document, say "Not stated". Do not invent facts.',
  order: 'This is a court order or judgment. Explain for the advocate: 1) What the court decided, 2) Directions and who must comply, with deadlines, 3) Next date and purpose, 4) Any costs or conditions, 5) Whether an appeal / revision may be considered and the usual limitation to check (say that it must be verified). Be exact; do not invent anything not in the order.',
  client: 'Explain this document to the client (a non-lawyer) in simple, polite language, in LANG. Short sentences. Say what it means for them and what they need to do or bring. End with: "Please call the office if you have any questions." Do not give guarantees about the outcome.',
  dates: 'List every date, deadline, amount and section number mentioned in this document as a table: Item | Value | Where it appears. Do not invent anything.',
  polish: 'Improve the language of this legal draft for an Indian court: correct grammar, formal tone, clear numbered paragraphs. Keep every fact, name, number, date and section exactly as given. Do not add new facts. Return only the improved draft.',
  ask: 'Answer the question below using only this document. If the document does not answer it, say so.\nQuestion: QUESTION',
};
module.exports = function (c) {
  const cfg = () => c.vault().data.ai_settings || {};
  async function run({ task, fid, filename, text, lang, question }) {
    c.needOpen(); const s = cfg();
    if (!s.key) throw new Error('Add your AI key in Settings > AI assistant first.');
    if (!s.consent) throw new Error('Please confirm in Settings > AI assistant that documents may be sent to the AI service.');
    const P = PROVIDERS[s.provider] || PROVIDERS.anthropic;
    let instr = (TASKS[task] || TASKS.summary).replace('LANG', lang || 'English').replace('QUESTION', String(question || '').slice(0, 2000));
    let content = text ? String(text) : null; let pdf = null;
    if (!content && fid) {
      const buf = c.readStored(fid); if (buf.length > 20 * 1024 * 1024) throw new Error('This file is larger than 20 MB, too large for the AI helper.');
      if (docview.kindOf(filename) === 'pdf') pdf = buf;
      else { content = docview.textOf(filename, buf); if (content == null) throw new Error('The AI helper reads PDF, Word, Excel and text files.'); }
    }
    if (content && content.length > 400000) content = content.slice(0, 400000) + '\n[shortened]';
    const url = (c.DEV && process.env.MITAKSHARA_AI_URL) || P.url; const model = s.model || P.model;
    let body, headers;
    if ((s.provider || 'anthropic') === 'anthropic') {
      const parts = []; if (pdf) parts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } });
      if (content) parts.push({ type: 'text', text: '<document>\n' + content + '\n</document>' }); parts.push({ type: 'text', text: instr });
      body = { model, max_tokens: 4000, system: 'You are a careful assistant to an Indian advocate. Be accurate and concise. Never invent facts, citations or dates.', messages: [{ role: 'user', content: parts }] };
      headers = { 'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01' };
    } else {
      if (pdf) throw new Error('With OpenAI, the helper reads Word, Excel and text files. Choose Anthropic Claude in Settings to read PDFs.');
      body = { model, messages: [{ role: 'system', content: 'You are a careful assistant to an Indian advocate. Be accurate and concise. Never invent facts, citations or dates.' }, { role: 'user', content: '<document>\n' + content + '\n</document>\n\n' + instr }] };
      headers = { 'content-type': 'application/json', authorization: 'Bearer ' + s.key };
    }
    let r;
    try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) }); }
    catch { throw new Error('Could not reach the AI service. Please check the internet connection.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 401 ? 'The AI key was not accepted. Please check it in Settings.' : 'AI service error: ' + (j.error?.message || r.status));
    const out = j.content ? j.content.filter(b => b.type === 'text').map(b => b.text).join('\n') : j.choices?.[0]?.message?.content;
    if (!out) throw new Error('The AI service sent an empty answer.');
    return { text: out.trim(), provider: P.name, model };
  }
  return {
    async aiRun(a) { return run(a); },
    async aiGet() { c.needOpen(); const s = cfg(); return { provider: s.provider || 'anthropic', model: s.model || '', consent: !!s.consent, hasKey: !!s.key, keyHint: s.key ? '...' + s.key.slice(-4) : '', providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, model: p.model })) }; },
    async aiSet({ provider, model, key, consent, clearKey }) { c.needOpen(); const s = { ...cfg() }; if (provider && PROVIDERS[provider]) s.provider = provider; if (model !== undefined) s.model = String(model).slice(0, 80); if (key) s.key = String(key).trim(); if (clearKey) delete s.key; if (consent !== undefined) s.consent = !!consent; c.vault().data.ai_settings = s; c.vault().save(); return true; },
  };
};
