// Shared shapes for the owner-only CV screening tool (ATS).
// Field names follow JSON Resume where they fit, with screening extensions
// (skill evidence, months used, last used) in the style of commercial parsers.

export const ATS_ENGINE_VERSION = "ats-2026.11.1";
/** Model used for optional Claude-assisted extraction. */
export const AI_MODEL = "claude-opus-5-5";

export type SkillEvidence = "work" | "summary" | "certification" | "listed" | "other";

export type CandidateSkill = {
  /** Canonical taxonomy id, or `term:<normalised text>` for skills outside the taxonomy. */
  id: string;
  name: string;
  family: string;
  /** Strongest place the skill was found: work history beats a bare skills list. */
  evidence: SkillEvidence;
  /** Total months across dated roles that mention the skill. */
  months: number;
  /** Year the skill was last seen in a dated role (or the current year for a current role). */
  lastUsedYear: number | null;
  /** Short quote from the CV showing where the skill was found. */
  snippet: string;
};

export type WorkEntry = {
  title: string;
  employer: string;
  location: string;
  start: string | null; // YYYY-MM
  end: string | null;   // YYYY-MM, null when current
  current: boolean;
  months: number;
  highlights: string[];
};

export type EducationEntry = {
  qualification: string;
  /** 1 = secondary (10th), 2 = higher secondary (12th), 3 = diploma/ITI, 4 = bachelor's, 5 = master's/professional, 6 = doctorate. */
  level: number;
  field: string;
  institution: string;
  year: number | null;
};

export type CandidateProfile = {
  schemaVersion: "1.0";
  source: {
    method: "rules" | "ai";
    model: string | null;
    fileName: string;
    fileType: "pdf" | "docx" | "text";
    textCharacters: number;
    pages: number | null;
    sha256: string;
    extractedAt: string;
    engineVersion: string;
  };
  contact: { name: string; email: string; phone: string; location: string; links: string[] };
  headline: string;
  summary: string;
  totalExperienceMonths: number;
  /** Years stated in the CV text ("5+ years of experience"), kept for comparison with dated roles. */
  statedExperienceYears: number | null;
  work: WorkEntry[];
  education: EducationEntry[];
  skills: CandidateSkill[];
  certifications: string[];
  languages: string[];
  noticePeriod: string;
  currentCtc: string;
  expectedCtc: string;
  /** Gaps of six months or more between roles. Shown for context, never scored. */
  gaps: { from: string; to: string; months: number }[];
  /** Personal fields that were found and removed before parsing (labels only, never values). */
  excludedPersonalFields: string[];
  parse: { confidence: number; sectionsFound: string[]; warnings: string[] };
};

export type RequirementSkill = { id: string; name: string; family: string };

export type JobRequirements = {
  schemaVersion: "1.0";
  title: string;
  mustHave: RequirementSkill[];
  niceToHave: RequirementSkill[];
  minYears: number | null;
  maxYears: number | null;
  /** Minimum education level (see EducationEntry.level), or null when not required. */
  educationLevel: number | null;
  educationFields: string[];
  location: string;
  workMode: string;
  /** "generated" from the JD text, or "edited" by a recruiter. */
  origin: "generated" | "edited";
  notes: string[];
};

export type ComponentKey = "mustHave" | "experience" | "title" | "recency" | "niceToHave" | "education" | "location";

export type ScoreComponent = {
  key: ComponentKey;
  label: string;
  weight: number;
  /** 0..1, or null when the job does not specify this and the weight was redistributed. */
  score: number | null;
  detail: string;
};

export type RequirementStatus = "met" | "unverified" | "partial" | "missing";

export type RequirementCheck = {
  requirement: string;
  kind: "must" | "nice";
  status: RequirementStatus;
  credit: number;
  matchedAs: string;
  evidence: string;
};

export type Verdict = "strong" | "possible" | "weak" | "not_fit" | "needs_review";

export type ScreeningResult = {
  engineVersion: string;
  score: number;
  verdict: Verdict;
  verdictLabel: string;
  verdictReason: string;
  components: ScoreComponent[];
  checks: RequirementCheck[];
  experience: { totalYears: number; relevantYears: number; requiredMin: number | null; requiredMax: number | null };
  strengths: string[];
  concerns: string[];
  interviewProbes: string[];
  flags: string[];
};
