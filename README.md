# Passie

Passie is a mobile-first web app for groups of friends who share football season tickets (*seizoenkaarten*). It replaces group chat polls with a first-come-first-served ledger for seat requests, and tracks who physically holds each card.

Built for Dutch football clubs. The MVP targets Excelsior Rotterdam.

## How it works

A matchday runs in three steps:

1. **Indication.** Before the deadline, each pass owner marks the pass as *kept* or *released* to the group.
2. **Queue.** A released pass goes to the first waiting group member. Queue order is the order of request, stored as a monotonic SQLite row id.
3. **Handover.** The app tracks which member holds each physical card, from owner to holder to the matchday claimant.

Two supporting pieces:

- **Fixtures.** Home match schedules are ingested from an RFC 5545 iCal feed by a cron trigger and an on-demand refresh. Kickoff changes and cancellations propagate to the open pool.
- **Theming.** Club colours are applied as CSS variables, with light and dark modes.

Dutch terms used in the app and in this codebase:

| Term | Meaning |
| :--- | :--- |
| *Seizoenkaart* | Season ticket |
| *Aangeven* / *Ik ga* | Indicate you are attending with your pass |
| *Pas vrijgeven* | Release your pass to the group queue |
| *Wachtrij* / *Op de bank* | The waitlist for released passes |
| *Overdracht* / *Wissel* | Physical handover of the card |

## Quickstart

Requirements: Node.js `^22.22.0`, pnpm `^10.0.0`, and the Cloudflare Wrangler CLI (run it locally as `pnpm exec wrangler`).

```bash
# Clone and install
git clone https://github.com/goed-volk/passie.git
cd passie
pnpm install

# Configure local environment files
cp .env.example .env.local
cp .dev.vars.example .dev.vars

# Initialize local D1 (SQLite in .wrangler/state/v3/d1), seed, and ingest fixtures
pnpm db:migrate:local
pnpm seed:example
pnpm ingest:local

# Start the dev server (prints its URL on the first line)
pnpm dev
```

Then open the URL printed by `pnpm dev`. With no session you are redirected to `/inloggen`.

1. Enter `demo@goedvolk.org` (the pre-seeded local admin) and select **Stuur code**.
2. Read the 6-digit code from the server console, for example `[mailer:console] Je inlogcode voor Passie is: 123456`.
3. Enter the code. You can enroll a passkey at this point.
4. As an admin you can reach `/beheer` for member management and `/instellingen` for sessions and passkeys.

## Tech stack

- **Framework:** Next.js 16 App Router, deployed through `@opennextjs/cloudflare`.
- **Runtime:** Cloudflare Workers.
- **Database:** Cloudflare D1 (SQLite) with Drizzle ORM.
- **Data fetching:** TanStack Query. Mutations are server-confirmed, and the client polls every 5 seconds while the tab is visible, plus on window focus.
- **UI:** Tailwind CSS, Radix UI primitives, Lucide icons, Sonner toasts.
- **Auth:** Better Auth with WebAuthn passkeys and email OTP (see [ADR 0014](docs/decisions/0014-identity-via-better-auth-on-d1.md)).
- **Analytics:** PostHog through a same-origin `/ingest` proxy, disabled when unconfigured.

### Authentication and privacy

Passie has no public sign-up. Accounts are pre-created and linked to group members by administrators.

- **Primary authentication:** WebAuthn passkeys (Touch ID, Face ID, or screen lock).
- **Fallback:** 6-digit email one-time passcodes, valid for 10 minutes.
- **Sessions:** Database-backed in D1, revoked server-side on deactivation and security events.

Client-side analytics and Web Vitals go through the same-origin `/ingest` proxy. Autocapture, heatmaps, and session recording are off. URLs are sanitized to route templates before they leave the client. Do not put confidential or personal data into the application.

## Scripts

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Start the Next.js dev server with hot module reloading. |
| `pnpm build` | Build the OpenNext Cloudflare worker bundle in `.open-next/`. |
| `pnpm preview` | Build and run the OpenNext bundle on local `workerd`. |
| `pnpm deploy` | Build and deploy the worker and assets to production. |
| `pnpm deploy:staging` | Build and deploy to the staging worker. |
| `pnpm typecheck` | TypeScript validation (`tsc --noEmit`). |
| `pnpm lint` | ESLint across the codebase. |
| `pnpm test` | Run the Vitest suite once. |
| `pnpm test:watch` | Run Vitest in watch mode. |
| `pnpm db:generate` | Generate SQL migrations from the Drizzle schema. |
| `pnpm db:migrate:local` | Apply migrations to the local D1 database. |
| `pnpm db:migrate:staging` | Apply migrations to the staging D1 database. |
| `pnpm db:migrate:prod` | Apply migrations to the production D1 database. |
| `pnpm seed:example` | Seed local D1 with fictional data. |
| `pnpm seed:local` | Seed local D1 from `seed/group.local.json`. Members are insert-only to preserve admin renames. |
| `pnpm seed:staging` | Seed the staging D1 database with test data. Refuses to target production. |
| `pnpm ingest:local` | Ingest upcoming fixtures from the iCal feed into local D1. |
| `pnpm ingest:staging` | Ingest fixtures into staging. |
| `pnpm dev-reset` | Reset local D1, re-migrate, re-seed, and re-ingest. |
| `pnpm cf-typegen` | Generate `worker-configuration.d.ts` for the Worker environment. |

Admin CLI scripts:

```bash
# Grant group admin rights to a member
pnpm tsx scripts/grant-admin.ts --member daan

# Link an email address to a member
pnpm tsx scripts/link-member-emails.ts --member daan --email daan@goedvolk.org
```

