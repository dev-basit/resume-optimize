"use client";

import { useState } from "react";
import { ClientApiError, downloadDocument, type DownloadKind } from "@/lib/client/api";
import type { GenerationResult } from "@/types/resume";
import { Alert, Spinner, buttonStyles } from "./ui";

export function DownloadActions({ result }: { result: GenerationResult }) {
  const [pending, setPending] = useState<DownloadKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(kind: DownloadKind) {
    setPending(kind);
    setError(null);
    const fileName =
      kind === "resume" ? result.files.resume : kind === "cover-letter" ? result.files.coverLetter : result.files.zip;
    try {
      await downloadDocument(result.documentId, kind, fileName);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Download failed. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const expires = new Date(result.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={buttonStyles.primary} onClick={() => download("resume")} disabled={pending !== null}>
          {pending === "resume" ? <Spinner /> : <DownloadIcon />}
          Download Optimized Resume (PDF)
        </button>
        <button type="button" className={buttonStyles.primary} onClick={() => download("cover-letter")} disabled={pending !== null}>
          {pending === "cover-letter" ? <Spinner /> : <DownloadIcon />}
          Download Cover Letter (PDF)
        </button>
        <button type="button" className={buttonStyles.secondary} onClick={() => download("zip")} disabled={pending !== null}>
          {pending === "zip" ? <Spinner /> : <DownloadIcon />}
          Download Both PDFs (.zip)
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Files are kept in server memory only and expire at {expires}. Regenerate to download again after that.
      </p>
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.69L6.28 8.47a.75.75 0 0 0-1.06 1.06l4.25 4.25c.3.3.77.3 1.06 0l4.25-4.25a.75.75 0 1 0-1.06-1.06l-2.97 2.97V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}
