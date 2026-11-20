'use strict';
/* Stage 4: practice details, invoices in any GST form, receipts, expenses, client money (BCI) and reports. */

const money = n => '₹ ' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = n => Math.round((+n || 0) * 100) / 100;
const fyOf = iso => { const d = new Date((iso || todayISO()) + 'T00:00:00'); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String(y + 1).slice(2)}`; };
const fyRange = fy => { const y = +fy.slice(0, 4); return [`${y}-04-01`, `${y + 1}-03-31`]; };
const inFY = (iso, fy) => { if (!fy) return true; const [a, b] = fyRange(fy); return iso >= a && iso <= b; };
function inWords(num) {
  num = Math.round(+num || 0); if (!num) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = n => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = n => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  const parts = []; const cr = Math.floor(num / 1e7); num %= 1e7; const lk = Math.floor(num / 1e5); num %= 1e5; const th = Math.floor(num / 1000); num %= 1000;
  if (cr) parts.push(three(cr) + ' Crore'); if (lk) parts.push(two(lk) + ' Lakh'); if (th) parts.push(two(th) + ' Thousand'); if (num) parts.push(three(num));
  return parts.join(' ');
}
const GST_MODES = {
  exempt: { label: 'Exempt (client is not a business)', doc: 'Bill of Supply', note: 'Legal services by an advocate to a person other than a business entity are exempt from GST (Notification No. 12/2017-Central Tax (Rate), Sl. No. 45).' },
  rcm: { label: 'Reverse charge (client is a business)', doc: 'Invoice', note: 'GST on these legal services is payable by the recipient under reverse charge (Notification No. 13/2017-Central Tax (Rate), Sl. No. 2). Tax payable on reverse charge: Yes.' },
  forward: { label: 'GST charged on this bill (18%)', doc: 'Tax Invoice', note: '' },
  none: { label: 'No GST statement (fee bill / memo)', doc: 'Fee Bill', note: '' },
};
const BILL_STYLES = ['Classic', 'Modern', 'Minimal', 'Tabular (GST table)'];
const DOC_TYPES = ['Tax Invoice', 'Invoice', 'Bill of Supply', 'Fee Bill', 'Proforma Invoice', 'Receipt'];
const SAC = [['998212', 'Legal advisory and representation (other areas of law)'], ['998211', 'Legal advisory and representation (criminal law)'], ['998213', 'Legal documentation and certification'], ['998214', 'Arbitration and mediation'], ['998215', 'Other legal services']];
const LINE_SUGGEST = ['Professional fee', 'Appearance fee', 'Drafting fee', 'Consultation fee', 'Conference fee', 'Retainer fee', 'Clerkage', 'Court fee (reimbursement)', 'Stamp paper (reimbursement)', 'Photocopy / typing (reimbursement)', 'Travel (reimbursement)', 'Certified copy charges (reimbursement)'];
const EXP_CATS = ['Court fee', 'Stamp paper', 'Typing / photocopy', 'Travel', 'Clerkage', 'Certified copies', 'Postage / courier', 'Office rent', 'Salaries', 'Electricity / internet', 'Books / subscriptions', 'Bar association fee', 'Other'];
const PAY_MODES = ['UPI', 'NEFT / RTGS / IMPS', 'Cheque', 'Cash', 'Card', 'Other'];
D.practice = D.practice || {};
const _loadD4 = loadD;
loadD = async function (force) {
  const first = !D.loaded || force; await _loadD4(force);
  if (first) for (const k of ['invoices', 'payments', 'expenses', 'client_money']) D[k] = (await call('getData', { key: k })) || [];
  if (first) D.practice = (await call('getData', { key: 'practice' })) || {};
};
window.mk.onLocked(() => { D.invoices = []; D.payments = []; D.expenses = []; D.client_money = []; D.practice = {}; });

/* ---------- invoice maths ---------- */
function invCalc(inv) {
  const P = D.practice; const fees = r2((inv.lines || []).filter(l => l.kind !== 'reimb').reduce((s, l) => s + (+l.amount || 0), 0));
  const reimb = r2((inv.lines || []).filter(l => l.kind === 'reimb').reduce((s, l) => s + (+l.amount || 0), 0));
  const intra = !!P.state && (inv.place_state || P.state) === P.state;
  let cgst = 0, sgst = 0, igst = 0;
  if (inv.gst_mode === 'forward' || inv.gst_mode === 'rcm') { if (intra) { cgst = r2(fees * 0.09); sgst = r2(fees * 0.09); } else igst = r2(fees * 0.18); }
  const taxCharged = inv.gst_mode === 'forward' ? r2(cgst + sgst + igst) : 0;
  const total = r2(fees + reimb + taxCharged);
  const paid = r2(D.payments.filter(p => p.invoice_id === inv.id).reduce((s, p) => s + (+p.amount || 0), 0));
  const tds = r2(D.payments.filter(p => p.invoice_id === inv.id).reduce((s, p) => s + (+p.tds || 0), 0));
  const due = inv.doc_type === 'Proforma Invoice' || inv.status === 'Cancelled' ? 0 : r2(total - paid - tds);
  const status = inv.status === 'Cancelled' ? 'Cancelled' : inv.doc_type === 'Proforma Invoice' ? 'Proforma' : due <= 0.5 ? 'Paid' : paid + tds > 0 ? 'Part paid' : (inv.due_date && inv.due_date < todayISO()) ? 'Overdue' : 'Unpaid';
  return { fees, reimb, cgst, sgst, igst, intra, taxCharged, total, paid, tds, due: Math.max(0, due), status };
}
function nextInvNo(docType, date) {
  const fy = fyOf(date); const pro = docType === 'Proforma Invoice'; const rec = docType === 'Receipt';
  const pre = pro ? 'PF' : rec ? 'RC' : (D.practice.inv_prefix || 'INV'); const k = `inv_${pre}_${fy}`;
  D.counters[k] = (D.counters[k] || 0) + 1; return `${pre}/${fy}/${String(D.counters[k]).padStart(4, '0')}`;
}
const suggestMode = c => !c ? 'exempt' : ['Company', 'Partnership firm', 'LLP', 'Proprietorship', 'Government body'].includes(c.type) ? 'rcm' : 'exempt';

/* ---------- invoice as printable HTML (3 designs) ---------- */
function invoiceHtml(inv) {
  if (/^Tabular/.test(inv.style || '')) return invoiceHtmlTabular(inv);
  const P = D.practice; const c = clientById(inv.client_id) || {}; const k = inv.case_id ? caseById(inv.case_id) : null; const T = invCalc(inv);
  const e = esc; const adr = a => [a?.line, a?.city, a?.district, a?.state, a?.pin].filter(Boolean).join(', ');
  const style = inv.style || P.style || 'Classic';
  const css = { Classic: `body{font-family:Georgia,'Times New Roman',serif}.head{border-bottom:3px double #333;text-align:center}.head h1{font-size:24px;letter-spacing:1px}th{background:#f1ede4}`,
    Modern: `body{font-family:Arial,Helvetica,sans-serif}.head{background:#0F2A44;color:#fff;margin:-36px -40px 18px;padding:26px 40px}.head h1{color:#fff}.head .sub{color:#E9DCC4}th{background:#0F2A44;color:#fff}.doc{color:#B08D57}`,
    Minimal: `body{font-family:Arial,Helvetica,sans-serif}.head{border-bottom:1px solid #ccc}th{border-bottom:2px solid #333;background:none}` }[style] || '';
  const lines = (inv.lines || []).filter(l => l.desc || +l.amount);
  const sac = inv.sac || '998212';
  const gstRows = (inv.gst_mode === 'forward' || inv.gst_mode === 'rcm') ? (T.intra ? [['CGST @ 9%', T.cgst], ['SGST @ 9%', T.sgst]] : [['IGST @ 18%', T.igst]]) : [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:0}body{margin:0;padding:36px 40px;color:#1d1d1d;font-size:12.5px}h1{margin:0;font-size:22px}.sub{color:#555;font-size:11.5px;margin-top:4px;line-height:1.5}
  .head{padding-bottom:12px;margin-bottom:16px}.doc{font-size:18px;font-weight:bold;text-align:center;margin:8px 0 14px;letter-spacing:2px;text-transform:uppercase}
  .two{display:flex;justify-content:space-between;gap:24px;margin-bottom:14px}.two>div{flex:1}.lbl{font-size:10.5px;text-transform:uppercase;color:#777;letter-spacing:.5px}
  table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #bbb;padding:7px 9px;text-align:left;vertical-align:top}td.n,th.n{text-align:right;white-space:nowrap}
  .tot td{font-weight:bold}.words{margin-top:8px;font-style:italic}.note{margin-top:14px;padding:9px 11px;border:1px solid #d9cfb8;background:#fbf8f2;font-size:11.5px}
  .foot{display:flex;justify-content:space-between;margin-top:30px;align-items:flex-end}.sign{text-align:center;min-width:200px}.sign .line{border-top:1px solid #333;margin-top:46px;padding-top:4px}
  ${css}</style></head><body>
  <div class="head"><h1>${e(P.firm || P.advocate || 'Advocate')}</h1><div class="sub">${e([P.advocate && P.firm ? 'Adv. ' + P.advocate : '', P.enrolment ? 'Enrolment No. ' + P.enrolment : ''].filter(Boolean).join(' · '))}<br>${e([P.address, P.city, P.state, P.pin].filter(Boolean).join(', '))}<br>${e([P.phone, P.email].filter(Boolean).join(' · '))}${P.pan ? '<br>PAN: ' + e(P.pan) : ''}${P.gstin ? ' · GSTIN: ' + e(P.gstin) : ''}</div></div>
  <div class="doc">${e(inv.doc_type)}</div>
  <div class="two"><div><div class="lbl">Billed to</div><b>${e(c.name)}</b><br>${e(adr(c.addr))}${c.gstin ? '<br>GSTIN: ' + e(c.gstin) : ''}${c.pan ? '<br>PAN: ' + e(c.pan) : ''}<br>Client code: ${e(c.code)}</div>
   <div><div class="lbl">${e(inv.doc_type)} details</div>No.: <b>${e(inv.no)}</b><br>Date: ${fd(inv.date)}${inv.due_date ? '<br>Due by: ' + fd(inv.due_date) : ''}<br>Place of supply: ${e(inv.place_state || c.addr?.state || P.state || '')}${k ? `<br>Matter: ${e(k.code)} · ${e(caseTitle(k))}${k.case_no ? ' (No. ' + e(k.case_no) + (k.case_year ? '/' + e(k.case_year) : '') + ')' : ''}` : ''}</div></div>
  <table><thead><tr><th style="width:34px">#</th><th>Description</th><th>SAC</th><th class="n">Amount</th></tr></thead><tbody>
   ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${e(l.desc)}${l.kind === 'reimb' ? ' <i>(reimbursement, as pure agent)</i>' : ''}</td><td>${l.kind === 'reimb' ? '-' : e(sac)}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}
   <tr><td></td><td colspan="2">Professional fees</td><td class="n">${money(T.fees)}</td></tr>
   ${T.reimb ? `<tr><td></td><td colspan="2">Reimbursements</td><td class="n">${money(T.reimb)}</td></tr>` : ''}
   ${inv.gst_mode === 'forward' ? gstRows.map(([t, v]) => `<tr><td></td><td colspan="2">${t}</td><td class="n">${money(v)}</td></tr>`).join('') : ''}
   <tr class="tot"><td></td><td colspan="2">Total</td><td class="n">${money(T.total)}</td></tr></tbody></table>
  <div class="words">Amount in words: Rupees ${inWords(T.total)} only</div>
  ${inv.gst_mode === 'rcm' ? `<div class="note">${e(GST_MODES.rcm.note)}<br>GST payable by the recipient: ${gstRows.map(([t, v]) => t + ' ' + money(v)).join(', ')}.</div>` : ''}
  ${inv.gst_mode === 'exempt' ? `<div class="note">${e(GST_MODES.exempt.note)}</div>` : ''}
  ${inv.doc_type === 'Proforma Invoice' ? '<div class="note">This is a proforma (estimate), not a demand for payment.</div>' : ''}
  ${inv.notes ? `<div class="note">${e(inv.notes).replace(/\n/g, '<br>')}</div>` : ''}
  <div class="foot"><div>${P.bank_name || P.upi ? `<div class="lbl">Payment details</div>${P.bank_name ? `${e(P.bank_holder || P.firm || P.advocate || '')}<br>${e(P.bank_name)}${P.bank_acc ? ' · A/c ' + e(P.bank_acc) : ''}${P.bank_ifsc ? '<br>IFSC ' + e(P.bank_ifsc) : ''}` : ''}${P.upi ? '<br>UPI: ' + e(P.upi) : ''}` : ''}${P.terms ? `<div class="sub">${e(P.terms)}</div>` : ''}</div>
   <div class="sign">For ${e(P.firm || P.advocate || '')}<div class="line">${e(P.sign_name || P.advocate || 'Advocate')}</div></div></div>
  </body></html>`;
}

/* "Tabular (GST table)" design: a grid bill with the GST split (provider / recipient) table,
   as some corporate clients ask for. Colours follow the usual Excel bill look. */
function invoiceHtmlTabular(inv) {
  const P = D.practice; const c = clientById(inv.client_id) || {}; const k = inv.case_id ? caseById(inv.case_id) : null; const T = invCalc(inv); const e = esc;
  const adr = a => [a?.line, a?.city, a?.district, a?.state, a?.pin].filter(Boolean).join(', ');
  const lines = (inv.lines || []).filter(l => l.desc || +l.amount);
  const tax = r2(T.cgst + T.sgst + T.igst); const rcm = inv.gst_mode === 'rcm', fwd = inv.gst_mode === 'forward', noTax = !rcm && !fwd;
  const n2 = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const caseRef = l => l.ref || (k ? [k.case_no ? k.case_no + (k.case_year ? '/' + k.case_year : '') : '', k.code].filter(Boolean)[0] : '') || '—';
  const firm = P.firm || P.advocate || 'Advocate';
  const gstRows = noTax ? `<tr><td>GST</td><td class="n" colspan="3">${inv.gst_mode === 'exempt' ? 'Exempt' : 'Not applicable'}</td></tr>`
    : (T.intra ? [['CGST 9%', T.cgst], ['SGST 9%', T.sgst]] : [['IGST 18%', T.igst]]).map(([t, v]) => `<tr><td>${t}</td><td class="n">${n2(v)}</td><td class="n">${n2(rcm ? 0 : v)}</td><td class="n">${n2(rcm ? v : 0)}</td></tr>`).join('') + `<tr class="b"><td>Total GST 18%</td><td class="n">${n2(tax)}</td><td class="n">${n2(rcm ? 0 : tax)}</td><td class="n">${n2(rcm ? tax : 0)}</td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:12mm}body{margin:0;font:11.5pt Cambria,Georgia,'Times New Roman',serif;color:#111}
  table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:5px 7px;vertical-align:top}th{font-weight:bold}
  .n{text-align:right;white-space:nowrap}.c{text-align:center}.b td{font-weight:bold}
  .t0{background:#BDD7EE;text-align:center;font-weight:bold;letter-spacing:1px}.t1{background:#9DC3E6;text-align:center;font-size:20pt;font-weight:bold;padding:8px}
  .t2{background:#DDEBF7;text-align:center;font-size:10pt}.y{background:#FFFF00}.bl{background:#DDEBF7}
  .small{font-size:9.5pt}.sign{height:58px}
  </style></head><body><table>
  <tr><td colspan="4" class="t0">${e(String(inv.doc_type || 'Invoice').toUpperCase())}</td></tr>
  <tr><td colspan="4" class="t1">${e(firm)}</td></tr>
  <tr><td colspan="4" class="t2">${e([P.address, P.city, P.state].filter(Boolean).join(', '))}${P.pin ? '-' + e(P.pin) : ''}</td></tr>
  <tr><td colspan="2" class="t2" style="text-align:left">${P.phone ? 'Ph.: ' + e(P.phone) : ''}</td><td colspan="2" class="t2" style="text-align:right">${P.email ? 'E-mail: ' + e(P.email) : ''}</td></tr>
  <tr class="y b"><td colspan="2">Name And Address</td><td class="c">BILL NO.</td><td class="c">${e(inv.no)}</td></tr>
  <tr><td colspan="2" rowspan="2"><b>${e(c.name)}</b><br>${e(adr(c.addr))}${c.gstin ? '<br>GSTIN: ' + e(c.gstin) : ''}</td><td class="c">DATE</td><td class="c">${fd(inv.date)}</td></tr>
  <tr><td class="c">CLIENT CODE</td><td class="c">${e(c.code || '')}</td></tr>
  <tr class="y"><td colspan="4" class="c"><b>Kind Attention: ${e(inv.attention || '____________')}</b></td></tr>
  <tr class="bl"><th class="c" style="width:52px">S.NO.</th><th class="c">PARTICULARS</th><th class="c" style="width:140px">Case No/F. No.</th><th class="c" style="width:120px">Amount (INR)</th></tr>
  ${lines.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${e(l.desc)}${l.kind === 'reimb' ? ' <i class="small">(reimbursement)</i>' : ''}</td><td class="c">${e(caseRef(l))}</td><td class="n">${n2(l.amount)}</td></tr>`).join('')}
  <tr class="b"><td colspan="3" class="n">Total</td><td class="n">${n2(T.fees + T.reimb)}</td></tr>
  <tr class="y small b"><td>Particulars</td><td class="n">Total Tax Payable 18%</td><td class="n">Payable by Service Provider ${rcm ? 'Nil' : '100'}%</td><td class="n">Payable by Service Receiver ${rcm ? '100' : 'Nil'}%</td></tr>
  ${gstRows}
  <tr class="bl b"><td colspan="3" class="n">Grand Total</td><td class="n">${n2(T.total)}</td></tr>
  <tr><td colspan="4" class="small"><i>Rupees ${inWords(T.total)} only</i></td></tr>
  <tr class="y"><td colspan="2">GST Registration No. ${e(P.gstin || '')}</td><td colspan="2" class="small">${rcm ? 'N.A - GST on Legal Services is payable by the recipient of service on reverse charge basis.' : inv.gst_mode === 'exempt' ? 'Legal services to a non-business client are exempt from GST.' : fwd ? 'GST charged as above.' : ''}</td></tr>
  <tr class="y"><td colspan="4">Service Category:- Legal Services (SAC ${e(inv.sac || '998212')})<br>PAN - ${e(P.pan || '')}</td></tr>
  <tr class="y"><td colspan="2"><b><u>DETAILS OF BANK ACCOUNT FOR REMITTANCE OF INVOICE</u></b><br>${e((P.bank_holder || firm).toUpperCase())}<br>A/c No. - ${e(P.bank_acc || '')}<br>${e(P.bank_name || '')}<br>IFSC - ${e(P.bank_ifsc || '')}${P.upi ? '<br>UPI - ' + e(P.upi) : ''}</td>
   <td colspan="2" class="c"><b>For ${e(firm)}</b><div class="sign"></div><b>Authorised Signatory</b></td></tr>
  ${inv.notes ? `<tr><td colspan="4" class="small">${e(inv.notes).replace(/\n/g, '<br>')}</td></tr>` : ''}
  </table></body></html>`;
}

/* ---------- Accounts page ---------- */
S.av = { tab: 'Overview' }; S.af = { fy: '', client: '', status: '', mode: '', cat: '' };
PAGES.Accounts = async () => {
  await loadD(); const A = S.av; const F = S.af; if (!F.fy) F.fy = fyOf(todayISO());
  if (A.mode === 'inv') return invoiceForm(A.id, A.client, A.case);
  const tabs = ['Overview', 'Invoices', 'Receipts', 'Expenses', 'Client money', 'Reports'];
  const fys = [...new Set([fyOf(todayISO()), ...D.invoices.map(i => fyOf(i.date)), ...D.expenses.map(x => fyOf(x.date)), ...D.payments.map(p => fyOf(p.date))])].sort().reverse();
  const cname = id => (clientById(id) || {}).name || '-';
  const clientSel = (id = 'af_client') => `<div><label>Client</label><select id="${id}"><option value="">All clients</option>${[...D.clients].sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}" ${F.client === c.id ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select></div>`;
  const fySel = `<div><label>Financial year</label><select id="af_fy">${fys.map(f => `<option ${F.fy === f ? 'selected' : ''}>${f}</option>`).join('')}<option value="all" ${F.fy === 'all' ? 'selected' : ''}>All years</option></select></div>`;
  const fyOk = d => F.fy === 'all' || inFY(d, F.fy);
  let body = '';
  const invs = D.invoices.filter(i => fyOk(i.date) && (!F.client || i.client_id === F.client));
  if (A.tab === 'Overview') {
    const real = invs.filter(i => i.doc_type !== 'Proforma Invoice' && i.status !== 'Cancelled'); const C = real.map(i => ({ i, t: invCalc(i) }));
    const billed = r2(C.reduce((s, x) => s + x.t.total, 0)); const pays = D.payments.filter(p => fyOk(p.date) && (!F.client || p.client_id === F.client));
    const recd = r2(pays.reduce((s, p) => s + (+p.amount || 0), 0)); const tds = r2(pays.reduce((s, p) => s + (+p.tds || 0), 0));
    const outstanding = r2(D.invoices.filter(i => (!F.client || i.client_id === F.client)).reduce((s, i) => s + invCalc(i).due, 0));
    const overdue = D.invoices.filter(i => (!F.client || i.client_id === F.client) && invCalc(i).status === 'Overdue');
    const exps = D.expenses.filter(x => fyOk(x.date) && (!F.client || x.client_id === F.client)); const spent = r2(exps.reduce((s, x) => s + (+x.amount || 0), 0));
    const held = r2(D.client_money.filter(m => !F.client || m.client_id === F.client).reduce((s, m) => s + (m.type === 'Received' ? +m.amount : -m.amount), 0));
    const months = F.fy === 'all' ? [] : Array.from({ length: 12 }, (_, i) => { const y = +F.fy.slice(0, 4) + (i >= 9 ? 1 : 0); const m = (i + 3) % 12; return `${y}-${String(m + 1).padStart(2, '0')}`; });
    const mb = months.map(m => ({ m, b: r2(C.filter(x => x.i.date.startsWith(m)).reduce((s, x) => s + x.t.total, 0)), r: r2(pays.filter(p => p.date.startsWith(m)).reduce((s, p) => s + (+p.amount || 0), 0)) }));
    const mx = Math.max(1, ...mb.map(x => Math.max(x.b, x.r)));
    const top = Object.entries(C.reduce((o, x) => (o[x.i.client_id] = (o[x.i.client_id] || 0) + x.t.total, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    body = `<div class="kpis">${[['Billed', money(billed), plural(real.length, 'bill')], ['Received', money(recd), tds ? 'plus TDS ' + money(tds) : 'in this period'], ['Outstanding', money(outstanding), 'all years'], ['Overdue', String(overdue.length), money(overdue.reduce((s, i) => s + invCalc(i).due, 0))], ['Expenses', money(spent), plural(exps.length, 'entry')], ['Client money held', money(held), 'client account']].map(([t, v, s]) => `<div class="card kpi nohand"><div class="muted small">${t}</div><div class="v small-v">${v}</div><div class="small muted">${s}</div></div>`).join('')}</div>
     <div class="grid g2"><div class="card"><h2>Billed and received by month</h2>${months.length ? `<div class="mchart">${mb.map(x => `<div class="mcol" title="${x.m}: billed ${money(x.b)}, received ${money(x.r)}"><div class="mbars"><i class="b" data-h="${Math.round(100 * x.b / mx)}"></i><i class="r" data-h="${Math.round(100 * x.r / mx)}"></i></div><span>${new Date(x.m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</span></div>`).join('')}</div><div class="small muted mt8"><span class="key b"></span> Billed &nbsp; <span class="key r"></span> Received</div>` : '<div class="muted">Choose one financial year to see the months.</div>'}</div>
      <div class="card"><h2>Top clients by billing</h2>${top.length ? top.map(([id, v]) => `<div class="row"><span>${esc(cname(id))}</span><b>${money(v)}</b></div>`).join('') : '<div class="muted">No bills yet.</div>'}
       ${overdue.length ? `<h3 class="mt14">Overdue bills</h3>${overdue.slice(0, 6).map(i => `<div class="row small"><a data-inv="${i.id}">${esc(i.no)}</a><span>${esc(cname(i.client_id))}</span><b>${money(invCalc(i).due)}</b></div>`).join('')}` : ''}</div></div>`;
  }
  if (A.tab === 'Invoices') {
    const list = invs.filter(i => !F.status || invCalc(i).status === F.status).sort((a, b) => (b.date + b.no).localeCompare(a.date + a.no));
    body = `<div class="card mb14"><div class="filters">${fySel}${clientSel()}<div><label>Status</label><select id="af_status">${opts(['Unpaid', 'Part paid', 'Paid', 'Overdue', 'Proforma', 'Cancelled'], F.status, 'All')}</select></div><div class="span2"><label>Search</label><input id="af_q" placeholder="Bill number, client, matter"></div><div><label>&nbsp;</label><button class="btn wide" id="af_new">+ New bill</button></div></div></div>
     <div class="card">${list.length ? `<div class="tblwrap"><table class="tbl" id="af_tbl"><thead><tr><th>No.</th><th>Date</th><th>Client</th><th>Type / GST</th><th class="n">Total</th><th class="n">Due</th><th>Status</th></tr></thead><tbody>
      ${list.map(i => { const t = invCalc(i); const k = i.case_id ? caseById(i.case_id) : null; return `<tr class="click" data-inv="${i.id}" data-s="${esc([i.no, cname(i.client_id), k ? k.code : ''].join(' ').toLowerCase())}"><td class="mono small">${esc(i.no)}</td><td class="small">${fd(i.date)}</td><td>${esc(cname(i.client_id))}${k ? `<div class="small muted mono">${esc(k.code)}</div>` : ''}</td>
       <td class="small">${esc(i.doc_type)}<div class="muted">${esc(GST_MODES[i.gst_mode]?.label || '')}</div></td><td class="n">${money(t.total)}</td><td class="n">${money(t.due)}</td><td><span class="tag ${t.status === 'Paid' ? 'ok' : t.status === 'Overdue' ? 'bad' : t.status === 'Cancelled' || t.status === 'Proforma' ? 'grey' : 'warn'}">${t.status}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty"><b>No bills here yet.</b><div class="muted">Press <b>+ New bill</b>.</div></div>'}</div>`;
  }
  if (A.tab === 'Receipts') {
    const list = D.payments.filter(p => fyOk(p.date) && (!F.client || p.client_id === F.client) && (!F.mode || p.mode === F.mode)).sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="card mb14"><div class="filters">${fySel}${clientSel()}<div><label>Mode</label><select id="af_mode">${opts(PAY_MODES, F.mode, 'All')}</select></div><div><label>&nbsp;</label><button class="btn wide" id="af_pay">+ Record payment</button></div></div></div>
     <div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Client</th><th>Against bill</th><th>Mode</th><th class="n">Amount</th><th class="n">TDS</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td class="small">${fd(p.date)}</td><td>${esc(cname(p.client_id))}</td><td class="mono small">${esc((D.invoices.find(i => i.id === p.invoice_id) || {}).no || 'Advance')}</td><td class="small">${esc(p.mode)}${p.ref ? ' · ' + esc(p.ref) : ''}</td><td class="n">${money(p.amount)}</td><td class="n">${p.tds ? money(p.tds) : '-'}</td><td><button class="btn ghost sm" data-pdel="${p.id}">Delete</button></td></tr>`).join('')}
      <tr class="tot"><td colspan="4"><b>Total</b></td><td class="n"><b>${money(list.reduce((s, p) => s + +p.amount, 0))}</b></td><td class="n"><b>${money(list.reduce((s, p) => s + (+p.tds || 0), 0))}</b></td><td></td></tr></tbody></table>` : '<div class="empty"><b>No payments recorded.</b></div>'}</div>`;
  }
  if (A.tab === 'Expenses') {
    const list = D.expenses.filter(x => fyOk(x.date) && (!F.client || x.client_id === F.client) && (!F.cat || x.category === F.cat)).sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="card mb14"><div class="filters">${fySel}${clientSel()}<div><label>Category</label><select id="af_cat">${opts(EXP_CATS, F.cat, 'All')}</select></div><div><label>&nbsp;</label><button class="btn wide" id="af_exp">+ Add expense</button></div></div></div>
     <div class="card">${list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Details</th><th>Client / case</th><th>Recover from client</th><th class="n">Amount</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td class="small">${fd(x.date)}</td><td>${esc(x.category)}</td><td class="small">${esc(x.desc || '')}${(x.files || []).map(f => ` <a data-xv="${f.fid}" data-xid="${x.id}">receipt</a>`).join('')}</td><td class="small">${esc(x.client_id ? cname(x.client_id) : 'Office')}${x.case_id ? ' · ' + esc((caseById(x.case_id) || {}).code || '') : ''}</td><td>${x.recoverable ? '<span class="tag warn">Yes</span>' : '-'}</td><td class="n">${money(x.amount)}</td><td><button class="btn ghost sm" data-xdel="${x.id}">Delete</button></td></tr>`).join('')}
      <tr class="tot"><td colspan="5"><b>Total</b></td><td class="n"><b>${money(list.reduce((s, x) => s + +x.amount, 0))}</b></td><td></td></tr></tbody></table>` : '<div class="empty"><b>No expenses recorded.</b></div>'}</div>`;
  }
  if (A.tab === 'Client money') {
    const bal = {}; D.client_money.forEach(m => bal[m.client_id] = r2((bal[m.client_id] || 0) + (m.type === 'Received' ? +m.amount : -m.amount)));
    const list = D.client_money.filter(m => !F.client || m.client_id === F.client).sort((a, b) => b.date.localeCompare(a.date));
    body = `<div class="warnbox mb14">Money received <b>for</b> a client (court fee to deposit, settlement amount, decree money) is kept apart from your fees, as the Bar Council of India Rules (Part VI, Rules 25 to 27) require. This ledger shows how much of each client's money you hold.</div>
     <div class="card mb14"><div class="filters">${clientSel()}<div><label>&nbsp;</label><button class="btn wide" id="af_cm">+ Add entry</button></div></div></div>
     <div class="grid g2"><div class="card"><h2>Balance held per client</h2>${Object.entries(bal).filter(([, v]) => v).map(([id, v]) => `<div class="row"><span>${esc(cname(id))}</span><b class="${v < 0 ? 'badtext' : ''}">${money(v)}</b></div>`).join('') || '<div class="muted">Nothing held.</div>'}</div>
      <div class="card"><h2>Entries</h2>${list.length ? list.map(m => `<div class="row small"><span>${fd(m.date)} · ${esc(cname(m.client_id))}<div class="muted">${esc(m.purpose || '')} ${m.mode ? '· ' + esc(m.mode) : ''}</div></span><span class="${m.type === 'Received' ? 'oktext' : 'badtext'}">${m.type === 'Received' ? '+' : '&minus;'} ${money(m.amount)}</span><button class="btn ghost sm" data-cmdel="${m.id}">Delete</button></div>`).join('') : '<div class="muted">No entries.</div>'}</div></div>`;
  }
  if (A.tab === 'Reports') {
    const rows = D.clients.map(c => { const is = D.invoices.filter(i => i.client_id === c.id && fyOk(i.date) && i.doc_type !== 'Proforma Invoice' && i.status !== 'Cancelled'); const t = is.map(invCalc);
      return { c, billed: r2(t.reduce((s, x) => s + x.total, 0)), recd: r2(D.payments.filter(p => p.client_id === c.id && fyOk(p.date)).reduce((s, p) => s + +p.amount, 0)), tds: r2(D.payments.filter(p => p.client_id === c.id && fyOk(p.date)).reduce((s, p) => s + (+p.tds || 0), 0)), due: r2(D.invoices.filter(i => i.client_id === c.id).reduce((s, i) => s + invCalc(i).due, 0)) }; }).filter(r => r.billed || r.recd || r.due);
    const gst = { exempt: 0, rcm: 0, forward: 0, none: 0, tax: 0 }; invs.filter(i => i.doc_type !== 'Proforma Invoice' && i.status !== 'Cancelled').forEach(i => { const t = invCalc(i); gst[i.gst_mode] = r2((gst[i.gst_mode] || 0) + t.fees); gst.tax = r2(gst.tax + t.taxCharged); });
    body = `<div class="card mb14"><div class="filters">${fySel}<div><label>&nbsp;</label><button class="btn ghost wide" id="af_csv">Download as Excel (CSV)</button></div></div></div>
     <div class="grid g2"><div class="card"><h2>Client-wise fees</h2>${rows.length ? `<table class="tbl"><thead><tr><th>Client</th><th class="n">Billed</th><th class="n">Received</th><th class="n">TDS</th><th class="n">Due</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.c.name)}<div class="small muted mono">${esc(r.c.code)}</div></td><td class="n">${money(r.billed)}</td><td class="n">${money(r.recd)}</td><td class="n">${money(r.tds)}</td><td class="n">${money(r.due)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Nothing in this period.</div>'}</div>
      <div class="card"><h2>GST summary (fees)</h2><div class="row"><span>Exempt (non-business clients)</span><b>${money(gst.exempt)}</b></div><div class="row"><span>Reverse charge (business clients)</span><b>${money(gst.rcm)}</b></div><div class="row"><span>GST charged on bill</span><b>${money(gst.forward)}</b></div><div class="row"><span>Tax collected on bills</span><b>${money(gst.tax)}</b></div><div class="row"><span>Fee bills without GST statement</span><b>${money(gst.none)}</b></div>
       <div class="small muted mt8">For your accountant. I am not a tax advisor; please confirm filing needs with your CA.</div></div></div>`;
  }
  page(`<div class="top"><div><h1>Accounts</h1><div class="muted">Bills in any GST form, payments, expenses and client money. Financial year April to March.</div></div><div class="flex"><button class="btn ghost" id="ac_profile">Practice details</button><button class="btn" id="ac_new">+ New bill</button></div></div>
   ${!D.practice.advocate && !D.practice.firm ? '<div class="warnbox mb14">Add your practice details (name, address, PAN, bank) once. They print on every bill. <a id="ac_profile2">Add now</a></div>' : ''}
   <div class="tabs">${tabs.map(t => `<button class="${A.tab === t ? 'on' : ''}" data-atab="${t}">${t}</button>`).join('')}</div>
   ${A.tab === 'Overview' ? `<div class="card mb14"><div class="filters">${fySel}${clientSel()}</div></div>` : ''}${body}`);
  $$('[data-h]').forEach(i => i.style.height = Math.max(1, +i.dataset.h) + '%');
  $$('[data-atab]').forEach(b => b.onclick = () => { A.tab = b.dataset.atab; PAGES.Accounts(); });
  ['ac_profile', 'ac_profile2'].forEach(id => { const b = document.getElementById(id); if (b) b.onclick = practiceModal; });
  const go = () => PAGES.Accounts();
  $('#ac_new').onclick = () => { S.av = { ...A, mode: 'inv', id: null }; go(); };
  if ($('#af_new')) $('#af_new').onclick = () => { S.av = { ...A, mode: 'inv', id: null, client: F.client }; go(); };
  if ($('#af_fy')) $('#af_fy').onchange = e => { F.fy = e.target.value; go(); };
  if ($('#af_client')) $('#af_client').onchange = e => { F.client = e.target.value; go(); };
  if ($('#af_status')) $('#af_status').onchange = e => { F.status = e.target.value; go(); };
  if ($('#af_mode')) $('#af_mode').onchange = e => { F.mode = e.target.value; go(); };
  if ($('#af_cat')) $('#af_cat').onchange = e => { F.cat = e.target.value; go(); };
  if ($('#af_q')) $('#af_q').oninput = e => { const t = e.target.value.trim().toLowerCase(); $$('#af_tbl tbody tr').forEach(r => r.classList.toggle('hidden', !!t && !r.dataset.s.includes(t))); };
  $$('[data-inv]').forEach(r => r.onclick = () => invoiceView(r.dataset.inv));
  if ($('#af_pay')) $('#af_pay').onclick = () => paymentModal(null, F.client);
  if ($('#af_exp')) $('#af_exp').onclick = () => expenseModal();
  if ($('#af_cm')) $('#af_cm').onclick = () => clientMoneyModal(F.client);
  const del = (attr, key, label) => $$(`[${attr}]`).forEach(b => b.onclick = async () => { if (!confirmBox) return; D[key] = D[key].filter(x => x.id !== b.getAttribute(attr)); await saveD(key); toast(label + ' deleted.'); go(); });
  const confirmBox = true; del('data-pdel', 'payments', 'Payment'); del('data-xdel', 'expenses', 'Expense'); del('data-cmdel', 'client_money', 'Entry');
  $$('[data-xv]').forEach(a => a.onclick = () => { const x = D.expenses.find(y => y.id === a.dataset.xid); openViewer(x.files.map(f => ({ ...f, title: x.category })), x.files.findIndex(f => f.fid === a.dataset.xv)); });
  if ($('#af_csv')) $('#af_csv').onclick = async () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Bill no', 'Date', 'Type', 'Client code', 'Client', 'Case code', 'GST treatment', 'Fees', 'Reimbursements', 'CGST', 'SGST', 'IGST', 'Tax charged', 'Total', 'Received', 'TDS', 'Due', 'Status'].map(q).join(',')];
    invs.forEach(i => { const t = invCalc(i); const c = clientById(i.client_id) || {}; lines.push([i.no, i.date, i.doc_type, c.code, c.name, i.case_id ? (caseById(i.case_id) || {}).code : '', GST_MODES[i.gst_mode]?.label, t.fees, t.reimb, t.cgst, t.sgst, t.igst, t.taxCharged, t.total, t.paid, t.tds, t.due, t.status].map(q).join(',')); });
    try { const r = await call('saveText', { text: lines.join('\r\n'), filename: `Mitakshara bills ${F.fy}.csv` }); if (r.saved) toast('Saved. It opens in Excel.'); } catch (e) { toast(e.message); }
  };
};

/* ---------- practice details ---------- */
function practiceModal() {
  const P = D.practice; const v = k => esc(P[k] || '');
  const m = modal(`<h2>Practice details</h2><div class="small muted">Printed on bills and letters. Bank details stay only on this computer, encrypted.</div><div class="grid g2 mt14">
   <div><label>Advocate's name *</label><input id="p_advocate" value="${v('advocate') || esc(S.status.vault.profile?.name || '')}"></div><div><label>Chamber / firm name</label><input id="p_firm" value="${v('firm')}" placeholder="e.g. Tak Law Chambers"></div>
   <div><label>Bar enrolment no.</label><input id="p_enrolment" value="${v('enrolment')}"></div><div><label>Phone</label><input id="p_phone" value="${v('phone')}"></div>
   <div class="span2"><label>Email</label><input id="p_email" value="${v('email')}"></div>
   <div class="span2 g4 paddr">${addrFields('pa', { line: P.address, city: P.city, district: P.district, state: P.state, pin: P.pin }, 'Office address')}</div>
   <div class="span2 small muted">The state decides whether a bill shows CGST + SGST or IGST.</div>
   <div><label>PAN</label><input id="p_pan" value="${v('pan')}" class="upper"></div><div><label>GSTIN (only if registered)</label><input id="p_gstin" value="${v('gstin')}" class="upper"></div>
   <div><label>Bank name</label><input id="p_bank_name" value="${v('bank_name')}"></div><div><label>Account holder</label><input id="p_bank_holder" value="${v('bank_holder')}"></div>
   <div><label>Account number</label><input id="p_bank_acc" value="${v('bank_acc')}"></div><div><label>IFSC</label><input id="p_bank_ifsc" value="${v('bank_ifsc')}" class="upper"></div>
   <div><label>UPI ID</label><input id="p_upi" value="${v('upi')}"></div><div><label>Bill number prefix</label><input id="p_inv_prefix" value="${v('inv_prefix') || 'INV'}" maxlength="6" class="upper"></div>
   <div><label>Usual bill design</label><select id="p_style">${opts(BILL_STYLES, P.style || 'Classic')}</select></div><div><label>Name under signature</label><input id="p_sign_name" value="${v('sign_name')}"></div>
   <div class="span2"><label>Terms printed on bills</label><input id="p_terms" value="${v('terms')}" placeholder="e.g. Payment within 15 days. Please quote the bill number."></div></div>
   <div class="err" id="p_err"></div><div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="p_go">Save</button></div>`);
  m.querySelector('.card').classList.add('mwide'); let PA = null; wireAddr('pa').then(r => PA = r);
  m.querySelector('#p_go').onclick = async () => {
    const o = {}; ['advocate', 'firm', 'enrolment', 'phone', 'email', 'pan', 'gstin', 'bank_name', 'bank_holder', 'bank_acc', 'bank_ifsc', 'upi', 'inv_prefix', 'style', 'sign_name', 'terms'].forEach(k => o[k] = $('#p_' + k).value.trim());
    const ad = PA ? PA.read() : {}; Object.assign(o, { address: ad.line || '', city: ad.city || '', district: ad.district || '', state: ad.state || '', pin: ad.pin || '' });
    if (o.pin && !/^[1-9]\d{5}$/.test(o.pin)) return $('#p_err').textContent = 'PIN code should be exactly 6 digits.';
    ['pan', 'gstin', 'bank_ifsc', 'inv_prefix'].forEach(k => o[k] = o[k].toUpperCase());
    const err = [];
    if (!o.advocate) err.push("Enter the advocate's name."); if (!o.state) err.push('Choose the state.');
    if (o.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(o.pan)) err.push('PAN should look like ABCDE1234F.');
    if (o.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(o.gstin)) err.push('GSTIN should be 15 characters.');
    if (o.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(o.bank_ifsc)) err.push('IFSC should look like SBIN0001234.');
    if (o.inv_prefix && !/^[A-Z0-9]{1,6}$/.test(o.inv_prefix)) err.push('Bill prefix: letters and numbers only.');
    if (err.length) return $('#p_err').innerHTML = err.map(esc).join('<br>');
    D.practice = { ...D.practice, ...o }; await call('setData', { key: 'practice', value: D.practice }); m.close(); toast('Practice details saved.'); redraw();
  };
}

/* ---------- new / edit bill ---------- */
function invoiceForm(id, presetClient, presetCase) {
  const inv = id ? JSON.parse(JSON.stringify(D.invoices.find(i => i.id === id))) : { client_id: presetClient || '', case_id: presetCase || '', date: todayISO(), due_date: addDays(todayISO(), 15), gst_mode: '', doc_type: '', sac: '998212', lines: [{ desc: 'Professional fee', kind: 'fee', amount: '' }], style: D.practice.style || 'Classic' };
  const clientsSorted = [...D.clients].sort((a, b) => a.name.localeCompare(b.name));
  page(`<div class="top"><div><a id="if_back">&larr; Accounts</a><h1 class="mt8">${id ? 'Edit bill ' + esc(inv.no) : 'New bill'}</h1><div class="muted">Choose how GST applies; the wording and tax lines follow automatically.</div></div>
    <div class="flex"><button class="btn ghost" id="if_prev">Preview</button><button class="btn" id="if_save">Save bill</button></div></div>
   <div class="formgrid"><section class="card"><h2>1. Client and matter</h2><div class="g4">
     <div class="span2"><label>Client *</label><select id="i_client"><option value="">Select client</option>${clientsSorted.map(c => `<option value="${c.id}" ${c.id === inv.client_id ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)} (${esc(c.type)})</option>`).join('')}</select></div>
     <div class="span2"><label>Case (optional)</label><select id="i_case"></select></div>
     <div><label>Bill date *</label><input id="i_date" type="date" value="${esc(inv.date)}"></div><div><label>Pay by</label><input id="i_due" type="date" value="${esc(inv.due_date || '')}"></div>
     <div><label>Place of supply (client's state)</label><select id="i_place">${opts(L('states'), inv.place_state || '', 'Select')}</select></div><div><label>Design</label><select id="i_style">${opts(BILL_STYLES, inv.style)}</select></div>
     <div class="span2"><label>Kind attention (person at the client)</label><input id="i_attn" value="${esc(inv.attention || '')}" placeholder="e.g. Mr. R. K. Mehta, GM - Legal"></div>
     <div class="span2"><label>&nbsp;</label><label class="check"><input type="checkbox" id="i_keepstyle"> Always use this design for this client</label></div></div></section>
    <section class="card"><h2>2. GST treatment</h2><div class="seg" id="i_gst">${Object.entries(GST_MODES).map(([k, g]) => `<button type="button" data-g="${k}" class="${inv.gst_mode === k ? 'on' : ''}">${esc(g.label)}</button>`).join('')}</div>
     <div class="small muted mt8" id="i_gsthint"></div><div class="g4 mt14"><div><label>Document title</label><select id="i_doctype">${opts(DOC_TYPES, inv.doc_type)}</select></div><div class="span2"><label>SAC code</label><select id="i_sac">${SAC.map(([c, t]) => `<option value="${c}" ${c === inv.sac ? 'selected' : ''}>${c} · ${esc(t)}</option>`).join('')}</select></div></div></section>
    <section class="card"><h2>3. Fees and reimbursements</h2><div id="i_lines"></div><button type="button" class="btn ghost sm" id="i_addl">+ Add line</button><datalist id="i_sugg">${LINE_SUGGEST.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
     <div class="totbox mt14" id="i_tot"></div></section>
    <section class="card"><h2>4. Note on the bill</h2><textarea id="i_notes" rows="2" placeholder="Optional, e.g. Fee for appearance on 12.11.2026">${esc(inv.notes || '')}</textarea></section></div>
   <div class="err center" id="if_err"></div>`);
  const fillCases = () => { const cid = $('#i_client').value; const cs = D.cases.filter(k => k.client_id === cid); $('#i_case').innerHTML = `<option value="">No particular case</option>` + cs.map(k => `<option value="${k.id}" ${k.id === inv.case_id ? 'selected' : ''}>${esc(k.code + ' · ' + caseTitle(k))}</option>`).join(''); };
  const setMode = mode => { inv.gst_mode = mode; $$('#i_gst button').forEach(b => b.classList.toggle('on', b.dataset.g === mode)); if (!id || !inv.doc_type_touched) $('#i_doctype').value = GST_MODES[mode].doc;
    const c = clientById($('#i_client').value); $('#i_gsthint').textContent = (mode === 'forward' && !D.practice.gstin ? 'Your GSTIN is not in Practice details. Add it before charging GST. ' : '') + (GST_MODES[mode].note || '') + (c ? ` Suggested for ${c.type}: ${GST_MODES[suggestMode(c)].label}.` : ''); calc(); };
  $('#i_client').onchange = () => { const c = clientById($('#i_client').value); fillCases(); if (c && c.addr?.state) $('#i_place').value = c.addr.state; if (c && !id) setMode(suggestMode(c));
    if (c && !id) { $('#i_style').value = c.bill_style || D.practice.style || 'Classic'; $('#i_keepstyle').checked = !!c.bill_style; if (c.bill_attention && !$('#i_attn').value) $('#i_attn').value = c.bill_attention; } };
  if (id) { const c0 = clientById(inv.client_id); $('#i_keepstyle').checked = !!(c0 && c0.bill_style === inv.style); }
  $('#i_doctype').onchange = () => inv.doc_type_touched = true;
  $$('#i_gst button').forEach(b => b.onclick = () => setMode(b.dataset.g));
  const rows = [];
  const addLine = l => { const el = document.createElement('div'); el.className = 'lrow'; el.innerHTML = `<input class="l_desc" list="i_sugg" value="${esc(l.desc || '')}" placeholder="Description"><input class="l_ref" value="${esc(l.ref || '')}" placeholder="Case No. / File No."><select class="l_kind"><option value="fee" ${l.kind !== 'reimb' ? 'selected' : ''}>Fee (taxable)</option><option value="reimb" ${l.kind === 'reimb' ? 'selected' : ''}>Reimbursement</option></select><input class="l_amt" value="${esc(l.amount ?? '')}" inputmode="decimal" placeholder="Amount"><button type="button" class="btn ghost sm l_rm">&times;</button>`;
    $('#i_lines').appendChild(el); const r = { el }; rows.push(r);
    el.querySelector('.l_desc').addEventListener('change', e => { if (/reimbursement/i.test(e.target.value)) el.querySelector('.l_kind').value = 'reimb'; calc(); });
    el.querySelector('.l_amt').addEventListener('input', e => { const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); if (v !== e.target.value) e.target.value = v; calc(); });
    el.querySelector('.l_kind').onchange = calc; el.querySelector('.l_rm').onclick = () => { rows.splice(rows.indexOf(r), 1); el.remove(); calc(); };
    r.read = () => ({ desc: el.querySelector('.l_desc').value.trim(), ref: el.querySelector('.l_ref').value.trim(), kind: el.querySelector('.l_kind').value, amount: el.querySelector('.l_amt').value }); };
  const collect = () => ({ ...inv, client_id: $('#i_client').value, case_id: $('#i_case').value, date: $('#i_date').value, due_date: $('#i_due').value, place_state: $('#i_place').value, style: $('#i_style').value, doc_type: $('#i_doctype').value, sac: $('#i_sac').value, notes: $('#i_notes').value.trim(), attention: $('#i_attn').value.trim(), lines: rows.map(r => r.read()).filter(l => l.desc || l.amount) });
  function calc() { const o = collect(); const t = invCalc({ ...o, id: '__' }); const P = D.practice;
    $('#i_tot').innerHTML = `<div class="row"><span>Fees</span><b>${money(t.fees)}</b></div>${t.reimb ? `<div class="row"><span>Reimbursements</span><b>${money(t.reimb)}</b></div>` : ''}
     ${o.gst_mode === 'forward' ? (t.intra ? `<div class="row"><span>CGST 9% + SGST 9%</span><b>${money(t.cgst + t.sgst)}</b></div>` : `<div class="row"><span>IGST 18%</span><b>${money(t.igst)}</b></div>`) : ''}
     ${o.gst_mode === 'rcm' ? `<div class="row small muted"><span>GST payable by client (reverse charge), not added</span><span>${money(t.cgst + t.sgst + t.igst)}</span></div>` : ''}
     <div class="row big"><span>Total</span><b>${money(t.total)}</b></div><div class="small muted">Rupees ${inWords(t.total)} only${!P.state ? ' · Add your state in Practice details for correct GST lines' : ''}</div>`; }
  (inv.lines.length ? inv.lines : [{}]).forEach(addLine);
  $('#i_addl').onclick = () => addLine({});
  fillCases(); if (inv.client_id && !id) $('#i_client').onchange(); else if (inv.gst_mode) setMode(inv.gst_mode); calc();
  $('#if_back').onclick = () => { S.av = { tab: S.av.tab || 'Invoices' }; PAGES.Accounts(); };
  const validate = o => { const e = []; if (!o.client_id) e.push('Choose the client.'); if (!o.gst_mode) e.push('Choose the GST treatment.'); if (!o.date) e.push('Enter the bill date.');
    if (!o.lines.length) e.push('Add at least one line.'); o.lines.forEach((l, i) => { if (!l.desc) e.push(`Line ${i + 1}: enter a description.`); if (!(+l.amount > 0)) e.push(`Line ${i + 1}: enter an amount.`); });
    if (o.due_date && o.date && o.due_date < o.date) e.push('Pay-by date is before the bill date.'); return e; };
  $('#if_prev').onclick = async () => { const o = collect(); const e = validate(o); if (e.length) return $('#if_err').innerHTML = e.map(esc).join('<br>'); try { const r = await call('makePdf', { html: invoiceHtml({ ...o, no: o.no || '(number on saving)', id: '__' }), filename: 'Preview', mode: 'preview' }); openViewer([{ ...r.preview, title: 'Preview of bill' }]); } catch (er) { toast(er.message); } };
  $('#if_save').onclick = async () => {
    const o = collect(); const e = validate(o); if (e.length) { $('#if_err').innerHTML = e.map(esc).join('<br>'); return; }
    const now = new Date().toISOString();
    const cl = clientById(o.client_id); if (cl) { cl.bill_style = $('#i_keepstyle').checked ? o.style : (cl.bill_style === o.style ? '' : cl.bill_style || ''); if (o.attention) cl.bill_attention = o.attention; await saveD('clients'); }
    if (!id) { o.id = uid(); o.no = nextInvNo(o.doc_type, o.date); o.status = 'Issued'; o.created = now; D.invoices.push(o); } else { o.updated = now; D.invoices[D.invoices.findIndex(i => i.id === id)] = o; }
    await saveD('invoices', 'counters'); toast(`Bill ${o.no} saved.`); invoiceView(o.id);
  };
  $('#page').addEventListener('input', () => { if ($('#if_err')) $('#if_err').textContent = ''; });
}

/* ---------- one bill ---------- */
function invoiceView(id) {
  const inv = D.invoices.find(i => i.id === id); const t = invCalc(inv); const c = clientById(inv.client_id) || {};
  S.tab = 'Accounts'; S.av = { tab: S.av.tab || 'Invoices' };
  const pays = D.payments.filter(p => p.invoice_id === id);
  const m = modal(`<h2>${esc(inv.doc_type)} ${esc(inv.no)} <span class="tag ${t.status === 'Paid' ? 'ok' : t.status === 'Overdue' ? 'bad' : 'warn'}">${t.status}</span></h2>
   <div class="muted">${esc(c.name)} · ${fd(inv.date)} · ${esc(GST_MODES[inv.gst_mode]?.label || '')}</div>
   <div class="kpis k4 inner mt14"><div class="kpi"><div class="small muted">Total</div><div class="v small-v">${money(t.total)}</div></div><div class="kpi"><div class="small muted">Received</div><div class="v small-v">${money(t.paid)}</div></div><div class="kpi"><div class="small muted">TDS</div><div class="v small-v">${money(t.tds)}</div></div><div class="kpi"><div class="small muted">Due</div><div class="v small-v">${money(t.due)}</div></div></div>
   ${pays.length ? `<h3 class="mt14">Payments</h3>${pays.map(p => `<div class="row small"><span>${fd(p.date)} · ${esc(p.mode)}${p.ref ? ' · ' + esc(p.ref) : ''}</span><b>${money(p.amount)}${p.tds ? ' + TDS ' + money(p.tds) : ''}</b></div>`).join('')}` : ''}
   <div class="flex wrap mt14"><button class="btn ghost sm" id="iv_view">View</button><button class="btn ghost sm" id="iv_pdf">Save PDF</button><button class="btn ghost sm" id="iv_store">Keep in client's documents</button>
    ${t.due > 0 ? '<button class="btn ghost sm" id="iv_pay">Record payment</button><button class="btn ghost sm" id="iv_rem">Reminder message</button>' : ''}<button class="btn ghost sm" id="iv_edit">Edit</button>${inv.status !== 'Cancelled' ? '<button class="btn ghost sm red-text" id="iv_cancel">Cancel bill</button>' : ''}</div>`);
  m.querySelector('.card').classList.add('mwide');
  const fname = `${inv.doc_type} ${inv.no.replace(/\//g, '-')} ${c.name}`;
  m.querySelector('#iv_view').onclick = async () => { const r = await call('makePdf', { html: invoiceHtml(inv), filename: fname, mode: 'preview' }); openViewer([{ ...r.preview, title: inv.no }]); };
  m.querySelector('#iv_pdf').onclick = async () => { try { const r = await call('makePdf', { html: invoiceHtml(inv), filename: fname, mode: 'save' }); if (r.saved) toast('PDF saved.'); } catch (e) { toast(e.message); } };
  m.querySelector('#iv_store').onclick = async () => { const r = await call('makePdf', { html: invoiceHtml(inv), filename: fname, mode: 'store' });
    D.documents.push({ id: uid(), client_id: inv.client_id, case_id: inv.case_id || null, group: 'Financial', name: `${inv.doc_type} ${inv.no}`, date: inv.date, status: 'Received', note: money(t.total), files: [r.file], created: new Date().toISOString() });
    await saveD('documents'); toast("Saved in the client's documents (Financial)."); };
  if (m.querySelector('#iv_pay')) m.querySelector('#iv_pay').onclick = () => { m.close(); paymentModal(inv.id, inv.client_id); };
  if (m.querySelector('#iv_rem')) m.querySelector('#iv_rem').onclick = () => { const P = D.practice;
    const txt = `Dear ${c.name},\nThis is a gentle reminder that ${inv.doc_type.toLowerCase()} ${inv.no} dated ${fd(inv.date)} for ${money(t.total)} has ${money(t.due)} pending${inv.due_date ? ' (due on ' + fd(inv.due_date) + ')' : ''}.${P.upi ? '\nUPI: ' + P.upi : ''}${P.bank_acc ? '\nBank: ' + (P.bank_name || '') + ' A/c ' + P.bank_acc + ' IFSC ' + (P.bank_ifsc || '') : ''}\nPlease ignore if already paid.\nRegards,\n${P.advocate || ''}`;
    const m2 = modal(`<h2>Reminder message</h2><div class="small muted">Copy and send by WhatsApp, SMS or email.</div><textarea id="rm_t" rows="9">${esc(txt)}</textarea><div class="flex end mt14"><button class="btn" id="rm_c">Copy</button></div>`);
    m2.querySelector('#rm_c').onclick = async () => { await navigator.clipboard.writeText($('#rm_t').value); toast('Copied.'); inv.reminded = new Date().toISOString(); await saveD('invoices'); }; };
  m.querySelector('#iv_edit').onclick = () => { m.close(); S.av = { tab: 'Invoices', mode: 'inv', id }; PAGES.Accounts(); };
  if (m.querySelector('#iv_cancel')) m.querySelector('#iv_cancel').onclick = async () => { inv.status = 'Cancelled'; inv.cancelled_at = new Date().toISOString(); await saveD('invoices'); m.close(); toast('Bill cancelled. Its number is kept, as the law requires.'); PAGES.Accounts(); };
  if (!$('#page .tabs')) PAGES.Accounts();
}

/* ---------- payment, expense, client money ---------- */
function paymentModal(invoiceId, clientId) {
  const open = D.invoices.filter(i => invCalc(i).due > 0 && (!clientId || i.client_id === clientId));
  const m = modal(`<h2>Record payment</h2><div class="grid g2">
   <div class="span2"><label>Against bill</label><select id="pm_inv"><option value="">Advance / no bill</option>${open.map(i => `<option value="${i.id}" ${i.id === invoiceId ? 'selected' : ''}>${esc(i.no)} · ${esc((clientById(i.client_id) || {}).name)} · due ${money(invCalc(i).due)}</option>`).join('')}</select></div>
   <div class="span2"><label>Client *</label><select id="pm_client"><option value="">Select</option>${D.clients.map(c => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select></div>
   <div><label>Date *</label><input id="pm_date" type="date" value="${todayISO()}"></div><div><label>Amount received *</label><input id="pm_amt" inputmode="decimal"></div>
   <div><label>TDS deducted by client</label><input id="pm_tds" inputmode="decimal" placeholder="e.g. 10% under 194J"></div><div><label>Mode</label><select id="pm_mode">${opts(PAY_MODES, 'UPI')}</select></div>
   <div class="span2"><label>Reference (UTR / cheque no.)</label><input id="pm_ref"></div></div><div class="err" id="pm_err"></div>
   <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="pm_go">Save</button></div>`);
  const sync = () => { const i = D.invoices.find(x => x.id === $('#pm_inv').value); if (i) { $('#pm_client').value = i.client_id; if (!$('#pm_amt').value) $('#pm_amt').value = invCalc(i).due; } };
  $('#pm_inv').onchange = sync; sync();
  ['pm_amt', 'pm_tds'].forEach(k => $('#' + k).addEventListener('input', e => { const v = e.target.value.replace(/[^\d.]/g, ''); if (v !== e.target.value) e.target.value = v; }));
  m.querySelector('#pm_go').onclick = async () => {
    const o = { id: uid(), invoice_id: $('#pm_inv').value || null, client_id: $('#pm_client').value, date: $('#pm_date').value, amount: r2($('#pm_amt').value), tds: r2($('#pm_tds').value), mode: $('#pm_mode').value, ref: $('#pm_ref').value.trim(), created: new Date().toISOString() };
    if (!o.client_id) return $('#pm_err').textContent = 'Choose the client.'; if (!(o.amount > 0) && !(o.tds > 0)) return $('#pm_err').textContent = 'Enter the amount.'; if (!o.date) return $('#pm_err').textContent = 'Enter the date.';
    const i = D.invoices.find(x => x.id === o.invoice_id); if (i && o.amount + o.tds > invCalc(i).due + 0.5) return $('#pm_err').textContent = `This is more than the ${money(invCalc(i).due)} due on the bill.`;
    D.payments.push(o); await saveD('payments'); m.close(); toast('Payment recorded.'); redraw();
  };
}
function expenseModal() {
  const files = [];
  const m = modal(`<h2>Add expense</h2><div class="grid g2"><div><label>Date *</label><input id="ex_date" type="date" value="${todayISO()}"></div><div><label>Category *</label><select id="ex_cat">${opts(EXP_CATS, '', 'Select')}</select></div>
   <div class="span2"><label>Details</label><input id="ex_desc" placeholder="e.g. Court fee stamps for bail application"></div><div><label>Amount *</label><input id="ex_amt" inputmode="decimal"></div><div><label>Paid by</label><select id="ex_via">${opts(PAY_MODES, 'Cash')}</select></div>
   <div><label>For client (optional)</label><select id="ex_client"><option value="">Office expense</option>${D.clients.map(c => `<option value="${c.id}">${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select></div><div><label>Case</label><select id="ex_case"><option value="">-</option></select></div></div>
   <label class="check mt14"><input type="checkbox" id="ex_rec"> Recover this from the client (add to their next bill)</label>
   <div class="flex mt8"><button type="button" class="btn ghost sm" id="ex_att">Attach receipt</button><span class="small muted" id="ex_fl"></span></div><div class="err" id="ex_err"></div>
   <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="ex_go">Save</button></div>`);
  $('#ex_client').onchange = () => { $('#ex_case').innerHTML = '<option value="">-</option>' + D.cases.filter(k => k.client_id === $('#ex_client').value).map(k => `<option value="${k.id}">${esc(k.code)}</option>`).join(''); };
  $('#ex_att').onclick = async () => { const got = await call('addFiles', {}); files.push(...got); $('#ex_fl').textContent = files.map(f => f.filename).join(', '); };
  m.addEventListener('click', async e => { if ((e.target === m || e.target.hasAttribute('data-x')) && files.length) for (const f of files) await call('deleteFile', { fid: f.fid }); }, true);
  m.querySelector('#ex_go').onclick = async () => {
    const o = { id: uid(), date: $('#ex_date').value, category: $('#ex_cat').value, desc: $('#ex_desc').value.trim(), amount: r2($('#ex_amt').value.replace(/[^\d.]/g, '')), paid_via: $('#ex_via').value, client_id: $('#ex_client').value || null, case_id: $('#ex_case').value || null, recoverable: $('#ex_rec').checked, files: [...files], created: new Date().toISOString() };
    if (!o.category) return $('#ex_err').textContent = 'Choose the category.'; if (!(o.amount > 0)) return $('#ex_err').textContent = 'Enter the amount.';
    if (o.recoverable && !o.client_id) return $('#ex_err').textContent = 'Choose the client to recover it from.';
    files.length = 0; D.expenses.push(o); await saveD('expenses'); m.close(); toast('Expense saved.'); redraw();
  };
}
function clientMoneyModal(clientId) {
  const m = modal(`<h2>Client money entry</h2><div class="grid g2"><div class="span2"><label>Client *</label><select id="cm_client"><option value="">Select</option>${D.clients.map(c => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.code + ' · ' + c.name)}</option>`).join('')}</select></div>
   <div><label>Type *</label><select id="cm_type"><option>Received</option><option>Paid out</option><option>Refunded</option></select></div><div><label>Date</label><input id="cm_date" type="date" value="${todayISO()}"></div>
   <div><label>Amount *</label><input id="cm_amt" inputmode="decimal"></div><div><label>Mode</label><select id="cm_mode">${opts(PAY_MODES, 'NEFT / RTGS / IMPS')}</select></div>
   <div class="span2"><label>Purpose *</label><input id="cm_purpose" placeholder="e.g. Court fee for appeal; decree amount received"></div></div><div class="err" id="cm_err"></div>
   <div class="flex end mt14"><button class="btn ghost" data-x>Cancel</button><button class="btn" id="cm_go">Save</button></div>`);
  m.querySelector('#cm_go').onclick = async () => {
    const o = { id: uid(), client_id: $('#cm_client').value, type: $('#cm_type').value, date: $('#cm_date').value, amount: r2($('#cm_amt').value.replace(/[^\d.]/g, '')), mode: $('#cm_mode').value, purpose: $('#cm_purpose').value.trim(), created: new Date().toISOString() };
    if (!o.client_id || !(o.amount > 0) || !o.purpose) return $('#cm_err').textContent = 'Client, amount and purpose are needed.';
    const bal = D.client_money.filter(x => x.client_id === o.client_id).reduce((s, x) => s + (x.type === 'Received' ? +x.amount : -x.amount), 0);
    if (o.type !== 'Received' && o.amount > bal + 0.5) return $('#cm_err').textContent = `Only ${money(bal)} of this client's money is held. You cannot pay out more than that.`;
    D.client_money.push(o); await saveD('client_money'); m.close(); toast('Entry saved.'); redraw();
  };
}

/* ---------- links from client and case pages ---------- */
const _cd4 = clientDetail;
clientDetail = function (id) {
  _cd4(id); const c = clientById(id); if (!c) return;
  const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'New bill'; b.onclick = () => { S.tab = 'Accounts'; S.av = { tab: 'Invoices', mode: 'inv', id: null, client: id }; shellView(); };
  const bar = $('#page .top .flex'); if (bar) bar.prepend(b);
  if ((S.cv.tab || 'Overview') === 'Overview') {
    const is = D.invoices.filter(i => i.client_id === id); const t = is.map(invCalc);
    const card = $('#page .card h2'); const ins = [...$$('#page .card h2')].find(h => h.textContent === 'Insights');
    if (ins) ins.parentNode.insertAdjacentHTML('beforeend', `<div class="row"><span class="muted">Fees billed / received / due</span><span>${money(t.filter((_, i) => is[i].doc_type !== 'Proforma Invoice').reduce((s, x) => s + x.total, 0))} / ${money(D.payments.filter(p => p.client_id === id).reduce((s, p) => s + +p.amount, 0))} / <b>${money(t.reduce((s, x) => s + x.due, 0))}</b></span></div>`);
  }
};
const _kd4 = caseDetail;
caseDetail = function (id) {
  _kd4(id); const k = caseById(id); if (!k) return;
  const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'New bill'; b.onclick = () => { S.tab = 'Accounts'; S.av = { tab: 'Invoices', mode: 'inv', id: null, client: k.client_id, case: id }; shellView(); };
  const bar = $('#page .top .flex'); if (bar) bar.prepend(b);
  const det = [...$$('#page .card h2')].find(h => h.textContent === 'Case details');
  if (det) { const is = D.invoices.filter(i => i.case_id === id && i.doc_type !== 'Proforma Invoice' && i.status !== 'Cancelled'); const billed = is.reduce((s, i) => s + invCalc(i).total, 0); const recd = D.payments.filter(p => is.some(i => i.id === p.invoice_id)).reduce((s, p) => s + +p.amount, 0);
    det.parentNode.insertAdjacentHTML('beforeend', `<div class="row"><span class="muted">Billed / received for this case</span><span>${money(billed)} / ${money(recd)}${k.fee ? ` <span class="small muted">of ${money(k.fee)} agreed</span>` : ''}</span></div>`); }
};
