// Sends the hiring updates that were queued as email (messages with channel 'email', status 'queued').
// There is no scheduler on this hosting, so the portal's API routes call this after each request, a few at a time.
// The address is read at send time from the person's record, so nothing is sent to someone who was erased.
import { nowIso, type Db } from "./db";
import { sendMail } from "./mailer";
import { SITE_URL } from "../site";

type Queued = { id: string; recipient_kind: "candidate" | "company"; recipient_id: string; kind: string; title: string; body: string; link: string };

async function addresses(db: Db, m: Queued): Promise<string[]> {
  if (m.recipient_kind === "candidate") {
    const r = await db.prepare("SELECT email FROM candidates WHERE id = ? AND status = 'active'").bind(m.recipient_id).first<{ email: string | null }>();
    return r?.email ? [r.email] : [];
  }
  const { results } = await db.prepare("SELECT a.email FROM company_users cu JOIN portal_accounts a ON a.id = cu.account_id JOIN companies c ON c.id = cu.company_id WHERE cu.company_id = ? AND a.status = 'active' AND c.status = 'active' LIMIT 20").bind(m.recipient_id).all<{ email: string }>();
  return results.map(r => r.email);
}

export async function deliverEmails(db: Db, limit = 10) {
  const { results } = await db.prepare("SELECT id, recipient_kind, recipient_id, kind, title, body, link FROM messages WHERE channel = 'email' AND status = 'queued' ORDER BY created_at LIMIT ?").bind(limit).all<Queued>();
  let sent = 0;
  for (const m of results) {
    // Claim the row first, so two requests never send the same email.
    const claim = await db.prepare("UPDATE messages SET status = 'sent', sent_at = ?, status_detail = 'sending' WHERE id = ? AND status = 'queued'").bind(nowIso(), m.id).run();
    if (!claim.meta.changes) continue;
    const to = await addresses(db, m);
    if (!to.length) { await db.prepare("UPDATE messages SET status = 'skipped', status_detail = 'no email address on record' WHERE id = ?").bind(m.id).run(); continue; }
    const where = m.recipient_kind === "candidate" ? "/candidate" : "/company";
    const link = m.link ? (m.link.startsWith("/") ? `${SITE_URL}${m.link}` : m.link) : `${SITE_URL}${where}`;
    const text = `${m.body}\n\n${m.link ? "Open: " : "See it in your Jobboard300 account: "}${link}\n\nJobboard300`;
    const results = await Promise.all(to.map(address => sendMail({ to: address, subject: m.title, text, kind: `notice.${m.kind}` })));
    const ok = results.some(r => r.sent);
    await db.prepare("UPDATE messages SET status = ?, status_detail = ? WHERE id = ?").bind(ok ? "sent" : "failed", ok ? `sent to ${results.filter(r => r.sent).length} address(es)` : (results[0]?.reason ?? "not sent").slice(0, 200), m.id).run();
    if (ok) sent++;
  }
  return { sent, tried: results.length };
}
