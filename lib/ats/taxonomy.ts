// Skill taxonomy for CV and job-description matching.
// Each entry: [canonical id, display label, family, ...aliases]. Aliases are
// matched on word boundaries after normalise(); the label is always an alias.
// Skills in the same family earn partial credit for each other (for example,
// Busy accounting for a Tally requirement). Labels are seeded from ESCO and
// Lightcast open-skill names and adapted to Indian recruitment wording.

type Entry = [string, string, string, ...string[]];

const ENTRIES: Entry[] = [
  // Accounting and finance
  ["tally", "Tally", "accounting-software", "tally erp", "tally erp 9", "tally erp9", "tally prime", "tallyprime", "tally.erp 9"],
  ["busy", "Busy Accounting", "accounting-software", "busy accounting software", "busy software"],
  ["zoho-books", "Zoho Books", "accounting-software"],
  ["quickbooks", "QuickBooks", "accounting-software", "quick books"],
  ["marg", "Marg ERP", "accounting-software", "marg software"],
  ["sap-fico", "SAP FICO", "erp", "sap fi", "sap fi co", "sap finance"],
  ["sap", "SAP", "erp", "sap erp", "sap s 4hana", "sap hana", "sap mm", "sap sd"],
  ["oracle-erp", "Oracle ERP", "erp", "oracle financials", "oracle netsuite", "netsuite"],
  ["gst", "GST", "indirect-tax", "gst returns", "gst filing", "gst compliance", "gstr", "gstr 1", "gstr 3b", "goods and services tax", "gst return filing"],
  ["tds", "TDS", "direct-tax", "tds returns", "tds filing", "tax deducted at source"],
  ["income-tax", "Income tax", "direct-tax", "income tax returns", "itr filing", "itr"],
  ["bookkeeping", "Bookkeeping and accounting", "accounting", "bookkeeping", "accounting", "accountancy", "general accounting", "book keeping", "books of accounts", "journal entries", "ledger posting", "ledger maintenance", "voucher entry"],
  ["bank-reconciliation", "Bank reconciliation", "accounting", "bank reconciliations", "brs", "bank reco"],
  ["accounts-payable", "Accounts payable", "accounting", "payables", "vendor payments", "ap"],
  ["accounts-receivable", "Accounts receivable", "accounting", "receivables", "collections follow up", "debtors management", "ar"],
  ["financial-reporting", "Financial reporting", "accounting", "financial statements", "balance sheet", "profit and loss", "p l statement", "final accounts", "finalisation of accounts", "finalization of accounts"],
  ["audit", "Audit", "accounting", "internal audit", "statutory audit", "audit support"],
  ["payroll", "Payroll", "hr-ops", "payroll processing", "salary processing", "pf esi", "pf and esi", "epf", "esic"],
  ["costing", "Cost accounting", "accounting", "costing", "cost control", "cost analysis"],
  ["budgeting", "Budgeting", "finance", "budget", "forecasting", "financial planning", "fp a", "mis budgeting"],
  ["mis-reporting", "MIS reporting", "reporting", "mis", "mis reports", "management information system", "daily reports", "weekly reports"],
  ["inventory-accounting", "Inventory accounting", "accounting", "stock reconciliation", "stock statement", "inventory valuation"],
  ["banking-ops", "Banking operations", "finance", "banking operations", "cash handling", "cash management", "kyc", "loan processing"],
  ["credit-analysis", "Credit analysis", "finance", "credit appraisal", "credit assessment", "underwriting"],

  // Office and data tools
  ["excel", "MS Excel", "office", "excel", "ms excel", "microsoft excel", "advanced excel", "spreadsheets", "spreadsheet"],
  ["vlookup", "VLOOKUP / pivot tables", "office", "vlookup", "xlookup", "hlookup", "pivot table", "pivot tables", "pivots"],
  ["ms-word", "MS Word", "office", "ms word", "microsoft word"],
  ["powerpoint", "PowerPoint", "office", "ms powerpoint", "microsoft powerpoint", "presentations"],
  ["ms-office", "MS Office", "office", "microsoft office", "ms office suite", "office 365", "microsoft 365"],
  ["google-workspace", "Google Workspace", "office", "google sheets", "google docs", "g suite", "gsuite"],
  ["data-entry", "Data entry", "admin", "data entry operator", "typing", "data processing"],
  ["power-bi", "Power BI", "analytics", "powerbi", "power bi dashboards"],
  ["tableau", "Tableau", "analytics"],
  ["data-analysis", "Data analysis", "analytics", "data analytics", "analysing data", "analyzing data", "data analyst"],

  // Sales and business development
  ["sales", "Sales", "sales", "selling", "sales executive", "sales officer", "sales manager", "sales representative", "sales experience", "sales role", "sales team", "sales and marketing", "salesman"],
  ["b2b-sales", "B2B sales", "sales", "b2b", "corporate sales", "enterprise sales", "institutional sales", "business to business"],
  ["b2c-sales", "B2C sales", "sales", "b2c", "retail sales", "direct sales", "counter sales", "showroom sales"],
  ["field-sales", "Field sales", "sales", "field sales", "outdoor sales", "on field sales", "territory sales", "market visits"],
  ["inside-sales", "Inside sales", "sales", "inside sales", "telesales", "tele sales", "telesales", "tele calling", "telecalling", "tele caller", "telecaller"],
  ["cold-calling", "Cold calling", "sales", "cold calls", "cold call"],
  ["lead-generation", "Lead generation", "sales", "lead gen", "prospecting", "generating leads", "lead sourcing"],
  ["business-development", "Business development", "sales", "bd", "bde", "new business", "client acquisition", "customer acquisition"],
  ["key-account-management", "Key account management", "sales", "account management", "kam", "key accounts", "client relationship management", "relationship management"],
  ["channel-sales", "Channel sales", "sales", "distributor management", "dealer management", "channel partners", "distribution network", "dealer network"],
  ["fmcg-sales", "FMCG sales", "sales", "fmcg", "general trade", "modern trade", "secondary sales", "primary sales"],
  ["negotiation", "Negotiation", "soft", "negotiating", "negotiation skills", "closing deals"],
  ["sales-targets", "Target achievement", "sales", "sales targets", "achieving targets", "target driven", "quota", "revenue targets"],
  ["crm", "CRM", "crm", "crm software", "customer relationship management", "crm tools"],
  ["salesforce", "Salesforce", "crm", "salesforce crm", "sfdc"],
  ["zoho-crm", "Zoho CRM", "crm"],
  ["hubspot", "HubSpot", "crm", "hubspot crm"],
  ["insurance-sales", "Insurance sales", "sales", "life insurance", "general insurance", "insurance advisor", "bancassurance"],
  ["real-estate-sales", "Real estate sales", "sales", "property sales", "real estate"],
  ["pharma-sales", "Pharma sales", "sales", "medical representative", "medical rep", "pharmaceutical sales"],

  // Marketing
  ["digital-marketing", "Digital marketing", "marketing", "online marketing", "performance marketing"],
  ["seo", "SEO", "marketing", "search engine optimisation", "search engine optimization"],
  ["social-media", "Social media marketing", "marketing", "social media", "smm", "instagram marketing", "facebook marketing"],
  ["google-ads", "Google Ads", "marketing", "adwords", "google adwords", "ppc", "sem"],
  ["content-writing", "Content writing", "marketing", "copywriting", "content creation", "blog writing"],
  ["market-research", "Market research", "marketing", "market survey", "competitor analysis", "competitive analysis"],
  ["brand-promotion", "Brand promotion", "marketing", "brand activation", "btl activities", "btl", "atl", "promotional activities"],
  ["email-marketing", "Email marketing", "marketing", "email campaigns", "mailchimp"],

  // Customer service and support
  ["customer-service", "Customer service", "customer-service", "customer support", "customer care", "client servicing", "customer handling", "customer relations"],
  ["call-handling", "Inbound and outbound calls", "customer-service", "inbound calls", "outbound calls", "call handling", "voice process", "inbound", "outbound", "call centre", "call center", "bpo"],
  ["non-voice", "Non-voice support", "customer-service", "non voice", "chat support", "email support", "chat process"],
  ["complaint-handling", "Complaint resolution", "customer-service", "complaint handling", "grievance handling", "escalation handling", "issue resolution", "query resolution", "resolving queries"],
  ["ticketing", "Ticketing tools", "customer-service", "ticketing tool", "ticketing", "ticket management", "ticket logging", "zendesk", "freshdesk", "servicenow", "ticketing system", "helpdesk"],
  ["technical-support", "Technical support", "it-support", "tech support", "it support", "desktop support", "it helpdesk", "l1 support", "l2 support"],

  // Operations, admin, logistics, supply chain
  ["operations-management", "Operations management", "operations", "operations", "back office", "back office operations", "process management", "daily operations"],
  ["office-administration", "Office administration", "admin", "office administration", "administration", "admin work", "front office", "reception", "receptionist", "facility management", "office management"],
  ["documentation", "Documentation", "admin", "record keeping", "record maintenance", "document management", "maintaining records"],
  ["inventory-management", "Inventory management", "supply-chain", "inventory", "inventory control", "cycle count", "cycle counts", "physical verification", "stock transfers", "sku", "skus", "stock management", "stock maintenance", "stock control", "store management", "store keeping", "storekeeping", "stores management", "stores in charge", "stores incharge", "store in charge", "store incharge", "stores executive", "stock register", "grn", "goods receipt"],
  ["warehouse-management", "Warehouse management", "supply-chain", "warehouse", "warehouse operations", "godown", "godown management", "warehousing", "wms", "dispatch", "receiving and dispatch"],
  ["logistics", "Logistics", "supply-chain", "logistics coordination", "transportation", "fleet management", "shipment", "shipping"],
  ["procurement", "Procurement", "supply-chain", "purchasing", "purchase department", "purchase executive", "purchase officer", "purchase management", "vendor management", "purchase orders", "vendor development"],
  ["supply-chain-management", "Supply chain management", "supply-chain", "scm", "supply chain"],
  ["export-import", "Export and import", "supply-chain", "exim", "export import", "customs clearance", "export documentation"],
  ["quality-control", "Quality control", "quality", "qc", "quality checks", "quality inspection", "quality assurance", "qa qc"],
  ["iso", "ISO standards", "quality", "iso 9001", "iso documentation", "iso audits"],
  ["production-planning", "Production planning", "manufacturing", "ppc", "production planning and control", "production scheduling"],
  ["production", "Production", "manufacturing", "production supervision", "production supervisor", "production line", "production planning and execution", "shop floor", "manufacturing operations", "plant operations"],
  ["maintenance", "Maintenance", "manufacturing", "preventive maintenance", "breakdown maintenance", "plant maintenance"],
  ["lean", "Lean / 5S / Kaizen", "manufacturing", "5s", "kaizen", "six sigma", "lean manufacturing", "tpm"],
  ["safety", "Health and safety", "manufacturing", "ehs", "hse", "industrial safety", "safety compliance"],
  ["autocad", "AutoCAD", "engineering-design", "auto cad"],
  ["solidworks", "SolidWorks", "engineering-design", "solid works"],
  ["electrical-maintenance", "Electrical maintenance", "engineering", "electrical", "plc", "electrical wiring", "panel wiring"],
  ["mechanical", "Mechanical engineering", "engineering", "mechanical", "fitter", "machining", "cnc", "welding"],
  ["civil-site", "Civil site work", "engineering", "site supervision", "site engineer", "civil engineering", "construction", "estimation", "billing engineer"],

  // HR and recruitment
  ["recruitment", "Recruitment", "hr", "recruiting", "talent acquisition", "sourcing candidates", "screening candidates", "end to end recruitment", "headhunting"],
  ["onboarding", "Onboarding", "hr", "employee onboarding", "induction", "joining formalities"],
  ["hr-operations", "HR operations", "hr", "hr ops", "hr administration", "employee records", "hrms", "attendance management", "leave management"],
  ["employee-relations", "Employee relations", "hr", "employee engagement", "grievance redressal", "industrial relations"],
  ["statutory-compliance", "Statutory compliance", "hr", "labour law", "labour laws", "statutory compliances", "compliance management"],
  ["job-portals", "Job portals", "hr", "naukri", "naukri com", "linkedin recruiter", "monster", "indeed", "shine"],

  // IT and software
  ["javascript", "JavaScript", "programming", "js", "es6", "ecmascript"],
  ["typescript", "TypeScript", "programming"],
  ["python", "Python", "programming", "python3"],
  ["java", "Java", "programming", "core java", "j2ee", "spring boot"],
  ["c-sharp", "C#", "programming", "c#", "c sharp", ".net", "dotnet", "asp.net", "asp net"],
  ["c-cpp", "C / C++", "programming", "c++", "cpp", "c programming", "c language"],
  ["php", "PHP", "programming", "laravel", "codeigniter"],
  ["go", "Go (Golang)", "programming", "golang"],
  ["sql", "SQL", "database", "mysql", "postgresql", "postgres", "sql server", "ms sql", "oracle sql", "pl sql", "sqlite", "t sql"],
  ["mongodb", "MongoDB", "database", "mongo"],
  ["react", "React", "frontend", "react.js", "reactjs", "react js", "next.js", "nextjs"],
  ["angular", "Angular", "frontend", "angularjs", "angular js"],
  ["vue", "Vue", "frontend", "vue.js", "vuejs"],
  ["html-css", "HTML / CSS", "frontend", "html", "css", "html5", "css3", "bootstrap", "tailwind"],
  ["nodejs", "Node.js", "backend", "node.js", "node js", "express.js", "expressjs"],
  ["django", "Django", "backend", "flask", "fastapi"],
  ["rest-api", "REST APIs", "backend", "restful", "rest api", "api development", "web services"],
  ["git", "Git", "devtools", "github", "gitlab", "bitbucket", "version control"],
  ["aws", "AWS", "cloud", "amazon web services", "ec2", "s3", "lambda"],
  ["azure", "Azure", "cloud", "microsoft azure"],
  ["gcp", "Google Cloud", "cloud", "google cloud platform"],
  ["docker", "Docker", "devops", "containers", "kubernetes", "k8s"],
  ["linux", "Linux", "systems", "unix", "shell scripting", "bash"],
  ["networking", "Networking", "systems", "lan", "wan", "tcp ip", "ccna", "routers", "firewall"],
  ["windows-admin", "Windows administration", "systems", "active directory", "windows server", "system administration", "system admin"],
  ["hardware", "Hardware troubleshooting", "it-support", "hardware", "hardware and networking", "computer hardware"],
  ["software-testing", "Software testing", "qa", "manual testing", "automation testing", "selenium", "test cases", "qa testing"],
  ["android", "Android development", "mobile", "android", "kotlin"],
  ["flutter", "Flutter", "mobile", "dart", "react native"],
  ["machine-learning", "Machine learning", "data-science", "ml", "deep learning", "nlp", "artificial intelligence"],
  ["ui-ux", "UI / UX design", "design", "ui design", "ux design", "figma", "adobe xd", "wireframing"],
  ["graphic-design", "Graphic design", "design", "photoshop", "illustrator", "coreldraw", "corel draw", "canva", "indesign"],
  ["video-editing", "Video editing", "design", "premiere pro", "after effects", "final cut"],
  ["wordpress", "WordPress", "web", "wordpress development", "woocommerce"],
  ["cybersecurity", "Cyber security", "security", "information security", "network security", "vapt", "soc"],

  // Healthcare, education, hospitality, retail
  ["nursing", "Nursing", "healthcare", "staff nurse", "gnm", "anm", "patient care"],
  ["pharmacy", "Pharmacy", "healthcare", "pharmacist", "d pharm", "b pharm", "dispensing"],
  ["lab-technician", "Lab technician", "healthcare", "dmlt", "pathology", "laboratory"],
  ["medical-billing", "Medical billing and coding", "healthcare", "medical coding", "medical billing", "rcm"],
  ["teaching", "Teaching", "education", "teacher", "tutoring", "lesson planning", "classroom management", "faculty"],
  ["counselling", "Counselling", "education", "student counselling", "career counselling", "admission counselling"],
  ["hospitality", "Hospitality", "hospitality", "hotel management", "front desk", "guest relations", "housekeeping", "food and beverage", "f b service"],
  ["retail-operations", "Retail store operations", "retail", "store operations", "visual merchandising", "merchandising", "pos", "billing counter", "cashier"],

  // Driving and field roles
  ["driving", "Driving", "field", "driving licence", "driving license", "two wheeler", "four wheeler", "lmv", "hmv", "valid licence"],
  ["security-guard", "Security services", "field", "security guard", "security supervisor", "guarding"],
  ["delivery", "Delivery", "field", "delivery executive", "last mile delivery", "courier"],

  // Soft skills (low weight in practice: commonly listed, hard to verify)
  ["communication", "Communication", "soft", "communication skills", "verbal communication", "written communication", "good communication", "presentation skills", "spoken english"],
  ["teamwork", "Teamwork", "soft", "team player", "team work", "collaboration"],
  ["leadership", "Team leadership", "soft", "team leadership", "team management", "team handling", "people management", "managing a team", "led a team", "supervised"],
  ["problem-solving", "Problem solving", "soft", "problem solving skills", "analytical skills", "critical thinking"],
  ["time-management", "Time management", "soft", "multitasking", "multi tasking", "prioritisation", "prioritization"],
  ["coordination", "Coordination", "soft", "coordinating", "liaison", "liaising", "follow up", "follow ups", "follow-ups"],
  ["interpersonal", "Interpersonal skills", "soft", "interpersonal", "people skills", "relationship building"],

  // Languages
  ["lang-english", "English", "language", "english"],
  ["lang-hindi", "Hindi", "language", "hindi"],
  ["lang-bengali", "Bengali", "language", "bengali", "bangla"],
  ["lang-odia", "Odia", "language", "odia", "oriya"],
  ["lang-urdu", "Urdu", "language", "urdu"],
  ["lang-nepali", "Nepali", "language", "nepali"],
  ["lang-santali", "Santali", "language", "santali"],
  ["lang-assamese", "Assamese", "language", "assamese"],
  ["lang-tamil", "Tamil", "language", "tamil"],
  ["lang-telugu", "Telugu", "language", "telugu"],
  ["lang-marathi", "Marathi", "language", "marathi"],
  ["lang-gujarati", "Gujarati", "language", "gujarati"],
  ["lang-punjabi", "Punjabi", "language", "punjabi"],
  ["lang-kannada", "Kannada", "language", "kannada"],
  ["lang-malayalam", "Malayalam", "language", "malayalam"],
];

