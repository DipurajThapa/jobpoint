"use client";
import { useState } from "react";
import { meetingCalendar } from "@/lib/meeting-calendar";
const zone = "Asia/Kolkata";
const dayOf = (s: string) => new Date(s).toLocaleDateString("en-CA", { timeZone: zone });
export default function MeetingPicker({ slots, value, onChange }: { slots: string[]; value: string; onChange: (s: string) => void }) {
  const [chosenDay, setDay] = useState(""), [monthIndex, setMonth] = useState(0);
  const months = [...new Set(slots.map(s => dayOf(s).slice(0, 7)))];
  const month = months[monthIndex] || months[0];
  if (!month) return <p className="label-note">No call times are showing. You can still send your hiring enquiry.</p>;
  const [year, m] = month.split("-").map(Number), count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Set(slots.map(dayOf));
  return <fieldset className="call-picker"><legend>Choose a day and time (optional)</legend><p className="label-note">30-minute call · India Standard Time (UTC+05:30). A requested time needs confirmation.</p>
    <input type="hidden" name="meetingAt" value={slots.includes(value) ? value : ""} />
    <div className="meeting-grid"><div>
      <div className="calendar-month"><button type="button" aria-label="Previous month" disabled={monthIndex === 0} onClick={() => setMonth(i => i - 1)}>‹</button><strong>{new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })}</strong><button type="button" aria-label="Next month" disabled={monthIndex >= months.length - 1} onClick={() => setMonth(i => i + 1)}>›</button></div>
      <div className="calendar-days">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}{Array.from({length: leading}, (_, i) => <span key={`pad${i}`} />)}{Array.from({ length: count }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; return <button type="button" key={date} disabled={!days.has(date)} aria-pressed={chosenDay === date} aria-label={date} onClick={() => { setDay(date); onChange(""); }}>{i + 1}</button>; })}</div>
    </div><div><p>{chosenDay ? `Times for ${chosenDay}` : "Select a day to see times"}</p><div className="meeting-times">{slots.filter(s => dayOf(s) === chosenDay).map(s => <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}>{new Date(s).toLocaleTimeString("en-IN", { timeZone: zone, hour: "numeric", minute: "2-digit" })}</button>)}</div></div></div>
    <button type="button" className="text-link" onClick={() => { setDay(""); onChange(""); }}>Skip meeting selection</button>
    <p aria-live="polite" className="label-note">{value && slots.includes(value) ? `Selected: ${new Date(value).toLocaleString("en-IN", { timeZone: zone, dateStyle: "medium", timeStyle: "short" })} IST. Submit the form to request this time.` : "No time selected."}</p>
  </fieldset>;
}
export function CalendarSave({ start }: { start: string }) {
  const links = meetingCalendar(start);
  function download() { const url = URL.createObjectURL(new Blob([links.ics], { type: "text/calendar;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "jobboard300-tentative-call.ics"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <section className="calendar-save"><h3>Save your proposed time</h3><p>This is a tentative reminder. Wait for our confirmation before making arrangements.</p><div className="calendar-actions"><a href={links.google} target="_blank" rel="noopener noreferrer">Google Calendar</a><a href={links.outlook} target="_blank" rel="noopener noreferrer">Outlook</a><button type="button" onClick={download}>Apple / phone calendar (.ics)</button></div></section>;
}
