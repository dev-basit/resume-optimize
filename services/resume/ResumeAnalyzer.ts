import "server-only";
import {
  JOB_ANALYSIS_SYSTEM,
  MATCHING_SYSTEM,
  RESUME_ANALYSIS_SYSTEM,
  jobAnalysisUser,
  matchingUser,
  resumeAnalysisUser,
} from "@/lib/prompts";
import {
  JobAnalysisSchema,
  MatchAnalysisSchema,
  ResumeProfileSchema,
  type JobAnalysis,
  type MatchAnalysis,
  type ResumeProfile,
} from "@/lib/schemas";
import { AIError } from "@/services/ai/errors";
import type { AIProvider } from "@/types/ai";
import type { JobMatchSummary, KeywordAnalysis, ResumeDocument } from "@/types/resume";
import { buildTextIndex, compactKey, containsTerm, type TextIndex } from "./textMatching";

export async function analyzeJobDescription(
  ai: AIProvider,
  jobDescription: string,
  signal?: AbortSignal,
): Promise<JobAnalysis> {
  const job = await ai.generateJSON({
    name: "job_analysis",
    system: JOB_ANALYSIS_SYSTEM,
    user: jobAnalysisUser(jobDescription),
    schema: JobAnalysisSchema,
    signal,
  });
  if (!job.jobTitle) {
    throw new AIError(
      "INVALID_RESPONSE",
      "Could not identify a job title in the job description. Make sure you pasted the complete posting.",
    );
  }
  return job;
}

export async function analyzeResume(
  ai: AIProvider,
  resumeText: string,
  signal?: AbortSignal,
): Promise<ResumeProfile> {
  const profile = await ai.generateJSON({
    name: "resume_profile",
    system: RESUME_ANALYSIS_SYSTEM,
    user: resumeAnalysisUser(resumeText),
    schema: ResumeProfileSchema,
    signal,
  });
  if (profile.experience.length === 0 && profile.projects.length === 0 && profile.education.length === 0) {
    throw new AIError(
      "INVALID_RESPONSE",
      "Could not find work experience, projects, or education in your resume text. Check that the resume was extracted correctly.",
    );
  }
  return profile;
}

export async function matchResumeToJob(
  ai: AIProvider,
  job: JobAnalysis,
  profile: ResumeProfile,
  resumeText: string,
  signal?: AbortSignal,
): Promise<MatchAnalysis> {
  const match = await ai.generateJSON({
    name: "match_analysis",
    system: MATCHING_SYSTEM,
    user: matchingUser(job, profile, resumeText),
    schema: MatchAnalysisSchema,
    signal,
  });
  // Drop references to roles/projects that don't exist.
  return {
    ...match,
    relevantExperience: match.relevantExperience.filter(
      (r) => r.experienceIndex < profile.experience.length,
    ),
    relevantProjectIndexes: match.relevantProjectIndexes.filter((i) => i < profile.projects.length),
  };
}

export function summarizeMatch(
  job: JobAnalysis,
  profile: ResumeProfile,
  match: MatchAnalysis,
): JobMatchSummary {
  const order = { high: 0, medium: 1, low: 2 } as const;
  return {
    jobTitle: job.jobTitle,
    companyName: job.companyName,
    seniority: job.seniority,
    roleFocus: job.roleFocus,
    requiredSkills: job.requirements
      .filter((r) => r.name && r.category !== "soft_skill")
      .map((r) => ({ name: r.name, importance: r.importance })),
    matchingSkills: match.matchingSkills.filter((s) => s.skill),
    transferableSkills: match.transferableSkills.filter((s) => s.requirement),
    missingSkills: match.missingSkills.filter((s) => s.skill),
    relevantExperience: [...match.relevantExperience]
      .sort((a, b) => order[a.relevance] - order[b.relevance])
      .map((r) => {
        const role = profile.experience[r.experienceIndex];
        return {
          label: [role.title, role.company].filter(Boolean).join(" — "),
          relevance: r.relevance,
          reason: r.reason,
        };
      }),
  };
}

/**
 * Keyword coverage is computed deterministically from the final document,
 * not reported by the model. It is a keyword indicator, not an ATS score.
 */
export function analyzeKeywords(
  job: JobAnalysis,
  resume: ResumeDocument,
  sourceIndex: TextIndex,
): KeywordAnalysis {
  const seen = new Set<string>();
  const jdKeywords = job.atsKeywords.filter((k) => {
    const key = compactKey(k);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const resumeIndex = buildTextIndex(resumeToPlainText(resume));
  const includedKeywords: string[] = [];
  const missingSupportedKeywords: string[] = [];
  const unsupportedKeywords: string[] = [];

  for (const keyword of jdKeywords) {
    if (containsTerm(keyword, resumeIndex)) includedKeywords.push(keyword);
    else if (containsTerm(keyword, sourceIndex)) missingSupportedKeywords.push(keyword);
    else unsupportedKeywords.push(keyword);
  }

  return {
    jdKeywords,
    includedKeywords,
    missingSupportedKeywords,
    unsupportedKeywords,
    coveragePercent: jdKeywords.length
      ? Math.round((includedKeywords.length / jdKeywords.length) * 100)
      : 0,
  };
}

export function resumeToPlainText(resume: ResumeDocument): string {
  return [
    resume.name,
    resume.title,
    resume.summary,
    ...resume.skills.map((s) => `${s.category}: ${s.items.join(", ")}`),
    ...resume.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...resume.projects.flatMap((p) => [p.name, p.technologies.join(", "), ...p.bullets]),
    ...resume.education.flatMap((e) => [e.credential, e.institution, ...e.details]),
    ...resume.certifications,
    ...resume.additionalSections.flatMap((s) => [s.title, ...s.items]),
  ].join("\n");
}
