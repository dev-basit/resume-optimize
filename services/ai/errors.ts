import type { AIErrorCode } from "@/types/ai";

/** Error with a user-safe message. Never include keys or document content here. */
export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status: number;

  constructor(code: AIErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

const STATUS_BY_CODE: Record<AIErrorCode, number> = {
  CONFIG: 500,
  AUTH: 502,
  RATE_LIMIT: 429,
  TIMEOUT: 504,
  PROVIDER: 502,
  INVALID_RESPONSE: 502,
  ABORTED: 499,
};
