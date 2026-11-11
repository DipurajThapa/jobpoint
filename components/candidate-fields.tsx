import { WEBSITE_FORM } from "@/lib/portal/notice";

/**
 * Candidate fields shared by the general "Upload your CV" form and a job's
 * application form. The CV carries the experience, skills and education, so
 * the form asks only who the person is, how to reach them, and what they agree to.
 * The consent sentences come from lib/portal/notice.ts, so the screen and the
 * record of what was agreed always carry the same words.
 */
export default function CandidateFields({ jobId }: { jobId?: string }) {
  const general = !jobId;
  return <>
    {jobId && <input type="hidden" name="jobId" value={jobId} />}
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <div className={general ? "public-form" : "public-form public-form-job"}>
      <div className="form-section-heading"><span className="material-symbols-rounded" aria-hidden="true">person</span><div><h3>Your details</h3><p>How a recruiter can reach you</p></div></div>
      <div className="form-grid">
      <label>Full name<input name="fullName" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Mobile number<input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+91" /><span className="label-note">Include a country code for WhatsApp updates</span></label>
      <label>Where you would like to work<input name="location" maxLength={100} placeholder="Preferred city or remote" /><span className="label-note">Optional</span></label>
      </div>
      <div className="form-section-heading"><span className="material-symbols-rounded" aria-hidden="true">description</span><div><h3>Your CV</h3><p>PDF or DOCX, up to 5 MB</p></div></div>
      <div className="form-grid">
      <label className="full-field">Your CV<input name="resume" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><span className="label-note">Use a PDF or DOCX with selectable text. We read your experience, skills and education from it.</span></label>
      </div>
      <div className="form-section-heading"><span className="material-symbols-rounded" aria-hidden="true">verified_user</span><div><h3>Consent and preferences</h3><p>Choose how your CV may be used</p></div></div>
      <div className="form-consents">
      <label className="consent full-field"><input name="declaration" type="checkbox" value="yes" required /> <span>I am 18 or older and I accept the <a href="/terms/job-seekers" target="_blank" rel="noopener noreferrer">terms for job seekers</a>.</span></label>
      <label className="consent full-field"><input name="consent" type="checkbox" value="yes" required /> <span>{general ? WEBSITE_FORM.dataGeneral : WEBSITE_FORM.dataJob} <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</span></label>
      <fieldset className="consent-options full-field"><legend>Your choices <span className="label-note">optional</span></legend>
        <label className="consent"><input name="shareConsent" type="checkbox" value="yes" /> <span>{general ? WEBSITE_FORM.shareGeneral : WEBSITE_FORM.shareJob}</span></label>
        {!general && <label className="consent"><input name="futureConsent" type="checkbox" value="yes" /> <span>{WEBSITE_FORM.future}</span></label>}
        <label className="consent"><input name="whatsappConsent" type="checkbox" value="yes" /> <span>{WEBSITE_FORM.whatsapp}</span></label>
        <p className="label-note">To change these later, use the <a href="/privacy#privacy-request">privacy request form</a>.</p>
      </fieldset>
      </div>
    </div>
  </>;
}
