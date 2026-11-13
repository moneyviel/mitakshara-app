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
  doc_groups: ['Identity & KYC', 'Vakalatnama & Authority', 'Police / FIR', 'Court Filings', 'Orders & Judgments', 'Evidence', 'Notices & Letters', 'Property', 'Financial', 'Medical', 'Agreements', 'Family & Personal', 'Others'],
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
};
