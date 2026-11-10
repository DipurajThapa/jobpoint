/**
 * Candidate fields shared by the general "Upload your CV" form and a job's
 * application form. The CV carries the experience, skills and education, so
 * the form asks only who the person is, how to reach them, and what they agree to.
 */
export default function CandidateFields({ jobId }: { jobId?: string }) {
  const general = !jobId;
  return <>
    {jobId && <input type="hidden" name="jobId" value={jobId} />}
    {/* Registering a CV without a role is itself the request to be contacted about suitable roles. */}
    {general && <input type="hidden" name="futureConsent" value="yes" />}
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <div className={general ? "form-grid" : "candidate-job-fields"}>
      <label>Full name<input name="fullName" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Mobile number <span className="label-note">with WhatsApp, if you use it</span><input name="phone" type="tel" required maxLength={30} autoComplete="tel" placeholder="+91" /></label>
      <label>Preferred work location <span className="label-note">optional</span><input name="location" maxLength={100} placeholder="e.g. Kolkata" /></label>
      <label className="full-field">Your CV <span className="label-note">PDF or DOCX with selectable text, up to 5 MB. We read your experience, skills and education from it.</span><input name="resume" type="file" required accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <label className="consent full-field"><input name="agree" type="checkbox" value="yes" required /> <span>I am 18 or older. I agree that Jobboard300 may use my details and CV {general ? "to consider me for suitable roles and contact me about them" : "to process this application"}, as set out in the <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> and the <a href="/terms/job-seekers" target="_blank" rel="noopener noreferrer">terms for job seekers</a>.</span></label>
      <fieldset className="consent-options full-field"><legend>Your choices <span className="label-note">optional; you can change them later</span></legend>
        <label className="consent"><input name="shareConsent" type="checkbox" value="yes" /> <span>You may share my CV with {general ? "an employer for a role that suits me" : "the employer for this role"}, after a recruiter has reviewed the fit.</span></label>
        {!general && <label className="consent"><input name="futureConsent" type="checkbox" value="yes" /> <span>Keep my CV and contact me about other suitable roles.</span></label>}
        <label className="consent"><input name="whatsappConsent" type="checkbox" value="yes" /> <span>Send me updates on WhatsApp at this number, as well as by email.</span></label>
      </fieldset>
    </div>
  </>;
}
