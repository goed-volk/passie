# ADR 0008: PostHog Analytics via Same-Origin Reverse Proxy

## Status
Accepted (Amended by [ADR 0013](0013-runtime-telemetry-env-config.md))

## Context
Understand app usage and queue contention while respecting user privacy and avoiding third-party tracker ad blockers.

## Decision
Use PostHog EU cloud via a same-origin `/ingest` API reverse proxy route (with targeted server-side `/capture/` dispatch for transactional email delivery and fatal server exceptions):
- Autocapture, heatmaps, session recording, dead-clicks, and rageclicks are strictly disabled.
- Web vitals and client/server exceptions (`$exception`) are captured with sanitized URL templates and redacted error messages (no pass IDs, dynamic route parameters, quoted string literals, or email addresses).
- Only explicit allowlisted functional domain, authentication, email delivery, and admin events are tracked without personal names, guest names, email addresses, or pass identifiers in event payloads.
- Person identity (`distinct_id`) is bound to member ID on person profiles only, and reset on member switch.
- The `/ingest` proxy allowlists request headers, forwards the client IP (`cf-connecting-ip` as `x-forwarded-for`) for accurate GeoIP resolution, enforces a 64 KB payload limit, strips sensitive cookies/credentials, and restricts allowed path prefixes. Server-side `/capture/` events explicitly set `$geoip_disable: true`.
- Fully deactivated when `POSTHOG_KEY` is not set or on localhost (see ADR 0013 for runtime configuration).

## Consequences
- Clean event telemetry without third-party ad blocker interference or cookie leakage.
- Strict data minimization and zero tracking data emitted in local dev or CI.
