/** Types shared between the server workflow and the client UI. */

export interface ResumeDocument {
  name: string;
  title: string;
  contact: string[];
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: {
    company: string;
    title: string;
    location: string;
    dates: string;
    bullets: string[];
  }[];
  projects: { name: string; link: string; technologies: string[]; bullets: string[] }[];
  education: { institution: string; credential: string; location: string; dates: string; details: string[] }[];
  certifications: string[];
  additionalSections: { title: string; items: string[] }[];
}

export interface CoverLetterDocument {
  senderName: string;
  senderContact: string[];
  date: string;
  recipient: string[];
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  signature: string;
}

export interface KeywordAnalysis {
  jdKeywords: string[];
  includedKeywords: string[];
  missingSupportedKeywords: string[];
  unsupportedKeywords: string[];
  /** Share of JD keywords present in the generated resume. Not an ATS score. */
  coveragePercent: number;
}

export interface JobMatchSummary {
  jobTitle: string;
  companyName: string;
  seniority: string;
  roleFocus: string;
  requiredSkills: { name: string; importance: "critical" | "important" | "preferred" }[];
  matchingSkills: { skill: string; evidence: string }[];
  transferableSkills: { requirement: string; evidence: string }[];
  missingSkills: { skill: string; importance: "critical" | "important" | "preferred" }[];
  relevantExperience: { label: string; relevance: "high" | "medium" | "low"; reason: string }[];
}

export interface FactCheckWarning {
  kind: "metric" | "skill" | "employment";
  message: string;
}

export interface GenerationResult {
  documentId: string;
  expiresAt: string;
  files: { resume: string; coverLetter: string; zip: string };
  resume: ResumeDocument;
  coverLetter: CoverLetterDocument;
  match: JobMatchSummary;
  keywords: KeywordAnalysis;
  warnings: FactCheckWarning[];
  /** Bullets that elaborate on documented work rather than restate it; shown for review. */
  elaboratedBullets: string[];
  provider: { id: string; model: string };
  layout: { resumePages: number; lastPageFillPercent: number; bodyFontSize: number };
}

export const GENERATION_STAGES = [
  { id: "read_resume", label: "Reading base resume" },
  { id: "analyze_jd", label: "Analyzing job description" },
  { id: "match_skills", label: "Matching technical skills" },
  { id: "optimize_resume", label: "Optimizing resume content" },
  { id: "cover_letter", label: "Writing cover letter" },
  { id: "pdf", label: "Generating PDF documents" },
] as const;

export type StageId = (typeof GENERATION_STAGES)[number]["id"];

export type GenerationEvent =
  | { type: "stage"; stage: StageId; status: "started" | "completed" }
  | { type: "result"; result: GenerationResult }
  | { type: "error"; error: { code: string; message: string; stage?: StageId } };

export interface ParseResumeResponse {
  fileName: string;
  text: string;
  characters: number;
  pages?: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
