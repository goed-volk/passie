# Pinned Documentation & Reference Index

This document tracks verified external documentation, checked dates, and known platform constraints.

---

## 1. Official References & Gotchas

- **OpenNext Cloudflare**
  - URL: `https://opennext.js.org/cloudflare/get-started` | `/bindings` | `/caching` | `/known-issues`
  - Verified: Requires `nodejs_compat` + compatibility date ≥ `2024-09-23` (configured to current `2026-08-17`), wrangler ≥ `3.99`.
  - Config: `main: .open-next/worker.js`, `assets.directory: .open-next/assets`, `WORKER_SELF_REFERENCE` service binding.
  - Development: Requires `initOpenNextCloudflareForDev()` in `next.config.ts` for local bindings. `.open-next` is gitignored.
  - **Critical Gotcha:** `export const runtime = 'edge'` is unsupported in `@opennextjs/cloudflare`.
  - **OpenNext Build Lifecycle & Preview Gotcha:**
    - `pnpm dev` compiles on-the-fly via Next.js Turbopack.
    - `pnpm preview` runs Cloudflare `workerd` on the bundle in `.open-next/`.
    - `opennextjs-cloudflare build` must execute prior to `preview` or `deploy` to avoid executing stale artifacts.

- **Cloudflare Workers / Wrangler / Cron Triggers / D1**
  - URL: `https://developers.cloudflare.com/workers/wrangler/configuration/` | `/workers/configuration/cron-triggers/` | `/d1/`
  - **Critical Gotcha:** D1 `batch()` executes all statements within a single transaction but cannot branch on intermediate results. No interactive transactions exist in D1. Use `guardResult.meta.changes === 1` to detect whether an optimistic concurrency guard succeeded.
  - **Concurrency Suite (`scripts/race-check.sh`) Execution Gotcha:**
    - The complete 5-iteration suite runs 20 D1 setup/inspection cycles and 20 concurrent HTTP burst cycles against the local dev server (~120–140s total runtime).
    - Automated runners and AI agent shell executions must set an explicit timeout (e.g. `timeout: 180000`) or configure custom iterations (`RACE_CHECK_ITERATIONS=2 bash scripts/race-check.sh` or `bash scripts/race-check.sh 2`) to avoid premature command timeout.

- **Drizzle ORM (SQLite / D1)**
  - URL: `https://orm.drizzle.team/docs/get-started/d1-new` | `/docs/migrations`
  - Gotchas: Partial unique indices (e.g. `WHERE status = 'assigned'`) may require hand-edited Drizzle migration SQL files.
  - **Snapshot & Journal Reconciliation (Resolved 2026-10-10):** Previously hand-written migrations `0001_pool_version_guards.sql`, `0002_performance_indices.sql`, and `0003_scope_assigned_pass_index.sql` are fully reconciled with `drizzle/meta/_journal.json` and matching `0001_snapshot.json`, `0002_snapshot.json`, and `0003_snapshot.json`. Running `pnpm db:generate` cleanly detects zero drift ("No schema changes, nothing to migrate").

- **Next.js App Router**
  - URL: `https://nextjs.org/docs/app`
  - Notes: Using Next.js 16 App Router on Cloudflare Workers.

- **Better Auth & Passkeys on Cloudflare D1 (Verified 2026-10-11)**
  - URL: `https://better-auth.com` | `/docs/concepts/session-management` | `/docs/plugins/passkey` | `/docs/plugins/email-otp`
  - Integration: Next.js App Router on Cloudflare Workers (`@opennextjs/cloudflare`) with Cloudflare D1 (`@better-auth/drizzle-adapter`).
  - Architecture: ADR 0014. Zero public sign-up via invitation gates; database-backed sessions; WebAuthn passkeys (`residentKey: "required"`, `userVerification: "required"`) + email OTP fallback; transactional isolation (`transaction: false` for D1); timestamp exception (`timestamp_ms` for `auth_*` tables).
  - Minimal Footprint: Bounded route profile via `disabledPaths`; subpath imports (`better-auth/minimal`, `better-auth/plugins/email-otp`, `@better-auth/passkey`).