export type TaxonomySkill = { id: string; label: string; family: string; aliases: string[] };

/** Lower-case, unify punctuation, collapse whitespace; keeps + # . inside tokens (c++, c#, node.js). */
export function normalise(text: string): string {
  return ` ${text.toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/(\w)'s\b/g, "$1s")
    .replace(/[^a-z0-9+#.\n]+/g, " ")
    .replace(/\.(?=\s|$)/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()} `;
}

// Skills whose bare label is everyday vocabulary in other roles ("sales vouchers",
// "production report"): they match only on their specific phrases.
const LABEL_NOT_ALIAS = new Set(["sales", "production"]);

export const SKILLS: TaxonomySkill[] = ENTRIES.map(([id, label, family, ...aliases]) => {
  const all = new Set([...(LABEL_NOT_ALIAS.has(id) ? [] : [label]), ...aliases].map(a => normalise(a).trim()).filter(a => a.length > 1 || a === "c"));
  if (LABEL_NOT_ALIAS.has(id)) all.delete(normalise(label).trim());
  return { id, label, family, aliases: [...all] };
});

const byId = new Map(SKILLS.map(s => [s.id, s]));
export const skillById = (id: string) => byId.get(id);

// Generic two-letter aliases that are risky out of context. They only count
// inside a skills or certification section, not in free text.
const CONTEXT_ONLY = new Set(["ap", "ar", "bd", "ml", "qc", "js", "pos", "itr", "mis", "brs", "soc", "ppc", "sem", "kam", "scm", "atl", "btl"]);

