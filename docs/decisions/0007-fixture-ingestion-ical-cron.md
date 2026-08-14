# ADR 0007: Ingestion via RFC 5545 iCalendar Feeds

## Status
Accepted

## Context
Match schedules change due to television broadcasts and cup fixtures. Manual fixture entry is error-prone.

## Decision
Ingest official home fixtures automatically from `https://ics.fixtur.es/v2/home/excelsior.ics` using Cloudflare Workers Cron Triggers (`0 */6 * * *`) and an RFC 5545 parser.

## Consequences
- Automated match updates and kickoff reschedules.
- Reschedules append compensating `fixture.rescheduled` timeline events without deleting historical records.
