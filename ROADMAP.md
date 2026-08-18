# ROADMAP — Passie Backlog

This document outlines features, architectural enhancements, and refinements deferred beyond the MVP.

---

## Next up

- **Direct Pass Transfer / Delegation (*Pas Overdragen*):** Allow pass owners to directly delegate their seat for a match to a specific friend, relative, or member, bypassing the general FIFO queue.
  - *Context & Motivation:* Season tickets belong to specific owners. While owners frequently donate unused passes to the shared group queue (*"Pas vrijgeven"*), they occasionally want to bring a personal guest or lend their own card to a specific person for a matchday.
  - *UI / UX Flow:*
    - The pass indication interface presents three primary actions: *"Ik ga"* (Keep), *"Pas vrijgeven"* (Release to group queue), and *"Pas overdragen"* (Direct transfer/delegation).
    - Selecting *"Pas overdragen"* opens a dialog prompting for the target recipient (a group member or custom guest name, e.g. *"Vader"*, *"Vriend Jan"*).
  - *Domain & Queue Engine Architecture:*
    - Creates a new `queue_entry` with monotonic SQLite `AUTOINCREMENT id`, tagged with `kind: "delegated"` and `delegated_from_pass_id: passId`.
    - Directly transitions `pass_game_states.status = 'assigned'` bound to this specific queue entry, overruling general queue priority without disrupting the position of waiting members.
    - Appends a transparent `pass.delegated` event to `activity_events` recording `{ passId, ownerMemberId, recipientName }` so the group timeline remains fully auditable.
    - If the delegated recipient cancels, the pass reverts to `unindicated` for the owner to decide anew.
  - *Why deferred beyond MVP:* Requires extending domain action types (`DelegatePass`), updating queue allocation logic to handle bypassed assignment, adding schema fields, and testing precedence rules.

- **Verified Identity via Cloudflare Access for Workers (v0.2):** Switch Worker-level Access policy from `bypass` to `allow` with email one-time-PIN / IdP allowlist. Read verified identity server-side via `ctx.access.getIdentity()` (zero JWT signature parsing or manual cert verification required), map verified email to `members.access_email`, retain `passie_member` cookie as dev fallback, bind email to `posthog.identify()`, and simulate locally using `wrangler.jsonc` `access.dev` block with required `aud`.
  - *Why not in MVP:* Frictionless initial rollout for soft launch using country-level bypass + cookie picker.

- **Matchday Deadline Reminders:** Automated notification (WhatsApp bot / webhook / webpush) at deadline − 24h to nudge unindicated pass owners.
  - *Why not in MVP:* High-trust friend group uses manual group WhatsApp chat reminders for MVP launch.

- **Server-Side PostHog & Error Capture:** Server-side event capture and exception tracking via direct `fetch` to PostHog EU ingestion (`/i/v0/e/` or `/otlp/v1/logs` inside request context wrapped in `waitUntil()`, never via OpenTelemetry Node SDK) and Next.js `onRequestError`.
  - *Why not in MVP:* Client-side product analytics + Cloudflare Workers Logs / `wrangler tail` provide complete visibility without OpenTelemetry worker bundling hazards.

- **Member & Pass Admin UI:** Web interface to manage members, avatars, pass ownership shares, and active status without editing JSON/DB directly.
  - *Why not in MVP:* Seed scripts cover initial group setup with zero UI overhead.
- **Web Push Notifications:** Real-time push alerts for *pass assigned to you* and *handover expected of you*.
  - *Why not in MVP:* Users open the web app directly before games; notifications add service worker / VAPID complexity.
- **Staging Subdomain (`passie-dev.goedvolk.org`):** Dedicated remote staging environment with isolated D1 database.
  - *Why not in MVP:* Local dev + workerd preview covers validation for single-group MVP.
- **Two-Step Handover Confirmation:** Holder marks handover -> receiver confirms receipt (with 24h auto-confirm).
  - *Why not in MVP:* One-step optimistic handover is sufficient for high-trust friend groups.
- **WhatsApp Status Share Sheet:** Generate a formatted text summary with one tap to paste into the WhatsApp group.
  - *Why not in MVP:* Nice-to-have convenience feature; users can view the web app directly.

---

## Later

- **Realtime via Durable Objects + SSE:** Server-Sent Events pushed from a per-game Durable Object, replacing 5s client polling while preserving identical snapshot API shapes.
  - *Why not in MVP:* TanStack Query polling is simple, battery-friendly when tab is active, and requires no stateful infrastructure.
  - *Architecture Note:* Worker-level Cloudflare Access policies support SSE (plain HTTP streaming) natively, but do not currently support WebSocket connection upgrades (which return 403 under Worker-level policies). SSE is fully compatible with Worker-level Access; if WebSocket transport is ever adopted in the future, Access must be migrated to hostname-based first.