/** Every taxonomy skill mentioned in `text`, with the alias that matched. */
// Accounting vocabulary ("purchase, sales, journal and receipt vouchers", "sales register")
// names voucher types, not the sales or procurement skills.
const VOUCHER_LIST = /\b((?:(?:purchase|sales|journal|payment|receipt|contra|debit|credit|note|notes|and)\s+)+)(vouchers?|entries|register|registers|ledgers?|invoices?|returns?|book|books|bills?)\b/g;
const maskAccounting = (text: string) => text.replace(VOUCHER_LIST, (_m, list: string, tail: string) => `${list.replace(/\b(sales|purchase)\b/g, "$1_acct")}${tail}`);

export function findSkills(text: string, opts: { allowShortAliases?: boolean } = {}): { skill: TaxonomySkill; alias: string; index: number }[] {
  const haystack = maskAccounting(normalise(text));
  const found: { skill: TaxonomySkill; alias: string; index: number }[] = [];
  for (const skill of SKILLS) {
    let best: { alias: string; index: number } | null = null;
    for (const alias of skill.aliases) {
      if (CONTEXT_ONLY.has(alias) && !opts.allowShortAliases) continue;
      const index = haystack.indexOf(` ${alias} `);
      if (index >= 0 && (!best || alias.length > best.alias.length)) best = { alias, index };
    }
    if (best) found.push({ skill, ...best });
  }
  // Drop a match fully contained in a longer match of a different skill
  // ("sales" inside "field sales" still counts as Sales: keep both; but "sap"
  // inside "sap fico" should not add generic SAP).
  return found.filter(f => !found.some(o => o !== f && o.skill.family === f.skill.family && o.alias.length > f.alias.length && o.alias.includes(f.alias) && o.index <= f.index && f.index + f.alias.length <= o.index + o.alias.length && f.skill.id !== "sales"));
}

/** Resolve free text (a requirement or a CV skill item) to a taxonomy skill, or a normalised free term. */
export function resolveSkill(text: string): { id: string; name: string; family: string } | null {
  const clean = normalise(text).trim();
  if (!clean || clean.length > 60) return null;
  const exact = SKILLS.find(s => s.aliases.includes(clean));
  if (exact) return { id: exact.id, name: exact.label, family: exact.family };
  const inside = findSkills(text, { allowShortAliases: true });
  if (inside.length === 1) return { id: inside[0].skill.id, name: inside[0].skill.label, family: inside[0].skill.family };
  if (clean.split(" ").length > 5) return null;
  return { id: `term:${clean}`, name: text.trim().replace(/\s+/g, " "), family: "term" };
}