Admin rights and email links can also be managed in the UI at `/beheer` after the first admin is set up.

## Configuration

Configuration is read from Cloudflare runtime variables (`vars` in `wrangler.jsonc`, or `.dev.vars` locally) and secrets. No API keys are inlined at build time ([ADR 0013](docs/decisions/0013-runtime-telemetry-env-config.md)).

| Variable | Required | Description |
| :--- | :---: | :--- |
| `BETTER_AUTH_SECRET` | Yes | Secret key for Better Auth tokens and cookies, at least 32 characters. Use a secret. |
| `PASSIE_PUBLIC_ORIGIN` | Yes | Public base URL, used for the WebAuthn RP origin. Example: `https://passie.goedvolk.org`. |
| `PASSIE_CRON_SECRET` | For the HTTP cron route | Bearer secret for `/api/cron/ingest`. The route returns 503 when unset. Use a secret. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Comma-separated trusted origins for CSRF checks. |
| `PASSIE_MAILER` | No | Mail transport: `cloudflare` (Worker `EMAIL` binding) or `console` (local fallback). |
| `PASSIE_MAIL_FROM` | No | Sender address for OTP mail. Defaults to `inloggen@passie.goedvolk.org`. |
| `PASSIE_DEV_LOGIN` | Local only | Set to `1` on localhost to enable the `/api/dev/login-as` harness. |
| `POSTHOG_KEY` | No | PostHog project key. Analytics are fully disabled when unset. Use a secret. |
| `POSTHOG_HOST` | No | PostHog host. Defaults to `https://eu.i.posthog.com`. |
| `PASSIE_ENV` | No | Environment tag: `development` or `production`. |

Use `.dev.vars` for local values and `wrangler secret put` for production secrets.

## Adapting for your club

Passie can run for any group at any football club on Cloudflare Workers and D1. The club slug and public URL are currently set in several places, so a fork has to update each of them.

### Club and feed

In `seed/group.local.json` (or `seed/group.example.json`):

- `club.slug`, `club.name`: short identifier and full name.
- `club.colorPrimary`, `club.colorSecondary`, `club.colorAccent`, `club.colorOnPrimary`: hex colours for UI.
- `club.icsHomeFeedUrl`: the home match iCal feed, for example `https://ics.fixtur.es/v2/home/<club>.ics`.

If you change the club slug from `"excelsior"`, update it in `src/worker.ts`, `src/app/api/cron/ingest/route.ts`, and `src/app/api/fixtures/refresh/route.ts`, plus the display fallbacks in `src/app/wedstrijden/page.tsx`, `src/components/PassCard.tsx`, and `src/server/snapshot.ts`. Bundling these into one configuration constant is planned.

### Group and passes

In the same file:

- `group.slug`, `group.name`.
- `members`: unique slugs with display names, initials, and avatar colours.
- `passes`: each with a `label`, optional `seatInfo`, `owners` (member slugs), and an initial physical `holder`.
- Set `role: "admin"` and a valid `email` on at least one member for the first admin login.

Then run:

```bash
pnpm seed:local
```

### Cloudflare and domain

In `wrangler.jsonc`:

- Set `name` to your Worker name.
- Set `routes[0].pattern` to your custom domain.
- Create a production D1 database (`pnpm exec wrangler d1 create <name>`) and set `d1_databases[0].database_id`.
- Set `vars.PASSIE_PUBLIC_ORIGIN` and `vars.BETTER_AUTH_TRUSTED_ORIGINS` to your HTTPS origin.
- Set `send_email[0].allowed_sender_addresses` to your verified Cloudflare Email Routing sender domain.

Update the canonical URL and display domain in `src/app/layout.tsx`, `src/app/opengraph-image.tsx`, `src/server/http/assertSameOrigin.ts`, `src/server/email/dispatch.ts`, and `src/i18n/nl.ts` (`loginOriginError`).

## Deployment

Deploys target Cloudflare Workers through OpenNext, with Cloudflare D1 and Cloudflare Access. Passie has run in production since 2026-08-18.

Each release runs against staging first, then production:

1. Set any new secrets and run `pnpm cf-typegen`.
2. Apply migrations: `pnpm db:migrate:staging`, then `pnpm db:migrate:prod`.
3. Deploy and smoke test staging: `pnpm deploy:staging` on `passie-dev.goedvolk.org`.
4. Record a production count baseline, then deploy and smoke test production: `pnpm deploy`.
5. Diff the baseline counts. They must match unless the release writes data.

Do not re-seed production or trigger manual ingest; it holds live matchday data.

The full runbook, including first-time setup, the first admin bootstrap SQL, staging seeding, and rollback, is in [`docs/deployment.md`](docs/deployment.md).

## Contributing

Contributions are welcome. Read [`AGENTS.md`](AGENTS.md) first. It is written primarily for LLM coding agents, but it is also a sound way of working for human contributors, and it covers the architecture rules, the working agreement, and the commands.

Before a commit, run `/verify` (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`). Keep changes small and functional, and write plain commit messages without type prefixes.

## Documentation

- [`AGENTS.md`](AGENTS.md): operating manual and architecture constraints. Written primarily for LLM coding agents, and useful for human contributors.
- [`docs/architecture.md`](docs/architecture.md): technical architecture, domain rules, and the concurrency model.
- [`docs/deployment.md`](docs/deployment.md): deployment runbook.
- [`docs/analytics.md`](docs/analytics.md): telemetry specification.
- [`docs/reference/README.md`](docs/reference/README.md): verified references and platform gotchas.
- [`docs/decisions/`](docs/decisions/): architectural decision records.
- [`ROADMAP.md`](ROADMAP.md): planned features.

## License

Passie is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
