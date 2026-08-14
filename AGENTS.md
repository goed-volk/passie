# AGENTS.md — Passie Operating Manual

Passie is a mobile-first web app for groups of friends sharing season tickets (*seizoenkaarten*) for football clubs (Excelsior Rotterdam in MVP). It replaces ambiguous WhatsApp polls with a deterministic, first-come-first-served ledger and physical card possession tracker. The architecture is built on Next.js 16 App Router on Cloudflare Workers (`@opennextjs/cloudflare`) with Cloudflare D1 (SQLite) and Drizzle ORM. Detailed documentation is in `docs/architecture.md`, pinned reference in `docs/reference/README.md`, and future plans in `ROADMAP.md`.

---

## 1. Golden Rules

1. **`src/domain/**` is pure:**
   - Absolutely no `next/*`, no Drizzle ORM, no `process.env`, no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`.
   - All time values, identifiers, and actor contexts must be passed as explicit parameters into reducer functions.
2. **All DB mutations go through `mutate()`:**
   - Never write directly to Cloudflare D1 from a React Server Component, Client Component, or API route handler.
   - Use the pure reducer + optimistic concurrency (`version` column guard) + D1 atomic `batch()` mutation pattern in `src/server/commit.ts`.
3. **Queue order is strictly monotonic:**
   - Ordering is `ORDER BY queue_entries.id ASC` (SQLite `AUTOINCREMENT`).
   - Never order queue entries by wall-clock timestamps (`created_at`).
   - Never reorder or renumber `queue_entries` on cancellation.
4. **Append compensating events, never delete rows:**
   - Possession changes, fixture reschedules, and cancellations are tracked via append-only logs (`possession_events`, `activity_events`).
   - Never delete rows for corrections.
5. **D1 `batch()` transaction constraints:**
   - D1 `batch()` executes all statements within a single transaction but cannot branch on intermediate results.
   - Statements must be computed in memory beforehand via `diffToStatements()`.
6. **Timestamps:**
   - All timestamps stored in SQLite are integer unix seconds UTC.
   - Format timestamps for display only in the UI using `Europe/Amsterdam`.
7. **i18n discipline:**
   - No hardcoded Dutch string literals in UI components.
   - All user-facing text must go through `t()` from `src/i18n/t.ts` / `src/i18n/nl.ts`.
8. **Secrets & Personal Data:**
   - Never commit secrets or real personal data to git.
   - Secrets are managed via `wrangler secret put` or local `.dev.vars` (gitignored).
   - Real seed data lives in `seed/group.local.json` (gitignored). Only `seed/group.example.json` with fictional data is committed.
9. **Authentication status:**
   - The MVP has **no authentication**. Identity is set via the `/wie-ben-jij` picker stored in the `passie_member` HTTP-only cookie.
   - Never add a code path that assumes a cryptographically trusted or verified identity.

---

## 2. Kilo Code Working Agreement

- **Local Package Isolation:** All dependencies and project tools must be installed locally within this repository (`node_modules`), never globally across the machine.
- **Tool Transparency & Permission:** Be explicit about which CLI tools and scripts are executed, explaining why and how they are used. Do not use unapproved third-party or community tools without explicit user permission. Official tools (such as Cloudflare's `wrangler` and `@cloudflare/next-on-pages` / `create-cloudflare`) are permitted.
- **Manual Cloudflare Configuration:** Not every Cloudflare setup step needs automation via CLI/API. The repository owner can manually create applications, bindings, or routes in the Cloudflare dashboard if preferred.
- **Todo Tool:** Drive every non-trivial task using the native `todowrite` tool. Maintain one `in_progress` item at a time. Mark completed immediately when verified. Never batch completions.
- **Question Tool:** Use the `question` tool with a recommended option when a requirement is ambiguous or irreversible. Do not guess or ask in plain prose.
- **Agent Roles:**
  - Use `task` with subagent `explore` for codebase discovery.
  - Use `passie-domain` subagent (`.kilo/agent/passie-domain.md`) for any changes to the allocation engine, queue ordering, or D1 commit path.
- **Plan Mode:** Enter plan mode before touching `src/domain/**`, DB schema, or concurrency mechanisms.
- **Skill:** Load the `kilo-config` skill before modifying configuration in `.kilo/`.
- **Tool Selection:**
  - File reading: `read` (never `cat`, `head`, `tail`).
  - File editing: `edit` (never `sed`, `awk`).
  - File writing: `write` (never `echo >`, heredocs).
  - File search: `glob` (never `find`, `ls`).
  - Content search: `grep` (never `grep`, `rg`).
  - Shell: reserve `bash` strictly for `pnpm`, `wrangler`, `git`, `drizzle-kit`, and `scripts/*`.
- **Pre-commit Verification:** Run `/verify` (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`) before every commit. Never commit broken code. Write readable, accessible, functional, short commit messages in plain English without semantic prefixes like "chore:" or "feat:".
- **Code Review:** Proactively suggest a local review (`/review uncommitted`) after completing non-trivial changes.

---

## 3. Running and Verifying the Application

- **Dev Server:**
  - Start using `.kilo/run-script.sh` (powers the Kilo Code Run button).
  - The script outputs the assigned URL on its **first output line** (e.g. `http://localhost:<PORT>`). Never hardcode port 3000.
  - `PASSIE_PORT=3111 .kilo/run-script.sh` pins a custom port for automated verification.
  - `PASSIE_PREVIEW=1 .kilo/run-script.sh` runs the preview server under workerd.
- **UI & Concurrency Verification:**
  - **No MCP servers are registered.** UI automation uses Kilo Code's built-in Browser Use.
  - Concurrency and FCFS race safety are verified deterministically via `scripts/race-check.sh` (hits dev server, fires concurrent requests with curl, inspects local D1).
  - Built-in Browser Use is used for the golden-path UI walkthrough (requires a high-capability agentic model like Sonnet-4 class).
  - Mobile responsiveness (safe areas, 100dvh, iOS momentum scrolling) must be validated on physical iOS/Android devices by the owner.

---

## 4. Worktree Hygiene

- Each git worktree contains its own `node_modules`, `.next`, `.open-next`, and `.wrangler` local SQLite D1 database.
- `.kilo/setup-script.sh` automatically installs dependencies, copies `.dev.vars` / `seed/group.local.json` if available, runs migrations, seeds data, and generates types.
- Never use `git stash` to move work between worktrees (git stashes are global across the repository).
- Bring work across worktrees via Agent Manager Apply, branch merge, or PR.
- Prune stale worktrees after merging to reclaim disk space.

---

## 5. Commands Cheat Sheet

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js development server |
| `pnpm build` | Build application for Cloudflare Workers |
| `pnpm preview` | Run local OpenNext Cloudflare workerd preview |
| `pnpm deploy` | Deploy application to Cloudflare Workers |
| `pnpm typecheck` | Run TypeScript type validation (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint checks |
| `pnpm test` | Run vitest suite |
| `pnpm test:watch` | Run vitest in watch mode |
| `pnpm db:generate` | Generate Drizzle SQL migrations |
| `pnpm db:migrate:local` | Apply migrations to local D1 SQLite DB |
| `pnpm db:migrate:prod` | Apply migrations to production Cloudflare D1 |
| `pnpm seed:example` | Seed local D1 database with fictional data |
| `pnpm seed:local` | Seed D1 database with real group data (requires `--confirm` for prod) |
| `pnpm ingest:local` | Ingest next fixtures from ICS feed into local D1 |
| `pnpm cf-typegen` | Generate Cloudflare Worker environment types |
| `/verify` | Run typecheck, lint, test, and build |
| `/verify-ui` | Run race-check script and browser verification |
| `/dev-reset` | Reset local D1, re-migrate, re-seed, re-ingest |
| `/ingest` | Fetch and print upcoming fixtures |

---

## 6. Definition of Done

1. Pure allocation engine unit tests pass with ≥95% branch/line coverage.
2. `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` succeed with zero errors.
3. `scripts/race-check.sh` passes against local dev server without race conditions.
4. Idempotency guarantees validated (double actions produce single events).
5. All UI copy rendered through `t()`.
6. Real-device check completed on iOS and Android for mobile layout.
7. No secrets, tokens, or personal names in git history or tracked files.

---

## 7. Anti-patterns to Avoid

- ❌ Treating D1 `batch()` as an interactive transaction that can query between writes.
- ❌ Ordering queue entries by `created_at` instead of `id ASC`.
- ❌ Allowing a non-owner to indicate a pass's state.
- ❌ Modifying `PoolSnapshot` shape without updating schema & snapshot tests.
- ❌ Hardcoding `http://localhost:3000` in scripts or tests.
- ❌ Expecting MCP browser tools (`playwright_*`) to be active in the environment.
