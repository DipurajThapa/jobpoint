// Simulates "the new code is live before its database change": hides a column added by the latest
// migrations, sends both public forms and checks that each is still saved. Needs npm run dev.
//   node scripts/check-deploy-order.mjs
import { BASE, chromium, context, client, pdfFromText, rows, clearRateLimits } from "./audit/lib.mjs";
import { DatabaseSync } from "node:sqlite"; import { readdirSync } from "node:fs";
const d = new URL("../.wrangler/state/v3/d1/miniflare-D1DatabaseObject", import.meta.url).pathname, db = new DatabaseSync(`${d}/${readdirSync(d).find(f => f.endsWith(".sqlite") && f !== "metadata.sqlite")}`);
clearRateLimits();
db.exec("ALTER TABLE applications RENAME COLUMN campaign TO campaign_hidden"); db.exec("ALTER TABLE employer_enquiries RENAME COLUMN campaign TO campaign_hidden");
const b = await chromium.launch(), anon = client(await context(b)), t = Date.now().toString(36);
try {
  const e = await anon.post("/api/employer-enquiries", { contactName: "Order Test", company: "Order Co " + t, email: `order.${t}@example.test`, phone: "+91 90000 11111", details: "Testing the deploy order.", consent: "yes", terms: "yes" });
  console.log("enquiry", e.status, e.text.slice(0, 120));
  const a = await anon.form("/api/applications", { fullName: "Order Tester", email: `ordercv.${t}@example.test`, phone: "+91 90000 22222", declaration: "yes", consent: "yes", resume: { name: "cv.pdf", mimeType: "application/pdf", buffer: await pdfFromText(b, "Order Tester\nAccounts Executive, Durgapur\nTally, GST, TDS. 3 years experience.") } });
  console.log("application", a.status, a.text.slice(0, 120));
} finally {
  db.exec("ALTER TABLE applications RENAME COLUMN campaign_hidden TO campaign"); db.exec("ALTER TABLE employer_enquiries RENAME COLUMN campaign_hidden TO campaign");
}
console.log(JSON.stringify(rows("SELECT company, details FROM employer_enquiries WHERE email = ?", `order.${t}@example.test`)), JSON.stringify(rows("SELECT full_name, resume_key IS NOT NULL cv FROM applications WHERE email = ?", `ordercv.${t}@example.test`)));
await b.close();
