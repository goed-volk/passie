# ADR 0011: Committing Production D1 Database ID to Configuration

## Status
Accepted

## Context
Wrangler requires a `database_id` binding in `wrangler.jsonc` to deploy and apply migrations to Cloudflare D1.

## Decision
Commit the production Cloudflare D1 `database_id` in `wrangler.jsonc`. Cloudflare D1 database UUIDs are resource identifiers, not authentication secrets. Access to the database is strictly governed by Cloudflare IAM credentials (API tokens and Cloudflare Zero Trust policies), not knowledge of the database ID.

## Consequences
- Automated and deterministic deployments without dynamic file patching during CI/deploy steps.
- Clear separation between resource identifiers (checked into version control) and access secrets (`PASSIE_CRON_SECRET`, managed via `wrangler secret`).
