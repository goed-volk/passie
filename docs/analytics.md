# PostHog Analytics, Telemetry & Privacy Architecture

This document is the authoritative specification for telemetry, user identity lifecycle, URL sanitization, and PostHog MCP query patterns across Passie.

---

## 1. Architectural Overview & Privacy Boundaries

Passie employs a privacy-first, client-side product analytics architecture backed by PostHog EU cloud (`https://eu.i.posthog.com`), routed through a same-origin reverse proxy at `/ingest` ([ADR 0008](decisions/0008-analytics-posthog-eu-proxy.md)).

```
[ Browser Client ]
  ├── posthog-js (capture_pageview: 'history_change') ──> $pageview on SPA route change
  ├── posthog-js (capture_exceptions) + error.tsx ──────> $exception on client/boundary errors
  ├── LoginForm (/inloggen) ───────────────────────────> $identify then auth.sign_in_* on authentication
  ├── HomeScreen / usePool ────────────────────────────> matchday domain events (pass.*, queue.*)
  ├── Admin Interface (/beheer) ───────────────────────> admin.* events
  │
  ├── [ before_send Hook ] (src/lib/posthog.ts)
  │     ├── Strict Allowlist: ALLOWED_ANALYTICS_EVENTS
  │     ├── Route Templating: /pas/[passId], /api/pool/[gamePoolId]
  │     └── PII Scrubber: strips guestName, displayName, passId, seatInfo, redacts $exception strings/emails
  │
  ▼
[ Next.js Same-Origin Proxy: /ingest/[[...path]] ]
  ├── Strict Opt-in: returns 404 immediately if POSTHOG_KEY is unset in runtime config
  ├── Path Prefix Allowlist: e, i/v0/e, decide, array, flags, s, batch, static
  ├── Header Filtering, Sensitive Header Stripping & Client IP Forwarding (X-Forwarded-For)
  └── 64 KB Payload Limit
  ▼
[ PostHog Upstream (configured via POSTHOG_HOST, defaults to eu.i.posthog.com) ]
  ▲
  │ Direct Server Dispatch (/capture/ with $geoip_disable: true)
[ Cloudflare Worker Server ]
  ├── dispatchTransactionalEmail (src/server/email/dispatch.ts) ──> email.sent / email.send_failed (otp, welcome)
  └── captureServerException (src/server/telemetryConfig.ts) ────> $exception (D1, cron, API routes, email_dispatch)
```

### Privacy & Compliance Guarantees
- **No Autocapture or Session Replay:** `autocapture: false`, `disable_session_recording: true`, `capture_heatmaps: false`, `capture_dead_clicks: false`, and `rageclick: false` are enforced in `initPostHog()`.
- **Privacy-Preserving Exception Tracking:** Unhandled browser exceptions (`window.onerror`), unhandled promise rejections (`unhandledrejection`), browser `console.error` calls (`capture_console_errors: true`), React error boundary crashes (`src/app/error.tsx`, `src/app/global-error.tsx`), Better Auth server error logs (`source: "better_auth_logger"`), and server-side fatal errors (`captureServerException`) are captured as `$exception` events with automatic redaction of quoted string literals and email addresses.
- **Zero Third-Party Tracking / Ad Blocker Immunity:** Telemetry is forwarded via the same-origin `/ingest` route, eliminating third-party cookie access and preventing tracking script blockades.
- **Strict Data Minimization:** Event payloads omit personal names, guest names, seat numbers, and pass identifiers.
- **Strict Opt-in Behavior:** When `POSTHOG_KEY` is omitted, the client SDK does not initialize and the `/ingest` proxy returns HTTP 404 without making upstream calls. In local development (`localhost`, `127.0.0.1`), production telemetry is suppressed.

---

## 2. Event Taxonomy & Allowlist

Only events explicitly included in `ALLOWED_ANALYTICS_EVENTS` pass through `before_send`. All other events (including `$autocapture`, `$click`, or arbitrary custom events) return `null` and are discarded before transmission.

