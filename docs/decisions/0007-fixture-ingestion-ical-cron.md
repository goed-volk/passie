# ADR 0007: Ingestion via RFC 5545 iCalendar Feeds

## Status
Accepted

## Context
Match schedules change due to television broadcasts and cup fixtures. Manual fixture entry is error-prone. In addition, matches can be rescheduled to a new kickoff date/time or cancelled/postponed without a known replacement date.

## Decision
Ingest official home fixtures automatically from `https://ics.fixtur.es/v2/home/excelsior.ics` using Cloudflare Workers Cron Triggers (`0 */6 * * *`), manual on-demand triggers (`/api/fixtures/refresh`), and an RFC 5545 parser.

The ingestion process differentiates between:
1. **Rescheduled matches (*Verplaatst*):** When a match's `UID` exists and kickoff (`DTSTART`) moves to a new timestamp while `STATUS` remains scheduled:
   - Updates `fixtures.kickoff_at`.
   - Dispatches `MarkFixtureRescheduled` to update `game_pools.indication_deadline_at` (48h prior to the new kickoff) via `mutate()`.
   - Appends a `fixture.rescheduled` timeline event with the formatted new date/time in `Europe/Amsterdam`.
   - The match pool remains active/open; existing claims and queue entries are preserved.
2. **Cancelled / disappeared matches (*Afgelast*):** When `STATUS:CANCELLED` is received in the feed or an upcoming scheduled match disappears from the feed window:
   - Updates `fixtures.status = 'cancelled'`.
   - Dispatches `MarkFixtureCancelled` to set `game_pools.status = 'cancelled'` via `mutate()`.
   - Appends a `fixture.cancelled` timeline event and places the pool in read-only state.
3. **Restored / rescheduled after cancellation:** If a cancelled fixture later reappears with a new valid `DTSTART` and active status, ingestion detects the changes and updates the pool and deadline accordingly.

## Consequences
- Automated match updates, kickoff reschedules, and cancellations.
- State transitions are deterministic and routed strictly through `mutate()` with optimistic concurrency guards.
- Reschedules and cancellations append compensating timeline events without deleting historical database records.
