# ADR 0008: PostHog Analytics via Same-Origin Reverse Proxy

## Status
Accepted

## Context
Understand app usage and queue contention while respecting user privacy and avoiding third-party tracker ad blockers.

## Decision
Use PostHog EU cloud via a same-origin `/ingest` API reverse proxy route. Product analytics is client-side only:
- Autocapture, heatmaps, session recording, dead-clicks, and rageclicks are strictly disabled.
- Web vitals are captured with sanitized URL templates (no pass IDs or dynamic route parameters).
- Only 8 explicit functional domain events are tracked without personal names, guest names, or pass identifiers in event payloads.
- Person identity (`distinct_id`) is bound to member ID on person profiles only, and reset on member switch.
- The `/ingest` proxy allowlists request headers, enforces a 64 KB payload limit, strips sensitive cookies/credentials, and restricts allowed path prefixes.
- Fully deactivated when `NEXT_PUBLIC_POSTHOG_KEY` is not set or on localhost.

## Consequences
- Clean event telemetry without third-party ad blocker interference or cookie leakage.
- Strict data minimization and zero tracking data emitted in local dev or CI.
