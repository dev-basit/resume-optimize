import "server-only";
import { AIError } from "@/services/ai/errors";
import { ResumeParseError } from "@/services/resume/ResumeParser";
import { WorkflowStageError } from "@/services/resume/ResumeWorkflow";
import type { ApiErrorBody, StageId } from "@/types/resume";

export interface PublicError {
  code: string;
  message: string;
  status: number;
  stage?: StageId;
}

const STAGE_FAILURE_MESSAGES: Partial<Record<StageId, string>> = {
  pdf: "The PDF documents could not be generated. Please try again.",
};

/**
 * Convert any error into a user-safe shape and log technical details
 * server-side. Never logs document contents, contact details, or API keys.
 */
export function toPublicError(error: unknown, context: string): PublicError {
  let stage: StageId | undefined;
  let inner = error;
  if (error instanceof WorkflowStageError) {
    stage = error.stage;
    inner = error.original;
  }

  if (inner instanceof AIError) {
    const cause = inner.cause as { status?: number; name?: string } | undefined;
    console.error(
      `[${context}] AI error code=${inner.code}${stage ? ` stage=${stage}` : ""}${
        cause?.status ? ` upstreamStatus=${cause.status}` : ""
      }${cause?.name ? ` cause=${cause.name}` : ""}`,
    );
    return { code: inner.code, message: inner.message, status: inner.status, stage };
  }
  if (inner instanceof ResumeParseError) {
    console.warn(`[${context}] resume parse error code=${inner.code}`);
    return { code: inner.code, message: inner.message, status: inner.status, stage };
  }

  console.error(
    `[${context}] unexpected error${stage ? ` stage=${stage}` : ""}:`,
    inner instanceof Error ? `${inner.name}: ${inner.message.slice(0, 300)}` : "unknown",
  );
  return {
    code: "INTERNAL",
    message:
      (stage && STAGE_FAILURE_MESSAGES[stage]) ??
      "Something went wrong while processing your request. Please try again.",
    status: 500,
    stage,
  };
}

export function jsonError(code: string, message: string, status: number): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
