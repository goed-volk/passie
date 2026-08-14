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

## Quickstart (Local Development)

### Prerequisites

- Node.js `^22.22.0`
- pnpm `^10.0.0`
- Cloudflare Wrangler CLI (`pnpm add -g wrangler`)

### Installation & Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/jvanu/passie.git
   cd passie
   pnpm install
   ```

2. Initialize local database and seed data:
   ```bash
   pnpm db:migrate:local
   pnpm seed:example
   pnpm ingest:local
   ```

3. Start development server:
   ```bash
   pnpm dev
   # Or using Kilo Code run script:
   .kilo/run-script.sh
   ```

Open [http://localhost:3000](http://localhost:3000) (or the port output by the run script) to view the application.

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
