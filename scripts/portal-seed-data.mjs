// Seed and test data for the JobPoint CV–JD matching engine.
//
// Everything here is fictional: the people, employers ("Example …", "Sample …",
// "Demo …", "Fictional …"), email addresses (example.com / example.in only) and
// phone numbers (+91 90000 1XXXX). Public education boards and universities are
// named only so the CVs read like real Indian CVs. Software names such as Tally
// or SAP appear only as skills.
//
// CVS[].text is the plain text as it would come out of extraction. Scanned CVs
// have no text layer, so their text is "".
// JDS[].relevance grades each CV for that JD: 3 = excellent, 2 = good,
// 1 = partial; CVs not listed are 0 (not relevant).

const ACC_04_TEXT = `Moumita Saha
moumita.saha@example.com | +91 90000 10004 | Bidhannagar, Durgapur

CAREER OBJECTIVE
Seeking a position as Accounts Executive in a manufacturing or trading company where my 3+ years of experience in Tally, GST and TDS can add value, and where I can take on more responsibility in compliance.

EXPERIENCE

Accounts Executive, Fictional Refractories Ltd, Durgapur (Feb 2023 – Present)
• Handle accounts payable for 150+ vendors; verify bills against PO and GRN before booking them in Tally Prime.
• Prepare the monthly GSTR-3B working and GSTR-1 data; reconcile ITC with GSTR-2B in Excel using VLOOKUP and pivot tables.
• Compute TDS on vendor payments (194C, 194J, 194I), generate challans and keep 26Q data ready for the CA every quarter.
• Daily bank reconciliation and preparation of payment advice for the treasury team.
• Assisted in the statutory audit for FY 2024-25 – prepared ledger schedules and updated the fixed asset register.

Accounts Trainee, Demo Cement Agencies, Durgapur (Jun 2022 – Jan 2023)
• Sales invoicing and receipt entry in Tally ERP 9; cash handling and daily cash book.
• Prepared party-wise outstanding statements for the proprietor.

SKILLS
Tally Prime, Tally ERP 9, GST, TDS, Accounts Payable, Bank Reconciliation, MS Excel, Fixed Asset Register

EDUCATION
B.Com (Hons) in Accounting & Finance – Kazi Nazrul University, 2022
Higher Secondary – WBCHSE, 2019
Madhyamik – WBBSE, 2017

Present salary: Rs. 24,000 per month
Expected CTC: 3.6 LPA
Notice Period: 15 days

PERSONAL DETAILS
Date of Birth: 21-07-2001
Gender: Female
Marital Status: Married
Religion: Hindu
Father's Name: Sri Prabir Saha
Nationality: Indian`;

// Same person re-uploading: "+jobs" email alias and two small edits.
const ACC_05_TEXT = ACC_04_TEXT
  .replace("moumita.saha@example.com", "moumita.saha+jobs@example.com")
  .replace("MS Excel, Fixed Asset Register", "MS Excel (Power Query basics), Fixed Asset Register")
  .replace("Expected CTC: 3.6 LPA", "Expected CTC: 3.8 LPA");

