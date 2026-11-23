"use client";

import { useEffect, useRef, useState } from "react";
import { ClientApiError, generateDocuments } from "@/lib/client/api";
import { MIN_JD_CHARS, MIN_RESUME_CHARS } from "@/lib/validation";
import { GENERATION_STAGES, type GenerationResult, type StageId } from "@/types/resume";
import { CoverLetterPreview } from "./CoverLetterPreview";
import { DownloadActions } from "./DownloadActions";
import { GenerationProgress, type StageStatus } from "./GenerationProgress";
import { JobDescriptionInput } from "./JobDescriptionInput";
import { JobMatchAnalysis } from "./JobMatchAnalysis";
import { ResumePreview } from "./ResumePreview";
import { ResumeUpload, type UploadedFileInfo } from "./ResumeUpload";
import { Alert, Card, Spinner, buttonStyles, cx } from "./ui";

type Tab = "resume" | "cover-letter" | "analysis";

const initialStages = () =>
  Object.fromEntries(GENERATION_STAGES.map((s) => [s.id, "pending"])) as Record<StageId, StageStatus>;

export function ResumeOptimizer() {
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<UploadedFileInfo | null>(null);
  const [jobDescription, setJobDescription] = useState("");

  const [generating, setGenerating] = useState(false);
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [resultInputs, setResultInputs] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resume");

  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const inputsKey = `${resumeText.trim()}\u0000${jobDescription.trim()}`;
  const inputsChanged = result !== null && resultInputs !== inputsKey;

  function validate(): string[] {
    const problems: string[] = [];
    const resume = resumeText.trim();
    const jd = jobDescription.trim();
    if (!resume) problems.push("Add your base resume: upload a PDF, DOCX, or TXT file, or paste the text.");
    else if (resume.length < MIN_RESUME_CHARS)
      problems.push(`Your resume looks incomplete (under ${MIN_RESUME_CHARS} characters).`);
    if (!jd) problems.push("Paste the job description.");
    else if (jd.length < MIN_JD_CHARS)
      problems.push(`The job description looks incomplete (under ${MIN_JD_CHARS} characters). Paste the full posting.`);
    return problems;
  }

  async function generate() {
    if (inFlight.current) return; // guard against double submission
    const problems = validate();
    setValidation(problems);
    if (problems.length) return;

    inFlight.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const submittedKey = inputsKey;

    setGenerating(true);
    setError(null);
    setStages(initialStages());

    try {
      const generated = await generateDocuments(
        { resumeText, jobDescription },
        (stage, status) =>
          setStages((prev) => ({ ...prev, [stage]: status === "started" ? "active" : "done" })),
        controller.signal,
      );
      setResult(generated);
      setResultInputs(submittedKey);
      setTab("resume");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setStages(initialStages());
        return;
      }
      const failedStage = err instanceof ClientApiError ? err.stage : undefined;
      setStages((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next) as StageId[]) {
          if (next[id] === "active" || id === failedStage) next[id] = "error";
        }
        return next;
      });
      const stageLabel = GENERATION_STAGES.find((s) => s.id === failedStage)?.label;
      setError({
        title: stageLabel ? `Failed while ${stageLabel.toLowerCase()}` : "Generation failed",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      inFlight.current = false;
      abortRef.current = null;
      setGenerating(false);
    }
  }

  const showProgress = generating || error !== null || Object.values(stages).some((s) => s !== "pending");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ResumeUpload
          text={resumeText}
          onTextChange={setResumeText}
          file={resumeFile}
          onFileChange={setResumeFile}
          disabled={generating}
        />
        <JobDescriptionInput value={jobDescription} onChange={setJobDescription} disabled={generating} />
      </div>

      <Card step={3} title="Generate" description="The AI analyzes the role, matches it against your real experience, and writes both documents.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" className={cx(buttonStyles.primary, "sm:px-6 sm:py-3 sm:text-base")} onClick={generate} disabled={generating}>
            {generating ? <Spinner /> : <SparkIcon />}
            {generating ? "Generating…" : result ? "Regenerate Optimized Resume" : "Generate Optimized Resume"}
          </button>
          {generating ? (
            <button type="button" className={buttonStyles.secondary} onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : null}
          {inputsChanged && !generating ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Inputs changed since the last generation. Regenerate to update the documents.
            </p>
          ) : null}
        </div>

        {validation.length > 0 ? (
          <div className="mt-4">
            <Alert title="Before generating">
              <ul className="list-disc space-y-0.5 pl-5">
                {validation.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ul>
            </Alert>
          </div>
        ) : null}

        {showProgress ? (
          <div className="mt-5">
            <GenerationProgress stages={stages} />
          </div>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Alert title={error.title}>
              {error.message}
              <p className="mt-1 opacity-80">Your resume and job description are still here. Adjust and try again.</p>
            </Alert>
          </div>
        ) : null}
      </Card>

      {result ? (
        <div ref={resultsRef} className="scroll-mt-6">
          <Card
            step={4}
            title="Generated documents"
            description={`Tailored for ${result.match.jobTitle}${result.match.companyName ? ` at ${result.match.companyName}` : ""} · ${result.provider.model}`}
          >
            <DownloadActions result={result} />
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Resume PDF: {result.layout.resumePages} page{result.layout.resumePages === 1 ? "" : "s"}
              {result.layout.resumePages > 1 ? ` · last page ${result.layout.lastPageFillPercent}% filled` : ""} · body text{" "}
              {result.layout.bodyFontSize}pt
            </p>

            {result.warnings.length > 0 ? (
              <div className="mt-4">
                <Alert tone="warning">
                  {result.warnings.length} item{result.warnings.length > 1 ? "s" : ""} need
                  {result.warnings.length > 1 ? "" : "s"} your review.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => setTab("analysis")}>
                    See details
                  </button>
                </Alert>
              </div>
            ) : null}

            <div className="mt-6 border-b border-zinc-200 dark:border-zinc-800" role="tablist">
              <nav className="-mb-px flex gap-6">
                {(
                  [
                    ["resume", "Optimized resume"],
                    ["cover-letter", "Cover letter"],
                    ["analysis", "Job match analysis"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cx(
                      "border-b-2 pb-2.5 text-sm font-medium transition",
                      tab === id
                        ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                        : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="mt-6" role="tabpanel">
              {tab === "resume" ? (
                <div className="rounded-xl bg-zinc-100 p-3 sm:p-6 dark:bg-zinc-950">
                  <ResumePreview resume={result.resume} elaborated={result.elaboratedBullets} />
                </div>
              ) : tab === "cover-letter" ? (
                <div className="rounded-xl bg-zinc-100 p-3 sm:p-6 dark:bg-zinc-950">
                  <CoverLetterPreview letter={result.coverLetter} />
                </div>
              ) : (
                <JobMatchAnalysis match={result.match} keywords={result.keywords} warnings={result.warnings} />
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function SparkIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M10 1.5a.75.75 0 0 1 .7.48l1.42 3.7a3 3 0 0 0 1.72 1.72l3.7 1.42a.75.75 0 0 1 0 1.4l-3.7 1.42a3 3 0 0 0-1.72 1.72l-1.42 3.7a.75.75 0 0 1-1.4 0l-1.42-3.7a3 3 0 0 0-1.72-1.72l-3.7-1.42a.75.75 0 0 1 0-1.4l3.7-1.42a3 3 0 0 0 1.72-1.72l1.42-3.7A.75.75 0 0 1 10 1.5Z" />
    </svg>
  );
}
