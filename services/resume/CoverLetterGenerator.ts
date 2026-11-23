import "server-only";
import { COVER_LETTER_SYSTEM, coverLetterUser } from "@/lib/prompts";
import {
  CoverLetterContentSchema,
  type JobAnalysis,
  type MatchAnalysis,
  type OptimizedContent,
  type ResumeProfile,
} from "@/lib/schemas";
import { AIError } from "@/services/ai/errors";
import type { AIProvider } from "@/types/ai";
import type { CoverLetterDocument, ResumeDocument } from "@/types/resume";
import { formatLetterDate } from "./formatting";

export async function generateCoverLetter(
  ai: AIProvider,
  input: {
    job: JobAnalysis;
    profile: ResumeProfile;
    match: MatchAnalysis;
    optimized: OptimizedContent;
    resume: ResumeDocument;
  },
  signal?: AbortSignal,
): Promise<CoverLetterDocument> {
  const { job, profile, match, optimized, resume } = input;
  const content = await ai.generateJSON({
    name: "cover_letter",
    system: COVER_LETTER_SYSTEM,
    user: coverLetterUser(job, profile, match, optimized),
    schema: CoverLetterContentSchema,
    signal,
  });

  if (content.paragraphs.length === 0) {
    throw new AIError("INVALID_RESPONSE", "The AI model returned an empty cover letter. Please try again.");
  }

  const company = job.companyName.trim();
  return {
    senderName: resume.name,
    senderContact: resume.contact,
    date: formatLetterDate(),
    recipient: company ? ["Hiring Team", company] : ["Hiring Manager"],
    subject: `Application for ${job.jobTitle}`,
    greeting: content.greeting || (company ? `Dear ${company} Hiring Team,` : "Dear Hiring Manager,"),
    paragraphs: content.paragraphs,
    closing: content.closing || "Sincerely,",
    signature: resume.name,
  };
}
