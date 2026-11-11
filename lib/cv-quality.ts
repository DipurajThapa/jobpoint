import type { CandidateProfile } from "./ats/types";
/** Review prompts, never assertions of fraud or automatic employment decisions. */
export function cvReviewReasons(profile: CandidateProfile, text: string, email = "") {
  const reasons: string[] = [];
  if (text.replace(/\s/g, "").length < 200) reasons.push("Limited readable text: check the original CV with the candidate.");
  if (!profile.work.length && !profile.education.length) reasons.push("No work history or education could be read: check whether this is a complete CV.");
  if (email && profile.contact.email && email.toLowerCase() !== profile.contact.email.toLowerCase()) reasons.push("The CV email differs from the submitted email: confirm the candidate's contact details.");
  return reasons;
}
