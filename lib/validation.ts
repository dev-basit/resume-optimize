import { z } from "zod";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MIN_RESUME_CHARS = 200;
export const MAX_RESUME_CHARS = 30_000;
export const MIN_JD_CHARS = 100;
export const MAX_JD_CHARS = 20_000;

export const ACCEPTED_RESUME_EXTENSIONS = [".pdf", ".docx", ".txt"] as const;
export type ResumeFileKind = "pdf" | "docx" | "txt";

/** Body of POST /api/resume/generate. */
export const GenerateRequestSchema = z.object({
  resumeText: z
    .string({ error: "Provide your base resume by uploading a file or pasting its text." })
    .trim()
    .min(MIN_RESUME_CHARS, {
      error: `Your resume looks too short (minimum ${MIN_RESUME_CHARS} characters). Upload the full resume or paste its complete text.`,
    })
    .max(MAX_RESUME_CHARS, {
      error: `Your resume is too long (maximum ${MAX_RESUME_CHARS.toLocaleString("en-US")} characters).`,
    }),
  jobDescription: z
    .string({ error: "Paste the job description." })
    .trim()
    .min(MIN_JD_CHARS, {
      error: `The job description looks too short (minimum ${MIN_JD_CHARS} characters). Paste the complete posting.`,
    })
    .max(MAX_JD_CHARS, {
      error: `The job description is too long (maximum ${MAX_JD_CHARS.toLocaleString("en-US")} characters).`,
    }),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export function fileKindFromName(name: string): ResumeFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

/** Keep a filename safe for display, logs, and Content-Disposition headers. */
export function sanitizeFileName(name: string, maxLength = 100): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || "resume";
}

/** "Senior Software Engineer (Remote)" -> "Senior-Software-Engineer-Remote" */
export function slugForFileName(value: string, fallback = "Resume"): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Normalize whitespace and remove control characters from extracted/pasted text. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