export const CVS = [
  // ───────────────────────── Accounts / finance (8) ─────────────────────────
  {
    key: "acc-01",
    format: "pdf",
    notes: "Accounts Executive, ~4.3 yrs, Durgapur; Tally/GST/TDS/Excel used at work; 3.2 LPA, 30-day notice; has Personal Details block.",
    text: `SOURAV MONDAL
sourav.mondal@example.com | +91 90000 10001 | Durgapur, West Bengal

PROFESSIONAL SUMMARY
Accounts Executive with 4+ years of hands-on experience in day-to-day accounting, GST compliance and TDS for trading firms in Durgapur. Comfortable working independently in Tally Prime and MS Excel and coordinating with the company's CA for monthly closing.

WORK EXPERIENCE
Accounts Executive | Example Steel Traders Pvt Ltd, Durgapur
Apr 2024 – Present
• Maintain complete books in Tally Prime – purchase, sales, journal, payment and receipt vouchers (approx. 600 entries a month).
• Prepare and file GSTR-1 and GSTR-3B every month; reconcile input tax credit with GSTR-2B before filing and follow up with suppliers on mismatches.
• Calculate TDS under sections 194C, 194J and 194Q, deposit challans on time and prepare data for quarterly 26Q returns.
• Bank reconciliation for three current accounts; debtor follow-up reduced outstanding above 90 days by about 20%.
• Prepare monthly MIS in Excel (VLOOKUP, pivot tables) on sales, collections and stock for the director.

Junior Accountant | Sample Hardware & Electricals, Durgapur
Jul 2022 – Mar 2024
• Voucher entry in Tally ERP 9, cash book and petty cash.
• Generated sales invoices and e-way bills; prepared GST sales and purchase registers for the tax consultant.

KEY SKILLS
Tally Prime / Tally ERP 9, GST returns & ITC reconciliation, TDS, Bank Reconciliation, Accounts Payable / Receivable, MS Excel (VLOOKUP, Pivot), E-way bill

EDUCATION
B.Com (Accountancy Hons.) – The University of Burdwan, 2022 – 61%
Higher Secondary (WBCHSE) – 2019
Madhyamik (WBBSE) – 2017

Current CTC: 3.2 LPA
Expected CTC: 4 LPA
Notice Period: 30 days
Preferred Location: Durgapur, Asansol

PERSONAL DETAILS
Date of Birth: 14/03/2001
Gender: Male
Marital Status: Unmarried
Religion: Hindu
Father's Name: Tapan Kumar Mondal
Nationality: Indian
Languages Known: Bengali, Hindi, English`,
  },
  {
    key: "acc-02",
    format: "docx",
    notes: "Senior Accountant, ~7.8 yrs, Asansol; Tally/GST/TDS, team of 2; no CTC stated; 30-day notice; slightly above the 2-5 yr band.",
    text: `Priyanka Ghosh
priyanka.ghosh.acc@example.in | +91 90000 10002 | Asansol, Paschim Bardhaman

Profile Summary
M.Com with over 7 years in accounts and statutory compliance for logistics and food processing companies. Handled books up to trial balance, GST and TDS compliance and audit coordination. Currently leading a small accounts team.

Employment History

Senior Accountant – Demo Coal Logistics Pvt Ltd, Asansol
06/2023 - Present
• Finalise accounts up to trial balance in Tally Prime (multi-location, cost centres) and coordinate with statutory and GST auditors.
• Responsible for GSTR-1, GSTR-3B and annual GSTR-9 data; monthly ITC reconciliation with GSTR-2B.
• TDS on transporter and professional payments, challan deposit, quarterly 26Q and 24Q returns and issue of Form 16A / 16.
• Supervise two junior accountants and review their vouchers daily.
• Vendor payment planning and weekly cash flow statement in Excel.

Accountant – Sample Agro Foods Pvt Ltd, Raniganj
08/2020 - 05/2023
• Purchase and sales accounting, stock valuation and godown-wise inventory in Tally ERP 9.
• Prepared GST returns and e-way bills; handled department queries during GST scrutiny.
• Bank and party ledger reconciliation every month.

Accounts Assistant – Fictional Motors (Two-wheeler Dealership), Asansol
01/2019 - 07/2020
• Cash counter, daily cash book, receipt vouchers and bank deposits.
• Reconciliation of finance company (hypothecation) payouts.

Technical Skills
Tally Prime, Tally ERP 9, GST, TDS (TRACES), Advanced Excel, Finalisation of Accounts, Audit Support

Educational Qualification
M.Com – The University of Burdwan (2018)
B.Com (Hons) – Kazi Nazrul University (2016)
Higher Secondary – WBCHSE (2013)
Madhyamik – WBBSE (2011)

Notice Period: 30 days
Preferred Location: Asansol / Durgapur

Languages Known: Bengali, Hindi, English`,
  },
  {
    key: "acc-03",
    format: "pdf",
    notes: "Accounts Assistant, ~3 yrs, Bardhaman; Tally/GST/TDS entries; 2.4 LPA, 15-day notice, willing to relocate to Durgapur; has Personal Details block.",
    text: `ARIJIT BANERJEE
Email: arijit.banerjee93@example.com | Mob: +91 90000 10003 | Bardhaman (Purba Bardhaman), WB

Career Objective
To work as an accounts professional in a growing organisation where I can use my knowledge of Tally, GST and TDS and grow along with the company.

Work Experience
Accounts Assistant
Sample Rice Mills Pvt Ltd, Bardhaman
May 2024 – Present
• Daily entry of purchase (paddy), sales and expense vouchers in Tally ERP 9.
• Prepare the GST sales register and HSN summary for GSTR-1; match purchase bills with GSTR-2B.
• Deduct TDS on contractor and transport bills (194C) and pass entries; share data with the consultant for return filing.
• Maintain debtor and creditor ledgers and send monthly statements to parties.
• Excel sheets for daily stock and bag-wise production report.

Accounts Trainee
Demo & Associates, Chartered Accountants, Bardhaman
Nov 2023 to Apr 2024
• Book-keeping for small clients in Tally, bank statement entries and ITR data collection.

Key Skills
• Tally ERP 9 / Tally Prime
• GST (GSTR-1 data, 2B matching)
• TDS entries (194C)
• MS Excel, MS Word
• Ledger scrutiny

Educational Qualification
B.Com (General), The University of Burdwan – 2023
Higher Secondary (Commerce), WBCHSE – 2020
Madhyamik, WBBSE – 2018

Current CTC: 2.4 LPA | Expected: 3.2 LPA
Notice Period: 15 days
Willing to relocate: Yes (Durgapur preferred)

Personal Details
Date of Birth: 02/09/2002
Gender: Male
Marital Status: Single
Religion: Hindu
Father's Name: Late Ashok Banerjee
Nationality: Indian`,
  },
  {
    key: "acc-04",
    format: "docx",
    notes: "DUPLICATE PAIR (first upload, pairs with acc-05): Accounts Executive, ~4.4 yrs, Durgapur; Tally/GST/TDS/Excel; Rs 24,000/month, 15-day notice; has Personal Details block.",
    text: ACC_04_TEXT,
  },
  {
    key: "acc-05",
    format: "pdf",
    notes: "DUPLICATE PAIR (second upload of acc-04): same person, email alias moumita.saha+jobs@example.com, Excel line and expected CTC edited; has Personal Details block.",
    text: ACC_05_TEXT,
  },
  {
    key: "acc-06",
    format: "pdf",
    notes: "Finance Manager, ~13.6 yrs, Kolkata; SAP FICO, team of 9; 14 LPA, 90-day notice, Kolkata only; too senior and far above an executive band.",
    text: `DEBASHIS CHATTERJEE
debashis.chatterjee@example.in | +91 90000 10006 | Behala, Kolkata

PROFESSIONAL SUMMARY
Finance professional (CA Inter, M.Com) with 13+ years across infrastructure, paper and export companies. Leads a team of 9 handling accounts, taxation, budgeting and SAP FICO-based reporting. Strong in month-end close, statutory audit and banking relationships.

WORK EXPERIENCE
Finance Manager | Example Infra Projects Ltd, Kolkata | Apr 2020 – Present
• Head the accounts and taxation team of 9; month-end close in SAP FICO within 5 working days.
• Prepare the annual budget and monthly variance analysis for management and the board.
• Oversee GST compliance for 4 state registrations and TDS compliance across 40+ project sites.
• Manage working capital limits and LC/BG facilities with three banks; reduced interest cost by 0.6% through renegotiation.
• Point of contact for statutory, internal and tax audits.

Assistant Manager – Accounts | Sample Paper Mills Ltd, Howrah | 2016 – 2020
• Led the SAP FICO go-live for the accounts module (GL, AP, AR, asset accounting).
• Costing support, stock valuation and quarterly results schedules.

Accountant | Demo Tea Exports Pvt Ltd, Kolkata | 2013 – 2016
• Export documentation, foreign currency realisation, Tally ERP 9 accounting and duty drawback claims.

SKILLS
SAP FICO, Tally, GST, TDS, Budgeting & MIS, Financial Statements (Ind AS), Audit Management, Team Leadership, Advanced Excel

EDUCATION
CA Intermediate – ICAI (2014)
M.Com – University of Calcutta (2013)
B.Com (Hons) – University of Calcutta (2011)

Current CTC: 14 LPA | Expected CTC: 17 LPA
Notice Period: 90 days
Preferred Location: Kolkata only`,
  },
  {
    key: "acc-07",
    format: "docx",
    notes: "FRESHER: B.Com 2026, Durgapur, 3-month CA-firm internship in Tally/GST; expects 2.2 LPA, immediate joiner; has Personal Details block.",
    text: `Ankita Roy
ankita.roy2004@example.com | +91 90000 10007 | City Centre, Durgapur

Career Objective
A B.Com graduate looking for an entry-level role in accounts where I can apply the practical knowledge of Tally Prime and GST I gained during my internship, and keep learning on the job.

Internship
Accounts Intern – Demo & Co., Chartered Accountants, Durgapur
Jan 2026 – Mar 2026 (3 months)
• Passed purchase, sales and journal vouchers in Tally Prime for 6 small clients.
• Checked GST invoices for GSTIN, HSN and tax rate errors and prepared GSTR-1 data in Excel.
• Helped prepare bank reconciliation statements and did ledger scrutiny before finalisation.

Academic Project
"Working capital management of a small trading firm" – final year project, B.Com.

Key Skills
• Tally Prime (with GST)
• Basic knowledge of TDS
• MS Excel (SUM, VLOOKUP, basic pivot), MS Word
• Typing speed 35 wpm

Education
B.Com (Hons) Accountancy – Kazi Nazrul University, 2026 – CGPA 7.4
Higher Secondary (Commerce) – WBCHSE, 2023 – 78%
Madhyamik – WBBSE, 2021 – 81%

Certifications
• Certificate in Computerised Accounting with Tally Prime – Sample Computer Academy, Durgapur (2025)

Expected Salary: 2.2 LPA
Immediate joiner

Languages Known: Bengali, Hindi, English

Personal Details
Date of Birth: 05/11/2004
Gender: Female
Marital Status: Unmarried
Religion: Hindu
Father's Name: Subrata Roy
Nationality: Indian`,
  },
  {
    key: "acc-08",
    format: "pdf",
    notes: "CAREER GAP (Mar 2021 – Jun 2023): Accounts Executive, ~9.8 yrs total, Howrah; Tally/GST/TDS; 3.0 LPA, 30-day notice; not willing to relocate.",
    text: `SUDIPTA PAL
sudipta.pal@example.com | +91 90000 10008 | Shibpur, Howrah

Summary
Accounts professional with about 9 years of experience in freight and packaging companies – Tally, GST, TDS and bank reconciliation. Took a planned career break from 2021 to 2023 for family responsibilities and have since returned to full-time work.

Employment History
Accounts Assistant (Contract) – Sample Packaging Industries, Howrah
Jul 2023 – Present
• Voucher entry and ledger maintenance in Tally Prime for a 120-employee packaging unit.
• Prepare GSTR-1 data and reconcile purchases with GSTR-2B every month.
• TDS deduction on contractor and rent payments; challan preparation.
• Bank reconciliation and vendor statement matching.

Career Break – Mar 2021 to Jun 2023 (child care and family responsibilities). Completed an online GST update course during this period.

Accounts Executive – Demo Freight Carriers Pvt Ltd, Howrah
Aug 2014 – Feb 2021
• Freight billing, party-wise outstanding and collection follow-up.
• Monthly GST returns since July 2017 and quarterly TDS returns with the consultant.
• Lorry hire payments, driver advances and cash book.

Skills: Tally Prime, Tally ERP 9, GST, TDS, Excel, Bank Reconciliation, Freight Billing

Education
B.Com – University of Calcutta, 2014
Higher Secondary – WBCHSE, 2011
Madhyamik – WBBSE, 2009

Certifications
• GST Update Course (online) – 2022

Current CTC: 3.0 LPA, Expected: 3.6 LPA
Notice Period: 30 days
Preferred Location: Howrah / Kolkata
Willing to relocate: No`,
  },

  // ─────────────────────── Sales / business development (7) ───────────────────────
  {
    key: "sal-01",
    format: "pdf",
    notes: "Inside Sales Executive, ~3 yrs, Kolkata; B2C tele-sales, lead generation, Zoho CRM, Bengali/Hindi/English; 2.8 LPA, 15-day notice.",
    text: `RAHUL DAS
rahul.das.kol@example.com | +91 90000 10009 | Dum Dum, Kolkata

PROFILE
Inside sales executive with 3 years of tele-sales experience in education and home-loan products. Consistently meet monthly targets through lead follow-up, CRM discipline and clear communication in Bengali, Hindi and English.

WORK EXPERIENCE
Inside Sales Executive
Example Learning Pvt Ltd, Salt Lake Sector V, Kolkata
Oct 2024 – Present
• Make 120–150 outbound calls daily to inbound leads for online course counselling (B2C).
• Achieved 108% of the quarterly revenue target in Q1 FY 2025-26; "Top Closer" award twice.
• Update every call, follow-up and payment status in Zoho CRM and keep the lead pipeline clean.
• Generate leads from webinars and referral campaigns; converted 9% of assigned leads against a team average of 6%.
• Handle objections around fees and EMI options; coordinate with the finance team for payment links.

Tele-calling Executive
Sample Home Finance Services (DSA), Kolkata
Sep 2023 – Sep 2024
• Cold calling and lead generation for home-loan and loan-against-property products.
• Collected documents, scheduled meetings for field officers and tracked status in Excel.

KEY SKILLS
Inside Sales, Tele-sales, Lead Generation, Zoho CRM, Objection Handling, Follow-up, MS Excel, Target Achievement

LANGUAGES KNOWN
Bengali, Hindi, English

EDUCATION
B.A. (General) – University of Calcutta, 2023
Higher Secondary – WBCHSE, 2020
Madhyamik – WBBSE, 2018

Current CTC: 2.8 LPA (fixed) + incentives
Expected CTC: 3.5 LPA
Notice Period: 15 days`,
  },
  {
    key: "sal-02",
    format: "docx",
    notes: "Senior Tele Sales Executive, ~3.2 yrs, Howrah; insurance & broadband B2C phone sales, CRM, lead qualification; Rs 27,500/month, 30-day notice; has Personal Details block.",
    text: `Sneha Kar
sneha.kar@example.in | +91 90000 10010 | Bally, Howrah

Professional Summary
Result-oriented tele-sales professional with 3+ years in insurance and broadband sales over the phone. Experienced in B2C selling, lead qualification, CRM updates and renewal follow-ups. Fluent in Bengali and Hindi.

Work Experience
Senior Tele Sales Executive | Demo Insurance Brokers Pvt Ltd, Kolkata
08/2024 - Present
• Sell health and motor insurance policies to warm leads over the phone; average 14 policies per month.
• Qualify leads generated from the website and partner campaigns and log every disposition in the company CRM.
• Mentor 3 new joiners on the pitch, compliance script and objection handling.
• Renewal calling for lapsed policies – improved the renewal ratio of my assigned book from 62% to 74%.

Telecaller | Fictional Broadband Services, Howrah
09/2023 - 07/2024
• Outbound calling for new broadband connections in Howrah and Hooghly.
• Lead generation from housing society and apartment databases; fixed appointments for the field team.
• Maintained the daily call report in Excel.

Skills
B2C Sales, Inside Sales, Lead Qualification, CRM, Renewal Calling, Customer Handling, MS Office

Education
Bachelor of Business Administration (BBA) – MAKAUT, 2023
Higher Secondary – WBCHSE, 2020
Madhyamik – WBBSE, 2018

Present salary: Rs. 27,500 per month
Expected CTC: 3.6 LPA
Notice Period: 30 days

Languages Known: Bengali, Hindi, English

Personal Details
Date of Birth: 18 Jan 2002
Gender: Female
Marital Status: Single
Religion: Hindu
Father's Name: Mr. Ranjit Kar
Nationality: Indian`,
  },
  {
    key: "sal-03",
    format: "pdf",
    notes: "TWO-COLUMN layout (skills/languages/education extracted before profile and experience): BDE, ~1.8 yrs, Kolkata; solar inside sales, lead gen, CRM; 2.6 LPA, 30-day notice.",
    text: `RITWIK SEN
Business Development Executive
ritwik.sen@example.com
+91 90000 10011
Kolkata, West Bengal

SKILLS
Lead Generation
Inside Sales
Cold Calling
CRM (HubSpot)
Client Follow-up
MS Excel & Google Sheets
Presentation

LANGUAGES
Bengali – Native
Hindi – Fluent
English – Fluent

EDUCATION
BBA (Marketing)
Sample Institute of Management, Kolkata
2022 – 2025 | CGPA 7.9
Higher Secondary – CBSE, 2022
Class 10 – CBSE, 2020

PROFILE
Energetic BDE with 1.5+ years of experience in inside sales and lead generation for rooftop solar and B2B services. I enjoy talking to customers, understanding their needs and moving them through the funnel.

EXPERIENCE
Business Development Executive
Fictional Solar Solutions Pvt Ltd, Kolkata
May 2025 – Present
• Call inbound and outbound leads for residential rooftop solar; qualify on roof size, electricity bill and subsidy eligibility.
• Generate 60+ qualified leads per month from online campaigns and housing society tie-ups.
• Maintain the full pipeline in the CRM and schedule site surveys for the technical team.
• Closed 28 residential orders in FY 2025-26 worth about ₹42 lakh.

Sales Intern
Demo Marketing Services, Kolkata
Jan 2025 – Apr 2025
• Cold calling SMEs for digital marketing packages; built prospect lists in Excel.

CTC: 2.6 LPA | Notice: 30 days`,
  },
  {
    key: "sal-04",
    format: "docx",
    notes: "Area Sales Manager (FMCG field/distribution), ~11.5 yrs, Siliguri; 9.5 LPA, 60-day notice; not an inside-sales profile.",
    text: `PRADIP KUMAR SARKAR
pradip.sarkar@example.com | +91 90000 10012 | Siliguri, Darjeeling

PROFESSIONAL SUMMARY
Area Sales Manager with 11 years in FMCG general trade across North Bengal, Sikkim and parts of Assam. Manages distributors, a team of 14 sales officers and DSRs, and secondary sales of about ₹3.2 crore per month.

EMPLOYMENT HISTORY
Area Sales Manager – Example Consumer Products Ltd, Siliguri
Apr 2021 – Present
• Responsible for primary and secondary sales through 11 distributors in North Bengal and Sikkim.
• Grew territory sales by 18% in FY 2025-26; added 1,400 new outlets through beat expansion.
• Monthly distributor claim settlement, stock norms and ROI review.
• Hire, train and review sales officers; weekly market visits with the team.

Sales Officer – Sample Foods & Beverages Pvt Ltd, Jalpaiguri
Jan 2018 to Mar 2021
• Distributor management, new outlet opening and trade scheme execution.

Territory Sales Executive – Demo Biscuits Co., Siliguri
Jun 2015 to Dec 2017
• Beat planning, retailer order booking and collections.

KEY SKILLS
Distribution Management, Secondary Sales, Team Handling, Channel Sales, Trade Schemes, DMS Reporting, Excel

EDUCATION
MBA (Marketing) – Sample School of Business, Siliguri (2015)
B.Com – University of North Bengal (2013)
Higher Secondary – WBCHSE (2010)

Current CTC: 9.5 LPA + vehicle allowance
Notice Period: 60 days
Preferred Location: Siliguri, Guwahati`,
  },
  {
    key: "sal-05",
    format: "pdf",
    notes: "Inside Sales Team Lead, ~8 yrs, Kolkata; leads 18 tele-sales executives; 7.2 LPA, 60-day notice; right domain but CTC far above an executive band.",
    text: `NUSRAT JAHAN
nusrat.jahan@example.com | +91 90000 10013 | Park Circus, Kolkata

Summary
Inside sales team lead with 8 years in tele-sales of insurance, credit cards and online education. Currently leads a team of 18 executives with a monthly revenue target of ₹45 lakh.

Work Experience
Team Lead – Inside Sales | Sample Edu Ventures Pvt Ltd, Kolkata | Jan 2023 – Present
• Lead 18 inside sales executives: daily huddles, call audits and floor management.
• Team achieved 112% of the annual target in FY 2025-26.
• Lead allocation, CRM dashboards and conversion analysis; hiring and training of freshers.
• Built Bengali and Hindi pitch scripts for regional campaigns.

Senior Sales Executive | Demo Card Services (credit card sales partner), Kolkata | 04/2020 - 12/2022
• Outbound credit card sales to pre-approved leads; promoted to Quality & Training Coach in 2021.
• Consistently in the top 5 of a 60-member floor.

Tele Sales Executive | Fictional Insurance Marketing, Kolkata | Nov 2018 to Mar 2020
• Outbound calling for term and health insurance; lead follow-up and document collection.

Skills
Team Management, Inside Sales, CRM Dashboards, Call Coaching, Target Planning, Lead Management, Excel

Education
B.Com – University of Calcutta, 2018
Higher Secondary – WBCHSE, 2015
Class X – WBBSE, 2013

Current CTC: 7.2 LPA
Expected CTC: 8.5 LPA
Notice Period: 60 days`,
  },
  {
    key: "sal-06",
    format: "docx",
    notes: "B2B SaaS Business Development Manager, ~6 yrs, Bengaluru; Salesforce, demos; omits CTC and notice period entirely.",
    text: `VIKRAM HEGDE
vikram.hegde@example.com | +91 90000 10014 | HSR Layout, Bengaluru

PROFESSIONAL SUMMARY
B2B SaaS business development manager with 6 years of experience selling HR and accounting software to mid-market companies in South India. Strong at outbound prospecting, product demos and closing annual contracts.

EXPERIENCE
Business Development Manager — Example Cloud HR Pvt Ltd, Bengaluru
Jul 2023 – Present
• Own a quota of ₹1.2 crore ARR; achieved 104% in FY 2025-26.
• Run discovery calls and product demos for CXOs and HR heads; manage every deal in Salesforce.
• Built outbound sequences on LinkedIn and email that now generate 35% of my pipeline.
• Work with pre-sales and customer success on onboarding and renewals.

Business Development Executive — Sample Accounting Software, Bengaluru
Dec 2020 – Jun 2023
• Inbound lead qualification and demos for SME customers; closed 140+ deals.
• Partnered with chartered accountant firms for referral leads.

SKILLS
B2B Sales, SaaS, Salesforce CRM, Demos & Negotiation, Account Management, Outbound Prospecting

EDUCATION
MBA (Marketing) – Sample Business School, Bengaluru, 2020
B.E. (Mechanical) – Visvesvaraya Technological University, 2018

Languages Known: English, Kannada, Hindi, Tamil`,
  },
  {
    key: "sal-07",
    format: "pdf",
    notes: "Showroom Sales Executive (counter sales), ~2 yrs, Durgapur; some enquiry follow-up calls; Rs 15,500/month, 7-day notice, willing to relocate to Kolkata; has Personal Details block.",
    text: `RAJIB SHEIKH
rajib.sheikh01@example.com | +91 90000 10015 | Durgapur – 713212

Career Objective
Hard-working and polite sales executive looking for a sales job in a reputed company where I can use my communication skills and build my career.

Work Experience
Sales Executive – Sample Electronics & Home Appliances Showroom, Durgapur
06/2025 - Present
• Attend walk-in customers, explain features of TVs, ACs and refrigerators and close the sale.
• Explain EMI and exchange offers; billing support at the counter.
• Call old customers and enquiry leads from the register for festive offers, around 30 calls a day.
• Achieve ₹6–8 lakh monthly sales; highest individual sales in the Puja season 2025.

Sales Trainee – Demo Mobile Store, Durgapur
11/2024 - 05/2025
• Mobile phone and accessory sales, stock display and daily sales report.

Key Skills
• Counter Sales
• Customer Handling
• Product Demonstration
• Basic Computer (MS Word, Excel)
• Communication in Bengali & Hindi

Education
Higher Secondary (Arts) – WBCHSE, 2023
Madhyamik – WBBSE, 2021
Pursuing B.A. (distance mode) – Netaji Subhas Open University

Present salary: Rs. 15,500 per month
Willing to relocate: Yes (Kolkata)
Notice Period: 7 days

Personal Details
Date of Birth: 10/08/2005
Gender: Male
Marital Status: Unmarried
Religion: Islam
Father's Name: Sk. Anwar Sheikh
Nationality: Indian`,
  },

  // ───────────────────────── Customer support / BPO (6) ─────────────────────────
  {
    key: "sup-01",
    format: "pdf",
    notes: "Customer Care Executive (inbound voice, telecom), ~1.8 yrs, Kolkata; Freshdesk ticketing, complaint handling, Bengali/Hindi/English; 2.1 LPA, immediate joiner; has Personal Details block.",
    text: `SAYANTIKA BOSE
sayantika.bose@example.com | +91 90000 10016 | Baranagar, Kolkata

Career Objective
Customer-focused professional seeking a voice process role where I can use my communication skills in Bengali, Hindi and English to resolve customer issues on the first call.

Work Experience
Customer Care Executive (Inbound Voice) – Example Telecom Support Services, Kolkata
Apr 2025 – Oct 2026
• Handled 80–100 inbound calls per shift for prepaid and postpaid mobile customers (billing, recharge, network complaints).
• Logged and tracked complaints in the Freshdesk ticketing tool; escalated network issues to the technical team within TAT.
• Kept AHT under 280 seconds and CSAT above 88% for 5 consecutive months.
• Handled escalated and irate callers and de-escalated them using the process script.
• Worked rotational shifts including night shifts.

Customer Service Trainee – Sample Retail Helpdesk, Kolkata
Jan 2025 – Mar 2025 (3 months)
• Answered order status and return queries over phone and email.

Key Skills
Inbound Voice, Complaint Handling, Freshdesk, CRM, Typing 40 wpm, MS Office

Languages Known
Bengali, Hindi, English

Education
B.A. (Hons) English – University of Calcutta, 2024
Higher Secondary – WBCHSE, 2021
Madhyamik – WBBSE, 2019

Last CTC: 2.1 LPA
Immediate joiner (relieved from previous company on 31 Oct 2026)

Personal Details
Date of Birth: 27/06/2003
Gender: Female
Marital Status: Unmarried
Religion: Hindu
Father's Name: Pradip Bose
Nationality: Indian`,
  },
  {
    key: "sup-02",
    format: "docx",
    notes: "KEYWORD-STUFFED: Customer Support Associate (voice/email/chat), ~2.2 yrs, Kolkata; skills list Tally/GST/TDS/SAP FICO/payroll but roles are only customer support; 2.3 LPA, 30-day notice.",
    text: `Payel Dutta
payel.dutta@example.com | +91 90000 10017 | Garia, Kolkata

PROFESSIONAL SUMMARY
Customer support associate with 2 years in e-commerce and travel support processes (voice, email and chat). B.Com graduate with knowledge of accounting software.

WORK EXPERIENCE
Customer Support Associate (Voice & Email) – Demo Retail Online Pvt Ltd, Kolkata
Jul 2025 – Present
• Answer inbound customer calls on order delivery, refunds and replacements; 70+ calls per day.
• Respond to customer emails within the 24-hour SLA and raise tickets for refund approvals.
• Coordinate with courier partners on delayed shipments and update customers.
• Achieved a 4.5/5 average customer rating in Q2.

Chat Support Executive – Sample Travels BPO, Kolkata
Sep 2024 – Jun 2025
• Live chat support for bus and hotel booking customers; handled cancellations and refund queries.
• Up-sold travel insurance on chat.

KEY SKILLS
Tally ERP 9, Tally Prime, GST, GSTR-1, GSTR-3B, TDS, SAP FICO, Payroll Processing, PF & ESI, Bank Reconciliation, Advanced Excel, Accounts Payable, Accounts Receivable, Balance Sheet Finalisation, Income Tax Return, Customer Support, Email Support, Chat Support

EDUCATION
B.Com (General) – University of Calcutta, 2024
Higher Secondary (Commerce) – WBCHSE, 2021
Madhyamik – WBBSE, 2019

Current CTC: 2.3 LPA
Expected CTC: 2.6 LPA
Notice Period: 30 days

Languages Known: Bengali, Hindi, English`,
  },
  {
    key: "sup-03",
    format: "pdf",
    notes: "BPO Process Associate, ~2.1 yrs, Howrah; 1 yr outbound credit-card tele-sales + 1 yr inbound banking support; CRM/ticketing; 2.4 LPA, 15-day notice.",
    text: `IMRAN HOSSAIN
imran.hossain@example.in | +91 90000 10018 | Uluberia, Howrah

Profile
Process associate with 2 years in BPO – one year in outbound credit card sales and one year in inbound customer service for a banking client. Comfortable with high call volumes, CRM tools and selling over the phone.

Employment History
Process Associate – Inbound | Sample BPO Services Pvt Ltd, Kolkata
Nov 2025 – Present
• Inbound calls for a bank's debit and credit card customers: card block, statements, reward points and dispute queries.
• Raise service requests in the ticketing tool and close them within TAT; average QA score 91%.
• Cross-sell card upgrades and add-on cards on eligible calls.

Tele Sales Associate – Outbound | Demo Card Sales (Channel Partner), Kolkata
Oct 2024 – Oct 2025
• Outbound calling to pre-approved leads for credit card sales; 7–10 logins per month on average.
• Lead follow-up, document pick-up scheduling and status updates in the CRM.
• Received "Rookie of the Month" in Feb 2025.

Skills
Inbound & outbound voice, Tele-sales, Cross-selling, CRM, Ticketing tool, Complaint handling, MS Excel

Languages Known: Bengali, Hindi, English, Urdu

Education
B.A. – University of Calcutta, 2024
Higher Secondary – WBCHSE, 2021
Madhyamik – WBBSE, 2019

CTC: 2.4 LPA | Expected: 2.8 LPA | Notice: 15 days`,
  },
  {
    key: "sup-04",
    format: "docx",
    notes: "Customer Service Team Leader, ~6 yrs, Kolkata; inbound voice, escalations, team of 15; 4.8 LPA, 60-day notice; too senior and far above an associate band.",
    text: `Arpita Chakraborty
arpita.chakraborty@example.com | +91 90000 10019 | New Town, Kolkata

PROFESSIONAL SUMMARY
Customer service team leader with 6 years in voice processes (telecom and utilities). Manages a team of 15 associates, handles escalations and drives AHT, FCR and CSAT metrics.

WORK EXPERIENCE
Team Leader – Customer Service, Example Utility Contact Centre, Kolkata
Mar 2024 – Present
• Lead 15 associates on an inbound electricity billing and complaint process.
• Improved FCR from 71% to 80% through call calibration and refresher training.
• Handle level-2 escalations and consumer forum complaints.
• Prepare daily MIS on AHT, CSAT and absenteeism; roster planning.

Senior Process Associate, Sample Telecom BPO, Kolkata
Jan 2022 – Feb 2024
• Inbound voice for postpaid customers; SME for billing disputes; trained new batches.

Process Associate, Sample Telecom BPO, Kolkata
Oct 2020 – Dec 2021
• Inbound calls for postpaid billing and plan change requests; complaint logging in CRM.

KEY SKILLS
Team Handling, Escalation Management, Inbound Voice, Quality Calibration, MIS Reporting, Excel, Roster Planning

EDUCATION
B.Sc (General) – University of Calcutta, 2020
Higher Secondary – WBCHSE, 2017
Madhyamik – WBBSE, 2015

Current CTC: 4.8 LPA | Expected CTC: 5.5 LPA
Notice Period: 60 days`,
  },
  {
    key: "sup-05",
    format: "pdf",
    notes: "Phone Banking Customer Service Officer, ~1.1 yrs, Kolkata; inbound voice, CRM complaints; 2.2 LPA but 90-day non-negotiable notice (near-miss for immediate-joiner role).",
    text: `SOHAM DEY
soham.dey@example.com | +91 90000 10020 | Tollygunge, Kolkata

Objective
To build a long-term career in customer service with an organisation that values quality and customer satisfaction.

Experience
Customer Service Officer – Phone Banking
Fictional Bank Services Ltd (captive contact centre), Kolkata
Oct 2025 – Present
• Handle inbound phone banking calls – balance, cheque book, UPI and net banking issues, card hotlisting.
• Register complaints in the bank's CRM / ticketing system and follow up until closure.
• Verify customers as per KYC and authentication guidelines; quality score 93%.
• Guide Hindi- and Bengali-speaking senior citizens step by step on digital banking.

Skills: Inbound voice, Complaint registration, CRM, Customer verification (KYC), Bengali / Hindi / English, MS Office

Education
B.Com – University of Calcutta, 2025
Class XII – CBSE, 2022
Class X – CBSE, 2020

Current CTC: 2.2 LPA
Notice Period: 90 days (as per employment terms; buy-out not allowed)`,
  },
  {
    key: "sup-06",
    format: "docx",
    notes: "Customer Support Executive (inbound voice, DTH), ~1.1 yrs, Siliguri; ticketing, Nepali/Bengali/Hindi/English; 1.8 LPA, immediate joiner, willing to relocate to Kolkata; has Personal Details block.",
    text: `Sangita Thapa
sangita.thapa@example.in | +91 90000 10021 | Pradhan Nagar, Siliguri

Career Objective
To join a customer support voice process in Kolkata and grow into a quality or team lead role.

Work Experience
Customer Support Executive (Voice) – Demo DTH Support Centre, Siliguri
Oct 2025 – Present
• Handle 60–80 inbound calls daily for DTH customers – recharge, channel packs and signal complaints.
• Book service visits and track complaint tickets in the ticketing tool until closure.
• Support Hindi, Bengali, English and Nepali speaking customers from North Bengal and Sikkim.
• Awarded "Best CSAT" for March 2026.

Skills
• Inbound calls & complaint handling
• Ticketing tool, CRM
• Multilingual: Nepali, Hindi, Bengali, English
• MS Excel, typing 35 wpm

Education
B.A. – University of North Bengal, 2025
Higher Secondary – WBCHSE, 2022
Madhyamik – WBBSE, 2020

Current CTC: 1.8 LPA
Expected CTC: 2.4 LPA
Immediate joiner
Willing to relocate: Yes – Kolkata

Personal Details
Date of Birth: 03-02-2004
Gender: Female
Marital Status: Unmarried
Religion: Hindu
Father's Name: Shri Dil Bahadur Thapa
Nationality: Indian`,
  },

  // ───────────────────── Operations / logistics / warehouse (5) ─────────────────────
  {
    key: "ops-01",
    format: "pdf",
    notes: "Warehouse Executive, ~4.3 yrs, Asansol; inventory, dispatch planning, SAP MM, Excel; 3.6 LPA, 30-day notice.",
    text: `MANOJ KUMAR YADAV
manoj.yadav@example.com | +91 90000 10022 | Burnpur Road, Asansol

PROFESSIONAL SUMMARY
Warehouse executive with 4+ years in inventory control, inward/outward and dispatch for steel and building-material warehouses. Hands-on in SAP MM (GRN, goods issue, stock reports) and Excel.

WORK EXPERIENCE
Warehouse Executive | Example Steel Distribution Hub, Asansol | Jan 2024 – Present
• Manage a 40,000 sq ft warehouse with ~1,200 SKUs (TMT bars, sheets, pipes).
• Post goods receipts (MIGO), goods issues and stock transfers in SAP MM; resolve GR/IR mismatches with the purchase team.
• Plan daily dispatch of 25–30 trucks, prepare loading slips, coordinate e-way bills and follow up with transporters.
• Monthly cycle counts and annual physical verification; inventory variance kept below 0.3%.
• Excel dashboards for stock ageing, slow-moving items and dispatch TAT.

Store & Dispatch Assistant | Sample Cement Depot, Raniganj | Aug 2022 – Dec 2023
• Inward entry, stock register, FIFO stacking and loading supervision.
• Daily stock report in Excel to the area office.

SKILLS
Inventory Management, SAP MM (MIGO, MB52, MB51), Dispatch Planning, Excel (Pivot, VLOOKUP), FIFO / FEFO, Physical Verification, Manpower Handling

EDUCATION
B.Com – Kazi Nazrul University, 2022
Higher Secondary – WBCHSE, 2019
Class 10 – WBBSE, 2017

Certifications
• SAP MM End User Training – Sample Tech Institute, Kolkata (2023)

Current CTC: 3.6 LPA | Expected CTC: 4.5 LPA
Notice Period: 30 days`,
  },
  {
    key: "ops-02",
    format: "docx",
    notes: "Logistics Coordinator, ~5 yrs, Durgapur; dispatch, transporters, FG inventory, e-way bills, Excel (no SAP); 3.9 LPA, 30-day notice, open to Asansol; has Personal Details block.",
    text: `Subhankar Nandi
subhankar.nandi@example.com | +91 90000 10023 | Durgapur, West Bengal

Professional Summary
Logistics coordinator with 5 years of experience in outbound logistics, finished-goods inventory and transporter management for an engineering manufacturer. Strong in Excel-based planning and dispatch documentation (invoices, e-way bills, LR).

Work Experience
Logistics Coordinator – Demo Engineering Works Pvt Ltd, Durgapur
Apr 2023 – Present
• Plan dispatch of fabricated structures and spares to customers in 9 states; 300+ consignments a month.
• Negotiate freight with 12 transporters and track vehicles; reduced detention charges by 15%.
• Maintain finished-goods inventory in the in-house ERP and reconcile it with physical stock every month.
• Prepare e-way bills, LRs and delivery challans; coordinate with accounts for freight bill passing.
• Excel trackers for vehicle placement, transit time and POD collection.

Dispatch Assistant – Demo Engineering Works Pvt Ltd, Durgapur
Nov 2021 – Mar 2023
• Packing lists, loading supervision and dispatch register.
• Stock tagging and yard arrangement of finished goods.

Key Skills
Dispatch & Transport Management, Inventory Control, E-way Bill, MS Excel, ERP (in-house), Vendor Negotiation, Documentation

Education
Diploma in Mechanical Engineering – WBSCTE, 2021
Madhyamik – WBBSE, 2018

Current CTC: 3.9 LPA
Expected CTC: 4.8 LPA
Notice Period: 30 days
Preferred Location: Durgapur, Asansol (willing to relocate within West Bengal)

Personal Details
Date of Birth: 29/12/2002
Gender: Male
Marital Status: Unmarried
Religion: Hindu
Father's Name: Gopal Nandi
Nationality: Indian`,
  },
  {
    key: "ops-03",
    format: "pdf",
    notes: "Store Keeper, ITI Fitter, ~3 yrs as store keeper (+1.5 yrs helper), Bardhaman; GRN, stock register, basic Excel; no CTC stated, 15-day notice; has Personal Details block.",
    text: `GOUTAM HAZRA
goutam.hazra@example.com | +91 90000 10024 | Memari, Purba Bardhaman

OBJECTIVE
Looking for a store / warehouse job with more responsibility in a manufacturing or logistics company.

EXPERIENCE
Store Keeper
Sample Agro Processing Unit, Memari, Bardhaman
Dec 2023 – Present
• Receive raw material and packing material, check quantity against challan and prepare GRN.
• Issue material to production against requisition slips; maintain bin cards and stock register.
• Enter daily receipts and issues in the Excel stock sheet; report minimum-level items to purchase.
• Assist in monthly physical stock taking and dispatch loading of finished bags.

Store Helper
Demo Fabricators, Bardhaman
Jun 2022 to Nov 2023
• Loading / unloading, material stacking and tools register.

SKILLS
• Store keeping, GRN, material issue
• Stock register and bin card
• Basic Excel and computer
• Forklift supervision

EDUCATION
ITI (Fitter) – NCVT, 2022
Madhyamik – WBBSE, 2019

Notice Period: 15 days

Personal Details
Date of Birth: 15-04-2003
Gender: Male
Marital Status: Married
Religion: Hindu
Father's Name: Nimai Hazra
Nationality: Indian`,
  },
  {
    key: "ops-04",
    format: "docx",
    notes: "Warehouse Manager (3PL), ~13 yrs, Pune; SAP EWM/MM, 60+ staff; 18 LPA, 90-day notice, Pune only (too senior, wrong city, not relocating).",
    text: `SACHIN PATIL
sachin.patil@example.com | +91 90000 10025 | Chakan, Pune

PROFESSIONAL SUMMARY
Warehouse and distribution manager with 13 years in automotive and FMCG warehousing. Currently runs a 2.5 lakh sq ft multi-client warehouse with 60+ staff, WMS and SAP EWM.

EXPERIENCE
Warehouse Manager – Example 3PL Logistics Pvt Ltd, Chakan, Pune — Jun 2020 – Present
• Site P&L responsibility for a multi-client warehouse; 98.7% order accuracy and 99% on-time dispatch.
• Implemented SAP EWM with RF scanning; cut picking time by 22%.
• Manage 60+ staff and 3 contractor agencies; safety audits and 5S.
• Inventory accuracy above 99.5% through a structured cycle counting programme.

Assistant Manager – Warehouse – Sample Auto Components Ltd, Pune — 2016 – 2020
• Inbound and outbound for an auto-parts plant; SAP MM goods movements and JIT supply to the line.

Warehouse Supervisor – Demo FMCG Distributors, Nashik — 2013 – 2016
• Shift supervision, dispatch to distributors and stock audits.

SKILLS
Warehouse Operations, SAP EWM, SAP MM, WMS, Inventory Control, Team Leadership, 5S / Lean, Excel

EDUCATION
MBA (Operations) – Savitribai Phule Pune University, 2013
B.Sc – Savitribai Phule Pune University, 2011

Current CTC: 18 LPA
Notice Period: 90 days
Preferred Location: Pune only (not open to relocation)`,
  },
  {
    key: "ops-05",
    format: "pdf",
    notes: "Inventory Executive, ~3 yrs, Kolkata; SAP MM, stock reconciliation, dealer dispatch, Excel; 4.2 LPA, 30-day notice, open to relocation to Asansol/Durgapur.",
    text: `RITUPARNA MAJUMDAR
rituparna.m@example.in | +91 90000 10026 | Kasba, Kolkata

Summary
Inventory executive with 3 years in a distribution warehouse for electrical goods. Use SAP MM daily for goods receipts, stock transfers and reconciliation; strong Excel skills.

Work Experience
Inventory Executive – Sample Electricals Distribution Pvt Ltd, Kolkata
Nov 2023 – Present
• Maintain stock of 3,500 SKUs across two godowns using SAP MM (MIGO, MB1B, MB52).
• Daily reconciliation of system vs physical stock for high-value items; resolve variances with stores and accounts.
• Coordinate dispatch to dealers in Kolkata and South Bengal; prepare delivery challans and track PODs.
• Monthly ageing and slow-moving inventory report in Excel; helped liquidate ₹18 lakh of non-moving stock.

Skills
SAP MM, Inventory Reconciliation, Dispatch Coordination, Advanced Excel (Pivot, XLOOKUP), Stock Audit

Education
BBA – MAKAUT, 2023
Class XII – CBSE, 2020
Class X – CBSE, 2018

Current CTC: 4.2 LPA | Expected: 5 LPA
Notice Period: 30 days
Open to relocation (Asansol / Durgapur / Bardhaman)`,
  },

  // ───────────────────────── Software development (5) ─────────────────────────
  {
    key: "sw-01",
    format: "pdf",
    notes: "Full Stack Developer, ~3.4 yrs, Bengaluru; React/TypeScript, Node.js/Express, PostgreSQL, MongoDB, Git; 11 LPA, 30-day notice.",
    text: `ADITYA SHARMA
aditya.sharma.dev@example.com | +91 90000 10027 | Bengaluru, Karnataka

SUMMARY
Full stack developer with 3.5 years building React and Node.js web applications for fintech and logistics products. Comfortable owning features end to end – API design, database schema, UI and deployment.

TECHNICAL SKILLS
Frontend: React, TypeScript, Redux Toolkit, Next.js, Tailwind CSS
Backend: Node.js, Express, REST APIs, JWT auth
Databases: PostgreSQL, MongoDB, Redis
Tools: Git, GitHub Actions, Docker, AWS (EC2, S3), Jest

WORK EXPERIENCE
Software Engineer II – Example Fintech Labs Pvt Ltd, Bengaluru
Jan 2025 – Present
• Built the merchant onboarding portal in React + TypeScript and the Node.js / Express REST APIs behind it; onboarding time fell from 3 days to 1.
• Designed PostgreSQL schemas and optimised queries for settlement reports (p95 latency down from 2.1 s to 400 ms).
• Added MongoDB-based audit logging and Redis caching for KYC lookups.
• Code reviews, Git branching strategy and CI pipelines on GitHub Actions.

Software Engineer – Sample Logistics Tech, Bengaluru
Jun 2023 – Dec 2024
• Developed the shipment tracking dashboard in React with a Node.js REST backend and MongoDB.
• Wrote Jest unit tests and raised coverage from 40% to 75%.

EDUCATION
B.Tech (Computer Science) – Sample Institute of Technology, Bengaluru (VTU), 2023 – CGPA 8.1

Current CTC: 11 LPA
Expected CTC: 14 LPA
Notice Period: 30 days`,
  },
  {
    key: "sw-02",
    format: "docx",
    notes: "MERN Developer, ~2.3 yrs, Kolkata; React, Node/Express, MongoDB, MySQL, Git; 6.5 LPA (expects 9), 30-day notice, open to Bengaluru/remote.",
    text: `Priyam Mitra
priyam.mitra@example.com | +91 90000 10028 | Salt Lake, Kolkata

Profile
MERN stack developer with 2+ years of experience at a Kolkata product agency. Build and maintain React front ends and Node.js / Express REST APIs with MongoDB for e-commerce and healthcare clients.

Technical Skills
React.js, JavaScript (ES6+), Node.js, Express.js, MongoDB, MySQL, REST APIs, Git, Postman, HTML5 / CSS3, Bootstrap

Work Experience
Software Developer | Demo Web Solutions Pvt Ltd, Kolkata
Oct 2024 – Present
• Developed a clinic appointment booking app – React front end, Node.js + Express REST APIs and MongoDB – now used by 40+ clinics.
• Wrote MySQL reporting queries for an e-commerce client's order and inventory dashboard.
• Implemented JWT-based login, role-based access and file upload APIs.
• Manage feature branches and pull requests on Git; take part in sprint planning and estimation.

Trainee Developer | Demo Web Solutions Pvt Ltd, Kolkata
Jul 2024 – Sep 2024
• Bug fixes on React components and Express routes under a senior developer.

Education
B.Tech (Information Technology) – MAKAUT, 2024 – DGPA 8.0
Higher Secondary – WBCHSE, 2020
Madhyamik – WBBSE, 2018

Current CTC: 6.5 LPA
Expected CTC: 9 LPA
Notice Period: 30 days
Preferred Location: Bengaluru / Remote (open to relocation)`,
  },
  {
    key: "sw-03",
    format: "pdf",
    notes: "Java Spring Boot + React engineer, ~4.1 yrs, Pune; REST, MySQL/PostgreSQL, Git (no Node.js); 12 LPA, 60-day notice, prefers remote.",
    text: `NEHA KULKARNI
neha.kulkarni@example.com | +91 90000 10029 | Baner, Pune

PROFESSIONAL SUMMARY
Software engineer with 4 years in Java Spring Boot microservices and React front ends for insurance and HR-tech platforms. Looking for remote or hybrid roles.

TECHNICAL SKILLS
Java 17, Spring Boot, Hibernate / JPA, REST APIs, React, JavaScript, MySQL, PostgreSQL, Kafka (basic), Git, Jenkins, Docker

WORK EXPERIENCE
Senior Software Engineer — Sample InsureTech Pvt Ltd, Pune (Hybrid)
Jul 2024 – Present
• Develop Spring Boot microservices for policy issuance; design REST APIs consumed by the web and mobile apps.
• Build React screens for the agent portal (forms, data tables, role-based menus).
• Optimised MySQL queries and indexes; policy search time down by 60%.
• Mentor two junior developers; Git code reviews.

Software Engineer — Demo HR Systems, Pune
Oct 2022 – Jun 2024
• Java backend for the leave and attendance modules on PostgreSQL; unit testing with JUnit.
• Small React components for employee self-service.

EDUCATION
B.E. (Computer Engineering) – Savitribai Phule Pune University, 2022 – CGPA 8.4

Current CTC: 12 LPA | Expected CTC: 15 LPA
Notice Period: 60 days
Preferred: Remote / Pune`,
  },
  {
    key: "sw-04",
    format: "docx",
    notes: "FRESHER: BCA 2026, Durgapur; React/Node/MongoDB academic projects and 45-day training; expects 3.5 LPA, immediate joiner, willing to relocate.",
    text: `DEBJIT KUNDU
debjit.kundu@example.com | +91 90000 10030 | Durgapur, West Bengal

Career Objective
BCA graduate passionate about web development, looking for a trainee or junior developer role where I can work on React and Node.js projects and learn from experienced engineers.

Technical Skills
• Languages: JavaScript, Python (basic), C
• Web: HTML, CSS, React, Node.js, Express
• Database: MySQL, MongoDB (basic)
• Tools: Git, GitHub, VS Code, Postman

Academic Projects
Campus Canteen Ordering App (React + Node.js + MongoDB) – 2026
• Built a React front end with cart and order tracking and a REST API in Express; deployed on a free cloud tier.
• Implemented JWT login and an admin panel for menu updates.

Library Management System (PHP + MySQL) – 2025
• CRUD screens for books and members and a fine calculation module.

Training
• 45-day Full Stack Web Development training – Sample Computer Academy, Durgapur (2025)

Education
BCA – MAKAUT, 2026 – CGPA 8.2
Higher Secondary (Science) – WBCHSE, 2023
Madhyamik – WBBSE, 2021

Expected CTC: 3.5 LPA
Immediate joiner
Willing to relocate: Yes (Bengaluru, Kolkata, Pune)

Languages Known: Bengali, Hindi, English`,
  },
  {
    key: "sw-05",
    format: "pdf",
    notes: "Node.js backend developer, ~3 yrs, Hyderabad; Express/NestJS, PostgreSQL, MongoDB, some React; 9 LPA, serving notice (LWD 15 Dec 2026), willing to relocate to Bengaluru.",
    text: `MOHAMMED FAIZAN
faizan.m@example.com | +91 90000 10031 | Gachibowli, Hyderabad

Summary
Backend-focused developer with 3 years of experience building Node.js services (Express, NestJS) on PostgreSQL and MongoDB. Some React experience on internal tools. Open to Bengaluru or remote.

Work Experience
Software Developer – Fictional Health Tech Pvt Ltd, Hyderabad
Nov 2023 – Present
• Built REST APIs in Node.js (Express, later NestJS) for lab test booking and report delivery; ~2M API calls a day.
• Data modelling in PostgreSQL and MongoDB; wrote migration scripts and indexes.
• Built an internal admin dashboard in React for the operations team.
• Integrated payment gateway webhooks and SMS / WhatsApp notification services.
• Git, Docker and CI/CD pipelines; part of the on-call rotation.

Skills
Node.js, Express, NestJS, TypeScript, PostgreSQL, MongoDB, REST APIs, React (working knowledge), Git, Docker

Education
B.Tech (CSE) – Sample Engineering College, Hyderabad (JNTUH), 2023
Intermediate (MPC) – Telangana State Board of Intermediate Education, 2019

Current CTC: 9 LPA
Expected CTC: 12.5 LPA
Serving notice – LWD 15 Dec 2026
Willing to relocate: Yes (Bengaluru)`,
  },

  // ───────────────────────────── HR / admin (3) ─────────────────────────────
  {
    key: "hr-01",
    format: "pdf",
    notes: "HR Executive (generalist, manufacturing), ~4 yrs, Durgapur; recruitment, payroll inputs, PF/ESI; 3.4 LPA, 30-day notice; has Personal Details block.",
    text: `RIMPA BHOWMICK
rimpa.bhowmick@example.com | +91 90000 10032 | Durgapur

PROFESSIONAL SUMMARY
HR Executive with 4 years of generalist experience in a manufacturing set-up – recruitment of blue- and white-collar staff, attendance and payroll inputs, PF/ESI compliance and employee engagement.

WORK EXPERIENCE
HR Executive – Demo Castings Pvt Ltd, Durgapur
Mar 2023 – Present
• End-to-end recruitment for 60–80 positions a year: job posting, screening, interview coordination and offer letters.
• Collect attendance from the biometric system and share payroll inputs with the accounts team every month.
• Monthly PF and ESI challans, new UAN generation and contractor compliance checks.
• Joining formalities, induction and exit interviews; maintain personnel files.
• Organise safety week, Vishwakarma Puja and the annual picnic.

HR Trainee – Sample Staffing Services, Durgapur
Oct 2022 – Feb 2023
• Sourced candidates from job portals and walk-in drives; scheduled interviews.

KEY SKILLS
Recruitment, Payroll Inputs, PF & ESI, Labour Law Basics, HRMS, MS Excel, Employee Engagement

EDUCATION
MBA (HR) – MAKAUT, 2022
BBA – The University of Burdwan, 2020
Higher Secondary – WBCHSE, 2017
Madhyamik – WBBSE, 2015

Current CTC: 3.4 LPA | Expected: 4.2 LPA
Notice Period: 30 days

PERSONAL DETAILS
Date of Birth: 08/10/1999
Gender: Female
Marital Status: Married
Religion: Hindu
Father's Name: Ramesh Bhowmick
Nationality: Indian`,
  },
  {
    key: "hr-02",
    format: "docx",
    notes: "Admin Executive (office admin, facilities, travel), ~7 yrs, Bhubaneswar; 4 LPA, 30-day notice.",
    text: `Smita Mohanty
smita.mohanty@example.in | +91 90000 10033 | Patia, Bhubaneswar

Profile Summary
Administration executive with 7 years of experience managing office administration, facilities, vendors and travel for a 200-seat IT/ITES office.

Employment History
Admin Executive – Example IT Services, Bhubaneswar
Feb 2022 – Present
• Manage housekeeping, security and cafeteria vendors; verify monthly bills against SLAs.
• Travel and hotel bookings for employees; ensure travel policy compliance.
• Asset and stationery inventory; AMC tracking for ACs, DG set and UPS.
• Coordinate employee events and seat allocation for new joiners.

Front Office Executive – Sample Hotels & Resorts, Bhubaneswar
Nov 2019 – Jan 2022
• Reception, guest handling, petty cash and courier management.

Skills
Office Administration, Vendor Management, Facility Management, Travel Desk, MS Office, Petty Cash

Education
MBA (HR & Marketing) – Biju Patnaik University of Technology, 2019
B.Com – Utkal University, 2017
Higher Secondary – CHSE Odisha, 2014

Current CTC: 4 LPA
Expected CTC: 5 LPA
Notice Period: 30 days

Languages Known: Odia, Hindi, English, Bengali`,
  },
  {
    key: "hr-03",
    format: "pdf",
    notes: "IT Recruiter, ~2 yrs, Bengaluru; sourcing for React/Node/Java roles (recruiter, not a developer); 4.5 LPA; omits notice period.",
    text: `KAVYA REDDY
kavya.reddy@example.com | +91 90000 10034 | Whitefield, Bengaluru

Summary
IT recruiter with 2 years of experience hiring developers, QA and DevOps engineers for product companies.

Experience
Talent Acquisition Executive – Fictional Talent Partners, Bengaluru
Oct 2024 – Present
• Source candidates through job portals, LinkedIn and referrals for React, Node.js, Java and QA roles.
• Screen 25–30 profiles daily, schedule technical interviews and negotiate offers.
• Closed 48 positions in FY 2025-26 with an 85% offer-to-join ratio.
• Maintain the candidate pipeline in the ATS and send weekly hiring reports to client managers.
• Run campus drives for fresher developer batches with two engineering colleges.

HR Intern – Sample Retail Pvt Ltd, Bengaluru
Jan 2024 to Jun 2024
• Screened store staff applications, scheduled walk-in interviews and prepared joining kits.
• Updated employee records in the HRMS and helped with exit formalities.

Skills
IT Recruitment, Boolean Search, ATS, Offer Negotiation, Stakeholder Management, Campus Hiring, Excel

Education
MBA (HR) – Sample Business School, Bengaluru, 2024
B.Com – Bangalore University, 2022

Current CTC: 4.5 LPA | Expected: 6 LPA`,
  },

  // ───────────────────────── Scanned, no text layer (2) ─────────────────────────
  {
    key: "scan-01",
    format: "scanned",
    notes: "SCANNED: image-only PDF with no text layer (needs OCR); profile unknown.",
    text: "",
  },
  {
    key: "scan-02",
    format: "scanned",
    notes: "SCANNED: phone photo of a printed CV saved as PDF, no text layer (needs OCR); profile unknown.",
    text: "",
  },
];

