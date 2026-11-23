"use client";

import { useRef, useState, type DragEvent } from "react";
import { ClientApiError, uploadResume } from "@/lib/client/api";
import {
  ACCEPTED_RESUME_EXTENSIONS,
  MAX_RESUME_CHARS,
  MAX_UPLOAD_BYTES,
  fileKindFromName,
} from "@/lib/validation";
import { Alert, Card, Spinner, buttonStyles, cx, textareaStyles } from "./ui";

export interface UploadedFileInfo {
  name: string;
  pages?: number;
}

type Mode = "upload" | "paste";

export function ResumeUpload({
  text,
  onTextChange,
  file,
  onFileChange,
  disabled,
}: {
  text: string;
  onTextChange: (text: string) => void;
  file: UploadedFileInfo | null;
  onFileChange: (file: UploadedFileInfo | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showText, setShowText] = useState(false);

  async function handleFile(selected: File) {
    setError(null);
    if (!fileKindFromName(selected.name)) {
      setError("Unsupported file type. Upload a PDF, DOCX, or TXT file.");
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setError(`The file is too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setUploading(true);
    try {
      const parsed = await uploadResume(selected);
      // Only replace the current resume once the new one was read successfully.
      onTextChange(parsed.text);
      onFileChange({ name: parsed.fileName, pages: parsed.pages });
      setShowText(false);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "The file could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled || uploading) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void handleFile(dropped);
  }

  function removeFile() {
    onFileChange(null);
    onTextChange("");
    setError(null);
  }

  const busy = disabled || uploading;

  return (
    <Card
      step={1}
      title="Base resume"
      description="Your real experience. It is the single source of truth for every generated document."
      actions={
        <div className="flex shrink-0 rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800" role="tablist">
          {(["upload", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={busy}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-md px-2.5 py-1 transition",
                mode === m
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
              )}
            >
              {m === "upload" ? "Upload" : "Paste text"}
            </button>
          ))}
        </div>
      }
    >
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={`${ACCEPTED_RESUME_EXTENSIONS.join(",")},application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain`}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) void handleFile(selected);
        }}
        disabled={busy}
        aria-label="Upload resume file"
      />

      {mode === "upload" ? (
        <div className="space-y-3">
          {file ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <FileIcon />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {file.pages ? `${file.pages} page${file.pages > 1 ? "s" : ""} · ` : ""}
                  {text.length.toLocaleString()} characters extracted
                </p>
              </div>
              <div className="flex gap-1">
                <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={() => inputRef.current?.click()}>
                  {uploading ? <Spinner /> : null} Replace
                </button>
                <button type="button" className={buttonStyles.ghost} disabled={busy} onClick={removeFile}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
                dragging
                  ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30"
                  : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600",
              )}
            >
              {uploading ? (
                <>
                  <Spinner className="size-6 text-indigo-600" />
                  <p className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Extracting text…</p>
                </>
              ) : (
                <>
                  <UploadIcon />
                  <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <button
                      type="button"
                      className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                      onClick={() => inputRef.current?.click()}
                      disabled={busy}
                    >
                      Choose a file
                    </button>{" "}
                    or drag it here
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    PDF, DOCX, or TXT · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB
                  </p>
                </>
              )}
            </div>
          )}

          {file ? (
            <div>
              <button
                type="button"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                onClick={() => setShowText((v) => !v)}
                aria-expanded={showText}
              >
                {showText ? "Hide extracted text" : "Review / edit extracted text"}
              </button>
              {showText ? (
                <textarea
                  className={cx(textareaStyles, "mt-2 h-72 font-mono text-xs")}
                  value={text}
                  maxLength={MAX_RESUME_CHARS}
                  onChange={(e) => onTextChange(e.target.value)}
                  disabled={disabled}
                  aria-label="Extracted resume text"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <textarea
            className={cx(textareaStyles, "h-80")}
            value={text}
            maxLength={MAX_RESUME_CHARS}
            onChange={(e) => {
              onTextChange(e.target.value);
              if (file) onFileChange(null);
            }}
            placeholder="Paste the full text of your resume: contact details, summary, skills, experience, projects, education…"
            disabled={disabled}
            aria-label="Resume text"
          />
          <p className="mt-1.5 text-right text-xs text-zinc-500 dark:text-zinc-400">
            {text.length.toLocaleString()} / {MAX_RESUME_CHARS.toLocaleString()}
          </p>
        </div>
      )}

      {error ? (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
    </Card>
  );
}

function UploadIcon() {
  return (
    <svg className="size-9 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function FileIcon() {
  return (
    <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4" />
      </svg>
    </span>
  );
}
