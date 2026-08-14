# ADR 0003: Pure Reducer + Optimistic Concurrency Guard for Mutations

## Status
Accepted

## Context
Cloudflare D1 does not support interactive transactions with client-side branching between statements. A first-come-first-served ledger requires deterministic race safety during concurrent requests.

## Decision
Use a pure domain reducer function (`src/domain/engine.ts`) coupled with an optimistic concurrency version column on `game_pools`. Mutations compute diff statements in memory and apply them inside a single atomic D1 `batch()` guarded by `WHERE version = snapshot.version`.

## Consequences
- Guaranteed deterministic behavior.
- Automatic retries on conflict.
- Pure reducer is independently testable without database mocks.
