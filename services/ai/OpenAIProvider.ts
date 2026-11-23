import "server-only";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { z } from "zod";
import type { ProviderConfig, StructuredOutputMode } from "@/lib/env";
import type { AIProvider, ChatMessage, GenerateJSONParams, GenerateTextParams } from "@/types/ai";
import { AIError } from "./errors";
import { extractJSON } from "./json";

const MODE_FALLBACK: Record<StructuredOutputMode, StructuredOutputMode | null> = {
  json_schema: "json_object",
  json_object: "prompt",
  prompt: null,
};

/**
 * Remembers when an endpoint rejected a structured-output mode so later calls
 * skip straight to a supported mode. Keyed per model + base URL.
 */
const downgradedModes = new Map<string, StructuredOutputMode>();

/**
 * OpenAI Chat Completions provider (api.openai.com, or an Azure/proxy endpoint
 * via OPENAI_BASE_URL).
 */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly model: string;
  protected readonly client: OpenAI;
  protected readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  private get modeKey() {
    return `${this.model}|${this.config.baseURL ?? ""}`;
  }

  async generateText({ system, user, signal }: GenerateTextParams): Promise<string> {
    const content = await this.complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      undefined,
      signal,
    );
    return content.trim();
  }

  async generateJSON<T extends z.ZodType>(params: GenerateJSONParams<T>): Promise<z.infer<T>> {
    const { name, schema, signal } = params;
    const jsonSchema = toProviderSchema(schema);
    let mode = downgradedModes.get(this.modeKey) ?? this.config.structuredOutput;

    for (;;) {
      try {
        return await this.generateJSONWithMode(params, jsonSchema, mode);
      } catch (error) {
        // Some endpoints reject response_format variants with a 400. Step down
        // to a less demanding mode instead of failing the whole workflow.
        const next = MODE_FALLBACK[mode];
        if (error instanceof BadRequestError && next && !signal?.aborted) {
          console.warn(
            `[ai:openai] "${mode}" structured output rejected for ${name}; falling back to "${next}".`,
          );
          mode = next;
          downgradedModes.set(this.modeKey, mode);
          continue;
        }
        throw this.normalizeError(error);
      }
    }
  }

  private async generateJSONWithMode<T extends z.ZodType>(
    { name, system, user, schema, signal }: GenerateJSONParams<T>,
    jsonSchema: Record<string, unknown>,
    mode: StructuredOutputMode,
  ): Promise<z.infer<T>> {
    const schemaInstruction =
      mode === "json_schema"
        ? "Respond only with JSON that conforms to the provided schema."
        : `Respond only with a single JSON object (no markdown, no commentary) that conforms to this JSON Schema:\n${JSON.stringify(jsonSchema)}`;

    const messages: ChatMessage[] = [
      { role: "system", content: `${system}\n\n${schemaInstruction}` },
      { role: "user", content: user },
    ];

    const responseFormat: ChatCompletionCreateParamsNonStreaming["response_format"] =
      mode === "json_schema"
        ? {
            type: "json_schema",
            json_schema: { name: sanitizeSchemaName(name), schema: jsonSchema, strict: false },
          }
        : mode === "json_object"
          ? { type: "json_object" }
          : undefined;

    // One repair round-trip: show the model its output and the validation errors.
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.complete(messages, responseFormat, signal);
      let issues: string;
      try {
        const parsed = schema.safeParse(extractJSON(raw));
        if (parsed.success) return parsed.data;
        issues = z.prettifyError(parsed.error);
      } catch (error) {
        issues = error instanceof Error ? error.message : "Output was not valid JSON.";
      }

      console.warn(`[ai:${this.id}] ${name} response failed validation (attempt ${attempt + 1}).`);
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: `Your previous response was invalid:\n${issues.slice(0, 2000)}\n\nReturn the corrected, complete JSON object only.`,
        },
      );
    }

    throw new AIError(
      "INVALID_RESPONSE",
      "The AI model returned a response in an unexpected format. Please try again or use a more capable model.",
    );
  }

  private async complete(
    messages: ChatMessage[],
    responseFormat: ChatCompletionCreateParamsNonStreaming["response_format"],
    signal?: AbortSignal,
  ): Promise<string> {
    const body: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
    };

    const completion = await this.client.chat.completions.create(body, { signal });
    const choice = completion.choices?.[0];
    if (!choice) {
      throw new AIError("INVALID_RESPONSE", "The AI provider returned an empty response.");
    }
    if (choice.finish_reason === "length") {
      throw new AIError(
        "INVALID_RESPONSE",
        "The AI response was cut off because it exceeded the model's output limit. Try a model with a larger output window.",
      );
    }
    if (choice.finish_reason === "content_filter" || choice.message?.refusal) {
      throw new AIError("INVALID_RESPONSE", "The AI provider declined to generate this content.");
    }
    const content = choice.message?.content;
    if (!content || !content.trim()) {
      throw new AIError("INVALID_RESPONSE", "The AI provider returned an empty response.");
    }
    return content;
  }

  /** Map SDK/network errors to user-safe AIErrors. Never echoes request content or keys. */
  protected normalizeError(error: unknown): AIError {
    if (error instanceof AIError) return error;
    const label = "OpenAI";

    if (error instanceof APIUserAbortError) {
      return new AIError("ABORTED", "The request was cancelled.", { cause: error });
    }
    if (error instanceof APIConnectionTimeoutError) {
      return new AIError(
        "TIMEOUT",
        `${label} did not respond in time. Try again, or increase AI_TIMEOUT_MS.`,
        { cause: error },
      );
    }
    if (error instanceof APIConnectionError) {
      return new AIError(
        "PROVIDER",
        `Could not connect to ${label}. Check the base URL and your network connection.`,
        { cause: error },
      );
    }
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return new AIError(
        "AUTH",
        `${label} rejected the API key. Check the configured API key and its permissions.`,
        { cause: error },
      );
    }
    if (error instanceof RateLimitError) {
      return new AIError(
        "RATE_LIMIT",
        `${label} rate limit or quota reached. Wait a moment and try again, or check your plan's usage limits.`,
        { cause: error },
      );
    }
    if (error instanceof NotFoundError) {
      return new AIError(
        "CONFIG",
        `${label} could not find model "${this.model}". Check the configured model name and base URL.`,
        { cause: error },
      );
    }
    if (error instanceof BadRequestError) {
      return new AIError(
        "PROVIDER",
        `${label} rejected the request (400). The model may not support this request or the input may be too long.`,
        { cause: error },
      );
    }
    if (error instanceof APIError) {
      return new AIError(
        "PROVIDER",
        `${label} returned an error${error.status ? ` (${error.status})` : ""}. Please try again shortly.`,
        { cause: error },
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      return new AIError("ABORTED", "The request was cancelled.", { cause: error });
    }
    return new AIError("PROVIDER", `Unexpected error while contacting ${label}.`, {
      cause: error,
    });
  }
}

function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function sanitizeSchemaName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
