# Pinned Documentation & Reference Index

This document tracks verified external documentation, checked dates, and known platform constraints.

---

## 1. Official References & Gotchas

- **OpenNext Cloudflare**
  - URL: `https://opennext.js.org/cloudflare/get-started` | `/bindings` | `/caching` | `/known-issues`
  - Verified: Requires `nodejs_compat` + compatibility date ≥ `2024-09-23`, wrangler ≥ `3.99`.
  - Config: `main: .open-next/worker.js`, `assets.directory: .open-next/assets`, `WORKER_SELF_REFERENCE` service binding.
  - Development: Requires `initOpenNextCloudflareForDev()` in `next.config.ts` for local bindings. `.open-next` is gitignored.
  - **Critical Gotcha:** `export const runtime = 'edge'` is unsupported in `@opennextjs/cloudflare`.

- **Cloudflare Workers / Wrangler / Cron Triggers / D1**
  - URL: `https://developers.cloudflare.com/workers/wrangler/configuration/` | `/workers/configuration/cron-triggers/` | `/d1/`
  - **Critical Gotcha:** D1 `batch()` executes all statements within a single transaction but cannot branch on intermediate results. No interactive transactions exist in D1. Use `guardResult.meta.changes === 1` to detect whether an optimistic concurrency guard succeeded.

- **Drizzle ORM (SQLite / D1)**
  - URL: `https://orm.drizzle.team/docs/get-started/d1-new` | `/docs/migrations`
  - Gotchas: Partial unique indices (e.g. `WHERE status = 'assigned'`) may require hand-edited Drizzle migration SQL files.

- **Next.js App Router**
  - URL: `https://nextjs.org/docs/app`
  - Notes: Using Next.js 16 App Router on Cloudflare Workers.

- **shadcn/ui & Lucide Icons**
  - URL: `https://ui.shadcn.com/docs/installation/next` | `https://lucide.dev/icons/`

- **TanStack Query**
  - URL: `https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates`
  - Pattern: 5-second polling interval while document is visible, instant optimistic rollbacks on `409 Conflict`.

- **PostHog**
  - URL: `https://posthog.com/docs/libraries/next-js` | `/docs/advanced/proxy`
  - Endpoint: EU host `https://eu.i.posthog.com` reversed proxied via `/ingest`.

- **iCalendar RFC 5545**
  - URL: `https://www.rfc-editor.org/rfc/rfc5545`
  - Ingestion: Feed `https://ics.fixtur.es/v2/home/excelsior.ics` uses UTC `Z` `DTSTART`, escaped commas in `LOCATION`, and trailing score brackets in `SUMMARY`.

- **Kilo Code**
  - URL: `https://kilo.ai/docs` | `https://kilo.ai/docs/automate/agent-manager` | `https://kilo.ai/docs/code-with-ai/features/browser-use`
  - Verified: `.kilo/setup-script.sh` runs once per worktree with `WORKTREE_PATH` and `REPO_PATH` environment variables (5-minute timeout).
  - `.kilo/run-script.sh` powers the Run button and should output the dev URL on line 1.
  - Browser Use is built-in (Playwright-based internally) and requires a Sonnet-4-class model. No MCP browser tools are registered in this project.

---

## 2. Toolchain Snapshot (Verified 2026-08-14)

| Tool / Package | Baseline / Target Version | Installed Scaffold Version |
| --- | --- | --- |
| Node.js | `22.22.2` | `v22.22.2` |
| npm | `10.9.7` | `10.9.7` |
| wrangler | `4.123.0` | `4.123.0` |
| next | `16.3.1` (or latest 15.5.x fallback) | Recorded after Phase 0.9 |
| @opennextjs/cloudflare | `1.20.2` | Recorded after Phase 0.9 |
| drizzle-orm | `0.45.2` | Recorded after Phase 0.9 |
| @tanstack/react-query | `5.101.4` | Recorded after Phase 0.9 |
| posthog-js | `1.417.0` | Recorded after Phase 0.9 |
| pnpm | `10.x` | `10.9.7` |
