"use client";

import { GENERATION_STAGES, type StageId } from "@/types/resume";
import { Spinner, cx } from "./ui";

export type StageStatus = "pending" | "active" | "done" | "error";

export function GenerationProgress({ stages }: { stages: Record<StageId, StageStatus> }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Generation progress">
      {GENERATION_STAGES.map((stage, i) => {
        const status = stages[stage.id];
        return (
          <li
            key={stage.id}
            aria-current={status === "active" ? "step" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition",
              status === "active" && "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100",
              status === "done" && "border-emerald-200 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100",
              status === "error" && "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200",
              status === "pending" && "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-500",
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center">
              {status === "active" ? (
                <Spinner className="size-4 text-indigo-600 dark:text-indigo-400" />
              ) : status === "done" ? (
                <svg className="size-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
                </svg>
              ) : status === "error" ? (
                <svg className="size-5 text-red-600 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.7 7.3a1 1 0 0 0-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 1 0 1.4 1.4l1.3-1.3 1.3 1.3a1 1 0 0 0 1.4-1.4L11.4 10l1.3-1.3a1 1 0 0 0-1.4-1.4L10 8.6 8.7 7.3Z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
                  {i + 1}
                </span>
              )}
            </span>
            <span className="font-medium">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
