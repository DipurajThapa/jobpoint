// Keep the public review site read-only until live intake is explicitly approved.
// Shared by the UI and API; visitors cannot change this setting.
export const DEMO_MODE = true;
export const DEMO_MESSAGE = "This is a website demo. Submissions and CV uploads are disabled; no form information is saved.";

export function demoSubmissionResponse() {
  return Response.json({ error: DEMO_MESSAGE, code: "DEMO_READ_ONLY" }, {
    status: 503,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
