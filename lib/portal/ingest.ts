// CV ingestion for the portal: parse, enrich with Indian-market fields, store
// the raw file and the structured version. Scanned or unreadable CVs are kept
// and flagged for manual review, never dropped.

import { analyseCvWithText, CvReadError } from "../ats/pipeline";
import { enrichProfile } from "./profile";
import { addCv } from "./candidate";
import { newId, now, type Db } from "./db";
import { notifyCandidate } from "./notify";

export type Bucket = { put(key: string, value: Uint8Array, options?: unknown): Promise<unknown> } | null;

export async function ingestCv(db: Db, bucket: Bucket, candidateId: string, file: { bytes: Uint8Array; fileName: string; knownName?: string; knownLocation?: string }) {
  let analysed;
  try { analysed = await analyseCvWithText({ bytes: file.bytes, fileName: file.fileName, knownName: file.knownName, knownLocation: file.knownLocation, now: now() }); }
  catch (error) { if (error instanceof CvReadError) throw error; throw new CvReadError("The CV could not be read."); }
  const profile = enrichProfile(analysed.profile, analysed.text, now());
  const parseOk = analysed.text.replace(/\s/g, "").length >= 200 && profile.parse.confidence >= 0.5;
  const r2Key = `portal-cv/${candidateId}/${newId()}`;
  if (bucket) await bucket.put(r2Key, file.bytes, { httpMetadata: { contentType: analysed.fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", cacheControl: "private, no-store" } });
  const { cvId, status } = await addCv(db, candidateId, { r2Key, fileName: file.fileName, fileType: analysed.fileType, size: file.bytes.byteLength, sha256: profile.source.sha256, text: analysed.text, profile, parseOk });
  // Tell the candidate what happened and exactly what is still missing.
  if (status !== "parsed") await notifyCandidate(db, candidateId, "cv.needs_review", "We could not read your CV automatically", "Your CV is saved, and a Jobboard300 reviewer will read it by hand. To speed this up, upload a PDF or DOCX with selectable text (not a scan or photo).");
  else {
    const missing = [profile.india.noticeDays === null && "notice period", profile.india.ctcExpectedInr === null && "expected CTC", !profile.india.currentCity && "current city"].filter(Boolean);
    await notifyCandidate(db, candidateId, missing.length ? "cv.incomplete" : "cv.received", missing.length ? "CV received: a few details are missing" : "CV received",
      missing.length ? `We read your CV. Please add your ${missing.join(", ")} under “Details read from your CV”; roles that filter on these cannot match you until you do.` : "We read your CV and your profile is complete. We will message you here when a role fits or an employer takes your profile forward.");
  }
  return { cvId, status, profile, text: analysed.text };
}
