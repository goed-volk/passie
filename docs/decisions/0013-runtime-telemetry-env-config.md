# ADR 0013: Runtime Environment Configuration for Telemetry

## Status
Accepted (Amends ADR 0008)

## Context
In Next.js App Router applications deploying to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`), environment variables prefixed with `NEXT_PUBLIC_*` are statically evaluated and inlined into client JavaScript bundles (`.open-next/assets/_next/static/chunks/*.js`) during compilation (`next build`). Because Next.js automatically loads `.env.local` during builds with higher precedence than `.env.production`, local development keys (`passie-dev`) were baked into production bundles unless manually overridden via shell environment variables before every deployment.

Furthermore, PostHog provides two primary host regions (EU: `https://eu.i.posthog.com`, US: `https://us.i.posthog.com`). Hardcoding the upstream host prevented flexible multi-region deployment.

## Decision
Transition telemetry configuration from build-time inlined `NEXT_PUBLIC_*` variables to a uniform, runtime-resolved Cloudflare Worker configuration model:
1. **Purge `NEXT_PUBLIC_*` Telemetry Variables:**
   Eliminate `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, and `NEXT_PUBLIC_PASSIE_ENV` from the codebase and `.env*` files.
2. **Server-Side Runtime Resolution (`getTelemetryConfig`):**
   `src/server/telemetryConfig.ts` queries the Cloudflare Worker request context (`getCloudflareContext({ async: true })`) for `POSTHOG_KEY`, `POSTHOG_HOST`, and `PASSIE_ENV`, with transparent fallback to `process.env` in CLI scripts and Workers scheduled tasks.
3. **Synchronous Server Injection to Client:**
   `RootLayout` (`src/app/layout.tsx`) awaits `getTelemetryConfig()` at request time and passes the configuration prop synchronously down to `<Providers>` and `initPostHog(config)` without client-side network round-trips or waterfalls.
4. **Dynamic Upstream Host & Proxy Gating:**
   The same-origin reverse proxy (`/ingest/[[...path]]/route.ts`) and server database error logger (`src/server/commit.ts`) query `getTelemetryConfig()`. When `POSTHOG_KEY` is absent or empty, telemetry is disabled (the proxy returns HTTP 404). When configured, upstream calls route to the resolved `POSTHOG_HOST` (defaulting to EU `https://eu.i.posthog.com`).
5. **Localhost & Development Isolation:**
   - In `.dev.vars` / `.dev.vars.example`, `POSTHOG_KEY=` defaults to empty (tracking disabled) and `PASSIE_ENV=development`.
   - On localhost or non-production runtimes, production tracking and exception logging are suppressed.
   - In production, `POSTHOG_KEY` is managed as a Cloudflare Worker secret via `wrangler secret put POSTHOG_KEY`, ensuring no project keys are committed to version control. Non-sensitive defaults (`POSTHOG_HOST`, `PASSIE_ENV`) reside in `wrangler.jsonc` `"vars"`.

## Consequences
- **Build Once, Deploy Anywhere:** Next.js build artifacts are completely environment-agnostic, with zero project tokens or environment tags inlined into client bundles.
- **No Deploy-Time Shell Overrides:** Deployments via `pnpm deploy` run deterministically without requiring manual terminal `export` commands.
- **Configurable PostHog Region:** Both client UI and server proxy/capture adapt to EU or US regions via `POSTHOG_HOST`.
