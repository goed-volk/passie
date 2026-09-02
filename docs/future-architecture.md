# Future Architectural Notes & Implementation Findings

This document records technical research, domain engine constraints, and forward-compatibility findings for features on the product roadmap (`ROADMAP.md`).

---

## 1. Direct Pass Transfer & Delegation (*Pas Overdragen*)

### Domain & Queue Engine Mechanics
- **Monotonic Queue Tagging:** When an owner delegates a pass directly to a recipient (member or custom guest name), a new `queue_entry` is created with a strictly monotonic SQLite `AUTOINCREMENT id`, tagged with `kind: "delegated"` and `delegated_from_pass_id: passId`.
- **Direct Assignment:** The pure reducer transitions `pass_game_states.status = 'assigned'` bound to this specific queue entry, bypassing the general FIFO waitlist without disrupting the position of waiting entries.
- **Auditable Compensation:** Appends a transparent `pass.delegated` event to `activity_events` recording `{ passId, ownerMemberId, recipientName }` for group timeline auditability.
- **Cancellation & Reversion:** If the delegated recipient yields or cancels, the pass reverts to `unindicated` for the owner to re-indicate or release.

---

## 2. Member & Pass Administration (`/beheer`)

### Delivered in v0.1.1
- Password-gated `/beheer` area for member creation, profile edits, distinct avatar color assignment, visual drag-and-drop sort ordering, and guarded deactivation.

### Pass CRUD & Ownership Constraints (Deferred)
1. **`passes.isActive` Inconsistency Across Aggregates:**
   - `src/server/ensurePool.ts` filters `isActive = 1` when creating `pass_game_states`.
   - `src/server/repo.ts` (`loadGamePoolState`) and `src/server/snapshot.ts` (`buildPoolSnapshot`) select group passes without an `isActive` filter.
   - Deactivating a pass has no effect on already-open pools, and adding a pass mid-season leaks into open pools as `unindicated`. Pass CRUD requires defining whether pool pass membership is snapshotted at pool creation or synchronized live.
2. **Pool Reconciliation Path:**
   - `members` sits outside `GamePoolState` and carries no `version` column, allowing direct guarded D1 batch writes (`src/server/adminMembers.ts`).
   - `passes` sits *inside* the aggregate. Modifying passes while pools are open must execute via `mutate()` + the pure reducer (e.g. a `SyncPoolPasses` action) or an explicit `pass_game_states` backfill.
3. **`pass_owners` Live Resolution:**
   - `src/server/repo.ts` reads owners live rather than snapshotting them into pool state, so editing ownership immediately modifies `canIndicate` / `canReclaim` permissions for open matchdays.
4. **Retroactive Event Text on Pass Rename:**
   - Timeline text resolves pass labels live via `passLabelsMap`. Renaming a pass retroactively changes past activity event copy. Future pass CRUD must choose between retroactive label updates or snapshotting `passLabel` into `activity_events.payloadJson`.

### Member Self-Service Sequencing
5. **Gated on Verified Identity (v0.2):**
   - The `passie_member` cookie is an unauthenticated selector (Golden Rule #9). Self-service profile editing before verified identity exists would allow arbitrary users to modify other members' profiles.
6. **S5 Allowlist Reusability:**
   - Self-service reuses `updateMember()` with an allowlist restricted to `displayName`, `initials`, and `avatarColor`. `isActive`, `sortOrder`, `slug`, and other members' IDs remain protected.

### Auth Evolution & Forward-Compatibility Seams
7. **SSO & Group Admin Seams:**
   - `src/server/adminAuth.ts` uses structured `v1.<b64url>.<hmacHex>` tokens with salted HMAC key derivation, `AdminPrincipal` (`subject`, `method`, `memberId`), and `assertCapability(principal, cap)` to allow transitioning to Cloudflare Access SSO and per-member group admins without rewriting call sites or schemas.
8. **Role Schema Evolution:**
   - Prefer `members.role text NOT NULL DEFAULT 'member'` over a boolean flag when per-member admin roles are introduced.
9. **Rate-Limiting & Access Transition:**
   - Transition from shared password authentication to Cloudflare Access for Workers verified identity, or introduce IP-based attempt rate-limiting on `POST /api/admin/session` before public deployment.

---

## 3. Verified Identity via Cloudflare Access for Workers (v0.2)

- **Worker-Level Policy:** Switch Worker-level Access policy from `bypass` to `allow` with email OTP / IdP allowlist.
- **Server Identity Contract:** Read verified identity server-side via `ctx.access.getIdentity()`, eliminating JWT signature parsing or public key certificate rotation.
- **Email Mapping & Analytics:** Map verified email to `members.access_email`, retain `passie_member` cookie as a development fallback, and bind email to `posthog.identify()`.
- **Local Dev Simulation:** Configured in `wrangler.jsonc` via `"access": { "dev": { "aud": "...", "identity": { "email": "..." } } }`.

---

## 4. Realtime Streaming (SSE + Durable Objects)

- **Worker-Level Access Constraint:** Worker-level Cloudflare Access policies support SSE (plain HTTP streaming) natively, but return `403` on WebSocket connection upgrades. SSE is the architecture of choice for push updates without hostname-level Access migration.
- **Polling Parity:** Server-Sent Events will push state updates from a per-game Durable Object, replacing 5-second polling while keeping snapshot shapes identical.

---

## 5. Multi-Club Onboarding & Accessible Color Science

- **Color Archetypes:** Eredivisie clubs fall into distinct color schemes (Red/Black, Red/White, Yellow/Black, Yellow/Green, Blue/White, Green/White).
- **Light/Yellow Primary Contrast (WCAG AA):** Clubs with light or yellow primaries (e.g. NAC Breda, Go Ahead Eagles) cannot use white text on primary buttons (contrast ratio ~1.15:1). The theming model requires `colorOnPrimary` (`#000000` for yellow, `#FFFFFF` for dark/saturated) and dark-mode adjusted luminance tokens so all CTAs achieve ≥4.5:1 WCAG AA contrast.
- **Dark Mode Hue Tuning:** Dark backgrounds (`#0B0F19` / `#131B2E`) require higher-luminance primary tones to prevent muddy contrast.
- **Dynamic Inversion Labels:** Theme toggle labels adapt to club colors (e.g. Excelsior: *Rood-Zwart* / *Zwart-Rood*; NAC Breda: *Geel-Zwart* / *Zwart-Geel*).
