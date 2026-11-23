import "server-only";
import { ConfigError, getProviderConfig, type ProviderConfig, type ProviderId } from "@/lib/env";
import type { AIProvider } from "@/types/ai";
import { AIError } from "./errors";
import { OpenAIProvider } from "./OpenAIProvider";

/**
 * Provider registry. To add a provider (Anthropic, Gemini, ...): implement
 * AIProvider, extend ProviderId/getProviderConfig in lib/env.ts, register here.
 */
const PROVIDER_FACTORIES: Record<ProviderId, (config: ProviderConfig) => AIProvider> = {
  openai: (config) => new OpenAIProvider(config),
};

/** Build the provider selected by AI_PROVIDER. Throws AIError("CONFIG") when misconfigured. */
export function getAIProvider(): AIProvider {
  try {
    const config = getProviderConfig();
    return PROVIDER_FACTORIES[config.provider](config);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new AIError(
        "CONFIG",
        `AI provider is not configured: ${error.message} Update your environment variables (see .env.example) and restart the server.`,
      );
    }
    throw error;
  }
}