| Event Name | Category | Trigger Location | Allowed Payload Properties | PII Status |
| --- | --- | --- | --- | --- |
| `$pageview` | Navigation | SPA route transition (`history_change`) | `$current_url`, `$pathname` (both templated) | Sanitized (no query params, no IDs) |
| `member.selected` | Identity | Legacy identity selection (deprecated) | `is_pass_owner`, `owned_pass_count` | Clean (no member name or ID in properties) |
| `auth.sign_in_otp_requested` | Auth | Email OTP requested (client) | _None_ | Clean (email omitted) |
| `auth.sign_in_otp_failed` | Auth | Email OTP request failed (client) | `error_code`, `status` | Clean (email omitted) |
| `email.sent` | Email | Transactional email dispatched (`src/server/email/dispatch.ts`) | `kind` (`otp` or `welcome`), `trigger` (`sign-in`, `member_created`, `member_email_linked`, `cli_link`), `otp_type` (when `kind === 'otp'`), `provider` (`cloudflare` or `console`), `$geoip_disable: true`, `$process_person_profile: boolean` | Clean (recipient email, name & OTP omitted) |
| `email.send_failed` | Email | Transactional email dispatch failed (`src/server/email/dispatch.ts`) | `kind` (`otp` or `welcome`), `trigger` (`sign-in`, `member_created`, `member_email_linked`, `cli_link`), `otp_type` (when `kind === 'otp'`), `provider` (`cloudflare` or `console`), `$geoip_disable: true`, `$process_person_profile: boolean` | Clean (recipient email & error PII omitted) |
| `auth.sign_in_success` | Auth | Successful sign-in | `method` (`otp` or `passkey`) | Clean |
| `auth.sign_in_failed` | Auth | Failed sign-in verification | `method` (`otp` or `passkey`), `error_code`, `status` | Clean (email & OTP omitted) |
| `auth.sign_out` | Auth | Explicit user sign-out | _None_ | Clean |
| `auth.passkey_registered` | Auth | New passkey enrolled | _None_ | Clean |
| `auth.passkey_deleted` | Auth | Passkey deleted by user | _None_ | Clean |
| `auth.sessions_revoked` | Auth | Other sessions revoked | _None_ | Clean |
| `pass.indicate_keep` | Matchday | Owner indicates attendance (*"Ik ga"*) | `hoursToKickoffBucket`, `passCount` | Clean |
| `pass.indicate_release` | Matchday | Owner releases pass (*"Pas vrijgeven"*) | `hoursToKickoffBucket`, `passCount` | Clean |
| `pass.reclaim` | Matchday | Owner reclaims assigned pass (*"Pas Terugclaimen"*) | `hoursToKickoffBucket` | Clean |
| `queue.join_self` | Matchday | Member joins queue (*"Ik wil een pas"*) | `queueLengthBefore`, `hoursToKickoffBucket` | Clean |
| `queue.join_guest` | Matchday | Member requests guest seat (*"Ik neem iemand mee"*) | `queueLengthBefore`, `hoursToKickoffBucket` | Clean (`guestName` stripped) |
| `queue.cancel` | Matchday | Member cancels queue entry (*"Annuleren"*) | `queuePosition`, `hoursToKickoffBucket` | Clean |
| `pass.give_back` | Matchday | Claimant yields assigned pass (*"Pas Teruggeven"*) | `hoursToKickoffBucket` | Clean |
| `pass.handover` | Matchday | Physical custody pill tap (*"Pas nu bij mij"*) | `isHolderNow`, `hoursToKickoffBucket` | Clean |
| `admin.login` | Admin | Legacy admin auth (deprecated by ADR 0014 role-based sessions) | _None_ | Clean |
| `admin.member_created` | Admin | New member added in `/beheer` | _None_ | Clean (`displayName` stripped) |
| `admin.member_updated` | Admin | Member edited in `/beheer` | `changed: string[]` (e.g. `["displayName"]`) | Clean (field names only, no values) |
| `admin.members_reordered` | Admin | Drag-and-drop sort saved in `/beheer` | `memberCount: number` | Clean |
| `admin.deadline_reminded` | Admin | Manual deadline reminder sent from TopNav | `recipientCount: number`, `skippedCount: number`, `unindicatedPassCount: number` | Clean |
| `$exception` | Errors | Browser unhandled errors/rejections, Next.js error boundaries (`error.tsx`, `global-error.tsx`), and server route/worker error handlers | `$exception_message`, `$exception_type`, `$exception_list`, `source` / `boundary` | Sanitized message & stack trace (quoted literals & emails redacted) |
| `$identify` | Internal | PostHog user identification event | Person properties (see Section 3) | Bound to distinct_id |
| `$set` | Internal | Person property update | Person properties | Bound to distinct_id |
| `$groupidentify` | Internal | Group analytics registration | Group properties | Bound to group key |
| `$web_vitals` | Telemetry | Core Web Vitals monitor (`LCP`, `INP`, `CLS`) | Metric values, rating | Clean |
| `$performance_event` | Telemetry | Performance timing event | Duration, metric name | Clean |

