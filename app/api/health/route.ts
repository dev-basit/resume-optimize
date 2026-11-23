import { connection } from "next/server";
import { ConfigError, getProviderConfig } from "@/lib/env";

/**
 * Liveness/readiness check. Runs at request time (never prerendered), so a
 * response means the server process is up and handling requests.
 * Reports only whether AI is configured, never keys or model details.
 */
export async function GET() {
  await connection();

  let ai: "configured" | "not_configured" = "configured";
  try {
    getProviderConfig();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    ai = "not_configured";
  }

  return Response.json(
    {
      status: "ok",
      ai,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
