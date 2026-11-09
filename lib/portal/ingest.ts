// CV ingestion for the portal: parse, enrich with Indian-market fields, store
// the raw file and the structured version. Scanned or unreadable CVs are kept
// and flagged for manual review, never dropped.

import { analyseCvWithText, CvReadError } from "../ats/pipeline";
import { enrichProfile } from "./profile";
import { addCv } from "./candidate";
import { newId, now, type Db } from "./db";

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
  return { cvId, status, profile, text: analysed.text };
}
