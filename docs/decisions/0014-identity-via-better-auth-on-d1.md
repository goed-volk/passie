# ADR 0014: Identity via Better Auth on D1

## Status
Accepted (Supersedes ADR 0004)

## Context
ADR 0004 intentionally deferred cryptographic authentication during the MVP soft launch, relying on a trusted local circle, an unauthenticated HTTP-only session cookie (`passie_member`), social timeline accountability, and Cloudflare Access NL-bypass.
As Passie expands beyond a single trusted circle and prepares for multi-group operation, verified identity is required to prevent member impersonation, secure administrative functions (`/beheer`), and protect matchday seat allocations.

An exhaustive evaluation of auth architectures for Next.js App Router on Cloudflare Workers (`@opennextjs/cloudflare`) and Cloudflare D1 (SQLite) compared Cloudflare Access, Firebase, Auth0, OpenAuth (SST), and Better Auth:
- **Cloudflare Access:** Workforce ZTNA orientation, requires per-seat licensing beyond 50 users, lacks member self-service/passkeys, and couples every fork to a Cloudflare Zero Trust organization.
- **OpenAuth (SST):** Storage is KV/Dynamo/memory only (no D1), eventual consistency risk on one-time codes, unmaintained since April 2025 with unmerged passkey PRs and open redirect/aud security issues, stateless JWTs preventing instant server-side revocation.
- **Better Auth:** Runs inside the same Worker, native Drizzle SQLite adapter on D1, database-backed sessions offering instant revocation, first-class WebAuthn passkeys and email OTP plugins, active maintenance, and transparent schema generation.

Trade-off: Running auth directly in our deployment requires managing security patches and compute footprint. This is addressed by a strictly bounded minimal-footprint profile.

## Decision
Adopt Better Auth on Cloudflare D1 with the following design and architecture principles (D-1 through D-22):

1. **Exact-Pinned Minimal Footprint (D-1, D-21, §2.5):**
   Install exact versions of `better-auth`, `@better-auth/drizzle-adapter`, and `@better-auth/passkey`. Import strictly from subpaths (e.g. `better-auth/minimal`, `@better-auth/drizzle-adapter`, `better-auth/plugins/email-otp`, `@better-auth/passkey`), never barrel exports. Disable unused core and email-OTP routes via `disabledPaths` (404 response). Passwords, social logins, account linking, user deletion, and the heavy `admin` and `organization` plugins are not installed or enabled.
2. **Table Prefix & Schema Generation (D-2):**
   All auth tables use the `auth_` prefix (`auth_user`, `auth_session`, `auth_account`, `auth_verification`, `auth_passkey`, `auth_rate_limit`) generated into `src/server/authSchema.ts` and managed via Drizzle migrations.
   - **Timestamp Exception (Golden Rule 6):** `auth_*` tables use `timestamp_ms` (`integer(..., { mode: "timestamp_ms" })`) to match Better Auth's internal millisecond Date calculations. Golden Rule 6 (integer unix seconds UTC) remains in strict effect for all domain tables (`game_pools`, `queue_entries`, `fixtures`, etc.).
   - **Concurrency Exception (Golden Rule 2):** Better Auth internal adapter and `src/server/authAdmin.ts` execute direct D1 batch / Drizzle writes against `auth_*` tables, exactly like `src/server/adminMembers.ts`. The aggregate mutation path (`src/server/commit.ts` / `mutate()`) remains strictly reserved for matchday pool state transitions.
   - **Adapter Configuration:** `drizzleAdapter(db, { provider: "sqlite", schema: authSchema, transaction: false })` since D1 does not support interactive transactions.
3. **Domain-Owned Tenancy & Linkage (D-3, D-4):**
   Better Auth `organization` plugin is omitted. Tenancy is owned by domain tables (`groups`, `members`). `members.user_id` is a nullable foreign key referencing `auth_user.id` with a partial unique index `(group_id, user_id) WHERE user_id IS NOT NULL`. Email addresses reside exclusively on `auth_user`.
4. **Zero Public Sign-up (D-5):**
   Public registration is disabled via three complementary defense-in-depth layers:
   - `emailOTP({ disableSignUp: true })`
   - `user.validateUserInfo` rejecting `source.action === "create-user"`
   - `databaseHooks.user.create.before` rejecting adapter-originated creations
   Onboarding is invitation-only: a group admin pre-creates the `auth_user` and links `members.user_id` in an atomic D1 batch (`authAdmin.preCreateUserAndLink`).
5. **Authentication Factors (D-6, D-7):**
   Primary authentication is WebAuthn passkeys (`@better-auth/passkey`) with discoverable credentials (`residentKey: "required"`, `userVerification: "required"`). Email OTP (6 digits, 10-minute TTL, rate-limited) serves as the bootstrap and fallback factor. Timing attacks and account enumeration are mitigated by identical OTP responses and asynchronous mail dispatch via Cloudflare Worker `ctx.waitUntil`.
6. **Database Sessions & Per-Request Factory (D-8, D-9, D-10):**
   Sessions are database-backed (`expiresIn` 60 days, sliding `updateAge` 1 day) without cookie caching (`session.cookieCache.enabled: false`) to ensure instant revocation upon deactivation or admin action.
   Auth instances are constructed per request via `getAuth()` using request-bound Cloudflare context (`getCloudflareContext({ async: true })`). No `proxy.ts` is used; session enforcement occurs server-side via `requireActingMember`.
7. **Role Hierarchy (D-11):**
   Platform admin role is stored in `auth_user.role = 'admin'` (server-only Drizzle writes). Group admin role is stored in `members.role = 'admin'`. Administrative access to `/beheer` is gated by session-verified roles. The legacy `PASSIE_ADMIN_PASSWORD` and `passie_admin_session` cookie are retired.
8. **Test & Dev Harness (D-12):**
   The `testUtils` plugin provides `/api/dev/login-as`, enabled strictly when `PASSIE_ENV !== "production"` and `PASSIE_DEV_LOGIN=1` on localhost. Vitest uses `testUtils({ captureOTP: true })`. Legacy `passie_member` cookie impersonation is completely removed.
9. **Email Transport & Abuse Controls (D-13, D-14, D-15):**
   Emails are dispatched through a provider-agnostic `Mailer` interface (`src/server/email/`), backed by Cloudflare Email Service in production and a console logger in local dev. Better Auth rate limiting uses `auth_rate_limit`. Mutating routes enforce same-origin verification via `assertSameOrigin`.
10. **Telemetry & Privacy (D-16):**
    PostHog tracks `distinct_id = member.id`. Emails and real personal names are strictly excluded from telemetry payloads.

## Consequences
- **Security:** Complete elimination of unauthenticated identity spoofing. Instant session revocation upon member deactivation or email change.
- **User Experience:** Fast, passwordless passkey login with seamless email OTP fallback. Mobile PWA remains fully supported.
- **Architecture Integrity:** Domain logic (`src/domain/**`) and concurrency engine (`src/server/commit.ts`) remain 100% pure and untouched. Auth acts strictly as a perimeter boundary layer.