### Authentication & Passkey Telemetry Lifecycle
Passie tracks the passwordless identity lifecycle without capturing sensitive credentials, passkey public keys, or user email addresses:
- **Unified Sign-in Event (`auth.sign_in_success`)**: Dispatched on every successful login session. Carries a single discriminator property:
  - `method: "passkey"` when authenticated via WebAuthn biometric or security key credential.
  - `method: "otp"` when authenticated via 6-digit email OTP.
- **Passkey Enrollment (`auth.passkey_registered`)**: A dedicated event emitted whenever a new WebAuthn credential is created and verified by the server (both from the post-OTP enrollment prompt in `/inloggen` and from the settings panel in `/instellingen`).
- **Passkey Removal (`auth.passkey_deleted`)**: Emitted when a member deletes an enrolled passkey in `/instellingen`.
- **OTP Request, Failures & Transactional Email Delivery (`auth.sign_in_otp_requested`, `auth.sign_in_otp_failed`, `auth.sign_in_failed`, `email.sent`, `email.send_failed`)**: `auth.sign_in_otp_requested` is dispatched on the client when an OTP code is requested; `auth.sign_in_otp_failed` and `auth.sign_in_failed` capture structured funnel failure reasons (`error_code`, `status`, `method`) without polluting Error Tracking with expected user validation errors (while `INVALID_ORIGIN` and `5xx` errors also emit `$exception`). All server-side transactional emails (OTP login codes, member onboarding welcome emails, seat allocated *"Je bent erbij!"* notifications, and admin deadline reminders) flow through `dispatchTransactionalEmail` (`src/server/email/dispatch.ts`), which emits `email.sent` (or `email.send_failed` + `$exception` with `source: "email_dispatch"`) carrying `kind` (`"otp"`, `"welcome"`, `"pass_assigned"`, or `"deadline_reminder"`), `trigger` (`"sign-in"`, `"member_created"`, `"member_email_linked"`, `"cli_link"`, `"pool_mutation"`, or `"admin_manual"`), `provider` (`"cloudflare"` or `"console"`), `$geoip_disable: true`, and `$process_person_profile: Boolean(memberId)` attributed directly to the resolved `member.id` (or `"system_mailer"` fallback). Recipient email addresses, display names, and OTP codes are strictly stripped by a denylist scrubber before transmission.
- **Sign-out & Session Management (`auth.sign_out`, `auth.sessions_revoked`)**: Emitted when explicit logout or revocation actions occur.

---

## 3. Identity Model & Lifecycle

PostHog attributes events using a persistent `distinct_id`. In Passie, identity is managed through a deterministic, privacy-respecting lifecycle:

### Core Identity Mechanics
1. **Anonymous Baseline:** On initial load without identity, `posthog-js` assigns an anonymous UUID. Events prior to identity selection are recorded under this anonymous ID.
2. **First Identification (Merge):** When a user signs in via `/inloggen` (`LoginForm`), `trackMemberIdentity(member)` calls `posthog.identify(member.id, properties)`. This merges previous anonymous browsing events into the member profile without rotating session IDs.
3. **Shared Device Switch (`reset()`):** If a different person uses the same browser/device (`posthog.get_property("$user_state") === "identified" && currentDistinctId !== member.id`), `trackMemberIdentity()` explicitly invokes `posthog.reset()` first. This decouples the sessions and prevents distinct user profiles from being merged into one person.
4. **Polling & Re-hydration Deduplication:** On subsequent renders or during TanStack Query 5-second polling intervals, `trackMemberIdentity()` checks `posthog.get_distinct_id() === member.id`. If already identified, duplicate `identify()` calls are skipped, preventing redundant `$set` property writes.
5. **Group Analytics (`goedvolk`):** Group association is established via `posthog.group("group", "goedvolk", { name: "Goed Volk" })`. The web SDK attaches `$groups: { group: "goedvolk" }` to all subsequent events in the session automatically. Duplicate `$groupidentify` calls are prevented by checking `posthog.getGroups().group !== groupSlug`.

