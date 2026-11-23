import "server-only";
import { normalizeText, slugForFileName, type GenerateRequest } from "@/lib/validation";
import { getAIProvider } from "@/services/ai/AIService";
import { saveDocuments } from "@/services/documents/DocumentStore";
import { generateCoverLetterPdf } from "@/services/pdf/CoverLetterPDFGenerator";
import type { GenerationResult, StageId } from "@/types/resume";
import { generateCoverLetter } from "./CoverLetterGenerator";
import { checkEmploymentFacts, findElaborations } from "./FactChecker";
import {
  analyzeJobDescription,
  analyzeKeywords,
  analyzeResume,
  matchResumeToJob,
  summarizeMatch,
} from "./ResumeAnalyzer";
import { fitResumeToTwoPages } from "./ResumeLayoutFitter";
import { optimizeResume } from "./ResumeOptimizer";
import { buildTextIndex } from "./textMatching";

export type StageListener = (stage: StageId, status: "started" | "completed") => void;

/** Error tagged with the workflow stage it happened in. */
export class WorkflowStageError extends Error {
  constructor(
    readonly stage: StageId,
    readonly original: unknown,
  ) {
    super(original instanceof Error ? original.message : "Workflow stage failed");
    this.name = "WorkflowStageError";
  }
}

/**
 * End-to-end optimization workflow. Emits real stage transitions as work
 * starts and finishes; independent stages run concurrently.
 */
export async function runResumeWorkflow(
  input: GenerateRequest,
  onStage: StageListener,
  signal?: AbortSignal,
): Promise<GenerationResult> {
  // Fail fast on configuration before doing any work.
  const ai = getAIProvider();

  // Cancel sibling work if one concurrent stage fails or the client disconnects.
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  async function stage<T>(id: StageId, work: () => Promise<T>): Promise<T> {
    onStage(id, "started");
    try {
      const result = await work();
      onStage(id, "completed");
      return result;
    } catch (error) {
      controller.abort();
      throw new WorkflowStageError(id, error);
    }
  }

  try {
    const resumeText = normalizeText(input.resumeText);
    const jobDescription = normalizeText(input.jobDescription);
    const sourceIndex = buildTextIndex(resumeText);
    const s = controller.signal;

    const [profile, job] = await Promise.all([
      stage("read_resume", () => analyzeResume(ai, resumeText, s)),
      stage("analyze_jd", () => analyzeJobDescription(ai, jobDescription, s)),
    ]);

    const match = await stage("match_skills", () =>
      matchResumeToJob(ai, job, profile, resumeText, s),
    );

    const fitted = await stage("optimize_resume", async () => {
      const outcome = await optimizeResume(ai, { job, profile, match, resumeText, sourceIndex }, s);
      // Measure the real PDF and fill exactly two pages (typography + grounded expansion/trim).
      return fitResumeToTwoPages(
        ai,
        { content: outcome.content, profile, job, match, resumeText, sourceIndex },
        s,
      );
    });
    const { resume, content: optimized, warnings: contentWarnings } = fitted;

    const coverLetter = await stage("cover_letter", () =>
      generateCoverLetter(ai, { job, profile, match, optimized, resume }, s),
    );

    const stored = await stage("pdf", async () => {
      const resumePdf = fitted.pdf; // already rendered and measured by the layout fitter
      const coverPdf = await generateCoverLetterPdf(coverLetter);
      const base = slugForFileName(job.jobTitle, "Target-Role");
      const files = {
        resume: `${base}-Optimized-Resume.pdf`,
        coverLetter: `${base}-Cover-Letter.pdf`,
        zip: `${base}-Application-Documents.zip`,
      };
      const saved = saveDocuments({
        resume: { fileName: files.resume, data: new Uint8Array(resumePdf) },
        coverLetter: { fileName: files.coverLetter, data: new Uint8Array(coverPdf) },
        zipFileName: files.zip,
      });
      return { ...saved, files };
    });

    return {
      documentId: stored.id,
      expiresAt: stored.expiresAt.toISOString(),
      files: stored.files,
      resume,
      coverLetter,
      match: summarizeMatch(job, profile, match),
      keywords: analyzeKeywords(job, resume, sourceIndex),
      warnings: [...checkEmploymentFacts(profile, resumeText), ...contentWarnings],
      elaboratedBullets: findElaborations(
        [...resume.experience.flatMap((e) => e.bullets), ...resume.projects.flatMap((p) => p.bullets)],
        resumeText,
      ),
      provider: { id: ai.id, model: ai.model },
      layout: {
        resumePages: fitted.measurement.pages,
        lastPageFillPercent: Math.round(fitted.measurement.lastPageFill * 100),
        bodyFontSize: fitted.typography.body,
      },
    };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
