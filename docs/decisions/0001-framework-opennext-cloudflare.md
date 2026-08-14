# ADR 0001: Next.js 16 App Router on Cloudflare Workers via OpenNext

## Status
Accepted

## Context
Passie requires server rendering, API route handlers, and scheduled background cron jobs with minimal latency and zero cold start overhead on a single-screen mobile application.

## Decision
Use Next.js 16 App Router deployed on Cloudflare Workers using `@opennextjs/cloudflare`.

## Consequences
- Fast edge execution close to users in the Netherlands.
- Must use `nodejs_compat` compatibility flag.
- Do not use `export const runtime = 'edge'`.