### Person & Group Properties
- **`distinct_id`**: Member UUID (`member.id`).
- **Person Properties (`$set`)**:
  - `member_slug`: Member slug (e.g. `"sam"`, `"ilse"`).
  - `display_name`: Display name (e.g. `"Sam"`, `"Ilse"`).
  - `group_slug`: Sharing group slug (`"goedvolk"`).
  - `is_pass_owner`: Boolean indicating whether the member owns one or more season tickets.
  - `owned_pass_count`: Integer count of owned passes.
- **Group Key**: `"goedvolk"` (group type `"group"`).

---

## 4. URL Sanitization & Route Templating

To prevent season ticket IDs, game pool IDs, and personal query parameters from leaking into analytics dashboards or heatmaps, `before_send` normalizes dynamic URLs:

- Dynamic pass detail paths: `/pas/*` → `/pas/[passId]`
- Dynamic pool API routes: `/api/pool/*` → `/api/pool/[gamePoolId]`
- Query strings & hashes: Stripped completely (`url.search = ""`, `url.hash = ""`).

---

## 5. Reverse Proxy Route (`/ingest`) Specification

The reverse proxy at `src/app/ingest/[[...path]]/route.ts` provides strict boundary defense:
- **Environment Gate:** Returns HTTP 404 `{ error: "Telemetry disabled" }` immediately if `POSTHOG_KEY` is undefined or empty in runtime config.
- **Allowed Path Prefixes:** Only `e`, `i/v0/e`, `decide`, `array`, `flags`, `s`, `batch`, `static` are forwarded to the upstream `POSTHOG_HOST` (default `https://eu.i.posthog.com/`). All others return HTTP 404.
- **Allowed Inbound Request Headers:** `content-type`, `content-encoding`, `user-agent`, `accept`, `accept-encoding`, plus `x-forwarded-for` populated from `cf-connecting-ip` (or the first hop of `x-forwarded-for`) so PostHog's GeoIP enrichment resolves the client's true location rather than the proxy server's location. All other headers (including `Cookie`, `Authorization`, `CF-Ray`) are discarded. Server-originated events (`/capture/`) explicitly set `$geoip_disable: true`.
- **Allowed Outbound Response Headers:** `content-type`, `cache-control`. Sensitive headers (e.g. `Set-Cookie`) are stripped.
- **Payload Size Enforcement:** Enforces a maximum body size of 64 KB (65,536 bytes). Excessively large requests receive HTTP 413.

---

## 6. PostHog MCP & HogQL Query Reference

Analytics agents and operators using PostHog MCP can execute these authoritative HogQL queries against the Passie dataset:

### 1. Matchday Attendance & Release Rate by Kickoff Bucket
```sql
SELECT
    properties.hoursToKickoffBucket AS kickoff_bucket,
    countIf(event = 'pass.indicate_keep') AS kept_count,
    countIf(event = 'pass.indicate_release') AS released_count,
    round(countIf(event = 'pass.indicate_release') * 100.0 / count(), 1) AS release_pct
FROM events
WHERE event IN ('pass.indicate_keep', 'pass.indicate_release')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY kickoff_bucket
ORDER BY kickoff_bucket ASC
```

### 2. Queue Contention & Cancellation Drop-off
```sql
SELECT
    properties.queueLengthBefore AS queue_length,
    countIf(event = 'queue.join_self') AS self_joins,
    countIf(event = 'queue.join_guest') AS guest_joins,
    countIf(event = 'queue.cancel') AS cancellations,
    round(countIf(event = 'queue.cancel') * 100.0 / nullIf(countIf(event LIKE 'queue.join%'), 0), 1) AS cancel_rate_pct
FROM events
WHERE event IN ('queue.join_self', 'queue.join_guest', 'queue.cancel')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY queue_length
ORDER BY queue_length ASC
```

### 3. Pass Reclaim & Yield Velocity
```sql
SELECT
    event,
    count() AS total_events,
    properties.hoursToKickoffBucket AS kickoff_bucket
FROM events
WHERE event IN ('pass.reclaim', 'pass.give_back')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY event, kickoff_bucket
ORDER BY total_events DESC
```

### 4. Admin Activity & Member Administration Timeline
```sql
SELECT
    timestamp,
    event,
    distinct_id,
    properties.changed AS modified_fields,
    properties.memberCount AS reordered_count
FROM events
WHERE event LIKE 'admin.%'
  AND timestamp >= now() - INTERVAL 14 DAY
ORDER BY timestamp DESC
LIMIT 50
```

