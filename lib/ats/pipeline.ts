// Orchestrates one screening: file bytes -> text -> CandidateProfile -> score.

import type { CandidateProfile, JobRequirements, ScreeningResult } from "./types";
import { detectFileType, extractText, sha256Hex } from "./extract";
import { parseCv } from "./cv-parser";
import { scoreCandidate } from "./score";

export const MAX_CV_BYTES = 5 * 1024 * 1024;

export type AnalyseOptions = { bytes: Uint8Array; fileName: string; knownName?: string; knownLocation?: string; useAi?: boolean; apiKey?: string; now?: Date };

export class CvReadError extends Error {}

export async function analyseCv(opts: AnalyseOptions): Promise<CandidateProfile> {
  return (await analyseCvWithText(opts)).profile;
}

/** Same as analyseCv, also returning the extracted text (used by the job portal). */
export async function analyseCvWithText(opts: AnalyseOptions): Promise<{ profile: CandidateProfile; text: string; fileType: "pdf" | "docx" }> {
  if (opts.bytes.byteLength > MAX_CV_BYTES) throw new CvReadError("The CV exceeds the 5 MB limit.");
  const fileType = detectFileType(opts.bytes, opts.fileName);
  if (!fileType) throw new CvReadError("Upload a PDF or DOCX file.");
  const sha256 = await sha256Hex(opts.bytes);
  let extracted;
  try { extracted = await extractText(opts.bytes, fileType); }
  catch (error) { throw new CvReadError(error instanceof Error && /DOCX|PDF|ZIP|password/i.test(error.message) ? error.message : "The CV file could not be read. It may be damaged or password-protected."); }
  const input = { text: extracted.text, fileName: opts.fileName, fileType, pages: extracted.pages, sha256, knownName: opts.knownName, knownLocation: opts.knownLocation, now: opts.now };
  let profile: CandidateProfile;
  if (opts.useAi && opts.apiKey && extracted.text.replace(/\s/g, "").length >= 200) {
    const { parseCvWithClaude } = await import("./ai");
    const outcome = await parseCvWithClaude(input, opts.apiKey);
    profile = outcome.profile;
    if (outcome.warning) profile.parse.warnings.push(outcome.warning);
  } else profile = parseCv(input);
  profile.parse.warnings.unshift(...extracted.warnings);
  return { profile, text: extracted.text, fileType };
}

export function screen(profile: CandidateProfile, requirements: JobRequirements, desiredRole?: string, now?: Date): ScreeningResult {
  return scoreCandidate(profile, requirements, { desiredRole, now });
}
