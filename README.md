# Passie 🎟️

> **Passie** turns ambiguous group chat polls for shared football season tickets (*seizoenkaarten*) into a deterministic, first-come-first-served ledger and physical card possession tracker.

Built for groups sharing season tickets at Dutch football clubs (Excelsior Rotterdam in MVP). It provides clear indication of who is going, an unambiguous queue for freed tickets, and real-time tracking of who physically holds each plastic card.

---

## Features

- ⚽ **Automatic Match Schedules:** Ingests official home fixtures automatically from RFC 5545 iCal feeds.
- 🎟️ **Pass Indication (Aangeven):** Pass owners indicate whether they are using their ticket or releasing it to the group pool.
- ⏱️ **Deterministic First-Come-First-Served Queue (Wachtrij):** Queue entries are strictly ordered by arrival sequence ID. When a ticket frees up, it is assigned instantly and deterministically.
- 🔄 **Physical Card Tracking (Overdracht):** Tracks the chain of custody (Owner -> Current Holder -> Matchday Claimant) with one-tap transfer logging.
- 📱 **Mobile-First & PWA-Ready:** Optimized for one-thumb smartphone usage, safe area insets, and Add to Home Screen.
- 🎨 **Club Theming:** Dynamic club-specific colour palettes (Excelsior black and red in MVP).

---

## Tech Stack

