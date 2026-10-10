# PostHog Analytics, Telemetry & Privacy Architecture

This document is the authoritative specification for telemetry, user identity lifecycle, URL sanitization, and PostHog MCP query patterns across Passie.

---

## 1. Architectural Overview & Privacy Boundaries

Passie employs a privacy-first, client-side product analytics architecture backed by PostHog EU cloud (`https://eu.i.posthog.com`), routed through a same-origin reverse proxy at `/ingest` ([ADR 0008](decisions/0008-analytics-posthog-eu-proxy.md)).

```
[ Browser Client ]
  ├── posthog-js (capture_pageview: 'history_change') ──> $pageview on SPA route change
  ├── MemberPicker ────────────────────────────────────> member.selected on identity selection
  ├── HomeScreen / usePool ────────────────────────────> matchday domain events (pass.*, queue.*)
  ├── Admin Interface (/beheer) ───────────────────────> admin.* events
  │
  ├── [ before_send Hook ] (src/lib/posthog.ts)
  │     ├── Strict Allowlist: ALLOWED_ANALYTICS_EVENTS
  │     ├── Route Templating: /pas/[passId], /api/pool/[gamePoolId]
  │     └── PII Scrubber: strips guestName, displayName, passId, seatInfo
  │
  ▼
[ Next.js Same-Origin Proxy: /ingest/[[...path]] ]
  ├── Strict Opt-in: returns 404 immediately if NEXT_PUBLIC_POSTHOG_KEY is unset
  ├── Path Prefix Allowlist: e, i/v0/e, decide, array, flags, s, batch, static
  ├── Header Filtering & Sensitive Header Stripping
  └── 64 KB Payload Limit
  ▼
[ PostHog EU Cloud (eu.i.posthog.com) ]
```

### Privacy & Compliance Guarantees
- **No Autocapture or Session Replay:** `autocapture: false`, `disable_session_recording: true`, `capture_heatmaps: false`, `capture_dead_clicks: false`, and `rageclick: false` are enforced in `initPostHog()`.
- **Zero Third-Party Tracking / Ad Blocker Immunity:** Telemetry is forwarded via the same-origin `/ingest` route, eliminating third-party cookie access and preventing tracking script blockades.
- **Strict Data Minimization:** Event payloads omit personal names, guest names, seat numbers, and pass identifiers.
- **Strict Opt-in Behavior:** When `NEXT_PUBLIC_POSTHOG_KEY` is omitted, the client SDK does not initialize and the `/ingest` proxy returns HTTP 404 without making upstream calls. In local development (`localhost`, `127.0.0.1`), production telemetry is suppressed.

---

## 2. Event Taxonomy & Allowlist

Only events explicitly included in `ALLOWED_ANALYTICS_EVENTS` pass through `before_send`. All other events (including `$autocapture`, `$click`, or arbitrary custom events) return `null` and are discarded before transmission.

