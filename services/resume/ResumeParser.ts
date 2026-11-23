import "server-only";
import mammoth from "mammoth";
import { extractTextItems, getDocumentProxy } from "unpdf";
import {
  MAX_RESUME_CHARS,
  MAX_UPLOAD_BYTES,
  MIN_RESUME_CHARS,
  fileKindFromName,
  normalizeText,
  type ResumeFileKind,
} from "@/lib/validation";

export class ResumeParseError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "ResumeParseError";
    this.code = code;
    this.status = status;
  }
}

export interface ParsedResume {
  text: string;
  kind: ResumeFileKind;
  pages?: number;
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK.. (DOCX is a ZIP container)

function startsWith(bytes: Uint8Array, magic: number[], searchWindow = 1): boolean {
  for (let offset = 0; offset < searchWindow && offset + magic.length <= bytes.length; offset++) {
    if (magic.every((b, i) => bytes[offset + i] === b)) return true;
  }
  return false;
}

/**
 * Extract plain text from an uploaded resume. Validates size, extension, and
 * file signature; uploaded content is only ever read as data, never executed.
 */
export async function parseResumeFile(file: File): Promise<ParsedResume> {
  if (file.size === 0) {
    throw new ResumeParseError("EMPTY_FILE", "The uploaded file is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ResumeParseError(
      "FILE_TOO_LARGE",
      `The file is too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }
  const kind = fileKindFromName(file.name);
  if (!kind) {
    throw new ResumeParseError(
      "UNSUPPORTED_FILE_TYPE",
      "Unsupported file type. Upload a PDF, DOCX, or TXT file.",
      415,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  let pages: number | undefined;

  switch (kind) {
    case "pdf": {
      // Some generators prepend a few bytes before the header; PDF readers allow up to 1 KB.
      if (!startsWith(bytes, PDF_MAGIC, 1024)) {
        throw new ResumeParseError("INVALID_FILE", "This file is not a valid PDF document.");
      }
      ({ text, pages } = await extractPdf(bytes));
      break;
    }
    case "docx": {
      if (!startsWith(bytes, ZIP_MAGIC)) {
        throw new ResumeParseError(
          "INVALID_FILE",
          "This file is not a valid DOCX document. Older .doc files are not supported; save it as .docx or PDF.",
        );
      }
      text = await extractDocx(bytes);
      break;
    }
    case "txt": {
      if (bytes.includes(0)) {
        throw new ResumeParseError("INVALID_FILE", "This file does not appear to be plain text.");
      }
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      break;
    }
  }

  text = normalizeText(text);

  if (text.replace(/\s/g, "").length < 50) {
    throw new ResumeParseError(
      "NO_TEXT_EXTRACTED",
      kind === "pdf"
        ? "No readable text was found in this PDF. It may be a scanned or image-based document. Upload a text-based PDF or DOCX, or paste your resume text instead."
        : "No readable text was found in this file. Paste your resume text instead.",
    );
  }
  if (text.length < MIN_RESUME_CHARS) {
    throw new ResumeParseError(
      "TOO_LITTLE_TEXT",
      "Only a small amount of text could be extracted from this file. Check that it is your complete resume, or paste the text instead.",
    );
  }
  if (text.length > MAX_RESUME_CHARS) {
    throw new ResumeParseError(
      "TOO_MUCH_TEXT",
      `The extracted text is too long (over ${MAX_RESUME_CHARS.toLocaleString("en-US")} characters). Upload a standard-length resume.`,
    );
  }

  return { text, kind, pages };
}

async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, items } = await extractTextItems(pdf);
    const pageTexts = items.map(reconstructLines);
    await pdf.cleanup().catch(() => undefined);
    return { text: pageTexts.join("\n\n"), pages: totalPages };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(message)) {
      throw new ResumeParseError(
        "PASSWORD_PROTECTED",
        "This PDF is password-protected. Remove the password or upload a different file.",
      );
    }
    console.error("[resume-parser] PDF extraction failed:", error instanceof Error ? error.name : "unknown");
    throw new ResumeParseError(
      "CORRUPTED_FILE",
      "This PDF could not be read. It may be corrupted. Try re-exporting it, uploading a DOCX, or pasting the text.",
    );
  }
}

type PdfItem = { str: string; x: number; y: number; width: number; height: number; fontSize: number };

/** Rebuild reading-order lines from positioned PDF text items. */
function reconstructLines(items: PdfItem[]): string {
  const visible = items.filter((it) => it.str && it.str.trim() !== "");
  if (visible.length === 0) return "";

  // Top-to-bottom (PDF origin is bottom-left), then left-to-right.
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfItem[][] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(2, (item.fontSize || item.height || 10) * 0.45);
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item);
    else lines.push([item]);
  }

  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = "";
      let prevEnd: number | null = null;
      for (const item of line) {
        const gap = prevEnd === null ? 0 : item.x - prevEnd;
        const spaceWidth = (item.fontSize || 10) * 0.2;
        if (prevEnd !== null && gap > spaceWidth && !out.endsWith(" ") && !item.str.startsWith(" ")) {
          out += gap > spaceWidth * 8 ? "  " : " ";
        }
        out += item.str;
        prevEnd = item.x + item.width;
      }
      return out.trimEnd();
    })
    .join("\n");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  try {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  } catch (error) {
    console.error("[resume-parser] DOCX extraction failed:", error instanceof Error ? error.name : "unknown");
    throw new ResumeParseError(
      "CORRUPTED_FILE",
      "This DOCX file could not be read. It may be corrupted. Try re-saving it, uploading a PDF, or pasting the text.",
    );
  }
}
