# ROADMAP — Passie Product Backlog

This document outlines planned features and enhancements for Passie. Technical architecture findings and implementation notes are documented in [`docs/future-architecture.md`](docs/future-architecture.md), and UX/UI audit recommendations are tracked in [`.kilo/plans/1787002200000-ux-audit-findings.md`](.kilo/plans/1787002200000-ux-audit-findings.md).

---

## Next up

- **Matchday Terminology & Copy Polish (UX Audit F-19 – F-22):**
  - *Description:* Refine matchday microcopy based on real-device findings to enhance clarity and football culture resonance.
  - *Improvements:*
    - **"Op de bank" (F-19):** Replace generic *"wachtrij"* with the football metaphor *"Op de bank"* (*Stap 2 — Op de bank* / *"De bank is momenteel leeg"*).
    - **Pass Assignment Clarity (F-20):** Change ambiguous *"Toegewezen: [Naam]"* in queue cards to *"Toegewezen: pas van [Naam]"* so users clearly understand that a season ticket was allocated, not the person.
    - **Attendee-First Guest Display (F-21):** Invert queue attendee hierarchy from *"[Lid] (gast: [Naam])"* to *"[Naam] (gast van [Lid])"*, putting the person who actually goes first.
    - **Natural Guest Claim Phrasing (F-22):** Rephrase pass badge from awkward *"[Lid]'s gast"* to natural Dutch *"Geclaimd door gast van [Lid]"*.
  - *Status:* **Delivered.** Tracked in [`.kilo/plans/1787002200000-ux-audit-findings.md`](.kilo/plans/1787002200000-ux-audit-findings.md).

- **Localized Action Loading & Multi-Pass Disambiguation (UX Audit F-11 & F-07):**
  - *Description:* Fine-grained loading spinners per action button (preventing global button freeze) and contextual pass label captioning on the multi-pass bottom action button.
  - *Status:* **Delivered.** Tracked in [`.kilo/plans/1787002200000-ux-audit-findings.md`](.kilo/plans/1787002200000-ux-audit-findings.md).

- **Settled Post-Match View Mode (UX Audit F-12):**
  - *Description:* Automatically transition matchday pool display 2 hours after kickoff to a settled match summary with finished badge, hiding pre-match indication action bars.
  - *Status:* **Delivered.** Tracked in [`.kilo/plans/1787002200000-ux-audit-findings.md`](.kilo/plans/1787002200000-ux-audit-findings.md).

