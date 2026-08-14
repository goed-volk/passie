# ROADMAP — Passie Backlog

This document outlines features, architectural enhancements, and refinements deferred beyond the MVP.

---

## Next up

- **Cloudflare Zero Trust / Access:** Secure the app with Cloudflare Access JWT validation and email-to-member mapping.
  - *Why not in MVP:* Kept frictionless for friend-group testing via cookie picker.
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
  - *Why not in MVP:* TanStack Query polling is simple, battery-friendly when tab is active, and requires no stateful WebSocket/DO infrastructure.
- **Multi-Group & Multi-Club Onboarding:** Support multiple groups and clubs (Eredivisie & Eerste Divisie) with dynamic club theme selector and logos.
  - *Why not in MVP:* Schema is multi-tenant ready, but MVP focuses on single-club (`Excelsior`) validation.
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
