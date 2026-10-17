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

export async function captureServerTelemetryEvent(options: {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
  env?: Record<string, unknown>;
  waitUntil?: (p: Promise<unknown>) => void;
}): Promise<void> {
  const work = (async () => {
    const fallbackConfig = await getTelemetryConfig();

    const rawKey =
      typeof options.env?.POSTHOG_KEY === "string" && options.env.POSTHOG_KEY.trim() !== ""
        ? options.env.POSTHOG_KEY.trim()
        : fallbackConfig.posthogKey;

    if (!rawKey) return;

    const posthogHost =
      typeof options.env?.POSTHOG_HOST === "string" && options.env.POSTHOG_HOST.trim() !== ""
        ? options.env.POSTHOG_HOST.trim()
        : fallbackConfig.posthogHost;

    const passieEnv =
      typeof options.env?.PASSIE_ENV === "string" && options.env.PASSIE_ENV.trim() !== ""
        ? options.env.PASSIE_ENV.trim()
        : fallbackConfig.passieEnv;

    // Safeguard: if passieEnv is "production" but we are NOT running inside a
    // production runtime (e.g. Vitest locally or a CLI script where NODE_ENV !== "production"),
    // skip the dispatch unless explicitly overridden in env.
    if (
      passieEnv === "production" &&
      process.env.NODE_ENV !== "production" &&
      !options.env?.POSTHOG_KEY
    ) {
      return;
    }

    const payload = {
      api_key: rawKey,
      event: options.event,
      distinct_id: options.distinctId,
      properties: {
        $geoip_disable: true,
        environment: passieEnv,
        ...options.properties,
      },
      timestamp: new Date().toISOString(),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch(`${posthogHost.replace(/\/$/, "")}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch {
      // Non-blocking fallback: never fail application logic on telemetry delivery
    }
  })();

  if (options.waitUntil) {
    options.waitUntil(work);
    return;
  }
  await work;
}

export function sanitizeServerErrorText(raw: string): string {
  return raw
    .replace(/'[^']*'/g, "'[redacted]'")
    .replace(/"[^"]*"/g, '"[redacted]"')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email_redacted]");
}

export async function captureServerException(options: {
  error: unknown;
  distinctId?: string;
  context?: Record<string, unknown>;
  env?: Record<string, unknown>;
  waitUntil?: (p: Promise<unknown>) => void;
}): Promise<void> {
  const errName = options.error instanceof Error ? options.error.name : "UnknownError";
  const rawMsg =
    options.error instanceof Error ? options.error.message : String(options.error);
  const sanitizedMsg = sanitizeServerErrorText(rawMsg).slice(0, 500);
  const sanitizedStack =
    options.error instanceof Error && options.error.stack
      ? sanitizeServerErrorText(options.error.stack).slice(0, 1000)
      : undefined;

  await captureServerTelemetryEvent({
    event: "$exception",
    distinctId: options.distinctId || "server_worker",
    env: options.env,
    waitUntil: options.waitUntil,
    properties: {
      $exception_type: errName,
      $exception_message: sanitizedMsg,
      $exception_stack_trace: sanitizedStack,
      $exception_list: [
        {
          type: errName,
          value: sanitizedMsg,
          mechanism: {
            handled: true,
            synthetic: false,
          },
        },
      ],
      $process_person_profile: false,
      ...options.context,
    },
  });
}
