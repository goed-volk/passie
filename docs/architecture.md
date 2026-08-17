# Architecture Document — Passie

Passie is a mobile-first web app for groups sharing season tickets (*seizoenkaarten*) for football clubs.

---

## 1. High-Level Architecture

```
[ Browser / Mobile PWA ]
          │  HTTP / JSON (Polling 5s)
          ▼
[ Cloudflare Worker (@opennextjs/cloudflare) ]
  ├── React Server Components (Snapshot rendering)
  ├── Route Handlers (/api/pool/[id]/..., /api/me)
  ├── Scheduled Event Handler (/api/cron/ingest)
  │
  ├── [ Domain Engine (Pure Reducer) ] (src/domain/**)
  │     └── Pure state transitions: (State, Action, ctx) -> NewState + Events
  │
  └── [ Persistence & Commit Layer ] (src/server/**)
        └── Guarded D1 batch mutations: version check + diff writes
                 │
                 ▼
     [ Cloudflare D1 (SQLite) ]
```

---

## 2. Domain & Concurrency Model

### Pure Domain Engine (`src/domain/`)
- Pure functions only. Zero framework imports, zero Drizzle, zero system clock (`Date.now()`), zero pseudo-randomness.
- Input: `GamePoolState`, `Action`, `{ now: number; actor: MemberId }`.
- Output: `{ state: GamePoolState; events: ActivityEvent[] }` or `{ error: DomainError }`.

### Guarded Atomic Mutation (`src/server/commit.ts`)
Cloudflare D1 does not offer interactive multi-query transactions. To prevent race conditions in a first-come-first-served queue:
1. `loadGamePoolState(gamePoolId)` reads current aggregate snapshot including `version`.
2. `reduce(snapshot.state, action, ctx)` produces target state in memory.
3. `diffToStatements(snapshot, result)` calculates the minimal set of SQL updates and inserts.
   - **Statement Ordering:** `queue_entries` writes are always placed before `pass_game_states` so that foreign key references (`claimant_entry_id`) resolve within the atomic batch.
   - **Idempotency Scoping:** Root `idempotency_key` applies only to the user action event, never to cascading allocation events.
4. Execute single atomic D1 `batch()` containing:
   - Guard statement: `INSERT INTO pool_version_guards (game_pool_id, version, created_at) VALUES (?, ?, ?)` (enforcing serializable optimistic concurrency via primary key constraint)
   - Diff statements.
5. If batch execution succeeds, mutation succeeded. If a primary key constraint collision occurs on `pool_version_guards` due to concurrent execution, retry with randomized exponential jitter backoff up to 8 times.

### Fixture Lifecycle & Ingestion Flow
Match schedules are ingested automatically via cron trigger (`/api/cron/ingest`) and on demand (`/api/fixtures/refresh`) with a configurable cooldown:
- **Rescheduled Matches (`fixture.rescheduled`):** When kickoff timestamp changes in the feed, `fixtures.kickoff_at` is updated and `MarkFixtureRescheduled` recalculates `indication_deadline_at` via `mutate()`. The pool remains open and existing claims/queue positions are preserved.
- **Cancelled Matches (`fixture.cancelled`):** When marked `STATUS:CANCELLED` or omitted from upcoming feed matches, `fixtures.status` and `game_pools.status` flip to `"cancelled"` via `mutate()`, making the pool read-only.
- **Compensating Logs:** All changes append compensating activity events with formatted Dutch timestamps in `Europe/Amsterdam` rather than deleting historical rows.

---

## 3. Database Schema

- `clubs`: Club profile, colors (`colorPrimary`, `colorSecondary`), ICS feed URL.
- `seasons`: Competition season bounds.
- `fixtures`: Match calendar ingested from RFC 5545 feed.
- `groups`: Sharing group metadata (`Europe/Amsterdam` timezone).
- `members`: People in the group (slug, display_name, initials, avatar_color).
- `passes`: Physical season ticket records with current holder pointer.
- `pass_owners`: M:N pass ownership.
- `game_pools`: Matchday aggregate root with `version` and `indication_deadline_at`.
- `pass_game_states`: Matchday pass lifecycle (`unindicated` -> `kept` / `released` -> `assigned`).
- `queue_entries`: Strictly monotonic seat requests ordered by `id AUTOINCREMENT ASC`.
- `possession_events`: Append-only physical card movement log.
- `activity_events`: Append-only activity timeline with `idempotency_key UNIQUE`.

---

## 4. UI & Theming

- Responsive layout built with Tailwind CSS and Radix UI primitives.
- Club branding injected as CSS variables on `<html>` (`--club-primary`, `--club-secondary`, `--club-accent`, `--club-on-primary`, `--page-bg`, `--page-fg`).
- **Club-Aware Light/Dark Modes:** Supports primary/secondary color pairing (e.g. Excelsior *Rood-Zwart* light and *Zwart-Rood* dark). Dark mode uses custom deep-slate surfaces (`#0B0F19` background, `#131B2E` cards, `#232F46` borders) and tuned primary accents to guarantee WCAG AA (≥4.5:1) text contrast across all states.
- User copy strictly resolved via `src/i18n/` dictionary.
- Cookie-based session identity (`passie_member`) with `/wie-ben-jij` picker.
- Persistent user theme selection (`passie_theme` cookie + localStorage).

---

## 5. Deployment & Cloudflare Infrastructure

- **Worker Entry (`src/worker.ts`):** Wraps `@opennextjs/cloudflare` server bundle with top-level `fetch` and `scheduled` handlers.
- **Cron Triggers:** Automatic background fixture ingestion (`0 */6 * * *`) invokes `ingestClubFixtures(db, "excelsior")` directly via the worker `scheduled` handler.
- **Custom Domain Routing:** Production traffic routes through `passie.goedvolk.org` configured as a Cloudflare Worker custom domain.
- **D1 Production Database:** Production database `passie` provisioned via `wrangler d1 create passie`, migrated via `pnpm db:migrate:prod`, and seeded via `pnpm seed:local --remote --confirm`.

