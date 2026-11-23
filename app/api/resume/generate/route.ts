import { jsonError, toPublicError } from "@/lib/http";
import { GenerateRequestSchema, MAX_JD_CHARS, MAX_RESUME_CHARS } from "@/lib/validation";
import { getAIProvider } from "@/services/ai/AIService";
import { runResumeWorkflow } from "@/services/resume/ResumeWorkflow";
import type { GenerationEvent } from "@/types/resume";

// Several sequential model calls; allow generous time on platforms that honor this.
export const maxDuration = 300;

const MAX_BODY_BYTES = (MAX_RESUME_CHARS + MAX_JD_CHARS) * 4 + 16 * 1024;

/**
 * Runs the optimization workflow and streams newline-delimited JSON events:
 * real stage transitions, then a single `result` or `error` event.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return jsonError("PAYLOAD_TOO_LARGE", "The resume or job description is too long.", 413);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("INVALID_REQUEST", "The request body must be valid JSON.", 400);
  }

  const parsed = GenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.", 400);
  }

  // Surface configuration problems as a normal error response before streaming.
  try {
    getAIProvider();
  } catch (error) {
    const e = toPublicError(error, "api/resume/generate");
    return jsonError(e.code, e.message, e.status);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerationEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true; // client went away
        }
      };

      try {
        const result = await runResumeWorkflow(
          parsed.data,
          (stage, status) => send({ type: "stage", stage, status }),
          request.signal,
        );
        send({ type: "result", result });
      } catch (error) {
        const e = toPublicError(error, "api/resume/generate");
        send({ type: "error", error: { code: e.code, message: e.message, stage: e.stage } });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