- **Framework:** [Next.js 16 App Router](https://nextjs.org/) via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
- **Runtime & Hosting:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) with [Drizzle ORM](https://orm.drizzle.team/)
- **State & Data Fetching:** [TanStack Query](https://tanstack.com/query) with server-confirmed mutations and smart polling (5s interval, refetch on window focus)
- **Styling & UI:** Tailwind CSS, Radix UI primitives, [Lucide Icons](https://lucide.dev/), Sonner toasts
- **Analytics:** [PostHog](https://posthog.com/) via same-origin reverse proxy route (client-side product analytics only, sanitized URLs, fully disabled when unconfigured)

---

## Authentication & Privacy Disclosure

⚠️ **The MVP has NO passwords or cryptographic authentication.**
Access is protected by Cloudflare Access at Worker scope (with a regional Bypass policy for the Netherlands during soft launch). Identity within the group is selected by members via a simple *"Wie ben jij?"* profile picker stored in a local HTTP-only session cookie (`passie_member`). Actions and physical pass transfers are socially accountable via an append-only activity timeline.

Client-side product analytics and Web Vitals are sent via a first-party same-origin `/ingest` proxy with autocapture, heatmaps, and session recording strictly disabled. URLs are sanitized to route templates before leaving the client. Never place confidential or sensitive personal data into the application.

---

## Environment Variables & Secrets

Passie uses environment variables for build-time analytics and Cloudflare secrets for scheduled background ingestion.

| Variable | Target | Required? | Description |
| :--- | :--- | :---: | :--- |
| `PASSIE_CRON_SECRET` | `.dev.vars` (local) / `wrangler secret put` (prod) | Required for HTTP cron route | Bearer secret protecting the `/api/cron/ingest` fixture ingestion endpoint (returns 503 if unconfigured). |
| `PASSIE_ADMIN_PASSWORD` | `.dev.vars` (local) / `wrangler secret put` (prod) | Required for `/beheer` | Shared password protecting the member administration area (`/beheer`, returns 503 if unconfigured). |
| `NEXT_PUBLIC_POSTHOG_KEY` | `.env.local` (dev) / deploy shell env (prod) | Optional | PostHog project API key. Separate project keys for `passie-dev` and `passie-prod`. If left blank or unset, all analytics tracking is completely disabled. |
| `NEXT_PUBLIC_POSTHOG_HOST` | `.env.local` (local) / deploy shell env (prod) | Optional | PostHog host URL (defaults to `https://eu.i.posthog.com`). |
| `NEXT_PUBLIC_PASSIE_ENV` | `.env.local` (local) / deploy shell env (prod) | Optional | Environment tag: `development` or `production`. |

For local development, copy the templates:
```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

---

## Quickstart & First-Time Initialization

### Prerequisites

- Node.js `^22.22.0`
- pnpm `^10.0.0`
- Cloudflare Wrangler CLI (run locally via `pnpm wrangler` or `pnpm exec wrangler`)

### Step-by-Step Initialization Flow

1. **Clone the repository and install dependencies:**
   ```bash
   git clone https://github.com/jvanu/passie.git
   cd passie
   pnpm install
   ```

2. **Configure local environment files:**
   ```bash
   cp .env.example .env.local
   cp .dev.vars.example .dev.vars
   ```

3. **Initialize local database and seed data:**
   Passie stores local state in Cloudflare D1's local SQLite storage (`.wrangler/state/v3/d1`).
   ```bash
   # Apply migrations to local D1 SQLite database
   pnpm db:migrate:local

   # Populate club, season, group members, and passes (fictional data)
   pnpm seed:example

   # Ingest upcoming Excelsior home fixtures from iCal feed
   pnpm ingest:local
   ```

4. **Start the development server:**
   ```bash
   pnpm dev
   # Or using Kilo Code run script:
   .kilo/run-script.sh
   ```

5. **First-Time User Walkthrough:**
   - Open [http://localhost:3000](http://localhost:3000) in your browser.
   - You will automatically be redirected to `/wie-ben-jij` because no session cookie exists.
   - Select a member profile (e.g. **Sam** or **Ilse**) to set your identity cookie.
   - On the home screen (`/`), indicate pass availability, join the queue, or transfer physical tickets.
   - Switch identity at any time via `/instellingen` or by visiting `/wie-ben-jij`.

---

## Available Scripts & Commands

| Command | Server? | Remote? | Description |
| :--- | :---: | :---: | :--- |
| `pnpm dev` | Yes (Local) | No | Starts Next.js development server with hot module reloading. |
| `pnpm build` | No | No | Compiles Next.js and generates OpenNext Cloudflare worker bundle in `.open-next/`. |
| `pnpm preview` | Yes (Local) | No | Builds OpenNext bundle and launches local Cloudflare `workerd` simulation. |
| `pnpm deploy` | No | Yes | Packages OpenNext bundle and deploys worker and assets to Cloudflare via Wrangler. |
| `pnpm typecheck` | No | No | Runs TypeScript type validation (`tsc --noEmit`). |
| `pnpm lint` | No | No | Runs ESLint checks across the codebase. |
| `pnpm test` | No | No | Runs test suite once via Vitest. |
| `pnpm test:watch` | No | No | Runs Vitest in interactive watch mode. |
| `pnpm db:generate` | No | No | Generates SQL migrations from Drizzle schema. |
| `pnpm db:migrate:local` | No | No | Applies pending migrations to local D1 SQLite database. |
| `pnpm db:migrate:prod` | No | Yes | Applies pending migrations to production Cloudflare D1 database. |
| `pnpm seed:example` | No | No | Populates local D1 database with fictional seed data. |
| `pnpm seed:local` | No | No | Seeds D1 with local group data (`--confirm` required for production). Members are insert-only to preserve admin renames. |
| `pnpm ingest:local` | No | No | Ingests upcoming fixtures from the iCal feed into local D1. |
| `pnpm dev-reset` | No | No | Resets local D1 database, re-migrates, re-seeds local group data, and re-ingests fixtures. |
| `pnpm cf-typegen` | No | No | Generates Cloudflare Worker runtime environment types (`worker-configuration.d.ts`). |

---

## Deployment Runbook

Deployments target Cloudflare Workers using OpenNext, Cloudflare D1, and Cloudflare Access.

Passie has been live in production since **2026-08-18**. The steps below are split into **Initial Setup** (run exactly once, when the Worker and database did not exist yet) and **Every Subsequent Deploy** (run for every code/feature release afterwards). Running an Initial Setup step against an already-populated production database can silently overwrite live data — see the warnings inline.

### Initial Setup (run once, first deploy only)

1. **Authenticate with Cloudflare:**
   ```bash
   pnpm exec wrangler login
   ```

2. **Provision the production D1 database:**
   ```bash
   pnpm exec wrangler d1 create passie
   ```
   Record the returned `database_id` and commit it into `wrangler.jsonc` under `d1_databases[0].database_id` (see ADR 0011). Run `pnpm cf-typegen`.

3. **Configure Cloudflare Access for Workers (Zero Trust dashboard):**
   - Create a **Worker-level** Access application (destination type `worker`, covering production and previews).
   - Add a policy with decision `Bypass` and include rule *Country = Netherlands*.
   - Disable the `workers.dev` route for the `passie` Worker in the Cloudflare dashboard as hygiene.
   - Enable Workers Logs / Observability for the `passie` Worker.

4. **Seed production group data from `seed/group.local.json`:**
   ```bash
   pnpm seed:local --remote --confirm
   ```
   ⚠️ **One-time only.** `passes` rows are upserted with `holder_member_id` taken from the seed file (`scripts/seed.ts`, `ON CONFLICT(group_id, label) DO UPDATE SET ... holder_member_id = excluded.holder_member_id`). Re-running this after real physical handovers have been recorded in production **silently resets every pass back to its original seed-file holder**, discarding live custody state. `members` rows are insert-only (`ON CONFLICT DO NOTHING`) and are safe to reseed at any time.

5. **Trigger initial fixture ingestion:**
   ```bash
   curl -i -H "Authorization: Bearer $PASSIE_CRON_SECRET" https://passie.goedvolk.org/api/cron/ingest
   ```
   Needed only because no fixtures exist yet. Once live, the cron trigger (`0 */6 * * *`) keeps fixtures current automatically — do not re-run this manually on later deploys.

### Every Subsequent Deploy

1. **Set any *new* secrets introduced by this release** (check the Environment Variables table above for anything added since the last deploy):
   ```bash
   pnpm exec wrangler secret put <NEW_SECRET_NAME>
   ```
   Then regenerate the typed Worker environment and commit the result:
   ```bash
   pnpm cf-typegen
   ```
   Ensure `NEXT_PUBLIC_POSTHOG_KEY` (production project key) and `NEXT_PUBLIC_PASSIE_ENV=production` are set in the deployment shell before building.

2. **Apply any pending D1 migrations:**
   ```bash
   pnpm db:migrate:prod
   ```
   Safe to run every time: Wrangler tracks applied migrations per-database and only executes new files in `drizzle/`. Prints `No migrations to apply!` when there is nothing pending.

3. **Do not re-run `pnpm seed:local --remote --confirm` or the manual ingest trigger** — both are Initial Setup steps only (see warnings above). Skip straight to building and deploying.

4. **Build and deploy Worker & static assets:**
   ```bash
   pnpm deploy
   ```

5. **Smoke-test the changed surface in production** (e.g. log in to `/beheer` after an admin-auth change, confirm a new API route responds as expected).

6. **Verify production data is unaffected:**
   ```bash
   pnpm exec wrangler d1 execute passie --remote --command "SELECT count(*) FROM fixtures; SELECT count(*) FROM members; SELECT count(*) FROM passes;"
   ```

### Rollback & Recovery

- Worker rollback: `pnpm exec wrangler deployments list` -> `pnpm exec wrangler rollback [id]`.
- D1 recovery: record bookmark via `pnpm exec wrangler d1 time-travel info passie --remote`.
- Kill switch: switch Access policy decision from `Bypass` to `Block` in Zero Trust dashboard.

---

## Project Structure & Documentation

- `AGENTS.md` — Agent and contributor operating manual and architecture constraints.
- `ROADMAP.md` — Planned post-MVP features and architecture enhancements.
- `docs/architecture.md` — Detailed technical architecture, domain rules, and concurrency model.
- `docs/reference/README.md` — Verified documentation references and known platform gotchas.
- `docs/decisions/` — Architectural Decision Records (ADRs).

---

## License

Passie is licensed under the **GNU Affero General Public License v3.0 or later** ([AGPL-3.0-or-later](LICENSE)).
