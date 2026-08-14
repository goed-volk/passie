# ADR 0006: Production and Local Development Environments Only

## Status
Accepted

## Context
Operating multiple Cloudflare staging environments adds DNS and configuration overhead for an MVP with a single test group.

## Decision
Support local development (`next dev` and local `.wrangler` D1) and production deployment (`passie.goedvolk.org`). Staging environment is deferred to post-MVP roadmap.

## Consequences
- Fast developer loop with zero external staging maintenance.
- Local D1 database isolated per worktree.