export const COMPANIES = [
  {
    key: "demo-ferro",
    displayName: "Demo Ferro Alloys",
    legalName: "Demo Ferro Alloys & Engineering Pvt Ltd",
    city: "Durgapur",
    params: {
      minScore: 65,
      roleFamilies: ["accounts-finance", "operations-supply", "manufacturing-engineering"],
      seniority: ["junior", "mid"],
      cities: ["Durgapur", "Asansol"],
      allowRemote: false,
      ctcBands: [{ minInr: 300000, maxInr: 500000 }],
      maxNoticeDays: 30,
      mandatoryFilters: [],
      maxReleasePerJd: 25,
      maxLiveJds: 10,
    },
  },
  {
    key: "sample-fintech",
    displayName: "SamplePay",
    legalName: "Sample Fintech Services Pvt Ltd",
    city: "Kolkata",
    params: {
      minScore: 60,
      roleFamilies: ["customer-support", "sales-bd"],
      seniority: ["fresher", "junior"],
      cities: ["Kolkata"],
      allowRemote: false,
      ctcBands: [{ minInr: 180000, maxInr: 360000 }],
      maxNoticeDays: 30,
      mandatoryFilters: [],
      maxReleasePerJd: 25,
      maxLiveJds: 10,
    },
  },
  {
    key: "fictional-labs",
    displayName: "Fictional Labs",
    legalName: "Fictional Labs Technologies Pvt Ltd",
    city: "Bengaluru",
    params: {
      minScore: 70,
      roleFamilies: ["software-it"],
      seniority: ["junior", "mid"],
      cities: ["Bengaluru"],
      allowRemote: true,
      ctcBands: [{ minInr: 800000, maxInr: 1400000 }],
      maxNoticeDays: 60,
      mandatoryFilters: [],
      maxReleasePerJd: 25,
      maxLiveJds: 10,
    },
  },
];

