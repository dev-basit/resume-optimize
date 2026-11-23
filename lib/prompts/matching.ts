import type { JobAnalysis, ResumeProfile } from "@/lib/schemas";
import { DATA_HANDLING_RULES, FACTUAL_ACCURACY_RULES, json, tag } from "./shared";

export const MATCHING_SYSTEM = `You are a senior technical recruiter comparing a candidate's resume with a job's requirements.
Return a structured JSON match analysis.

HOW TO MATCH
- matchingSkills: JD requirements the candidate demonstrably has. "evidence" must cite where in the resume it appears (role/company or project).
- transferableSkills: JD requirements the candidate does not have directly but has closely related, genuine experience for (e.g. JD asks for "GCP", resume shows "AWS"). Be honest; describe the real related experience.
- missingSkills: JD requirements with no support in the resume. Keep the JD importance.
- relevantExperience: rate every experience entry by its index (0-based, same order as the parsed resume) as high, medium, or low relevance, with a brief reason.
- relevantProjectIndexes: 0-based indexes of projects worth featuring for this role (empty if none).
- emphasize: specific skills, systems, and accomplishments from the resume that deserve more prominence for this role.
- deemphasize: resume content that is irrelevant to this role and can be shortened.
- supportedKeywords: JD ATS keywords that the resume genuinely supports and that should be included naturally.

Matching is semantic: "Postgres" matches "PostgreSQL", "REST APIs" matches "RESTful services", "LLM integration" can match "OpenAI API". But never treat a requirement as matched without real evidence.

${FACTUAL_ACCURACY_RULES}

${DATA_HANDLING_RULES}`;

export function matchingUser(job: JobAnalysis, profile: ResumeProfile, resumeText: string): string {
  const experienceIndex = profile.experience.map((e, i) => `${i}: ${e.title} at ${e.company}`).join("\n");
  const projectIndex = profile.projects.map((p, i) => `${i}: ${p.name}`).join("\n") || "(none)";

  return [
    "Compare the candidate with the job.",
    tag("job_analysis", json(job)),
    tag("parsed_resume", json(profile)),
    tag("experience_indexes", experienceIndex || "(none)"),
    tag("project_indexes", projectIndex),
    tag("base_resume", resumeText),
  ].join("\n\n");
}
