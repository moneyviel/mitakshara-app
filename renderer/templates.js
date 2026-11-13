'use strict';
/* Built-in drafting templates. {{name}} is filled from the client, the case and Practice details;
   extra fields are asked for in the form. Lines starting with "# " print as centred headings.
   These are starting points: always read and adapt before filing. */
const TEMPLATES = [
  { id: 'vakalatnama', name: 'Vakalatnama', cat: 'Court papers', fields: [],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# VAKALATNAMA

I/We, {{client_name}} {{client_relation}} {{client_parent}}, aged about {{client_age}} years, resident of {{client_address}}, the {{our_side}} in the above matter, do hereby appoint and retain {{adv_name}}, Advocate (Enrolment No. {{adv_enrolment}}), to appear, plead and act for me/us in the above matter and in all proceedings connected with it, including applications, appeals, revisions, execution and withdrawal of documents and money, and to sign and file all papers on my/our behalf.

I/We agree to ratify all acts done by the said Advocate in pursuance of this authority.

Place: {{place}}
Date: {{today}}

(Signature of {{our_side}})                              Accepted
{{client_name}}                                          {{adv_name}}, Advocate
                                                         Enrolment No. {{adv_enrolment}}
                                                         {{adv_address}} · {{adv_phone}}` },
  { id: 'appearance', name: 'Memo of Appearance', cat: 'Court papers', fields: [],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# MEMO OF APPEARANCE

Sir/Madam,
Kindly take notice that I, {{adv_name}}, Advocate, appear on behalf of {{client_name}}, the {{our_side}} in the above matter. Kindly record my appearance and serve all notices and papers on me at the address below.

Place: {{place}}
Date: {{today}}
                                                         {{adv_name}}, Advocate
                                                         Enrolment No. {{adv_enrolment}}
                                                         {{adv_address}} · {{adv_phone}} · {{adv_email}}` },
  { id: 'adjournment', name: 'Application for adjournment', cat: 'Applications', fields: [['reason', 'Reason for adjournment', 'the counsel for the applicant is unwell'], ['hearing_date', 'Date fixed for hearing', '{{next_date}}']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# APPLICATION FOR ADJOURNMENT ON BEHALF OF THE {{our_side_upper}}

Respectfully submitted:
1. That the above matter is fixed for hearing on {{hearing_date}}.
2. That on the said date {{reason}}, and therefore the applicant is unable to proceed with the matter.
3. That the absence is neither intentional nor deliberate, and no prejudice will be caused to the other side if a short adjournment is granted.

PRAYER
It is therefore prayed that the matter may kindly be adjourned to a suitable date, in the interest of justice.

Place: {{place}}
Date: {{today}}
                                                         {{client_name}} ({{our_side}})
                                                         Through: {{adv_name}}, Advocate` },
  { id: 'exemption', name: 'Exemption from personal appearance (Sec. 228 BNSS)', cat: 'Criminal', fields: [['reason', 'Reason the accused cannot attend', 'is unwell and has been advised bed rest']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# APPLICATION UNDER SECTION 228 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR EXEMPTION FROM PERSONAL APPEARANCE OF THE ACCUSED

Respectfully submitted:
1. That the above case is pending before this Hon'ble Court and is fixed for {{next_date}}.
2. That the accused, {{client_name}}, {{reason}}, and is therefore unable to appear in person on the said date.
3. That the accused is duly represented by counsel and undertakes not to dispute identity and to appear whenever directed by this Hon'ble Court.

PRAYER
It is prayed that the personal appearance of the accused may kindly be exempted for the said date, in the interest of justice.

Place: {{place}}
Date: {{today}}
                                                         {{client_name}} (Accused)
                                                         Through: {{adv_name}}, Advocate` },
  { id: 'bail', name: 'Regular bail application (Sec. 483 BNSS)', cat: 'Criminal', fields: [['fir_no', 'FIR number and year', ''], ['police_station', 'Police station', ''], ['sections', 'Sections', ''], ['custody_since', 'In custody since', ''], ['grounds', 'Main grounds (one per line)', 'The applicant is innocent and has been falsely implicated.\nInvestigation is complete and the applicant is no longer required for custodial interrogation.\nThe applicant has deep roots in society and there is no likelihood of absconding.\nThe applicant undertakes to abide by all conditions imposed by this Hon\'ble Court.']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# Bail Application No. ____ of {{case_year}}
{{client_name}} {{client_relation}} {{client_parent}}, aged about {{client_age}} years, resident of {{client_address}}        ... Applicant / Accused
Versus
{{opposite_party}}        ... Respondent

FIR No. {{fir_no}}, Police Station {{police_station}}, under Sections {{sections}}

# APPLICATION FOR REGULAR BAIL UNDER SECTION 483 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023

Respectfully submitted:
1. That the applicant has been in judicial custody since {{custody_since}} in connection with the above FIR.
{{grounds_numbered}}

PRAYER
It is therefore most respectfully prayed that the applicant may kindly be released on bail on such terms and conditions as this Hon'ble Court deems fit, in the interest of justice.

Place: {{place}}
Date: {{today}}
                                                         Applicant
                                                         Through: {{adv_name}}, Advocate` },
  { id: 'anticipatory', name: 'Anticipatory bail application (Sec. 482 BNSS)', cat: 'Criminal', fields: [['fir_no', 'FIR number and year', ''], ['police_station', 'Police station', ''], ['sections', 'Sections', ''], ['grounds', 'Main grounds (one per line)', 'The applicant apprehends arrest in the above FIR.\nThe allegations are false and the dispute is essentially civil in nature.\nThe applicant is ready to join and co-operate with the investigation.\nThe applicant has no criminal antecedents.']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# Anticipatory Bail Application No. ____ of {{case_year}}
{{client_name}} {{client_relation}} {{client_parent}}, aged about {{client_age}} years, resident of {{client_address}}        ... Applicant
Versus
{{opposite_party}}        ... Respondent

FIR No. {{fir_no}}, Police Station {{police_station}}, under Sections {{sections}}

# APPLICATION UNDER SECTION 482 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR GRANT OF ANTICIPATORY BAIL

Respectfully submitted:
{{grounds_numbered}}

PRAYER
It is therefore prayed that in the event of arrest, the applicant may kindly be released on bail on such conditions as this Hon'ble Court deems fit, in the interest of justice.

Place: {{place}}
Date: {{today}}
                                                         Applicant
                                                         Through: {{adv_name}}, Advocate` },
  { id: 'notice_recovery', name: 'Legal notice: recovery of money', cat: 'Notices & letters', fields: [['amount', 'Amount due (Rs.)', ''], ['basis', 'How the amount became due', 'goods supplied / services rendered under invoices'], ['days', 'Days given to pay', '15'], ['interest', 'Interest claimed (% per year)', '18']],
    body: `{{adv_name}}, Advocate
{{adv_address}} · {{adv_phone}}

Date: {{today}}
By Registered Post A.D. / Speed Post / Email

To,
{{opposite_party}}

# LEGAL NOTICE

Under instructions from and on behalf of my client, {{client_name}}, resident of {{client_address}}, I serve upon you the following notice:
1. That my client is owed a sum of Rs. {{amount}} by you towards {{basis}}.
2. That despite repeated requests and reminders, you have failed and neglected to pay the said amount.
3. I therefore call upon you to pay the said sum of Rs. {{amount}}, with interest at {{interest}}% per annum from the due date until payment, within {{days}} days of receipt of this notice.
4. Take notice that if you fail to do so, my client shall be constrained to initiate appropriate civil and/or criminal proceedings against you, entirely at your risk as to costs and consequences.

A copy of this notice is retained in my office for further action.

                                                         {{adv_name}}, Advocate
                                                         for {{client_name}}` },
  { id: 'notice_reply', name: 'Reply to legal notice', cat: 'Notices & letters', fields: [['notice_date', 'Date of their notice', ''], ['sender', 'Notice sent by (advocate / party)', ''], ['points', 'Our answers (one per line)', 'The contents of the notice are denied in toto, save what is specifically admitted herein.\nMy client does not owe any amount as alleged.']],
    body: `{{adv_name}}, Advocate
{{adv_address}} · {{adv_phone}}

Date: {{today}}

To,
{{sender}}

# REPLY TO YOUR LEGAL NOTICE DATED {{notice_date}}

Under instructions from my client, {{client_name}}, I reply to your notice as follows:
{{points_numbered}}

You are therefore called upon to withdraw the said notice. My client reserves all rights to take appropriate legal action, including for costs.

                                                         {{adv_name}}, Advocate
                                                         for {{client_name}}` },
  { id: 'affidavit', name: 'Affidavit (general)', cat: 'Court papers', fields: [['statements', 'Statements (one per line)', 'That I am the deponent in the above matter and am well conversant with the facts of the case.']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# AFFIDAVIT

I, {{client_name}} {{client_relation}} {{client_parent}}, aged about {{client_age}} years, resident of {{client_address}}, do hereby solemnly affirm and state as under:
{{statements_numbered}}

DEPONENT

# VERIFICATION
Verified at {{place}} on {{today}} that the contents of the above affidavit are true and correct to my knowledge and belief, no part of it is false and nothing material has been concealed.

DEPONENT` },
  { id: 'certified_copy', name: 'Application for certified copy', cat: 'Applications', fields: [['documents', 'Copies required of', 'the order dated ____']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# APPLICATION FOR CERTIFIED COPY

Respectfully submitted that the applicant, {{client_name}}, the {{our_side}} in the above matter, requires certified copies of {{documents}} for the purpose of further legal proceedings. The requisite fee / stamps are affixed / will be paid.

It is prayed that certified copies of the above may kindly be supplied at the earliest.

Date: {{today}}
                                                         {{client_name}} ({{our_side}})
                                                         Through: {{adv_name}}, Advocate` },
  { id: 'inspection', name: 'Application for inspection of record', cat: 'Applications', fields: [['purpose', 'Purpose of inspection', 'preparing the case for arguments']],
    body: `# IN THE COURT OF {{court}}, {{court_place}}
# {{case_type}} No. {{case_no}}/{{case_year}}
{{case_title}}

# APPLICATION FOR INSPECTION OF THE RECORD

Respectfully submitted that the counsel for the {{our_side}} wishes to inspect the judicial record of the above matter for the purpose of {{purpose}}. The prescribed fee is being paid.

It is prayed that inspection of the record may kindly be permitted.

Date: {{today}}
                                                         {{adv_name}}, Advocate for the {{our_side}}` },
  { id: 'client_update', name: 'Letter to client: hearing update', cat: 'Notices & letters', fields: [['what_happened', 'What happened on the last date', ''], ['bring', 'What the client should bring / do', 'Please be present in court on time with your original ID.']],
    body: `{{adv_name}}, Advocate
{{adv_address}} · {{adv_phone}}

Date: {{today}}

To,
{{client_name}}
{{client_address}}

Subject: Your case {{case_title}} ({{case_type}} No. {{case_no}}/{{case_year}}), {{court}}

Dear {{client_name}},
On the last date of hearing, {{what_happened}}
The next date fixed in your case is {{next_date}}.
{{bring}}

Please call the office if you have any questions.

Regards,
{{adv_name}}` },
  { id: 'engagement', name: 'Engagement letter / fee agreement', cat: 'Notices & letters', fields: [['scope', 'Work covered', 'conducting the above matter up to final disposal before the trial court'], ['fee', 'Professional fee (Rs.)', ''], ['payment', 'Payment terms', '50% in advance and the balance before final arguments']],
    body: `{{adv_name}}, Advocate
{{adv_address}} · {{adv_phone}}

Date: {{today}}

To,
{{client_name}}
{{client_address}}

# LETTER OF ENGAGEMENT

Dear {{client_name}},
Thank you for engaging me in the matter {{case_title}}.
1. Scope of work: {{scope}}.
2. Professional fee: Rs. {{fee}}, payable as follows: {{payment}}.
3. Court fees, stamp papers, certified copies, travel and similar expenses are extra and will be charged at actual cost.
4. Appeals, revisions and separate proceedings are not included and will be agreed separately.
5. The result of any case cannot be guaranteed. I will keep you informed of every date and development.

Kindly sign a copy of this letter as your acceptance.

{{adv_name}}, Advocate                                   Accepted: {{client_name}}` },
];
