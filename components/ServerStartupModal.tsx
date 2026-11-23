"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const READY_KEY = "resume-optimizer:server-ready";
const POLL_INTERVAL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 10_000;
/** After this long without a response, offer a manual retry (polling continues). */
const SLOW_AFTER_MS = 90_000;

type Phase = "checking" | "ready";

const noopSubscribe = () => () => {};

function readyThisSession(): boolean {
  try {
    return sessionStorage.getItem(READY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Shown on a visitor's first load of the session until GET /api/health
 * responds, covering the server's cold start (which can take about a minute).
 * Rendered open in the static HTML so it appears before any JavaScript loads.
 */
export function ServerStartupModal() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Server HTML always includes the modal (cold start); on the client it is
  // skipped at once if the server already answered earlier in this session.
  const confirmedEarlier = useSyncExternalStore(noopSubscribe, readyThisSession, () => false);
  const open = phase === "checking" && !confirmedEarlier;

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);

    async function check() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
        if (res.ok) {
          try {
            sessionStorage.setItem(READY_KEY, "1");
          } catch {
            // storage unavailable: the modal will simply show again next load
          }
          clearInterval(tick);
          if (!cancelled) setPhase("ready");
          return;
        }
      } catch {
        // server still starting or unreachable; retry below
      } finally {
        clearTimeout(timeout);
      }
      if (!cancelled) pollTimer = setTimeout(check, POLL_INTERVAL_MS);
    }

    void check();

    return () => {
      cancelled = true;
      clearInterval(tick);
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [attempt]);

  // Keep keyboard focus inside the dialog and lock page scroll while it is open.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  const slow = elapsed * 1000 >= SLOW_AFTER_MS;
  const progress = Math.min(95, Math.round((elapsed / 60) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="startup-title"
        aria-describedby="startup-desc"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60">
          <svg className="size-6 animate-spin text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>

        <h2 id="startup-title" className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Starting the server…
        </h2>
        <p id="startup-desc" className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          The server may be waking up from sleep. This usually takes <strong>about 1 minute</strong>. Please keep
          this page open; it will be ready automatically.
        </p>

        {/* Elapsed time, not a real percentage: the bar fills over the expected minute. */}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
          <div
            className="h-full rounded-full bg-indigo-600 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400" aria-live="polite">
          Waiting {elapsed}s
        </p>

        {slow ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
            This is taking longer than usual. We&apos;ll keep checking.
            <button
              type="button"
              onClick={() => {
                setElapsed(0);
                setAttempt((n) => n + 1);
              }}
              className="ml-1 font-semibold underline"
            >
              Retry now
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
