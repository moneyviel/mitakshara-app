'use strict';
/* Starting dropdown lists. All of them can be edited in Settings > Lists. */
const DEFAULT_LISTS = {
  client_types: ['Individual', 'Company', 'Partnership firm', 'LLP', 'Proprietorship', 'HUF', 'Trust', 'Society', 'Government body', 'Other'],
  relations: ['S/o', 'D/o', 'W/o', 'C/o'],
  genders: ['Male', 'Female', 'Transgender', 'Prefer not to say'],
  id_types: ['Aadhaar', 'PAN', 'Voter ID', 'Passport', 'Driving Licence', 'Ration Card', 'Other'],
  languages: ['Hindi', 'English', 'Marathi', 'Gujarati', 'Punjabi', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Odia', 'Urdu', 'Rajasthani'],
  referral_sources: ['Existing client', 'Family / friend', 'Another advocate', 'Walk-in', 'Phone call', 'Court premises', 'Other'],
  family_relations: ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Relative', 'Friend', 'Employee', 'Other'],
  doc_status: ['Received', 'Pending', 'Not required'],
  states: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'],
  case_categories: ['Criminal', 'Civil', 'Family / Matrimonial', 'Labour', 'Consumer', 'Cheque bounce (NI Act)', 'Motor accident (MACT)', 'Revenue', 'Writ / Constitutional', 'Arbitration', 'Tax', 'Other'],
  case_types: ['Bail Application', 'Anticipatory Bail', 'Criminal Trial', 'Complaint Case', 'Criminal Revision', 'Criminal Appeal', 'Quashing Petition', 'Civil Suit', 'Injunction Suit', 'Civil Appeal', 'Civil Revision', 'Execution', 'Writ Petition', 'Divorce Petition', 'Maintenance', 'Domestic Violence', 'Child Custody', 'Consumer Complaint', 'Labour Dispute', 'Cheque Bounce Complaint', 'MACT Claim', 'Arbitration Petition', 'Other'],
  court_levels: ['Supreme Court', 'High Court', 'District & Sessions Court', 'Civil Judge / Magistrate', 'Family Court', 'Consumer Commission', 'Labour Court / Tribunal', 'Revenue Court', 'Other Tribunal (NCLT, DRT, etc.)', 'Other'],
  our_sides: ['Petitioner', 'Respondent', 'Plaintiff', 'Defendant', 'Appellant', 'Accused', 'Complainant', 'Applicant', 'Opposite Party', 'Intervenor'],
  case_stages: ['Filing', 'Notice / Summons', 'Appearance', 'Reply / Written statement', 'Framing of issues / charges', 'Evidence', 'Arguments', 'Reserved for orders', 'Judgment', 'Execution'],
  hearing_purposes: ['Admission', 'Notice / Summons', 'Appearance', 'Bail hearing', 'Reply / Written statement', 'Interim application', 'Framing of issues / charges', 'Evidence', 'Cross-examination', 'Arguments', 'Final arguments', 'Orders', 'Judgment', 'Compliance', 'Mention'],
  hearing_outcomes: ['Adjourned', 'Heard, next date given', 'Part heard', 'Reserved for orders', 'Interim order passed', 'Final order / judgment (case ends)'],
  adjourn_reasons: ["At our request", "At other side's request", 'Judge on leave', 'Court time over', "Lawyers' strike", 'Record / papers not ready', 'Witness absent', 'Party / accused absent', 'Other'],
  final_results: ['Won', 'Partly won', 'Lost', 'Settled / compromise', 'Withdrawn', 'Disposed otherwise'],
  checklist_items: ['Case file / brief ready', 'Vakalatnama filed', 'Copies for court and other side', 'Client informed of date', 'Client / witness to attend', 'Court fee / stamps', 'Original documents', 'Last order sheet read', 'Citations / judgments printed', 'Junior / clerk briefed'],
  team_roles: ['Senior Advocate', 'Associate Advocate', 'Junior Advocate', 'Clerk / Munshi', 'Intern', 'Office staff'],
  duties: ['Arguments', 'Drafting', 'Research', 'Attend dates', 'Note next date', 'Inform client', 'Filing', 'Certified copies', 'Cause list check', 'Court fee & stamps', 'Accounts'],
  doc_groups: ['Identity & KYC', 'Vakalatnama & Authority', 'Police / FIR', 'Court Filings', 'Orders & Judgments', 'Evidence', 'Notices & Letters', 'Property', 'Financial', 'Medical', 'Agreements', 'Family & Personal', 'Research & Judgments', 'Others'],
};
/* Common document names, used as typing suggestions until the user's own history takes over. */
const SEED_DOCS = {
  'Identity & KYC': ['Aadhaar Card', 'PAN Card', 'Voter ID', 'Passport', 'Driving Licence', 'Passport-size Photograph', 'Address Proof'],
  'Vakalatnama & Authority': ['Vakalatnama', 'Memo of Appearance', 'Power of Attorney', 'Board Resolution', 'Authority Letter', 'No Objection Certificate (NOC)'],
  'Police / FIR': ['FIR Copy', 'Complaint Copy', 'Charge Sheet', 'Arrest Memo', 'Seizure Memo', 'Case Diary Extract', 'Bail Bond', 'Surety Documents', 'Police Notice'],
  'Court Filings': ['Plaint', 'Written Statement', 'Petition', 'Bail Application', 'Anticipatory Bail Application', 'Affidavit', 'Reply', 'Rejoinder', 'Appeal Memo', 'Revision Petition', 'Interim Application', 'Synopsis and List of Dates'],
  'Orders & Judgments': ['Order Sheet', 'Interim Order', 'Bail Order', 'Judgment', 'Decree', 'Certified Copy', 'Stay Order'],
  'Evidence': ['Photographs', 'Video Recording', 'Audio Recording', 'CCTV Footage', 'Call Detail Records', 'WhatsApp Chats', 'Witness Statement', 'Section 63 BSA Certificate'],
  'Notices & Letters': ['Legal Notice', 'Reply to Legal Notice', 'Summons', 'Postal Receipt', 'Acknowledgement Card', 'Email Correspondence'],
  'Property': ['Sale Deed', 'Title Deed', 'Jamabandi / Khatauni', 'Mutation Record', 'Rent Agreement', 'Property Tax Receipt', 'Site Plan', 'Encumbrance Certificate'],
  'Financial': ['Bank Statement', 'Cheque Copy', 'Cheque Return Memo', 'Salary Slips', 'Income Tax Return', 'Invoice', 'Loan Agreement'],
  'Medical': ['Medical Certificate', 'MLC Report', 'Post-mortem Report', 'Discharge Summary', 'Prescription'],
  'Agreements': ['Agreement', 'Memorandum of Understanding', 'Employment Contract', 'Appointment Letter', 'Settlement Deed', 'Partnership Deed'],
  'Family & Personal': ['Marriage Certificate', 'Birth Certificate', 'Death Certificate', 'Legal Heir Certificate', 'Divorce Decree', 'Will'],
  'Others': [],
};
const LIST_LABELS = {
  doc_groups: 'Document groups', referral_sources: 'Referred by', languages: 'Languages', id_types: 'ID proof types',
  client_types: 'Client types', family_relations: 'Family contact relations',
  case_categories: 'Case categories', case_types: 'Case types', court_levels: 'Courts (level)', case_stages: 'Case stages', hearing_purposes: 'Hearing purposes',
  adjourn_reasons: 'Adjournment reasons', checklist_items: 'Pre-hearing checklist', team_roles: 'Team roles', duties: 'Team duties',
};
/* Short letters used in case codes, e.g. C26-0001/01-CR */
const CAT_CODE = { 'Criminal': 'CR', 'Civil': 'CV', 'Family / Matrimonial': 'MT', 'Labour': 'LB', 'Consumer': 'CS', 'Cheque bounce (NI Act)': 'NI', 'Motor accident (MACT)': 'MA', 'Revenue': 'RV', 'Writ / Constitutional': 'WR', 'Arbitration': 'AR', 'Tax': 'TX', 'Other': 'OT' };
/* Duties each role usually has; can be changed per person. */
const ROLE_DUTIES = {
  'Senior Advocate': ['Arguments', 'Drafting', 'Research'],
  'Associate Advocate': ['Arguments', 'Drafting', 'Research', 'Attend dates'],
  'Junior Advocate': ['Attend dates', 'Note next date', 'Inform client', 'Research'],
  'Clerk / Munshi': ['Filing', 'Certified copies', 'Cause list check', 'Court fee & stamps'],
  'Intern': ['Research', 'Drafting'],
  'Office staff': ['Inform client', 'Accounts'],
};
