// Pages a candidate reaches from a one-time link, without an account: an invited
// test and the offer-stage commitment. The token in the link is the only credential.
import { portalDb, json, fail, failFrom, sameOrigin, ipHash } from "@/lib/portal/session";
import { answerTest, testByToken, testStep } from "@/lib/portal/adaptive";
import { acceptCommitment, readCommitment } from "@/lib/portal/commitment";
import { withinLimits } from "@/lib/portal/access";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Ctx) {
  const { action } = await context.params, db = portalDb(), token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    if (action === "commitment") return json(await readCommitment(db, token));
    if (action === "test") { const t = await testByToken(db, token); return json(await testStep(db, t.id, t.candidate_id)); }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  if (!sameOrigin(request)) return fail("This request must come from the Jobboard300 site.", 403, "ORIGIN");
  const { action } = await context.params, db = portalDb();
  try {
    const b = await request.json().catch(() => ({})) as Record<string, unknown>, token = typeof b.token === "string" ? b.token : "";
    if (!(await withinLimits(db, `ip:${await ipHash(request)}`, "public_link")).ok) return fail("Too many requests. Wait a minute and try again.", 429, "RATE_LIMIT");
    if (action === "commitment-accept") { if (b.agree !== true) return fail("Tick the box to accept."); return json({ ...await acceptCommitment(db, token, await ipHash(request)), message: "Thank you. Your commitment is recorded." }); }
    const t = await testByToken(db, token);
    if (action === "test-start") return json(await testStep(db, t.id, t.candidate_id, { start: true }));
    if (action === "test-answer") return json(await answerTest(db, t.id, t.candidate_id, typeof b.choice === "number" ? b.choice : null));
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
