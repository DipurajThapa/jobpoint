// Assessments tool API: question banks for administrators and invigilators
// (the Assessments tool at Edit), and Fast Track settings and payments for administrators.
import { authorizeApi } from "@/lib/platform/auth";
import { portalDb, json, fail, failFrom } from "@/lib/portal/session";
import { addQuestions, bankQuestions, bankSummary, createBank, decideFastTrackOrder, fastTrackOffer, fastTrackOrders, loadSampleBanks, parseQuestionRows, saveFastTrackSettings, setBankStatus, setQuestionActive, TEST, type QuestionInput } from "@/lib/portal/adaptive";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };
const s = (v: unknown, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
const ADMIN_ONLY = ["sample-load", "fast-track-settings", "order-decide"];

export async function GET(request: Request, context: Ctx) {
  const user = await authorizeApi(request, { tool: "assessments", min: "view" });
  if (user instanceof Response) return user;
  const { action } = await context.params, db = portalDb(), url = new URL(request.url), admin = user.role === "admin";
  try {
    if (action === "banks") {
      const { results: clients } = await db.prepare("SELECT id, display_name FROM companies WHERE status = 'active' ORDER BY display_name").all();
      return json({ banks: await bankSummary(db), clients, canEdit: user.access.assessments !== "view", admin, test: TEST, fastTrack: admin ? { offer: await fastTrackOffer(db), orders: await fastTrackOrders(db) } : null });
    }
    if (action === "questions") return json({ questions: await bankQuestions(db, url.searchParams.get("bank") ?? "") });
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}

export async function POST(request: Request, context: Ctx) {
  const { action } = await context.params;
  const user = await authorizeApi(request, { tool: "assessments", min: "edit", mutate: true, admin: ADMIN_ONLY.includes(action) });
  if (user instanceof Response) return user;
  const db = portalDb();
  try {
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (action === "bank-create") return json({ id: await createBank(db, { kind: s(b.kind, 20), title: s(b.title, 160), skillId: s(b.skillId, 60), companyId: s(b.companyId, 60) || null }, user.id), message: "Question bank created as a draft. Add questions, then set it live." }, 201);
    if (action === "bank-status") { const out = await setBankStatus(db, s(b.bankId, 60), s(b.status, 20), user.id); return json({ message: out.thin ? "Live. Note: for a reliable result aim for 10 to 20 questions at every level from 1 to 10." : "Saved." }); }
    if (action === "question-add") {
      const q: QuestionInput = { level: Number(b.level), topic: s(b.topic, 80), stem: s(b.stem, 1000), options: Array.isArray(b.options) ? b.options.map(o => s(o, 300)).filter(Boolean) : [], answerIndex: Number(b.answerIndex), explanation: s(b.explanation, 600) };
      const out = await addQuestions(db, s(b.bankId, 60), [q], user.id);
      return out.added ? json({ message: "Question added." }, 201) : fail(out.errors[0]?.replace(/^Row 1: /, "") ?? "The question was not added.");
    }
    if (action === "question-upload") {
      const parsed = parseQuestionRows(s(b.text, 400_000));
      if (!parsed.questions.length) return fail(parsed.errors[0] ?? "No questions were found. Use one row per question.");
      const out = await addQuestions(db, s(b.bankId, 60), parsed.questions, user.id);
      const errors = [...parsed.errors, ...out.errors];
      return json({ message: `${out.added} question(s) added.${errors.length ? ` ${errors.length} row(s) refused.` : ""}`, errors: errors.slice(0, 50) });
    }
    if (action === "question-active") { await setQuestionActive(db, s(b.questionId, 60), b.active === true, user.id); return json({ message: b.active === true ? "Question restored." : "Question withdrawn. It will not be asked again." }); }
    if (action === "sample-load") { await loadSampleBanks(db, user.id); return json({ message: "Two sample banks loaded and set live. Replace them with real questions before candidates pay." }, 201); }
    if (action === "fast-track-settings") { await saveFastTrackSettings(db, Number(b.priceInr), s(b.payNote, 600), user.id); return json({ message: "Fast Track price and payment instructions saved." }); }
    if (action === "order-decide") { await decideFastTrackOrder(db, s(b.orderId, 60), b.paid === true, s(b.note, 300), user.id); return json({ message: b.paid === true ? "Payment confirmed. The candidate is now on Fast Track." : "Order cancelled." }); }
    return fail("Unknown action.", 404);
  } catch (error) { return failFrom(error); }
}
