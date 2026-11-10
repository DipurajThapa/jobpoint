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
    <div className={general ? "form-grid" : "candidate-job-fields"}>
      <label>Full name<input name="fullName" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Mobile number <span className="label-note">with country code if you want WhatsApp updates</span><input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+91" /></label>
      <label>Where you would like to work <span className="label-note">optional</span><input name="location" maxLength={100} placeholder="e.g. Kolkata" /></label>
      <label className="full-field">Your CV <span className="label-note">PDF or DOCX with selectable text, up to 5 MB. We read your experience, skills and education from it.</span><input name="resume" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <label className="consent full-field"><input name="declaration" type="checkbox" value="yes" required /> <span>I am 18 or older and I accept the <a href="/terms/job-seekers" target="_blank" rel="noopener noreferrer">terms for job seekers</a>.</span></label>
      <label className="consent full-field"><input name="consent" type="checkbox" value="yes" required /> <span>{general ? WEBSITE_FORM.dataGeneral : WEBSITE_FORM.dataJob} <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</span></label>
      <fieldset className="consent-options full-field"><legend>Your choices <span className="label-note">optional</span></legend>
        <label className="consent"><input name="shareConsent" type="checkbox" value="yes" /> <span>{general ? WEBSITE_FORM.shareGeneral : WEBSITE_FORM.shareJob}</span></label>
        {!general && <label className="consent"><input name="futureConsent" type="checkbox" value="yes" /> <span>{WEBSITE_FORM.future}</span></label>}
        <label className="consent"><input name="whatsappConsent" type="checkbox" value="yes" /> <span>{WEBSITE_FORM.whatsapp}</span></label>
        <p className="label-note">To change these later, use the <a href="/privacy#privacy-request">privacy request form</a>.</p>
      </fieldset>
    </div>
  </>;
}
