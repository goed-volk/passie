# ADR 0008: PostHog Analytics via Same-Origin Reverse Proxy

## Status
Accepted

## Context
Understand app usage and queue contention while respecting user privacy and avoiding third-party tracker ad blockers.

## Decision
Use PostHog EU cloud via a same-origin `/ingest` API reverse proxy route. Disable autocapture, track only explicit functional events, and fully deactivate when `NEXT_PUBLIC_POSTHOG_KEY` is not set.

## Consequences
- Clean event telemetry without ad blocker interference.
- Zero tracking data emitted in local dev or CI.