- **Multi-Group & Multi-Club Onboarding & Dynamic Theming:** Support multiple groups and clubs (Eredivisie & Eerste Divisie) with dynamic club theme selector, club logos, and automatic accessible color palette generation.
  - *Why not in MVP:* Schema is multi-tenant ready, but MVP focuses on single-club (`Excelsior`) validation.
  - *Scalability & Contrast Learnings (Eredivisie):*
    - **Dual-Mode Color Roles:** Eredivisie clubs fall into distinct color archetypes (Red/Black like Excelsior/NEC, Red/White like Ajax/Feyenoord/PSV/Sparta/Twente/Utrecht, Yellow/Black or Yellow/Green like NAC/Fortuna/Go Ahead, Blue/White like Heerenveen/PEC Zwolle, and Green/White like FC Groningen).
    - **WCAG Contrast on Yellow/Light Primaries:** Yellow primary clubs (e.g. NAC Breda, Go Ahead Eagles, Fortuna) cannot use white text on primary buttons (contrast ratio ~1.15:1). The theming model requires `colorOnPrimary` (e.g. `#000000` for yellow, `#FFFFFF` for red/blue/dark) and dark-mode adjusted luminance tokens so all CTAs and badges achieve ≥4.5:1 WCAG AA contrast.
    - **Dark Mode Hue Tuning:** Dark backgrounds require slightly higher-luminance primary tones (e.g., Excelsior red `#FF2E44` vs `#E2001A` on dark) to prevent muddy saturated text on dark cards (`#131B2E`).
    - **Dynamic Inversion Labels:** The theme toggle adapts to the club's colors (e.g. Excelsior: *Rood-Zwart* / *Zwart-Rood*; NAC Breda: *Geel-Zwart* / *Zwart-Geel*; Heerenveen: *Blauw-Wit* / *Nacht-Blauw*).
- **Per-Member Notification Preferences:** Granular email/push settings per fixture or event type.
  - *Why not in MVP:* Requires user settings storage and authentication layer.
- **Opt-in Auto-Free at Deadline:** Automatically release unindicated passes to the queue at `kickoff - 24h`.
  - *Why not in MVP:* High-trust group prefers soft countdown reminder without forcing unintended releases.
- **Priority Tiers in Queue:** Priority rules giving members without passes first priority over guest requests.
  - *Why not in MVP:* Strict FCFS is simpler, unambiguous, and matches existing group consensus.
- **Fairness & Attendance Statistics:** Season stats showing attendance rate, passes shared, and queue wait times.
  - *Why not in MVP:* Fun post-season engagement metric, not core for matchday ledger.
- **Away & Cup Games:** Support fixtures outside the standard home league schedule.
  - *Why not in MVP:* Excelsior season tickets only apply to home league matches in MVP.
- **Personal ICS Export:** Subscribe to an iCal feed of matches where you personally have an assigned pass.
  - *Why not in MVP:* Non-critical convenience feature.
- **Expense Settlement (Tikkie Integration):** Track pass costs, guest fees, and generate payment requests.
  - *Why not in MVP:* Financial settlement is handled outside Passie in the group's existing banking app.
- **Admin Audit & Correction View:** Interactive log viewer with rollback/compensating action triggers.
  - *Why not in MVP:* Append-only logs exist in D1 and can be queried or compensated manually if needed.
- **English Locale + Switcher:** Multi-language UI support.
  - *Why not in MVP:* MVP users are Dutch; code and i18n structure are English-ready.
- **Playwright MCP / CI Regression Suite:** Headless browser integration for automated multi-device / multi-context regression tests.
  - *Why not in MVP:* Kilo Code built-in Browser Use + deterministic `scripts/race-check.sh` cover MVP testing.
- **Native App Shell (Capacitor / PWA wrapper):** App Store distribution.
  - *Why not in MVP:* Mobile-first PWA (Add to Home Screen) is instantaneous and zero-maintenance.

---

## Ideas

- **Visual Seat Map:** Stadium diagram showing exact seat positions (Vak, rij, stoel).
- **Physical Card Photo:** Stored pass photo on `/pas/[id]` for gate verification emergencies.
- **Pickup Location Hints:** Member profile default neighborhood/pickup instructions.
- **Season Attendance Leaderboard:** Group gamification of away/home support.
- **Ownership Shares & Payment Tracking:** Co-owner fraction tracking (e.g. 50/50 vs 1/3 splits).