| Event Name | Category | Trigger Location | Allowed Payload Properties | PII Status |
| --- | --- | --- | --- | --- |
| `$pageview` | Navigation | SPA route transition (`history_change`) | `$current_url`, `$pathname` (both templated) | Sanitized (no query params, no IDs) |
| `member.selected` | Identity | Explicit avatar selection in `/wie-ben-jij` | `is_pass_owner`, `owned_pass_count` | Clean (no member name or ID in properties) |
| `pass.indicate_keep` | Matchday | Owner indicates attendance (*"Ik ga"*) | `hoursToKickoffBucket`, `passCount` | Clean |
| `pass.indicate_release` | Matchday | Owner releases pass (*"Pas vrijgeven"*) | `hoursToKickoffBucket`, `passCount` | Clean |
| `pass.reclaim` | Matchday | Owner reclaims assigned pass (*"Pas Terugclaimen"*) | `hoursToKickoffBucket` | Clean |
| `queue.join_self` | Matchday | Member joins queue (*"Ik wil een pas"*) | `queueLengthBefore`, `hoursToKickoffBucket` | Clean |
| `queue.join_guest` | Matchday | Member requests guest seat (*"Ik neem iemand mee"*) | `queueLengthBefore`, `hoursToKickoffBucket` | Clean (`guestName` stripped) |
| `queue.cancel` | Matchday | Member cancels queue entry (*"Annuleren"*) | `queuePosition`, `hoursToKickoffBucket` | Clean |
| `pass.give_back` | Matchday | Claimant yields assigned pass (*"Pas Teruggeven"*) | `hoursToKickoffBucket` | Clean |
| `pass.handover` | Matchday | Physical custody pill tap (*"Pas nu bij mij"*) | `isHolderNow`, `hoursToKickoffBucket` | Clean |
| `admin.login` | Admin | Successful password auth in `/beheer/inloggen` | _None_ | Clean |
| `admin.member_created` | Admin | New member added in `/beheer` | _None_ | Clean (`displayName` stripped) |
| `admin.member_updated` | Admin | Member edited in `/beheer` | `changed: string[]` (e.g. `["displayName"]`) | Clean (field names only, no values) |
| `admin.members_reordered` | Admin | Drag-and-drop sort saved in `/beheer` | `memberCount: number` | Clean |
| `$exception` | Errors | Application error boundary capture | `$exception_message`, `$exception_type` | Sanitized stack trace |
| `$identify` | Internal | PostHog user identification event | Person properties (see Section 3) | Bound to distinct_id |
| `$set` | Internal | Person property update | Person properties | Bound to distinct_id |
| `$groupidentify` | Internal | Group analytics registration | Group properties | Bound to group key |
| `$web_vitals` | Telemetry | Core Web Vitals monitor (`LCP`, `INP`, `CLS`) | Metric values, rating | Clean |
| `$performance_event` | Telemetry | Performance timing event | Duration, metric name | Clean |

---

## 3. Identity Model & Lifecycle

PostHog attributes events using a persistent `distinct_id`. In Passie, identity is managed through a deterministic, privacy-respecting lifecycle:

### Core Identity Mechanics
1. **Anonymous Baseline:** On initial load without identity, `posthog-js` assigns an anonymous UUID. Events prior to identity selection are recorded under this anonymous ID.
2. **First Identification (Merge):** When a user selects their profile in `/wie-ben-jij`, `trackMemberIdentity(member)` calls `posthog.identify(member.id, properties)`. This merges previous anonymous browsing events into the member profile without rotating session IDs.
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
- **Environment Gate:** Returns HTTP 404 `{ error: "Telemetry disabled" }` immediately if `NEXT_PUBLIC_POSTHOG_KEY` is undefined or empty.
- **Allowed Path Prefixes:** Only `e`, `i/v0/e`, `decide`, `array`, `flags`, `s`, `batch`, `static` are forwarded to `https://eu.i.posthog.com/`. All others return HTTP 404.
- **Allowed Inbound Request Headers:** `content-type`, `content-encoding`, `user-agent`, `accept`, `accept-encoding`. All other headers (including `Cookie`, `Authorization`, `CF-Ray`) are discarded.
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

---

## 7. Operator Guide: Setup & Verification

### Configuring Telemetry
1. In Cloudflare Workers environment or `.env.local`, set:
   ```env
   NEXT_PUBLIC_POSTHOG_KEY=phc_your_eu_posthog_project_key
   NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   NEXT_PUBLIC_PASSIE_ENV=production
   ```
2. For local testing with telemetry enabled, run with `NEXT_PUBLIC_PASSIE_ENV=development` in `.env.local`.

### Verifying Telemetry in Browser
Append `?__posthog_debug=true` to the URL. The browser console will print:
- Initialization details (`[PostHog.js] Initializing PostHog`).
- Captured `$pageview` events on every SPA route navigation.
- Captured `$identify` and `member.selected` on avatar pick.
- Dropped events if any unlisted event is triggered.
