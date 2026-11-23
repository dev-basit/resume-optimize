import type {
  ApiErrorBody,
  GenerationEvent,
  GenerationResult,
  ParseResumeResponse,
  StageId,
} from "@/types/resume";

export class ClientApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly stage?: StageId,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

async function readError(response: Response): Promise<ClientApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error?.message) return new ClientApiError(body.error.code, body.error.message);
  } catch {
    // non-JSON error body
  }
  if (response.status === 413) {
    return new ClientApiError("PAYLOAD_TOO_LARGE", "The upload is too large.");
  }
  return new ClientApiError("HTTP_" + response.status, `Request failed (${response.status}). Please try again.`);
}

export async function uploadResume(file: File, signal?: AbortSignal): Promise<ParseResumeResponse> {
  const form = new FormData();
  form.append("file", file);
  let response: Response;
  try {
    response = await fetch("/api/resume/parse", { method: "POST", body: form, signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ClientApiError("NETWORK", "Could not reach the server. Check your connection and try again.");
  }
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function generateDocuments(
  input: { resumeText: string; jobDescription: string },
  onStage: (stage: StageId, status: "started" | "completed") => void,
  signal?: AbortSignal,
): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch("/api/resume/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ClientApiError("NETWORK", "Could not reach the server. Check your connection and try again.");
  }
  if (!response.ok || !response.body) throw await readError(response);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: GenerationResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as GenerationEvent;
    if (event.type === "stage") onStage(event.stage, event.status);
    else if (event.type === "result") result = event.result;
    else if (event.type === "error") {
      throw new ClientApiError(event.error.code, event.error.message, event.error.stage);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    handle(buffer);
  } catch (error) {
    if (error instanceof ClientApiError || (error as Error).name === "AbortError") throw error;
    throw new ClientApiError(
      "STREAM_INTERRUPTED",
      "The connection was interrupted before generation finished. Please try again.",
    );
  }

  if (!result) {
    throw new ClientApiError("STREAM_INTERRUPTED", "Generation ended unexpectedly. Please try again.");
  }
  return result;
}

export type DownloadKind = "resume" | "cover-letter" | "zip";

/** Download a generated file in place (no navigation), surfacing errors such as expiry. */
export async function downloadDocument(documentId: string, kind: DownloadKind, fileName: string) {
  let response: Response;
  try {
    response = await fetch(`/api/documents/${encodeURIComponent(documentId)}?file=${kind}`, {
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError("NETWORK", "Download failed. Check your connection and try again.");
  }
  if (!response.ok) throw await readError(response);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
