// Calendar exports are personal reminders; staff confirmation remains separate.
export const MEETING_TITLE = "Proposed Jobboard300 hiring call — awaiting confirmation";
export const MEETING_DESCRIPTION = "Tentative time requested for an IT or non-IT hiring discussion. This calendar reminder does not confirm a booking. Please wait for Jobboard300 to confirm the time and contact details.";
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
export function meetingCalendar(start: string) {
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid meeting time.");
  const end = new Date(date.getTime() + 30 * 60_000), from = stamp(date), to = stamp(end);
  const google = new URL("https://calendar.google.com/calendar/render");
  google.search = new URLSearchParams({ action: "TEMPLATE", text: MEETING_TITLE, dates: `${from}/${to}`, details: MEETING_DESCRIPTION }).toString();
  const outlook = new URL("https://outlook.office.com/calendar/0/deeplink/compose");
  outlook.search = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: MEETING_TITLE, startdt: date.toISOString(), enddt: end.toISOString(), body: MEETING_DESCRIPTION }).toString();
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  // RFC 5545 lines are folded at 75 octets; text is UTF-8.
  const fold = (s: string) => { const lines: string[] = []; let line = "", bytes = 0; for (const ch of s) { const n = new TextEncoder().encode(ch).length; if (bytes + n > 74) { lines.push(line); line = " "; bytes = 1; } line += ch; bytes += n; } return [...lines, line].join("\r\n"); };
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jobboard300//Hiring call//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:request-${from}@jobboard300`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${from}`, `DTEND:${to}`, `SUMMARY:${escape(MEETING_TITLE)}`, `DESCRIPTION:${escape(MEETING_DESCRIPTION)}`, "STATUS:TENTATIVE", "TRANSP:TRANSPARENT", "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
  return { google: google.href, outlook: outlook.href, ics };
}
