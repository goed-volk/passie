import { cache } from "react";

export interface TelemetryConfig {
  posthogKey: string | null;
  posthogHost: string;
  passieEnv: string;
}

/**
 * Resolves runtime telemetry configuration for PostHog.
 *
 * Execution environments:
 * 1. Cloudflare Workers (HTTP request):
 *    Variables are bound to the worker runtime context (`ctx.env`), accessible via
 *    `getCloudflareContext({ async: true })`.
 * 2. Standalone scripts, tests, static compilation, or Workers Scheduled event:
 *    `getCloudflareContext` may throw or return outside request scope. In Node.js /
 *    workerd runtime with `nodejs_compat`, variables are mirrored or accessed via `process.env`.
 *
 * Note: Zero `NEXT_PUBLIC_*` fallbacks are used to prevent build-time inlining into client bundles.
 */
export const getTelemetryConfig = cache(async (): Promise<TelemetryConfig> => {
  let cfEnv: Record<string, string | undefined> | undefined;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    cfEnv = ctx.env as unknown as Record<string, string | undefined>;
  } catch {
    // Outside Cloudflare request context (build-time prerender, vitest, standalone scripts)
  }

  const posthogKey =
    (cfEnv?.POSTHOG_KEY && cfEnv.POSTHOG_KEY.trim() !== "" ? cfEnv.POSTHOG_KEY.trim() : null) ||
    (process.env.POSTHOG_KEY && process.env.POSTHOG_KEY.trim() !== "" ? process.env.POSTHOG_KEY.trim() : null);

  const posthogHost =
    (cfEnv?.POSTHOG_HOST && cfEnv.POSTHOG_HOST.trim() !== "" ? cfEnv.POSTHOG_HOST.trim() : null) ||
    (process.env.POSTHOG_HOST && process.env.POSTHOG_HOST.trim() !== "" ? process.env.POSTHOG_HOST.trim() : null) ||
    "https://eu.i.posthog.com";

  const passieEnv =
    (cfEnv?.PASSIE_ENV && cfEnv.PASSIE_ENV.trim() !== "" ? cfEnv.PASSIE_ENV.trim() : null) ||
    (process.env.PASSIE_ENV && process.env.PASSIE_ENV.trim() !== "" ? process.env.PASSIE_ENV.trim() : null) ||
    (process.env.NODE_ENV === "production" ? "production" : "development");

  return {
    posthogKey: posthogKey || null,
    posthogHost,
    passieEnv,
  };
});
