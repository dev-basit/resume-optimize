import type { JobAnalysis, OptimizedContent, ResumeProfile } from "@/lib/schemas";
import {
  DATA_HANDLING_RULES,
  FACTUAL_ACCURACY_RULES,
  WRITING_STYLE_RULES,
  json,
  tag,
} from "./shared";
import { BULLET_QUALITY_RULES, SPECIALIZATION_GUIDANCE } from "./resumeOptimization";

export interface ExpansionRequest {
  experience: { experienceIndex: number; label: string; add: number }[];
  projects: { projectIndex: number; name: string; add: number }[];
}

export const RESUME_EXPANSION_SYSTEM = `You are an expert resume writer. The tailored resume below is accurate but too short to fill two pages.
Write ADDITIONAL bullets for specific roles so the resume becomes complete and detailed. Do not rewrite or repeat existing bullets.

OUTPUT
- experience: for each experienceIndex in <requested_additions>, exactly the requested number of NEW bullets in "newBullets".
- projects: for each projectIndex in <requested_additions>, exactly the requested number of NEW bullets in "newBullets".

WHAT TO WRITE
- Reasonable elaborations of that specific role's documented responsibilities, using technologies the base resume associates with the candidate, preferably ones documented for that role.
- Prioritize work relevant to the target job: architecture, APIs and services, data and performance, security, reliability, testing and CI/CD, cloud, frontend, integrations, production support, technical planning, collaboration.
- Each new bullet must cover a responsibility not already stated in that role's existing bullets.
- No numbers or metrics in new bullets. No outcomes that are not documented.
- Make each new bullet 20–32 words: name the concrete system or feature, how it was built (technologies, techniques), and its purpose.

${BULLET_QUALITY_RULES}

${SPECIALIZATION_GUIDANCE}

${FACTUAL_ACCURACY_RULES}

${WRITING_STYLE_RULES}

${DATA_HANDLING_RULES}`;

export function resumeExpansionUser(
  job: JobAnalysis,
  profile: ResumeProfile,
  content: OptimizedContent,
  resumeText: string,
  request: ExpansionRequest,
): string {
  const requested = [
    ...request.experience.map((e) => `- experienceIndex ${e.experienceIndex} (${e.label}): ${e.add} new bullets`),
    ...request.projects.map((p) => `- projectIndex ${p.projectIndex} (${p.name}): ${p.add} new bullets`),
  ].join("\n");

  return [
    "Write the additional bullets.",
    tag("requested_additions", requested),
    tag("current_resume_content", json({ experience: content.experience, projects: content.projects })),
    tag("job_analysis", json(job)),
    tag("parsed_resume", json(profile)),
    tag("base_resume", resumeText),
  ].join("\n\n");
}