- **shadcn/ui & Lucide Icons**
  - URL: `https://ui.shadcn.com/docs/installation/next` | `https://lucide.dev/icons/`

- **Cloudflare Access for Workers (Verified 2026-08-14)**
  - URL: `https://blog.cloudflare.com/workers-protected-by-access/` | `https://developers.cloudflare.com/workers/configuration/cloudflare-access/`
  - Scope: Access policies attach to the **Worker** directly (destination types `worker`, `preview_worker`, `all_workers`, `all_preview_workers`). One policy covers custom domains, routes, `workers.dev`, and preview URLs without route-level gaps.
  - Identity Contract: `ctx.access.getIdentity()` returns user email, name, and groups without manual JWT assertion parsing or cert rotation. `ctx.access` is `undefined` when bypassed or unauthenticated.
  - Local Simulation: Configured in `wrangler.jsonc` via `"access": { "dev": { "aud": "...", "identity": { "email": "..." } } }`. Note: `aud` is required whenever the `access.dev` block is present.
  - Hierarchy: Hostname/path > Worker > Account.
  - **Critical Gotcha (WebSockets):** Worker-level Access policies do not currently support WebSocket connection upgrades (returns `403`). Server-Sent Events (SSE) uses plain HTTP streaming and is fully supported under Worker-level Access.

- **TanStack Query**
  - URL: `https://tanstack.com/query/latest`
  - Pattern: 5-second polling interval while document is visible (`document.hidden === false`), refetch on focus, and server-confirmed mutations with disabled controls during inflight requests. Cache is updated upon receiving server-confirmed snapshot.

- **PostHog**
  - URL: `https://posthog.com/docs/libraries/next-js` | `/docs/advanced/proxy`
  - Endpoint: EU host `https://eu.i.posthog.com` reversed proxied via `/ingest`.
  - Architecture & Specification: Pinned telemetry specification, event allowlist, identity lifecycle, and HogQL recipes in [`docs/analytics.md`](../analytics.md).

- **iCalendar RFC 5545**
  - URL: `https://www.rfc-editor.org/rfc/rfc5545`
  - Ingestion: Feed `https://ics.fixtur.es/v2/home/excelsior.ics` uses UTC `Z` `DTSTART`, escaped commas in `LOCATION`, and trailing score brackets in `SUMMARY`.

- **Kilo Code**
  - URL: `https://kilo.ai/docs` | `https://kilo.ai/docs/automate/agent-manager` | `https://kilo.ai/docs/code-with-ai/features/browser-use`
  - Verified: `.kilo/setup-script.sh` runs once per worktree with `WORKTREE_PATH` and `REPO_PATH` environment variables (5-minute timeout).
  - `.kilo/run-script.sh` powers the Run button and outputs the dev URL on line 1.
  - Browser Automation: Built-in for the **VS Code extension** (enabled via Settings → Web Tools → Browser Automation); the **CLI** uses Playwright MCP (`pnpm exec playwright-mcp`). Tool names are `browser_*`. Advanced agentic models are recommended for complex DOM interaction, but no hard model allowlist exists.

---

## 2. Toolchain Snapshot (Verified 2026-10-17)

| Tool / Package | Version in `package.json` | Purpose |
| --- | --- | --- |
| Node.js | `>=22.22.0` | Server runtime engine |
| pnpm | `>=10.0.0` | Local package isolation |
| wrangler | `^4.123.0` | Cloudflare Workers CLI & local workerd emulator |
| next | `16.3.1` | Next.js App Router |
| @opennextjs/cloudflare | `^1.20.2` | Next.js Cloudflare Workers adapter |
| better-auth | `1.7.7` | Passwordless WebAuthn & Email OTP auth |
| @better-auth/drizzle-adapter | `1.7.7` | D1 SQLite adapter for Better Auth |
| @better-auth/passkey | `1.7.7` | WebAuthn passkey client & server plugin |
| drizzle-orm | `^0.45.2` | Type-safe SQLite ORM for Cloudflare D1 |
| @tanstack/react-query | `^5.66.0` | Client state polling & server snapshot sync |
| posthog-js | `^1.220.0` | Privacy-scrubbed product analytics & telemetry |