- **Direct Pass Transfer / Delegation (*Pas Overdragen*):**
  - *Description:* Allow season ticket owners to directly delegate their seat for a match to a specific friend, family member, or group member, bypassing the general FIFO queue.
  - *User Flow:* Pass owners can choose between *"Ik ga"* (Keep), *"Pas vrijgeven"* (Release to group queue), and *"Pas overdragen"* (Direct transfer/delegation with recipient name).
  - *Status:* Planned. Technical specification documented in [`docs/future-architecture.md#1-direct-pass-transfer--delegation`](docs/future-architecture.md#1-direct-pass-transfer--delegation).

- **Member & Pass Administration (`/beheer`):**
  - *Description:* Web-based administration area for managing group members, profile details, active status, and season ticket configurations without manually editing database files.
  - *Status:* **Partially delivered (v0.1.1):** Member creation, profile editing, distinct avatar color assignment, visual drag-and-drop sort ordering, and guarded deactivation. Pass CRUD and ownership management are planned for a subsequent iteration.
  - *Technical Notes:* Detailed constraints for pass CRUD and self-service sequencing are documented in [`docs/future-architecture.md#2-member--pass-administration-beheer`](docs/future-architecture.md#2-member--pass-administration-beheer).

- **Verified Identity via Better Auth on D1 (ADR 0014):**
  - *Description:* Authenticate members securely via WebAuthn passkeys (Face ID, Touch ID, platform lock) and email OTP, replacing the local unauthenticated picker. Full database-backed sessions on Cloudflare D1 with instant revocation and role-based `/beheer` access.
  - *Status:* **Delivered (v0.2.0).** Architecture documented in [`docs/decisions/0014-identity-via-better-auth-on-d1.md`](docs/decisions/0014-identity-via-better-auth-on-d1.md).

- **Admin Email-Edit Hardening (prerequisite for a second group admin; Security Review FND-02):**
  - *Description:* Today any group admin can take over any member account, including the platform admin's, by editing its email in `/beheer`. Two code paths cause this:
    - **Rewrite path** (`src/server/authAdmin.ts` `updateMemberEmailAndSync`, new address): the target's `auth_user.email` is replaced with the admin-supplied address. Sessions are revoked, but the `auth_user` keeps its platform `role`, its passkeys and its member links. The admin can then request an OTP to the new address and sign in as that user.
    - **Relink path** (address already belongs to another `auth_user`): the member is silently relinked to that user. That user's existing sessions and passkeys immediately control the member. `preCreateUserAndLink` likewise links to an existing user without checking its other memberships.
    - **Contributing factors:** `assertCapability` in `src/server/adminAuth.ts` always returns true, and `PATCH /api/admin/members/[memberId]` has no checks on the target's role.
  - *Required before more than one group admin exists:*
    - Group admins may not change the email or role of admins or platform admins. Implement `assertCapability` with real capability checks.
    - Refuse to relink a member to an existing `auth_user`; return 409 instead.
    - Require proof of control of the new address (verification or an invite/claim flow) before binding it.
    - Delete the `auth_user`'s passkeys and sessions whenever its email is reassigned.
    - Audit-log every email and role change.
    - Enforce at least one active admin per group (Security Review FND-12).
    - Add negative tests for each rule.
  - *Risk acceptance:* Accepted by the owner for Alpha and Beta, while a single person is both the only platform admin and the only group admin. This acceptance lapses as soon as a second group admin is appointed.
  - *Status:* Planned. Findings in [`.kilo/plans/1791916949466-better-auth-security-review-findings.md`](.kilo/plans/1791916949466-better-auth-security-review-findings.md).

- **Cross-Group Tenant Scoping / IDOR Protection (Security Review FND-14; required for Beta phase):**
  - *Description:* Multi-group tenant isolation across all route handlers and loaders. In the Alpha single-group deployment, cross-group access is structurally impossible because only one group row exists. Before onboarding a second group in Beta, tenant scoping must be strictly enforced:
    - Assert `resource.groupId === actor.groupId` across all pool routes (`/api/pool/[gamePoolId]`, `/queue`, `/indicate`, `/cancel`), pass routes (`/api/pass/[passId]/holder`), and page loaders (`/pas/[passId]`).
    - Scope admin operations to `principal.groupId` rather than the single-group assertion in `resolveAdminGroup` (which currently throws when `groups.length > 1`).
    - In `getActingSession`, resolve membership relative to the requested group context rather than blindly selecting `userMembers[0]`.
    - Add multi-group negative test fixtures.
  - *Status:* Planned (Prerequisite for Beta multi-group rollout).

- **Transactional & Lifecycle Email Notifications:**
  - *Description:* Actionable, zero-fluff Dutch transactional emails built on the shared `renderPassieEmailLayout` HTML design system and `dispatchTransactionalEmail` telemetry pipeline (`src/server/email/`).
  - *Lifecycle Hooks:*
    1. **Member Onboarding / Welcome Email (`kind: "welcome"`):** Sent automatically when a new member is created with an email address (`createMember`), when an existing member has an email linked for the first time (`updateMember`), or via CLI (`scripts/link-member-emails.ts`). Explains how Passie works, links directly to `/inloggen`, and recommends setting up a passkey after first login. (**Delivered.**)
    2. **Indication Deadline Reminder (`kind: "deadline_reminder"`):** Cron-driven nudge sent at `indication_deadline_at - 24h` strictly to pass owners whose pass is still `unindicated` for an upcoming `open` home match (deduplicated via `activity_events` idempotency key `email_deadline_reminder_${poolId}_${memberId}`).
    3. **Queue Seat Allocated (`kind: "pass_assigned"`):** Sent when `pass.assigned` transitions a waiting queue entry to `assigned` (triggered by `IndicateRelease` or `GiveBackAssignedPass`), informing the claimant which pass (`label` + `seatInfo`) they received and who currently holds the physical card (`holderMemberId`). Uses a 3-minute delay / debounce check against current DB state before sending so accidental clicks immediately undone by the owner do not spam the queue.
    4. **Pass Reclaimed Disruption Alert (`kind: "pass_reclaimed"`):** High-priority alert sent when a season ticket owner reclaims an already-assigned pass (`pass.reclaimed`), immediately notifying the bumped claimant (`reclaimedFromMemberId`) that the owner is attending after all and that their request has been returned to the front of the waiting list (*"Op de bank"*).
    5. **Matchday Physical Handover Reminder (`kind: "handover_reminder"`):** Sent on matchday morning (`kickoff_at - 6h`) when a pass's physical holder (`passes.holder_member_id`) still differs from the expected attendee (`expectedHolder`), nudging both parties to arrange the physical card exchange (*wissel*).
    6. **Kickoff Rescheduled / Match Cancelled Alert (`kind: "fixture_changed"`):** Sent when ICS feed ingestion triggers `fixture.rescheduled` or `fixture.cancelled` on an `open` pool, notifying only members with an active stake (`kept` owners, `assigned` claimants, or `waiting` queue members).
    7. **Security: Email Address Change Verification (`kind: "email_change"`):** Confirmation/notice dispatched to both old and new addresses when a linked member's login email is modified (paired with Security Review FND-02 hardening).
  - *Status:* **Welcome email delivered;** matchday & security lifecycle hooks planned.

- **Server-Side Event & Error Analytics:**
  - *Description:* Server-side exception tracking and telemetry to capture backend errors, API usage, and authoritative matchday domain events without reliance on client JavaScript.
  - *Technical Notes:* Authoritative domain events can be emitted from `mutate()` call sites via Cloudflare Worker `ctx.waitUntil` or direct API calls using the authenticated `passie_member` cookie as `distinct_id` and `$groups: { group: "goedvolk" }`. Touches the transaction commit path, requiring dedicated domain review per Golden Rule 2.
  - *Status:* Planned.

- **Web Push Notifications:**
  - *Description:* Real-time device notifications for key events (e.g. *a pass has been assigned to you*, *physical card handover needed*).
  - *Status:* Planned.

- **Staging Subdomain (`passie-dev.goedvolk.org`) & Staging Seeding Strategy:**
  - *Description:* Dedicated remote preview environment with an isolated Cloudflare D1 test database (`passie-staging-db`, UUID `1c936aac-181c-47dc-98c2-6f6d64416595`) and Worker `passie-staging` for validating major updates and multi-group features before production cutover.
  - *Remote Staging Seeding Strategy:*
    - After significant schema evolutions, domain engine refactors, or test cycles, the staging database can be reset and reseeded with representative test data via `pnpm seed:staging` (`tsx scripts/seed.ts --env=staging --remote`).
    - **Production Guardrails:**
      - The production database (`passie`, UUID `176bd801-9d6f-4d7e-8306-83ea0a0be157`) is strictly blocked from any automated or CLI seed execution.
      - Staging seed commands explicitly assert against database binding/ID and require `--env=staging`, refusing to run if targeting `passie` or if `PASSIE_ENV === "production"`.
      - Staging runs under `env.staging` in `wrangler.jsonc` targeting custom domain `passie-dev.goedvolk.org` (single-level subdomain covered by Cloudflare Universal SSL at $0.00 cost).
  - *Status:* **Delivered.** Tracked in [`.kilo/plans/1792264849195-staging-environment-plan.md`](.kilo/plans/1792264849195-staging-environment-plan.md).

- **Twee-staps wisselbevestiging:**
  - *Description:* Twee-fasen paswissel waarbij de huidige houder de wissel registreert en de ontvanger de ontvangst bevestigt (met een automatische bevestiging na 24 uur).
  - *Status:* Planned.

- **WhatsApp Matchday Summary Share:**
  - *Description:* One-tap button to copy a clean, formatted matchday roster and pass distribution summary directly into the group WhatsApp chat.
  - *Status:* Planned.

- **Adaptive Timeline Timestamp Formatting (UX Audit F-23):**
  - *Description:* Format timeline timestamps with 3-tier adaptive granularity in Dutch (`Europe/Amsterdam`) so events are instantly contextualized across days:
    - **Today:** Only wall-clock time (e.g. *"11:25"*).
    - **Past 7 days (< 7d):** Abbreviated weekday + time (e.g. *"wo 11:25"*).
    - **Older (> 7d):** Calendar date + time (e.g. *"12 sep 11:25"*).
  - *Status:* **Delivered.** Tracked in [`.kilo/plans/1787002200000-ux-audit-findings.md#f-23`](.kilo/plans/1787002200000-ux-audit-findings.md).

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

- **HTTP Security Headers & Clickjacking Defense (Security Review FND-11; Beta/public):**
  - *Description:* Enforce defense-in-depth HTTP security headers in `next.config.ts` or at the Cloudflare zone level for all environments:
    - `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` to protect `/inloggen` and `/instellingen` from clickjacking and credential prompt framing.
    - `X-Content-Type-Options: nosniff`.
    - `Referrer-Policy: strict-origin-when-cross-origin`.
    - `Permissions-Policy: publickey-credentials-get=(self), publickey-credentials-create=(self)` to explicitly bound WebAuthn execution context.
    - Strict Transport Security (`HSTS`) header.
  - *Status:* Planned (Beta / Public launch).

- **Comprehensive Rate-Limiting Hardening (Security Review FND-09 & FND-10; Beta/public):**
  - *Description:* Expand Better Auth rate-limiting beyond initial basic IP-based rules:
    - **Passkey Endpoints (FND-09):** Add dedicated custom rules for `/passkey/generate-authenticate-options`, `/passkey/verify-authentication`, `/passkey/generate-register-options`, and `/passkey/verify-registration` so they do not fall back to the broad 100/10s default bucket.
    - **Per-Email OTP Cooldown & Account Quota (FND-10):** Enforce an application-level rate limit or cooldown keyed on normalized `email` (e.g. max 3 OTP requests per 10 minutes per address) to prevent distributed IP churning, inbox flooding, and Cloudflare Email Sending quota exhaustion.
    - **KV-Backed Storage:** Evaluate migrating `auth_rate_limit` storage from Cloudflare D1 to Cloudflare KV or Worker memory/secondaryStorage to eliminate SQLite write amplification and database lock contention under high-frequency probing.
  - *Status:* Planned (Beta / Public launch).

- **Banned User Active Session Rejection (Security Review FND-13; Beta/public):**
  - *Description:* Currently, user ban status is only validated at session creation (`session.create.before`). If an operator sets `banned = true` via direct D1 database intervention without calling `setBanned()`, or if a race condition occurs, `getActingSession` will return `status: "active"`. Explicitly inspect `user.banned === true` in `getActingSession` and reject existing sessions immediately with `status: "unauthenticated"`.
  - *Status:* Planned (Beta / Public launch).

---

## Test gaps (from Security Review FND-15)

Systematic negative test coverage to be implemented across automated test suites:
1. **Banned user session read rejection:** Integration test confirming that an existing session cookie for an `auth_user` flagged `banned = 1` is rejected on read by `getActingSession`.
2. **Deactivated member denial:** Route-level and snapshot integration tests confirming that an authenticated user linked to `isActive = 0` receives `status: "no_membership"` and is redirected to `/geen-toegang`.
3. **Auth user without membership:** Route-level tests confirming that every mutating API route returns 401 when called with a valid session belonging to an `auth_user` who has no corresponding `members` record.
4. **Cross-group access isolation:** Multi-group test fixtures asserting that members of Group A receive 404 or 403 when requesting Group B's pools, passes, or member resources.
5. **Cross-origin rejection across all 8 mutating routes:** Integration tests asserting that requests carrying cross-origin headers to `/api/pool/...`, `/api/pass/.../holder`, `/api/admin/members/...`, and `/api/fixtures/refresh` receive 403 `CrossOriginRequestError`.
6. **Disabled Better Auth endpoints:** Parameterized tests for all remaining paths in `disabledPaths` and their trailing-slash variants (`/api/auth/sign-up/email/`, `/api/auth/update-user/`, etc.) confirming HTTP 404.
7. **OTP for unknown email:** Explicit test verifying that `/email-otp/send-verification-otp` with an unknown email address returns `{ success: true }` without creating an `auth_user` row or dispatching email.
8. **Production dev login refusal:** Test verifying that `/api/dev/login-as` returns 404 whenever `PASSIE_ENV = "production"` or `PASSIE_DEV_LOGIN` is unset or `Host` is non-localhost.
9. **Production mailer fail-closed:** Test verifying that `getMailer()` throws an explicit error when `isProduction` is true and Cloudflare `EMAIL` binding is missing.
10. **Missing production secret fail-closed:** Test verifying that `getAuth()` throws an explicit error when `isProduction` is true and `BETTER_AUTH_SECRET` is unset.
11. **Admin role & email edit boundaries:** Unit and route tests verifying privilege boundaries and conflict handling for `PATCH /api/admin/members/[memberId]`.
12. **Fresh migration replay harness:** Automated CI / `/verify` step that runs `wrangler d1 migrations apply` from scratch against an isolated database to prevent untested migration SQL drift.
13. **Active rate-limiting suite:** Test cases with `rateLimit.enabled = true` asserting HTTP 429 status code handling when request thresholds are exceeded.

---

## Ideas

- **Visual Stadium Seat Map:** Diagram showing exact seat locations per pass (stand, row, seat).
- **Physical Card Photo Storage:** Stored digital backup photo of the physical barcode for gate verification emergencies.
- **Member Pickup Location Notes:** Default neighborhood or matchday meeting spot displayed on member profiles.
- **Season Attendance Leaderboard:** Friendly group stats for home and away match attendance.
- **Fractional Ownership Splits:** Explicit tracking of shared pass fractions (e.g. 50/50 vs 1/3 ownership).
