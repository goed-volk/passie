# AGENTS.md — Passie Operating Manual

Passie is a mobile-first web app for groups of friends sharing season tickets (*seizoenkaarten*) for football clubs (Excelsior Rotterdam in MVP). It replaces ambiguous WhatsApp polls with a deterministic, first-come-first-served ledger and physical card possession tracker. The architecture is built on Next.js 16 App Router on Cloudflare Workers (`@opennextjs/cloudflare`) with Cloudflare D1 (SQLite) and Drizzle ORM. Detailed documentation is in `docs/architecture.md`, pinned reference in `docs/reference/README.md`, and future plans in `ROADMAP.md`.

This manual is written primarily for LLM coding agents, which is why it states rules and constraints as explicit imperatives. It is also a sound way of working for human contributors: the same architecture rules, commit discipline, and verification steps apply to everyone. Human readers can treat the agent-specific tooling notes (tool selection, subagents, plan mode) as guidance rather than hard rules.

---

## 1. Golden Rules

1. **`src/domain/**` is pure:**
   - Absolutely no `next/*`, no Drizzle ORM, no `process.env`, no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`.
   - All time values, identifiers, and actor contexts must be passed as explicit parameters into reducer functions.
2. **All DB mutations go through `mutate()`:**
   - Never write directly to Cloudflare D1 from a React Server Component, Client Component, or API route handler for matchday pool state.
   - Use the pure reducer + optimistic concurrency (`version` column guard) + D1 atomic `batch()` mutation pattern in `src/server/commit.ts`.
   - *Exception (ADR 0014 & ADR 0009):* `auth_*` tables (managed by Better Auth and `src/server/authAdmin.ts`) and member administration (`src/server/adminMembers.ts`) execute direct Drizzle/D1 batch writes outside `mutate()` as they sit outside the `GamePoolState` concurrency root.
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
   - All timestamps stored in SQLite for domain tables are integer unix seconds UTC.
   - *Exception (ADR 0014):* `auth_*` tables use `timestamp_ms` to maintain compatibility with Better Auth's internal millisecond Date calculations.
   - Format timestamps for display only in the UI using `Europe/Amsterdam`.
7. **i18n discipline:**
   - No hardcoded Dutch string literals in UI components.
   - All user-facing text must go through `t()` from `src/i18n/t.ts` / `src/i18n/nl.ts`.
8. **Secrets & Personal Data:**
   - Never commit secrets or real personal data to git.
   - Secrets are managed via `wrangler secret put` or local `.dev.vars` (gitignored).
   - Real seed data lives in `seed/group.local.json` (gitignored). Only `seed/group.example.json` with fictional data is committed.
9. **Authentication status:**
   - Identity is verified via **Better Auth** session authentication (WebAuthn passkeys and email OTP; ADR 0014).
   - Public registration is completely disabled; members are pre-created and linked by group administrators.
   - Acting member is resolved per request via `getActingMember()` / `requireActingMember()`. Unauthenticated requests redirect to `/inloggen` or return 401 JSON.

---

## 2. Kilo Code Working Agreement

- **Local Package Isolation:** All dependencies and project tools must be installed locally within this repository (`node_modules`), never globally across the machine.
- **External Directory & File Policy:** Never create, modify, or consult folders or files outside this repository workspace (including `/tmp`, global caches, or system paths) without first asking for explicit user permission and providing clear reasoning.
- **Tool Transparency & Permission:** Be explicit about which CLI tools and scripts are executed, explaining why and how they are used. Do not use unapproved third-party or community tools without explicit user permission. Official tools (such as Cloudflare's `wrangler` and `@cloudflare/next-on-pages` / `create-cloudflare`) are permitted.
- **Manual Cloudflare Configuration:** Not every Cloudflare setup step needs automation via CLI/API. The repository owner can manually create applications, bindings, or routes in the Cloudflare dashboard if preferred.
- **Todo Tool & Plan Alignment:** Drive every non-trivial task using the native `todowrite` tool. Structure plan steps and to-do list items around distinct, committable functional milestones. Maintain one `in_progress` item at a time. Mark completed immediately when verified. Never batch completions.
- **Question Tool:** Use the `question` tool with a recommended option when a requirement is ambiguous or irreversible. Do not guess or ask in plain prose.
- **Agent Roles:**
  - Use `task` with subagent `explore` for codebase discovery.
  - Use `passie-domain` subagent (`.kilo/agent/passie-domain.md`) for any changes to the allocation engine, queue ordering, or D1 commit path.
- **Plan Mode:** Enter plan mode before touching `src/domain/**`, DB schema, or concurrency mechanisms. When writing plans for multi-step features, explicitly design the deliverables and execution phases to align with the incremental functional commit boundaries.
- **Skill:** Load the `kilo-config` skill before modifying configuration in `.kilo/`.
- **Tool Selection:**
  - File reading: `read` (never `cat`, `head`, `tail`).
  - File editing: `edit` (never `sed`, `awk`).
  - File writing: `write` (never `echo >`, heredocs).
  - File search: `glob` (never `find`, `ls`).
  - Content search: `grep` (never `grep`, `rg`).
  - Shell: reserve `bash` strictly for `pnpm`, `wrangler`, `git`, `drizzle-kit`, and `scripts/*`.
- **Incremental Functional Commits:** For large features or multi-step tasks, chunk work into distinct, verified functional groups (e.g., schema and migrations, core backend logic, API route endpoints, UI components, tests and documentation) and commit each group iteratively as it is completed. Align plan phases and to-do items directly with these commit boundaries so that checking off a completed functional milestone includes verifying and committing it. Never accumulate hundreds or thousands of lines across disparate subsystems to commit in one massive monolithic dump. Committing in functional increments enforces development discipline, makes code changes untangleable and reviewable for both human engineers and AI sub-agents, and keeps git history bisectable. Every functional commit must leave the codebase in a working, passing state.
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
  - UI automation uses Kilo Code's Browser Use (`browser_*` tools). In the **VS Code extension**, browser automation is built-in (Settings → Web Tools → Browser Automation); in the **CLI**, it runs via local Playwright MCP.
  - Concurrency and FCFS race safety are verified deterministically via `scripts/race-check.sh` (hits dev server, fires concurrent requests with curl, inspects local D1).
    - **Execution & Timeout:** The full 5-iteration suite (20 D1 setups + 20 concurrent HTTP burst cycles) takes ~120–140s under local Next.js dev server JIT compilation. When running `scripts/race-check.sh` via AI agent shell tools, set an explicit `timeout: 180000` (180s) to prevent command timeout. For fast intermediate verification, pass a custom iteration count (e.g. `bash scripts/race-check.sh 2` or `RACE_CHECK_ITERATIONS=2 bash scripts/race-check.sh`, ~45–55s).
  - Browser Use is used for the golden-path UI walkthrough and scenario verification (recent high-capability agentic models are recommended for complex DOM interaction).
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
| `pnpm dev` | Start Next.js development server (Turbopack JIT) |
| `pnpm build` | Build application for Cloudflare Workers (`opennextjs-cloudflare build`) |
| `pnpm preview` | Build and run local OpenNext Cloudflare workerd preview |
| `pnpm deploy` | Build and deploy application to Cloudflare Workers |
| `pnpm typecheck` | Run TypeScript type validation (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint checks |
| `pnpm test` | Run vitest suite |
| `pnpm test:watch` | Run vitest in watch mode |
| `pnpm db:generate` | Generate Drizzle SQL migrations |
| `pnpm db:migrate:local` | Apply migrations to local D1 SQLite DB |
| `pnpm db:migrate:prod` | Apply migrations to production Cloudflare D1 |
| `pnpm seed:example` | Seed local D1 database with fictional data |
| `pnpm seed:local` | Seed local D1 database with real group data |
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
- ❌ Putting `pass_game_states` before `queue_entries` in D1 `batch()` (violates `claimant_entry_id` foreign key).
- ❌ Propagating root `Idempotency-Key` to cascading sub-events (violates `idempotency_key UNIQUE`).
- ❌ Ordering queue entries by `created_at` instead of `id ASC`.
- ❌ Allowing a non-owner to indicate a pass's state.
- ❌ Modifying `PoolSnapshot` shape without updating schema & snapshot tests.
- ❌ Hardcoding `http://localhost:3000` in scripts or tests.
- ❌ Expecting MCP browser tools (`playwright_*`) to be active in the environment.