export const JDS = [
  {
    key: "jd-accounts-durgapur",
    company: "demo-ferro",
    title: "Accounts Executive",
    location: "Durgapur",
    workMode: "On-site",
    text: `Accounts Executive – Durgapur

Demo Ferro Alloys & Engineering Pvt Ltd is a growing steel trading and fabrication company with its works office in Durgapur. We are looking for an Accounts Executive to join our 4-member accounts team.

Responsibilities:
• Day-to-day accounting in Tally Prime – purchase, sales, journal, payment and receipt vouchers.
• Prepare GSTR-1 and GSTR-3B data and reconcile ITC with GSTR-2B every month.
• Compute TDS on vendor and contractor payments, deposit challans and support quarterly returns.
• Bank reconciliation, vendor ledger scrutiny and debtor follow-up.
• Prepare monthly MIS reports in Excel for management.

Requirements:
• Must have hands-on experience in Tally, GST returns and TDS.
• Required: good working knowledge of MS Excel (VLOOKUP, pivot tables).
• 2-5 years of experience in accounts, preferably in a trading or manufacturing company.
• Education: B.Com; M.Com is an advantage.
• Experience with e-way bills and audit support is preferred.
• Candidates from Durgapur, Asansol or nearby areas preferred.

CTC: 3 - 4.5 LPA
Notice period: up to 30 days
Location: Durgapur (on-site, 6 days a week)`,
    relevance: {
      "acc-01": 3,
      "acc-04": 3,
      "acc-05": 3,
      "acc-02": 2,
      "acc-03": 2,
      "acc-06": 1,
      "acc-07": 1,
      "acc-08": 1,
    },
  },
  {
    key: "jd-insidesales-kolkata",
    company: "sample-fintech",
    title: "Inside Sales Executive (Tele-sales)",
    location: "Kolkata",
    workMode: "On-site",
    text: `Inside Sales Executive (Tele-sales) – Kolkata

SamplePay is a Kolkata-based fintech offering digital gold savings and small-ticket insurance to retail customers. We are expanding our inside sales team at Salt Lake Sector V.

What you will do:
• Call warm leads from digital campaigns and convert them into paying customers (B2C).
• Generate new leads through referrals and follow-ups; make 100+ quality calls a day.
• Record every interaction and follow-up in the CRM.
• Explain products clearly in Bengali, Hindi and English and handle objections.
• Meet weekly and monthly conversion targets.

Requirements:
• Required: 1-3 years of experience in inside sales, tele-sales or B2C phone sales.
• Must have fluent Bengali and Hindi, with working English.
• Experience in lead generation and any CRM tool.
• Graduate in any discipline.
• Experience selling insurance, loans, credit cards or other financial products is an advantage.
• Basic MS Excel preferred.

CTC: 2.4 - 3.6 LPA fixed + monthly incentives
Notice period: up to 30 days
Location: Kolkata (Salt Lake Sector V), work from office`,
    relevance: {
      "sal-01": 3,
      "sal-02": 3,
      "sal-03": 2,
      "sup-03": 2,
      "sal-05": 1,
      "sal-07": 1,
    },
  },
  {
    key: "jd-support-voice-kolkata",
    company: "sample-fintech",
    title: "Customer Support Associate – Voice",
    location: "Kolkata",
    workMode: "On-site",
    text: `Customer Support Associate – Voice (Kolkata)

Join SamplePay's customer support team, which handles queries from app users across eastern India.

Responsibilities:
• Handle inbound calls on payments, account access, KYC and refund issues.
• Log, track and close complaints in the ticketing tool within TAT.
• Escalate unresolved cases to the L2 team with clear notes.
• Maintain quality, AHT and CSAT targets.
• Work in rotational shifts (cab drop provided after 9 pm).

Requirements:
• Required: 0-2 years of experience in an inbound voice process; freshers with good communication may apply.
• Must have fluency in Bengali and Hindi, with working English.
• Experience in complaint handling and any ticketing tool or CRM.
• Education: Higher Secondary (12th) pass minimum; graduates preferred.
• Banking or fintech support experience is an advantage.
• Typing speed of 25+ wpm.

CTC: 1.8 - 2.6 LPA + performance incentive
Immediate joiners preferred (notice period up to 15 days)
Location: Kolkata (on-site)`,
    relevance: {
      "sup-01": 3,
      "sup-06": 3,
      "sup-02": 2,
      "sup-03": 2,
      "sup-04": 1,
      "sup-05": 1,
      "sal-01": 1,
    },
  },
  {
    key: "jd-warehouse-asansol",
    company: "demo-ferro",
    title: "Warehouse & Logistics Executive",
    location: "Asansol",
    workMode: "On-site",
    text: `Warehouse & Logistics Executive – Asansol

Demo Ferro Alloys & Engineering Pvt Ltd is looking for a Warehouse & Logistics Executive for its finished-goods and raw-material warehouse at Asansol.

Key Responsibilities:
• Manage inward, storage and outward of steel products and consumables (~1,000 SKUs).
• Inventory management – cycle counts, physical verification and stock reconciliation.
• Plan daily dispatch, coordinate with transporters and prepare loading slips, challans and e-way bills.
• Maintain stock and dispatch reports in Excel and share MIS with the plant head.
• Supervise loading staff and ensure safe material handling.

Requirements:
• Must have 2-6 years of experience in warehouse, stores or logistics operations.
• Required: inventory management and dispatch planning experience; good MS Excel skills.
• Education: Graduate or Diploma in any discipline.
• Working knowledge of SAP MM (GRN, goods issue, stock reports) is an advantage.
• Experience handling steel, cement or building materials preferred.
• Candidates from Asansol, Durgapur or Raniganj preferred; others must be willing to relocate.

CTC: 3 - 5 LPA
Notice period: up to 30 days
Location: Asansol (on-site)`,
    relevance: {
      "ops-01": 3,
      "ops-02": 3,
      "ops-03": 2,
      "ops-05": 2,
      "ops-04": 1,
    },
  },
  {
    key: "jd-fullstack-bengaluru",
    company: "fictional-labs",
    title: "Full Stack Developer (React + Node.js)",
    location: "Bengaluru",
    workMode: "Remote",
    text: `Full Stack Developer (React + Node.js)

Fictional Labs is a seed-funded Bengaluru startup building inventory and billing software for small retailers. We are a team of 14 engineers and are hiring a Full Stack Developer.

Responsibilities:
• Build and ship features end to end: React front end, Node.js REST APIs and database changes.
• Design clean, documented REST APIs and integrate third-party services (payments, SMS).
• Write SQL queries and schemas in PostgreSQL; work with MongoDB for event logs.
• Review code, write tests and maintain CI pipelines.
• Work closely with product and design in sprint planning.

Requirements:
• Must have 2-5 years of professional experience as a full stack, backend or frontend developer.
• Required: strong React and Node.js (Express or NestJS), REST APIs, SQL (PostgreSQL/MySQL) or MongoDB, and Git.
• Education: B.Tech / B.E. / MCA in Computer Science or a related field (or equivalent experience).
• TypeScript experience is preferred.
• Exposure to AWS, Docker or CI/CD is an advantage.

CTC: 8 - 14 LPA (plus ESOPs)
Notice period: up to 60 days; immediate joiners preferred
Location: Bengaluru (HSR Layout) or Remote within India`,
    relevance: {
      "sw-01": 3,
      "sw-02": 3,
      "sw-03": 2,
      "sw-05": 2,
      "sw-04": 1,
    },
  },
];
