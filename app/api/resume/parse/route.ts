import { jsonError, toPublicError } from "@/lib/http";
import { MAX_UPLOAD_BYTES, sanitizeFileName } from "@/lib/validation";
import { parseResumeFile } from "@/services/resume/ResumeParser";
import type { ParseResumeResponse } from "@/types/resume";

/** Extract text from an uploaded resume (PDF, DOCX, TXT). Nothing is stored. */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return jsonError(
      "FILE_TOO_LARGE",
      `The file is too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
      413,
    );
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return jsonError("INVALID_REQUEST", "The upload could not be read. Please try again.", 400);
  }
  if (!(file instanceof File)) {
    return jsonError("MISSING_FILE", "Choose a resume file to upload.", 400);
  }

  try {
    const parsed = await parseResumeFile(file);
    const body: ParseResumeResponse = {
      fileName: sanitizeFileName(file.name),
      text: parsed.text,
      characters: parsed.text.length,
      pages: parsed.pages,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const e = toPublicError(error, "api/resume/parse");
    return jsonError(e.code, e.message, e.status);
  }
}
