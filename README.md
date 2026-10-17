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

Passie uses **Better Auth** for secure, passwordless authentication backed by Cloudflare D1 ([ADR 0014](docs/decisions/0014-identity-via-better-auth-on-d1.md)):
- **Primary Authentication:** WebAuthn Passkeys (Touch ID, Face ID, or platform screen lock).
- **Bootstrap & Fallback:** 6-digit Email One-Time Passcodes (OTP), valid for 10 minutes.
- **Zero Public Sign-Up:** Accounts are pre-created and linked to group members by administrators. Uninvited visitors cannot self-register.
- **Sessions:** Database-backed sessions stored in Cloudflare D1 with instant server-side revocation on deactivation or security events.

Client-side product analytics and Web Vitals are sent via a first-party same-origin `/ingest` proxy with autocapture, heatmaps, and session recording strictly disabled. URLs are sanitized to route templates before leaving the client. Never place confidential or sensitive personal data into the application.

---

## Environment Variables & Secrets

Passie uses Cloudflare runtime environment variables (`vars` / `.dev.vars`) and secrets for configuration (see ADR 0013 and ADR 0014). Zero API keys are inlined at build time.

| Variable | Target | Required? | Description |
| :--- | :--- | :---: | :--- |
| `BETTER_AUTH_SECRET` | `.dev.vars` (local) / `wrangler secret put` (prod) | Required | Secret encryption key for Better Auth tokens and cookies (min 32 chars). |
| `BETTER_AUTH_TRUSTED_ORIGINS` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Optional | Comma-separated allowlist of trusted origins for CSRF protection (e.g. `http://localhost:*,http://127.0.0.1:*,https://passie.goedvolk.org`). |
| `PASSIE_PUBLIC_ORIGIN` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Required | Base public URL (e.g. `https://passie.goedvolk.org` or `http://localhost:3000`). Used for WebAuthn RP origin. |
| `PASSIE_MAILER` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Optional | Mail transport: `cloudflare` (uses Worker `EMAIL` binding) or `console` (local dev fallback). |
| `PASSIE_MAIL_FROM` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Optional | Sender address for OTP emails (defaults to `inloggen@passie.goedvolk.org`). |
| `PASSIE_DEV_LOGIN` | `.dev.vars` (local) | Dev only | Set to `1` on localhost to enable `/api/dev/login-as` dev authentication harness. |
| `PASSIE_CRON_SECRET` | `.dev.vars` (local) / `wrangler secret put` (prod) | Required for HTTP cron route | Bearer secret protecting the `/api/cron/ingest` fixture ingestion endpoint (returns 503 if unconfigured). |
| `POSTHOG_KEY` | `.dev.vars` (local) / `wrangler secret put` (prod) | Optional | PostHog project API key. If left blank or unset, all analytics tracking is completely disabled. |
| `POSTHOG_HOST` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Optional | PostHog host URL (defaults to `https://eu.i.posthog.com`). |
| `PASSIE_ENV` | `.dev.vars` (local) / `wrangler.jsonc` `vars` (prod) | Optional | Environment tag: `development` or `production`. |

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
   git clone https://github.com/goed-volk/passie.git
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

