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
4. Execute single atomic D1 `batch()` containing:
   - Guard statement: `UPDATE game_pools SET version = version + 1 WHERE id = ? AND version = snapshot.version`
   - Diff statements.
5. If `guardResult.meta.changes === 1`, mutation succeeded. If `0`, another transaction committed concurrently -> retry up to 4 times.

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
- Club branding injected as CSS variables on `<html>` (`--club-primary`, `--club-secondary`, `--club-accent`, `--club-on-primary`).
- User copy strictly resolved via `src/i18n/` dictionary.
- Cookie-based session identity (`passie_member`) with `/wie-ben-jij` picker.
