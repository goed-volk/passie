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
- **State & Data Fetching:** [TanStack Query](https://tanstack.com/query) with optimistic mutations and smart polling
- **Styling & UI:** Tailwind CSS, Radix UI primitives, [Lucide Icons](https://lucide.dev/), Sonner toasts
- **Analytics:** [PostHog](https://posthog.com/) via self-hosted reverse proxy route (fully disabled when unconfigured)

---

## Authentication & Privacy Disclosure

⚠️ **The MVP has NO authentication.**
Access is controlled by obscurity (`noindex`, unguessable URL). Identity is selected by users via a simple *"Wie ben jij?"* profile picker stored in a local HTTP-only session cookie. Actions are socially accountable via an append-only timeline. Never place confidential or sensitive personal data into the application.

---

## Environment Variables & Secrets

Passie uses environment variables for build-time analytics and Cloudflare secrets for scheduled background ingestion.

| Variable | Target | Required? | Description |
| :--- | :--- | :---: | :--- |
| `PASSIE_CRON_SECRET` | `.dev.vars` (local) / `wrangler secret put` (prod) | Optional | Bearer secret protecting the `/api/cron/ingest` fixture ingestion endpoint. |
| `NEXT_PUBLIC_POSTHOG_KEY` | `.env.local` (local) / Cloudflare dashboard (prod) | Optional | PostHog project API key. If left blank or unset, all analytics tracking is completely disabled. |
| `NEXT_PUBLIC_POSTHOG_HOST` | `.env.local` (local) / Cloudflare dashboard (prod) | Optional | PostHog host URL (defaults to `https://eu.i.posthog.com`). |

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
- Cloudflare Wrangler CLI (`pnpm add -g wrangler`)

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
| `pnpm build` | No | No | Validates and compiles the Next.js app to `.next/`. Exits on completion. |
| `pnpm preview` | Yes (Local) | No | Builds with OpenNext and runs a local Cloudflare `workerd` runtime preview. |
| `pnpm deploy` | No | Yes | Packages the app for OpenNext and deploys Worker and assets to Cloudflare via Wrangler. |
| `pnpm typecheck` | No | No | Runs TypeScript type validation (`tsc --noEmit`). |
| `pnpm lint` | No | No | Runs ESLint checks across the codebase. |
| `pnpm test` | No | No | Runs test suite once via Vitest. |
| `pnpm test:watch` | No | No | Runs Vitest in interactive watch mode. |
| `pnpm db:generate` | No | No | Generates SQL migrations from Drizzle schema. |
| `pnpm db:migrate:local` | No | No | Applies pending migrations to local D1 SQLite database. |
| `pnpm db:migrate:prod` | No | Yes | Applies pending migrations to production Cloudflare D1 database. |
| `pnpm seed:example` | No | No | Populates local D1 database with fictional seed data. |
| `pnpm seed:local` | No | No | Seeds D1 with local group data (`--confirm` required for production). |
| `pnpm ingest:local` | No | No | Ingests upcoming fixtures from the iCal feed into local D1. |
| `pnpm cf-typegen` | No | No | Generates Cloudflare Worker runtime environment types (`worker-configuration.d.ts`). |

---

## Deployment Runbook

Deployments target Cloudflare Workers using OpenNext.

1. Ensure your Cloudflare account is authenticated:
   ```bash
   pnpm wrangler login
   ```

2. Apply D1 migrations to production database:
   ```bash
   pnpm db:migrate:prod
   ```

3. Seed production data (if initial setup):
   ```bash
   pnpm seed:local --confirm
   ```

4. Deploy Worker:
   ```bash
   pnpm deploy
   ```

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