5. **First-Time User Walkthrough & Login:**
   - Open [http://localhost:3000](http://localhost:3000) (or the assigned port shown by `.kilo/run-script.sh`) in your browser.
   - You will automatically be redirected to `/inloggen` because no active session exists.
   - Enter `demo@goedvolk.org` (pre-seeded local admin) and click **Stuur code**.
   - Check the server console log for the 6-digit OTP code (`[mailer:console] Je inlogcode voor Passie is: 123456`).
   - Enter the code to sign in. When prompted, you can enroll your device passkey (Touch ID, Face ID, etc.) for passwordless one-tap login.
   - Once signed in as an admin, you can access the admin panel at `/beheer` to invite, link, or reorder members.
   - Manage your sessions or passkeys at `/instellingen`.

---

## Admin User Bootstrapping

Passie has zero public registration: members must be pre-created and linked by an administrator.

### Local Development Admin
When you run `.kilo/setup-script.sh` or `pnpm seed:example`, **Sam** (`demo@goedvolk.org`, `slug: "sam"`) is automatically provisioned as a group administrator with an active `auth_user` link.

To grant administrator rights to another local member or link an email:
```bash
# Grant group admin rights to a member:
pnpm tsx scripts/grant-admin.ts --member daan

# Link an email address to a member:
pnpm tsx scripts/link-member-emails.ts --member daan --email daan@goedvolk.org
```

### Production First Admin (Cloudflare D1)

Because public registration is disabled, the initial group administrator must be linked in the production database using Wrangler before deploying the Better Auth update:

```bash
# 1. Insert admin auth_user record on remote D1:
pnpm exec wrangler d1 execute passie --remote --command "
  INSERT INTO auth_user (id, name, email, email_verified, role, banned, created_at, updated_at)
  VALUES ('user_admin_primary', 'Jouw Naam', 'jouw-email@voorbeeld.nl', 1, 'admin', 0, cast(unixepoch('subsecond')*1000 as integer), cast(unixepoch('subsecond')*1000 as integer));
"

# 2. Link member slug and grant group admin role:
pnpm exec wrangler d1 execute passie --remote --command "
  UPDATE members SET user_id = 'user_admin_primary', role = 'admin' WHERE slug = 'jouwnaam';
"
```

Once deployed and logged in at `https://passie.goedvolk.org/inloggen`, manage all other group members and their email addresses directly in the UI at `/beheer`.

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
| `pnpm seed:local` | No | No | Seeds local D1 database with group data from `seed/group.local.json`. Members are insert-only to preserve admin renames. |
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

4. **Initial production group data bootstrap (Historical, 2026-08-18):**
   Group structure, members, and initial passes were bootstrapped once on Day 0. Now that production is live, all ongoing member additions, renames, and email assignments are managed safely via the role-gated `/beheer` web interface.

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
   Then regenerate the typed Worker environment so the new binding is type-visible locally:
   ```bash
   pnpm cf-typegen
   ```
   `worker-configuration.d.ts` is generated per environment and gitignored — it is not committed. Each contributor and each worktree regenerates it after adding a secret to `.dev.vars` (`.kilo/setup-script.sh` does this automatically for new worktrees).

   ⚠️ **`pnpm cf-typegen` can change `pnpm typecheck` results.** Wrangler types every key present in `.dev.vars` as a required `string` on `NodeJS.ProcessEnv`, so code that simulates an absent variable (`delete process.env.X`) starts failing with `TS2790` once that key is generated. Use `Reflect.deleteProperty(process.env, "X")` in tests instead of `delete`. Because the generated file is gitignored, typecheck outcomes differ between machines depending on each contributor's `.dev.vars` — always re-run `pnpm typecheck` after `pnpm cf-typegen`.

2. **Verify production environment variables & secrets:**
   Telemetry (`POSTHOG_HOST`, `PASSIE_ENV`) is configured in `wrangler.jsonc` `"vars"`. The production API token is stored securely in Cloudflare:
   ```bash
   pnpm exec wrangler secret put POSTHOG_KEY
   ```
   No build-time `export NEXT_PUBLIC_*` commands are needed before deployment.

3. **Apply any pending D1 migrations:**
   ```bash
   pnpm db:migrate:prod
   ```
   Safe to run every time: Wrangler tracks applied migrations per-database and only executes new files in `drizzle/`. Prints `No migrations to apply!` when there is nothing pending.

4. **Do not re-seed the production database or trigger manual ingest** — production is live with actual matchday pool states and member custody records. Member and email management is performed directly via `/beheer`. Skip straight to building and deploying.

5. **Record a pre-deploy data baseline** so the release can be proven non-destructive:
   ```bash
   pnpm exec wrangler d1 execute passie --remote --json --command "SELECT (SELECT count(*) FROM members) AS members, (SELECT count(*) FROM passes) AS passes, (SELECT count(*) FROM fixtures) AS fixtures, (SELECT count(*) FROM queue_entries) AS queue_entries, (SELECT count(*) FROM possession_events) AS possession_events, (SELECT count(*) FROM activity_events) AS activity_events;"
   ```

6. **Build and deploy Worker & static assets:**
   ```bash
   pnpm deploy
   ```

7. **Smoke-test the changed surface in production.** Admin auth can be verified by confirming unauthorized access returns `403` or `401`:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://passie.goedvolk.org/api/admin/members      # expect 403
   curl -s -o /dev/null -w "%{http_code}\n" https://passie.goedvolk.org/inloggen              # expect 200
   ```
   Then confirm an actual login in the browser at `/inloggen` and navigate to `/beheer`.

8. **Re-run the baseline query from step 5 and diff the counts** — they must be identical unless the release intentionally writes data.

### Rollback & Recovery

- Worker rollback: `pnpm exec wrangler deployments list` -> `pnpm exec wrangler rollback [id]`.
- D1 recovery: record bookmark via `pnpm exec wrangler d1 time-travel info passie --remote`.
- Kill switch: switch Access policy decision from `Bypass` to `Block` in Zero Trust dashboard.

---

## Self-Hosting & Forking for Another Group or Club

Passie is designed so any group sharing season tickets at any football club can self-host an independent instance on Cloudflare Workers and D1. Follow this checklist when forking:

### 1. Club Configuration & Matchday Calendar Feed
1. **Club Details & Colours:** Define your club in `seed/group.local.json` (or edit `seed/group.example.json`):
   - `club.slug`: Short club identifier (e.g. `"excelsior"`, `"feyenoord"`, `"nac"`).
   - `club.name`: Full club name (e.g. `"Excelsior Rotterdam"`).
   - `club.colorPrimary`, `club.colorSecondary`, `club.colorAccent`, `club.colorOnPrimary`: Hex colour codes for UI buttons, badges, and headers.
2. **Fixture Feed (RFC 5545 iCal):** Set `club.icsHomeFeedUrl` to your club's home match iCal feed (e.g. from `https://ics.fixtur.es/v2/home/<club>.ics`).
3. **Ingestion Club Slug:** If changing the club slug from `"excelsior"`, update the club slug passed to `ingestClubFixtures(db, "<your-club-slug>")` in `src/worker.ts`, `src/app/api/cron/ingest/route.ts`, and `src/app/api/fixtures/refresh/route.ts`, as well as club display fallbacks in `src/app/wedstrijden/page.tsx`, `src/components/PassCard.tsx`, and `src/server/snapshot.ts`.

### 2. Group & Season Ticket Setup
1. **Roster & Cards (`seed/group.local.json`):**
   - Set `group.slug` and `group.name` to your group's name.
   - List your group members under `members` with unique slugs, display names, initials, and avatar colours.
   - Define your season tickets under `passes` with custom `label`, optional `seatInfo`, `owners` (array of member slugs), and initial physical `holder`.
   - Assign `"role": "admin"` and a valid `email` to at least one member for initial administrator login.
2. **Seed Local Database:**
   ```bash
   pnpm seed:local
   ```

### 3. Cloudflare & Domain Configuration
1. **Wrangler Configuration (`wrangler.jsonc`):**
   - Replace `name` with your Worker name.
   - Replace `routes[0].pattern` with your custom domain.
   - Create your own production D1 database (`pnpm exec wrangler d1 create <name>`) and update `d1_databases[0].database_id`.
   - Update `vars.PASSIE_PUBLIC_ORIGIN` and `vars.BETTER_AUTH_TRUSTED_ORIGINS` to your public HTTPS origin.
   - Update `send_email[0].allowed_sender_addresses` to match your verified Cloudflare Email Routing sender domain.
2. **Public URL Metadata & Origin Defaults:**
   - Update the canonical URL and display domain in `src/app/layout.tsx`, `src/app/opengraph-image.tsx`, `src/server/http/assertSameOrigin.ts`, `src/server/email/dispatch.ts`, and `src/i18n/nl.ts` (`loginOriginError`).

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
