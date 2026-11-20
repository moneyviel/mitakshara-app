'use strict';
/* eCourts case data by CNR through the eCourtsIndia API (the lawyer's own key, kept encrypted).
   One fetch = one "refresh" (asks eCourtsIndia to re-read eCourts now) + one "case detail" read.
   Field names are read defensively because High Court / District Court records differ a little. */
const BASE = 'https://webapi.ecourtsindia.com';
const STATES = { AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CG: 'Chhattisgarh', CT: 'Chhattisgarh', DN: 'Dadra and Nagar Haveli and Daman and Diu', DD: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu and Kashmir', JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya', MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', OD: 'Odisha', PY: 'Puducherry', PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu', TS: 'Telangana', TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', UT: 'Uttarakhand', WB: 'West Bengal' };
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const str = v => v == null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : isObj(v) ? str(v.name || v.partyName || v.advocateName || v.judgeName || v.value || '') : '';
const isoDate = v => { const s = str(v); if (!s) return ''; let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
// first value found for any of the keys, searching the case object then the whole reply (depth-limited)
function pick(objs, keys) {
  for (const o of objs) { if (!isObj(o)) continue; for (const k of keys) { const hit = Object.keys(o).find(x => x.toLowerCase() === k.toLowerCase()); if (hit != null && o[hit] != null && o[hit] !== '' && !(Array.isArray(o[hit]) && !o[hit].length)) return o[hit]; } }
  return undefined;
}
function deep(obj, re, depth = 0, out = []) { if (!obj || depth > 4) return out; if (Array.isArray(obj)) { obj.forEach(x => deep(x, re, depth + 1, out)); return out; } if (isObj(obj)) for (const [k, v] of Object.entries(obj)) { if (re.test(k)) out.push(v); else deep(v, re, depth + 1, out); } return out; }
const names = v => (Array.isArray(v) ? v : v ? [v] : []).map(str).map(s => s.replace(/^\d+\)\s*/, '')).filter(Boolean);
function normalise(raw, cnr) {
  const data = raw && (raw.data || raw.result || raw);
  const c = (data && (data.courtCaseData || data.caseData || data.case)) || data || {};
  const ent = (data && data.entityInfo) || {};
  const O = [c, data, ent];
  const reg = str(pick(O, ['registrationNumber', 'regNo', 'caseNo'])); const [rno, ryear] = reg.includes('/') ? reg.split('/') : [reg, ''];
  const pet = names(pick(O, ['petitioners', 'petitionerNames', 'petitioner', 'petitionerName', 'plaintiffs'])) ; const res = names(pick(O, ['respondents', 'respondentNames', 'respondent', 'respondentName', 'defendants']));
  const petAdv = names(pick(O, ['petitionerAdvocates', 'petitionerAdvocate', 'petitionerAdvocateNames'])); const resAdv = names(pick(O, ['respondentAdvocates', 'respondentAdvocate', 'respondentAdvocateNames']));
  const judges = names(pick(O, ['judges', 'judge', 'coram', 'judgeName']));
  const st = str(pick(O, ['state', 'stateName'])); const stateName = STATES[st.toUpperCase()] || st;
  const histRaw = pick(O, ['historyOfCaseHearings', 'caseHistory', 'hearings']) || [];
  const history = (Array.isArray(histRaw) ? histRaw : []).map(h => ({ date: isoDate(h.hearingDate || h.businessOnDate || h.date || h.businessDate), purpose: str(h.purposeOfListing || h.purpose || h.nextPurpose), judge: str(h.judge || h.courtOf), business: str(h.business || h.businessOnDateText || h.remarks), next: isoDate(h.nextHearingDate || h.nextDate) })).filter(h => h.date);
  const ordersRaw = [...(pick(O, ['interimOrders']) || []), ...(pick(O, ['judgmentOrders', 'judgments', 'finalOrders']) || []), ...((pick(O, ['orders']) || []))];
  const orders = ordersRaw.map(o => ({ date: isoDate(o.orderDate || o.date || o.judgmentDate), url: str(o.orderUrl || o.url || o.pdfUrl || o.link), kind: /judg|final/i.test(JSON.stringify(Object.keys(o)) + str(o.type)) ? 'Judgment / final order' : 'Order', no: str(o.orderNumber || o.orderNo || '') })).filter(o => o.url || o.date);
  const fir = isObj(pick(O, ['firDetails'])) ? pick(O, ['firDetails']) : {};
  const acts = deep(c, /^(acts?|actsAndSections|underActs|sections?)$/i).map(v => Array.isArray(v) ? v.map(x => isObj(x) ? [str(x.act || x.actName), str(x.section || x.sections)].filter(Boolean).join(' s. ') : str(x)).join('; ') : str(v)).filter(Boolean).join('; ');
  return {
    cnr: str(pick(O, ['cnr', 'cnrNumber'])) || cnr,
    court_name: [str(pick(O, ['courtName', 'court', 'establishmentName'])), str(pick(O, ['courtNo', 'courtNumber'])) && !/^\d{3,}$/.test(str(pick(O, ['courtNo']))) ? 'Court No. ' + str(pick(O, ['courtNo'])) : ''].filter(Boolean).join(', '),
    district: str(pick(O, ['district', 'districtName'])), state: stateName,
    case_type: str(pick(O, ['caseTypeRaw', 'caseTypeName', 'caseType', 'caseTypeSub'])),
    case_no: (rno || '').trim(), case_year: (ryear || str(pick(O, ['registrationYear', 'cnrYear', 'filingYear']))).trim(),
    filing_no: str(pick(O, ['filingNumber'])), filing_date: isoDate(pick(O, ['filingDate'])), registration_date: isoDate(pick(O, ['registrationDate'])),
    first_hearing: isoDate(pick(O, ['firstHearingDate'])), next_hearing: isoDate(pick(O, ['nextHearingDate', 'nextDateOfHearing', 'nextDate'])),
    decision_date: isoDate(pick(O, ['decisionDate', 'disposalDate'])), status: str(pick(O, ['caseStatus', 'status'])), stage: str(pick(O, ['caseStage', 'stageOfCase', 'stage'])) || (history.length ? history[history.length - 1].purpose : ''),
    nature_of_disposal: str(pick(O, ['natureOfDisposal', 'disposalNature'])),
    judges, petitioners: pet, respondents: res, pet_advocates: petAdv, res_advocates: resAdv,
    fir: { number: str(fir.firNumber || fir.firNo), police_station: str(fir.policeStation), year: str(fir.firYear || fir.year) }, acts,
    history: history.sort((a, b) => a.date.localeCompare(b.date)), orders: orders.sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    source_modified: str(pick(O, ['dateModified', 'lastUpdated', 'updatedAt'])),
  };
}
module.exports = function (c) {
  const base = () => (c.DEV && process.env.MITAKSHARA_EC_URL) || BASE;
  const token = () => ((c.vault().data.research_sources || []).find(s => s.id === 'ecourtsindia') || {}).token || '';
  async function api(path, method = 'GET') {
    const t = token(); if (!t) throw new Error('NO_KEY');
    let r; try { r = await fetch(base() + path, { method, headers: { authorization: 'Bearer ' + t, accept: 'application/json' }, signal: AbortSignal.timeout(45000) }); }
    catch { throw new Error('Could not reach eCourtsIndia. Please check the internet connection.'); }
    if (r.status === 401 || r.status === 403) throw new Error('eCourtsIndia did not accept your API key. Check it in Law Library > Sources.');
    if (r.status === 402) throw new Error('Your eCourtsIndia account has no credits left. Please recharge it on ecourtsindia.com.');
    if (r.status === 404) throw new Error('No case was found for this CNR. Please check the number.');
    if (r.status === 429) throw new Error('Too many requests to eCourtsIndia just now. Please try again in a minute.');
    if (!r.ok) throw new Error('eCourtsIndia answered with an error (' + r.status + '). Please try again later.');
    return r.json().catch(() => ({}));
  }
  return {
    async ecInfo() { c.needOpen(); return { hasKey: !!token() }; },
    async ecFetch({ cnr }) {
      c.needOpen(); cnr = String(cnr || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!/^[A-Z]{4}\d{12}$/.test(cnr)) throw new Error('A CNR has 16 characters: 4 letters and 12 digits, e.g. RJJP010012342026.');
      if (!token()) throw new Error('NO_KEY');
      const asked = new Date().toISOString();
      try { await api(`/api/partner/case/${cnr}/refresh`, 'POST'); } catch (e) { if (/No case was found/.test(e.message)) throw e; /* refresh is a bonus; still read what is there */ }
      await new Promise(r => setTimeout(r, (c.DEV && process.env.MITAKSHARA_EC_WAIT) ? +process.env.MITAKSHARA_EC_WAIT : 12000)); // eCourtsIndia re-reads eCourts in about 5-10 seconds
      const raw = await api(`/api/partner/case/${cnr}`);
      const n = normalise(raw, cnr);
      if (!n.court_name && !n.petitioners.length && !n.history.length) throw new Error('eCourtsIndia sent no case details for this CNR yet. Please try again in a few minutes.');
      return { ...n, fetched_at: asked };
    },
    async ecOrder({ url, filename }) {
      c.needOpen(); let u; try { u = new URL(url); } catch { throw new Error('Bad order link'); }
      const devOk = c.DEV && u.origin === 'http://127.0.0.1:8788';
      if (!(u.protocol === 'https:' && /(^|\.)ecourtsindia\.com$|(^|\.)ecourts\.gov\.in$/.test(u.hostname)) && !devOk) throw new Error('Order link is not from eCourts.');
      const headers = /(^|\.)ecourtsindia\.com$/.test(u.hostname) || devOk ? { authorization: 'Bearer ' + token() } : {};
      let r; try { r = await fetch(u.href, { headers, signal: AbortSignal.timeout(90000) }); } catch { throw new Error('Could not download the order.'); }
      if (!r.ok) throw new Error('Could not download the order (' + r.status + ').');
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 60 * 1024 * 1024) throw new Error('Order file too large.');
      if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('The order link did not give a PDF.');
      return c.storeBuffer(buf, String(filename || 'Order').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) + '.pdf');
    },
  };
};
module.exports.normalise = normalise;
