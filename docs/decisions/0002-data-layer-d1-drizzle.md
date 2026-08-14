# ADR 0002: Cloudflare D1 (SQLite) with Drizzle ORM

## Status
Accepted

## Context
Passie needs a lightweight, low-latency relational SQL database with transactional batch capability at the edge without maintaining standalone database servers.

## Decision
Use Cloudflare D1 (SQLite engine) paired with Drizzle ORM for type-safe schema definitions and query generation.

## Consequences
- Single source of truth at the edge.
- No network roundtrip overhead between Worker and database.
- Drizzle migrations committed directly in `drizzle/`.
