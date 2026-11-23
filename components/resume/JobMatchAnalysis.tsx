import type { ReactNode } from "react";
import type { FactCheckWarning, JobMatchSummary, KeywordAnalysis } from "@/types/resume";
import { Alert, Chip } from "./ui";

const IMPORTANCE_TONE = { critical: "danger", important: "warning", preferred: "neutral" } as const;
const RELEVANCE_TONE = { high: "success", medium: "accent", low: "neutral" } as const;

export function JobMatchAnalysis({
  match,
  keywords,
  warnings,
}: {
  match: JobMatchSummary;
  keywords: KeywordAnalysis;
  warnings: FactCheckWarning[];
}) {
  return (
    <div className="space-y-6">
      {warnings.length > 0 ? (
        <Alert tone="warning" title="Review before sending">
          <p className="mb-1.5">
            These items could not be traced directly to your base resume. Confirm they are accurate, or edit your base
            resume and regenerate.
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Target job title" value={match.jobTitle} />
        <Stat label="Company" value={match.companyName || "Not stated"} />
        <Stat label="Detected seniority" value={match.seniority || "Not stated"} />
        <Stat label="Role focus" value={match.roleFocus || "—"} />
      </div>

      <Block title="Required skills identified">
        <div className="flex flex-wrap gap-1.5">
          {match.requiredSkills.map((s, i) => (
            <Chip key={i} tone={IMPORTANCE_TONE[s.importance]}>
              {s.name}
              <span className="ml-1 opacity-60">· {s.importance}</span>
            </Chip>
          ))}
        </div>
      </Block>

      <div className="grid gap-6 lg:grid-cols-2">
        <Block title={`Matching skills in your resume (${match.matchingSkills.length})`}>
          <ul className="space-y-1.5 text-sm">
            {match.matchingSkills.map((s, i) => (
              <li key={i}>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{s.skill}</span>
                {s.evidence ? <span className="text-zinc-500 dark:text-zinc-400"> — {s.evidence}</span> : null}
              </li>
            ))}
          </ul>
        </Block>

        <div className="space-y-6">
          <Block title={`Missing or unsupported skills (${match.missingSkills.length})`}>
            {match.missingSkills.length ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {match.missingSkills.map((s, i) => (
                    <Chip key={i} tone={IMPORTANCE_TONE[s.importance]}>
                      {s.skill}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  These were not added to your resume because your base resume does not support them.
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-500">None identified.</p>
            )}
          </Block>

          {match.transferableSkills.length > 0 ? (
            <Block title="Transferable experience">
              <ul className="space-y-1.5 text-sm">
                {match.transferableSkills.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.requirement}</span>
                    <span className="text-zinc-500 dark:text-zinc-400"> — {s.evidence}</span>
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}
        </div>
      </div>

      <Block title="Most relevant experience">
        <ul className="space-y-2 text-sm">
          {match.relevantExperience.map((r, i) => (
            <li key={i} className="flex flex-wrap items-start gap-2">
              <Chip tone={RELEVANCE_TONE[r.relevance]}>{r.relevance}</Chip>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.label}</span>
                {r.reason ? <span className="text-zinc-500 dark:text-zinc-400"> — {r.reason}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="ATS keyword analysis">
        <div className="mb-4 flex items-center gap-4">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-indigo-600"
              style={{ width: `${keywords.coveragePercent}%` }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums">{keywords.coveragePercent}% keyword coverage</span>
        </div>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Share of the job description&apos;s key terms that appear in the generated resume ({keywords.includedKeywords.length}{" "}
          of {keywords.jdKeywords.length}). This is an internal keyword indicator, not an ATS score, and does not
          guarantee how any applicant tracking system will rank your resume.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <KeywordList title="Included in resume" items={keywords.includedKeywords} tone="success" />
          <KeywordList
            title="In your base resume, not used"
            items={keywords.missingSupportedKeywords}
            tone="accent"
          />
          <KeywordList title="Not supported by your base resume" items={keywords.unsupportedKeywords} tone="danger" />
        </div>
      </Block>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {children}
    </div>
  );
}

function KeywordList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "accent" | "danger";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title} ({items.length})
      </p>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((k, i) => (
            <Chip key={i} tone={tone}>
              {k}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-400">None</p>
      )}
    </div>
  );
}
