// Live intake switch. false (since 9 November 2026, owner's decision): the public
// application, employer enquiry and privacy request forms accept submissions and
// the site may be indexed. Set to true to make the public site read-only again.
// Shared by the UI and API; visitors cannot change this setting.
export const DEMO_MODE = false;
export const DEMO_MESSAGE = "This is a website demo. Submissions and CV uploads are disabled; no form information is saved.";

export function demoSubmissionResponse() {
  return Response.json({ error: DEMO_MESSAGE, code: "DEMO_READ_ONLY" }, {
    status: 503,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
