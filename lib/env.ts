import "server-only";

/**
 * Server-only environment configuration for AI providers.
 *
 * Nothing here is ever sent to the browser. Configuration is read lazily on each
 * request so the app boots normally without keys and reports a clear error only
 * when generation is attempted.
 */

export type ProviderId = "openai";

export const SUPPORTED_PROVIDERS: readonly ProviderId[] = ["openai"];

export type StructuredOutputMode = "json_schema" | "json_object" | "prompt";

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseURL?: string;
  structuredOutput: StructuredOutputMode;
  timeoutMs: number;
  maxRetries: number;
  temperature?: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = read(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ConfigError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function readTemperature(name: string): number | undefined {
  const raw = read(name);
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 2) {
    throw new ConfigError(`${name} must be a number between 0 and 2.`);
  }
  return n;
}

function readStructuredMode(name: string, fallback: StructuredOutputMode): StructuredOutputMode {
  const raw = read(name)?.toLowerCase();
  if (!raw) return fallback;
  if (raw === "json_schema" || raw === "json_object" || raw === "prompt") return raw;
  throw new ConfigError(`${name} must be one of: json_schema, json_object, prompt.`);
}

function validateUrl(name: string, value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return value.replace(/\/+$/, "");
  } catch {
    throw new ConfigError(`${name} must be a valid http(s) URL.`);
  }
}

/** Resolve the active provider configuration from environment variables. */
export function getProviderConfig(): ProviderConfig {
  const provider = (read("AI_PROVIDER") ?? "openai").toLowerCase();
  if (!SUPPORTED_PROVIDERS.includes(provider as ProviderId)) {
    throw new ConfigError(`AI_PROVIDER "${provider}" is not supported. Use one of: ${SUPPORTED_PROVIDERS.join(", ")}.`);
  }

  const timeoutMs = readInt("AI_TIMEOUT_MS", 120_000, 5_000, 600_000);
  const maxRetries = readInt("AI_MAX_RETRIES", 2, 0, 5);
  const temperature = readTemperature("AI_TEMPERATURE");

  const apiKey = read("OPENAI_API_KEY");
  const model = read("OPENAI_MODEL");
  if (!apiKey) throw new ConfigError("OPENAI_API_KEY is not set.");
  if (!model) throw new ConfigError("OPENAI_MODEL is not set.");
  const baseURL = read("OPENAI_BASE_URL");
  return {
    provider: "openai",
    apiKey,
    model,
    baseURL: baseURL ? validateUrl("OPENAI_BASE_URL", baseURL) : undefined,
    structuredOutput: readStructuredMode("OPENAI_STRUCTURED_OUTPUT", "json_schema"),
    timeoutMs,
    maxRetries,
    temperature,
  };
}
