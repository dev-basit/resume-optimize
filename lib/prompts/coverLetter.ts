import type { JobAnalysis, MatchAnalysis, OptimizedContent, ResumeProfile } from "@/lib/schemas";
import {
  DATA_HANDLING_RULES,
  FACTUAL_ACCURACY_RULES,
  WRITING_STYLE_RULES,
  json,
  tag,
} from "./shared";

export const COVER_LETTER_SYSTEM = `You write tailored, human-sounding cover letters for senior engineering candidates.

Write the BODY of a cover letter for the target job. The application adds the letterhead, date, recipient block, and signature.

OUTPUT FIELDS
- greeting: "Dear <Company> Hiring Team," when the company name is known, otherwise "Dear Hiring Manager,". Never invent a person's name or a company name.
- paragraphs: 3-4 paragraphs, 250-400 words in total:
  1. Open with the specific role (exact job title) and company (if known) and a concise, specific reason the candidate is a strong fit. No generic opener.
  2-3. Connect 2-3 of the candidate's most relevant, real experiences, projects, or achievements to the job's key requirements. Be specific about technologies and outcomes the resume supports. Do not repeat the resume line by line.
  Final. Show genuine, professional interest in the role and the company's work (only reference company details that the JD states), and close with a confident call to action.
- closing: e.g. "Sincerely," or "Best regards,".

Additional rules:
- First person, natural and warm but professional. Vary sentence length. No bullet points.
- Do not mention skills the candidate lacks, and do not apologize for gaps.
- Stay consistent with the optimized resume.

${FACTUAL_ACCURACY_RULES}

${WRITING_STYLE_RULES}

${DATA_HANDLING_RULES}`;

export function coverLetterUser(
  job: JobAnalysis,
  profile: ResumeProfile,
  match: MatchAnalysis,
  optimized: OptimizedContent,
): string {
  return [
    "Write the cover letter for this job.",
    tag("job_analysis", json(job)),
    tag("match_analysis", json(match)),
    tag("candidate_profile", json(profile)),
    tag("optimized_resume_content", json(optimized)),
  ].join("\n\n");
}
