import { z } from "zod";

/**
 * Schemas for every structured AI response. They are deliberately lenient about
 * null/missing values (models differ) but strict about shape, and they are the
 * single source of truth for the corresponding TypeScript types.
 */

const text = z
  .string()
  .nullish()
  .transform((v) => (v ?? "").trim());

const textList = z
  .array(z.string().nullish())
  .nullish()
  .transform((v) => (v ?? []).map((s) => (s ?? "").trim()).filter(Boolean));

const listOf = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => (v ?? []) as z.output<T>[]);

const index = z.coerce.number().int().min(0);

export const Importance = z.enum(["critical", "important", "preferred"]);

// ---------------------------------------------------------------------------
// 1. Job description analysis
// ---------------------------------------------------------------------------

export const JobAnalysisSchema = z.object({
  jobTitle: text.describe("Exact target job title as written in the JD"),
  companyName: text.describe("Hiring company name, or empty string if not stated"),
  seniority: text.describe("e.g. Junior, Mid-level, Senior, Staff, Principal, Lead"),
  roleFocus: text.describe("Primary specialization and stack, e.g. 'Backend - Python/FastAPI'"),
  summary: text.describe("Two-sentence summary of what the role is about"),
  requirements: listOf(
    z.object({
      name: text.describe("Skill, technology, or qualification"),
      category: text.describe(
        "One of: language, frontend, backend, database, cloud, devops, ai_ml, architecture, testing, soft_skill, domain, education, experience, other",
      ),
      importance: Importance.catch("important"),
    }),
  ),
  responsibilities: textList,
  experienceRequirements: text,
  educationRequirements: text,
  domain: text.describe("Industry/domain knowledge expected, or empty"),
  location: text,
  employmentType: text,
  atsKeywords: textList.describe(
    "10-30 of the most important ATS keywords/phrases, written as they appear in the JD",
  ),
});

// ---------------------------------------------------------------------------
// 2. Base resume extraction (facts only, verbatim)
// ---------------------------------------------------------------------------

export const ResumeProfileSchema = z.object({
  fullName: text,
  headline: text.describe("Current professional title as written on the resume"),
  contact: z
    .object({
      email: text,
      phone: text,
      location: text,
      linkedin: text,
      github: text,
      website: text,
      other: textList,
    })
    .nullish()
    .transform(
      (v) =>
        v ?? { email: "", phone: "", location: "", linkedin: "", github: "", website: "", other: [] },
    ),
  summary: text,
  yearsOfExperience: z.coerce
    .number()
    .nullish()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null)),
  skills: textList.describe("Every technical skill/tool explicitly mentioned anywhere in the resume"),
  experience: listOf(
    z.object({
      company: text,
      title: text,
      location: text,
      startDate: text,
      endDate: text,
      bullets: textList,
      technologies: textList,
    }),
  ),
  projects: listOf(
    z.object({
      name: text,
      link: text,
      description: text,
      bullets: textList,
      technologies: textList,
    }),
  ),
  education: listOf(
    z.object({
      institution: text,
      degree: text,
      field: text,
      location: text,
      startDate: text,
      endDate: text,
      details: textList,
    }),
  ),
  certifications: listOf(z.object({ name: text, issuer: text, date: text })),
  additionalSections: listOf(z.object({ title: text, items: textList })),
});

// ---------------------------------------------------------------------------
// 3. Resume <-> JD matching
// ---------------------------------------------------------------------------

export const MatchAnalysisSchema = z.object({
  matchingSkills: listOf(z.object({ skill: text, evidence: text })),
  transferableSkills: listOf(z.object({ requirement: text, evidence: text })),
  missingSkills: listOf(z.object({ skill: text, importance: Importance.catch("important") })),
  relevantExperience: listOf(
    z.object({
      experienceIndex: index,
      relevance: z.enum(["high", "medium", "low"]).catch("medium"),
      reason: text,
    }),
  ),
  relevantProjectIndexes: z
    .array(index)
    .nullish()
    .transform((v) => v ?? []),
  emphasize: textList,
  deemphasize: textList,
  supportedKeywords: textList.describe("JD keywords the resume genuinely supports"),
});

// ---------------------------------------------------------------------------
// 4. Optimized resume content (text only; facts are merged from the profile)
// ---------------------------------------------------------------------------

export const OptimizedContentSchema = z.object({
  professionalTitle: text,
  summary: text,
  skillCategories: listOf(z.object({ category: text, skills: textList })),
  experience: listOf(z.object({ experienceIndex: index, bullets: textList })),
  projects: listOf(z.object({ projectIndex: index, bullets: textList })),
  keywordsUsed: textList,
});

export const ResumeExpansionSchema = z.object({
  experience: listOf(z.object({ experienceIndex: index, newBullets: textList })),
  projects: listOf(z.object({ projectIndex: index, newBullets: textList })),
});

// ---------------------------------------------------------------------------
// 5. Cover letter
// ---------------------------------------------------------------------------

export const CoverLetterContentSchema = z.object({
  greeting: text,
  paragraphs: textList,
  closing: text,
});

export type JobAnalysis = z.output<typeof JobAnalysisSchema>;
export type ResumeProfile = z.output<typeof ResumeProfileSchema>;
export type MatchAnalysis = z.output<typeof MatchAnalysisSchema>;
export type OptimizedContent = z.output<typeof OptimizedContentSchema>;
export type ResumeExpansion = z.output<typeof ResumeExpansionSchema>;
export type CoverLetterContent = z.output<typeof CoverLetterContentSchema>;
