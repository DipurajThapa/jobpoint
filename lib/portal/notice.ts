// Consent notice text (DPDP Rules 2025, Rule 3): standalone, itemised, one per purpose.
// Shared by the upload screen and the consent ledger (the ledger stores a hash of this text).
export const CONSENT_NOTICE_VERSION = "portal-2026-11-09";
export const CONSENT_NOTICE = {
  profile_processing: "Job Point will store your CV and the details read from it (work history, education, skills, certifications, current and preferred cities, notice period and CTC) to build your profile, match it with job descriptions, and show you suitable jobs. Your name, gender, age, religion, caste, marital status and photo are never used for matching.",
  share_with_companies: "When your profile closely matches a job, Job Point will show the hiring company an anonymous summary (title, years of experience, key skills, city, match score and the reasons for it). If the company unlocks your profile, it will see your full CV and contact details for that hiring purpose. You can withdraw this consent at any time from Privacy and consent; we then stop showing your profile to companies immediately.",
  service_offers: "Optional: Job Point may tell you about paid services such as CV writing, LinkedIn profile optimisation, spoken English and technical training.",
} as const;
