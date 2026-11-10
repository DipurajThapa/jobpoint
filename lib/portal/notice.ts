// Consent notice text (DPDP Rules 2025, Rule 3): standalone, itemised, one per purpose.
// Shared by the upload screen and the consent ledger (the ledger stores a hash of this text).
export const CONSENT_NOTICE_VERSION = "portal-2026-11-09b";
export const CONSENT_NOTICE = {
  profile_processing: "Jobboard300 will store your CV and the details read from it (work history, education, skills, certifications, current and preferred cities, notice period and CTC) to build your profile and match it with job descriptions, so that a Jobboard300 recruiter can contact you about suitable roles. Your name, gender, age, religion, caste, marital status and photo are never used for matching.",
  share_with_companies: "When your profile closely matches a job, Jobboard300 will show the hiring company an anonymous summary (title, years of experience, key skills, city, match score and the reasons for it). If the company unlocks your profile, it will see your full CV and contact details for that hiring purpose. You can withdraw this consent at any time under “Sharing with employers” on your My CV and privacy page; we then stop showing your profile to companies immediately.",
  service_offers: "Optional: Jobboard300 may tell you about paid services such as CV writing, LinkedIn profile optimisation, spoken English and technical training.",
} as const;

/**
 * Consent wording on the public website's application and registration forms
 * (components/candidate-fields.tsx). When a website applicant joins the
 * candidate list, their ticks are recorded in the same ledger against this
 * wording, never against the portal notice they did not see.
 */
export const WEBSITE_NOTICE = {
  // Ticked on a job application to stay on file for other roles.
  profile_processing: "Keep my CV and contact me about other suitable roles.",
  // The data consent of the general "Upload your CV" form: being matched and contacted is what registering is for.
  registration: "Jobboard300 may store my CV and details, match them to roles and contact me about roles that fit.",
  recruiter_sharing: "You may share my CV with an employer for a role that suits me, after a recruiter has reviewed the fit.",
} as const;
/** The sentences on the website's candidate form, word for word. The form shows these and the records keep their version. */
export const WEBSITE_FORM_VERSION = "2026-11-11";
export const WEBSITE_FORM = {
  declaration: "I am 18 or older and I accept the terms for job seekers.",
  dataJob: "Jobboard300 may store my CV and details and use them to consider me for this role.",
  dataGeneral: WEBSITE_NOTICE.registration,
  shareJob: "You may share my CV with the employer for this role, after a recruiter has reviewed the fit.",
  shareGeneral: WEBSITE_NOTICE.recruiter_sharing,
  future: WEBSITE_NOTICE.profile_processing,
  whatsapp: "Send me updates on WhatsApp at this number, as well as by email.",
} as const;
export const websiteNoticeVersion = (privacyVersion: string) => `website-${privacyVersion}`;
