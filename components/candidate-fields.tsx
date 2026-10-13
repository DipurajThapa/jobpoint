/** Candidate fields shared by general registration and individual job applications. */
export default function CandidateFields({ jobId }: { jobId?: string }) {
  const general = !jobId;
  const full = general ? "full-field" : undefined;
  const consentClass = general ? "consent full-field" : "consent";
  return <>
    {jobId && <input type="hidden" name="jobId" value={jobId} />}
    <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <div className={general ? "form-grid" : "candidate-job-fields"}>
      <label>Full name<input name="fullName" required maxLength={120} autoComplete="name" /></label>
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Phone<input name="phone" type="tel" required maxLength={30} autoComplete="tel" /></label>
      <label>Preferred location<input name="location" required maxLength={100} /></label>
      <label>Desired role<input name="desiredRole" required={general} maxLength={160} /></label>
      <label>Skills<input name="skills" maxLength={500} placeholder="e.g. customer service, Excel" /></label>
      <label>Availability<input name="availability" maxLength={100} placeholder="e.g. within 30 days" /></label>
      <label>Education<input name="education" maxLength={160} /></label>
      <label className={full}>Experience summary<textarea name="experience" required maxLength={1200} rows={3} /></label>
      <label className={full}>CV / resume <span className="label-note">PDF or DOCX, up to 5 MB</span><input name="resume" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /></label>
      <label className={consentClass}><input name="consent" type="checkbox" value="yes" required /> I agree that Job Point Consultancy may use these details {general ? "to register my interest in recruitment opportunities" : "to process this application"}. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy notice</a>.</label>
      <label className={consentClass}><input name="adult" type="checkbox" value="yes" required /> I confirm I am at least 18 years old.</label>
      <label className={consentClass}><input name="shareConsent" type="checkbox" value="yes" /> You may share my CV with {general ? "an employer for a suitable role" : "the employer for this role"} after reviewing the fit.</label>
      <label className={consentClass}><input name="futureConsent" type="checkbox" value="yes" required={general} /> Contact me about other suitable roles later.</label>
    </div>
  </>;
}
