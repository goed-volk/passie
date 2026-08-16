# ADR 0003: Pure Reducer + Optimistic Concurrency Guard for Mutations

## Status
Accepted

## Context
Cloudflare D1 does not support interactive transactions with client-side branching between statements. A first-come-first-served ledger requires deterministic race safety during concurrent requests (e.g. simultaneous seat claims and pass releases).

## Decision
Use a pure domain reducer function (`src/domain/engine.ts`) coupled with an optimistic concurrency version column on `game_pools`. Mutations compute diff statements in memory and apply them inside a single atomic D1 `batch()` guarded by `WHERE version = snapshot.version`.

### Critical Concurrency Invariants & Findings

1. **D1 `batch()` Statement Ordering (Foreign Key Dependencies):**
   - SQLite enforces foreign keys in statement order within the batch.
   - When a queue join immediately allocates a pass, `queue_entries` (the claimant) must be inserted **before** `pass_game_states` (which references `claimant_entry_id`). Reversing this order triggers an immediate `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`.

2. **Retry Loop & Jitter Backoff on Constraint Conflicts:**
   - When concurrent requests race, the losing request may fail either on `guardResult.meta.changes === 0` (clean version mismatch) or on `SQLITE_CONSTRAINT` (e.g. attempting to insert the same auto-calculated ID or version).
   - `mutate()` catches constraint errors inside the retry loop and executes a randomized exponential jitter backoff (`15ms * attempt + jitter`) across up to 8 attempts to allow the winning transaction's writes to settle before re-reading.

3. **Idempotency Key Scope:**
   - The caller's `Idempotency-Key` header belongs exclusively to the root action event (e.g. `queue.joined` or `pass.released`).
   - Cascading events produced by the allocation engine (such as `pass.assigned`) must have `idempotencyKey: null` to avoid violating `activity_events.idempotency_key UNIQUE`.

## Consequences
- Guaranteed deterministic FCFS behavior verified via `scripts/race-check.sh`.
- Automatic transparent retries on conflict with zero data corruption.
- Pure reducer is independently testable without database mocks.
