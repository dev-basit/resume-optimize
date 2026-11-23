import type { z } from "zod";

export type AIErrorCode =
  | "CONFIG"
  | "AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER"
  | "INVALID_RESPONSE"
  | "ABORTED";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateJSONParams<T extends z.ZodType> {
  /** Short identifier for the schema; used for structured outputs and logs. */
  name: string;
  system: string;
  user: string;
  schema: T;
  signal?: AbortSignal;
}

export interface GenerateTextParams {
  system: string;
  user: string;
  signal?: AbortSignal;
}

/**
 * Provider-agnostic contract. Business logic depends only on this interface,
 * so adding Anthropic, Gemini, etc. means adding one class + a factory entry.
 */
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  generateJSON<T extends z.ZodType>(params: GenerateJSONParams<T>): Promise<z.infer<T>>;
  generateText(params: GenerateTextParams): Promise<string>;
}
