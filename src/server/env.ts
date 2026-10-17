export type PassieEnvironment = "development" | "staging" | "production" | "test";

/**
 * Resolves the active Passie environment from explicit Cloudflare worker context
 * or process.env fallbacks.
 */
export function resolvePassieEnv(env?: Record<string, unknown>): PassieEnvironment {
  const raw =
    (typeof env?.PASSIE_ENV === "string" ? env.PASSIE_ENV.trim() : "") ||
    (typeof process.env.PASSIE_ENV === "string" ? process.env.PASSIE_ENV.trim() : "");

  if (raw === "production" || raw === "staging" || raw === "development" || raw === "test") {
    return raw;
  }

  if (process.env.NODE_ENV === "test") {
    return "test";
  }

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

/**
 * Returns true if running in a remote Cloudflare deployed environment (production or staging).
 * Cloud deployments enforce strict fail-closed security invariants:
 * - High-entropy BETTER_AUTH_SECRET
 * - Explicit PASSIE_PUBLIC_ORIGIN
 * - Secure cookies enabled
 * - Cloudflare EMAIL binding required
 * - Local dev login endpoints strictly blocked (404)
 */
export function isCloudDeployed(env?: Record<string, unknown>): boolean {
  const resolved = resolvePassieEnv(env);
  return resolved === "production" || resolved === "staging";
}
