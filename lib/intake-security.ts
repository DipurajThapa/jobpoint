// Shared public-intake boundaries. All values still go into bound SQL parameters;
// these checks improve data quality and limit abuse, not replace parameter binding.
import { PortalError, sha256Hex, type Db } from "./portal/db";
import { withinLimits } from "./portal/access";

export async function readLimitedBody(request: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) throw new PortalError("BODY_SIZE", "The request is too large.", 413);
  if (!request.body) throw new PortalError("BODY", "The request is empty.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > max) { await reader.cancel(); throw new PortalError("BODY_SIZE", "The request is too large.", 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readLimitedForm(request: Request, max: number) {
  const bytes = await readLimitedBody(request, max);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
  catch { throw new PortalError("FORM", "Submit a valid form with the requested details."); }
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (seen.has(key)) throw new PortalError("FIELDS", "A form field was submitted more than once. Reload the form and try again.");
    seen.add(key);
    if (seen.size > 40 || key.length > 80 || (typeof value === "string" && value.length > 5000)) throw new PortalError("FIELDS", "The form contains too much data.", 413);
  }
  return form;
}
export async function readLimitedJson(request: Request, max: number): Promise<Record<string, unknown>> {
  const bytes = await readLimitedBody(request, max);
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length > 40) throw new Error();
    return body;
  } catch { throw new PortalError("JSON", "Submit a valid request."); }
}
const disposable = new Set(["mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com", "tempmail.com", "yopmail.com"]);
export function validateContact(name: string, email: string, phone: string) {
  if ((name.match(/\p{L}/gu) ?? []).length < 2 || /[<>\x00-\x1f]/.test(name) || /(.)\1{7}/u.test(name)) throw new PortalError("NAME", "Enter your name as you would like a recruiter to address you.");
  const [local, domain, extra] = email.toLowerCase().split("@");
  if (extra !== undefined || !local || local.length > 64 || !domain || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(domain) || domain.split(".").some(p => !p || p.startsWith("-") || p.endsWith("-")) || /[\s<>\x00-\x1f]/.test(email) || email.length > 254) throw new PortalError("EMAIL", "Enter a valid email address.");
  if (disposable.has(domain)) throw new PortalError("EMAIL", "Use an email address you can keep accessing, rather than a temporary inbox.");
  const digits = phone.replace(/\D/g, "");
  if (!/^[+\d ()-]+$/.test(phone) || digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)) throw new PortalError("PHONE", "Enter a valid phone number, including the country code when applicable.");
}
export function validateHiringNeed(company: string, details: string) {
  if ((company.match(/[\p{L}\p{N}]/gu) ?? []).length < 2 || /[<>\x00-\x1f]/.test(company)) throw new PortalError("COMPANY", "Enter your company's name.");
  const plain = details.replace(/https?:\/\/\S+/gi, "");
  if ((plain.match(/\p{L}/gu) ?? []).length < 15 || /(.)\1{10}/u.test(details) || (details.match(/https?:\/\//gi) ?? []).length > 4 || /<\/?(?:script|iframe|object)\b/i.test(details)) throw new PortalError("HIRING_NEED", "Describe the role, key skills and hiring need in a short sentence. Avoid link-only messages.");
}
/** Shared across registration and older intake endpoints; changing forms cannot reset the quota. */
export async function limitContact(db: Db, email: string, phone: string) {
  for (const [kind, value] of [["email", email.trim().toLowerCase()], ["phone", phone.replace(/\D/g, "")]]) {
    if (!value) continue;
    const digest = await sha256Hex(value);
    if (!(await withinLimits(db, `${kind}:${digest}`, "intake_contact")).ok) throw new PortalError("RATE_LIMIT", "We have received several requests with these contact details. Please try again later or sign in to update your information.", 429);
  }
}
