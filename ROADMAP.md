# ROADMAP — Passie Product Backlog

This document outlines planned features and enhancements for Passie. Technical architecture findings and implementation notes are documented in [`docs/future-architecture.md`](docs/future-architecture.md).

---

## Next up

- **Direct Pass Transfer / Delegation (*Pas Overdragen*):**
  - *Description:* Allow season ticket owners to directly delegate their seat for a match to a specific friend, family member, or group member, bypassing the general FIFO queue.
  - *User Flow:* Pass owners can choose between *"Ik ga"* (Keep), *"Pas vrijgeven"* (Release to group queue), and *"Pas overdragen"* (Direct transfer/delegation with recipient name).
  - *Status:* Planned. Technical specification documented in [`docs/future-architecture.md#1-direct-pass-transfer--delegation`](docs/future-architecture.md#1-direct-pass-transfer--delegation).

- **Member & Pass Administration (`/beheer`):**
  - *Description:* Web-based administration area for managing group members, profile details, active status, and season ticket configurations without manually editing database files.
  - *Status:* **Partially delivered (v0.1.1):** Member creation, profile editing, distinct avatar color assignment, visual drag-and-drop sort ordering, and guarded deactivation. Pass CRUD and ownership management are planned for a subsequent iteration.
  - *Technical Notes:* Detailed constraints for pass CRUD and self-service sequencing are documented in [`docs/future-architecture.md#2-member--pass-administration-beheer`](docs/future-architecture.md#2-member--pass-administration-beheer).

- **Verified Identity via Cloudflare Access (v0.2):**
  - *Description:* Authenticate members seamlessly via email one-time PIN or SSO allowlist, replacing the local unauthenticated picker for production deployments while keeping login frictionless.
  - *Status:* Planned. Architecture documented in [`docs/future-architecture.md#3-verified-identity-via-cloudflare-access-for-workers-v02`](docs/future-architecture.md#3-verified-identity-via-cloudflare-access-for-workers-v02).

- **Matchday Deadline Reminders:**
  - *Description:* Automated notifications (e.g. WhatsApp webhook, web push) sent to pass owners who haven't indicated attendance by `deadline - 24h`.
  - *Status:* Planned.

- **Server-Side Event & Error Analytics:**
  - *Description:* Server-side exception tracking and telemetry to capture backend errors, API usage, and authoritative matchday domain events without reliance on client JavaScript.
  - *Technical Notes:* Authoritative domain events can be emitted from `mutate()` call sites via Cloudflare Worker `ctx.waitUntil` or direct API calls using the authenticated `passie_member` cookie as `distinct_id` and `$groups: { group: "goedvolk" }`. Touches the transaction commit path, requiring dedicated domain review per Golden Rule 2.
  - *Status:* Planned.

- **Web Push Notifications:**
  - *Description:* Real-time device notifications for key events (e.g. *a pass has been assigned to you*, *physical card handover needed*).
  - *Status:* Planned.

- **Staging Subdomain (`passie-dev.goedvolk.org`):**
  - *Description:* Dedicated remote preview environment with an isolated test database for validating updates before production deployment.
  - *Status:* Planned.

- **Twee-staps wisselbevestiging:**
  - *Description:* Twee-fasen paswissel waarbij de huidige houder de wissel registreert en de ontvanger de ontvangst bevestigt (met een automatische bevestiging na 24 uur).
  - *Status:* Planned.

- **WhatsApp Matchday Summary Share:**
  - *Description:* One-tap button to copy a clean, formatted matchday roster and pass distribution summary directly into the group WhatsApp chat.
  - *Status:* Planned.

- **Timeline Date & Time Formatting:**
  - *Description:* Display a compact day/date prefix (e.g. *"vr 20:07"*, *"12 sep 09:42"*, or relative date indicator) in the matchday activity timeline rather than just a wall-clock time, making events that occurred across multiple days easily distinguishable.
  - *Status:* Planned.

---

## Later

- **Realtime State Updates (Server-Sent Events):**
  - *Description:* Instantaneous live updates for open pools via Server-Sent Events, eliminating the 5-second polling interval while keeping battery and data usage minimal.
  - *Technical Notes:* [`docs/future-architecture.md#4-realtime-streaming-sse--durable-objects`](docs/future-architecture.md#4-realtime-streaming-sse--durable-objects).

- **Multi-Club Onboarding & Dynamic Theming:**
  - *Description:* Support multiple football clubs across the Eredivisie & Eerste Divisie with automated accessible club palette generation and custom club branding.
  - *Technical Notes:* Color science and WCAG AA contrast rules documented in [`docs/future-architecture.md#5-multi-club-onboarding--accessible-color-science`](docs/future-architecture.md#5-multi-club-onboarding--accessible-color-science).

- **Personal ICS Calendar Feed:**
  - *Description:* Individualized calendar subscription feed showing only the matchdays where you personally hold or have been assigned a pass.

- **Per-Member Notification Preferences:**
  - *Description:* Granular user controls for email and push alerts per fixture or event type.

- **Opt-in Auto-Free at Deadline:**
  - *Description:* Optional group setting to automatically release unindicated passes to the waiting list when the deadline expires.

- **Season Attendance & Sharing Statistics:**
  - *Description:* Year-end stats highlighting attendance rates, passes shared, and queue wait times across the group.

- **Expense & Tikkie Settlement:**
  - *Description:* Record season ticket costs, guest fees, and generate payment requests for simple end-of-season settlement.

- **Multi-Language Support (English / Dutch):**
  - *Description:* Language selector for international visitors and non-Dutch speaking friends.

- **Away & Cup Match Fixtures:**
  - *Description:* Support for away games, cup ties, and playoff matches beyond the regular home season.

---

## Ideas

- **Visual Stadium Seat Map:** Diagram showing exact seat locations per pass (stand, row, seat).
- **Physical Card Photo Storage:** Stored digital backup photo of the physical barcode for gate verification emergencies.
- **Member Pickup Location Notes:** Default neighborhood or matchday meeting spot displayed on member profiles.
- **Season Attendance Leaderboard:** Friendly group stats for home and away match attendance.
- **Fractional Ownership Splits:** Explicit tracking of shared pass fractions (e.g. 50/50 vs 1/3 ownership).