### 5. Identity Selection & Device Sharing Ratio
```sql
SELECT
    count() AS total_selections,
    count(DISTINCT distinct_id) AS distinct_members,
    round(count() * 1.0 / count(DISTINCT distinct_id), 2) AS selections_per_member
FROM events
WHERE event = 'member.selected'
  AND timestamp >= now() - INTERVAL 30 DAY
```

### 6. Authentication Method Share: Passkey vs. Email OTP
```sql
SELECT
    properties.method AS auth_method,
    count() AS total_logins,
    round(count() * 100.0 / sum(count()) OVER (), 1) AS share_pct
FROM events
WHERE event = 'auth.sign_in_success'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY auth_method
ORDER BY total_logins DESC
```

### 7. Passkey Adoption & Enrollment Velocity
```sql
SELECT
    countIf(event = 'auth.passkey_registered') AS passkeys_registered,
    countIf(event = 'auth.passkey_deleted') AS passkeys_deleted,
    count(DISTINCT distinct_id) AS unique_members_enrolling
FROM events
WHERE event IN ('auth.passkey_registered', 'auth.passkey_deleted')
  AND timestamp >= now() - INTERVAL 30 DAY
```

### 8. Transactional Email Delivery & Failure Rate by Campaign Kind
```sql
SELECT
    properties.kind AS email_kind,
    properties.trigger AS email_trigger,
    properties.provider AS mailer_provider,
    countIf(event = 'email.sent') AS emails_sent,
    countIf(event = 'email.send_failed') AS emails_failed,
    round(countIf(event = 'email.send_failed') * 100.0 / nullIf(count(), 0), 1) AS failure_rate_pct
FROM events
WHERE event IN ('email.sent', 'email.send_failed')
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY email_kind, email_trigger, mailer_provider
ORDER BY emails_sent DESC
```

### 9. Client & Server Exception Breakdown
```sql
SELECT
    coalesce(properties.source, properties.boundary, 'browser_unhandled') AS error_origin,
    properties.$exception_type AS exception_type,
    count() AS occurrences
FROM events
WHERE event = '$exception'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY error_origin, exception_type
ORDER BY occurrences DESC
```

### 10. Authentication Funnel & Failure Breakdown
```sql
SELECT
    event,
    properties.method AS auth_method,
    properties.error_code AS error_code,
    properties.status AS http_status,
    count() AS occurrences
FROM events
WHERE event IN (
    'auth.sign_in_otp_requested',
    'auth.sign_in_otp_failed',
    'auth.sign_in_success',
    'auth.sign_in_failed'
  )
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY event, auth_method, error_code, http_status
ORDER BY occurrences DESC
```

---

## 7. Operator Guide: Setup & Verification

### Configuring Telemetry
Telemetry configuration is runtime-resolved via Cloudflare Worker context and `.dev.vars` (see [ADR 0013](decisions/0013-runtime-telemetry-env-config.md)):
1. **Local Development:**
   Configure in `.dev.vars` (see `.dev.vars.example`):
   ```env
   POSTHOG_KEY=phc_your_dev_posthog_project_key
   POSTHOG_HOST=https://eu.i.posthog.com
   PASSIE_ENV=development
   ```
   *(If `POSTHOG_KEY` is omitted or left empty, telemetry is completely disabled).*

2. **Production Cloudflare Worker:**
   Set the production project key securely as a Cloudflare Worker secret:
   ```bash
   pnpm exec wrangler secret put POSTHOG_KEY
   ```
   *(Enter your production `phc_...` key when prompted, or configure it via the Cloudflare Dashboard under **Workers & Pages → passie → Settings → Variables and Secrets**).*

   Non-sensitive defaults are maintained in `wrangler.jsonc` under `"vars"`:
   ```jsonc
   "vars": {
     "POSTHOG_HOST": "https://eu.i.posthog.com",
     "PASSIE_ENV": "production"
   }
   ```

### Verifying Telemetry in Browser
Append `?__posthog_debug=true` to the URL. The browser console will print:
- Initialization details (`[PostHog.js] Initializing PostHog`).
- Captured `$pageview` events on every SPA route navigation.
- Captured `$identify` and `member.selected` on avatar pick.
- Dropped events if any unlisted event is triggered.
