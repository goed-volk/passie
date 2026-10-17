# Security Policy

## Security & Authentication Model

Passie enforces verified, passwordless identity and role-based access control backed by **Better Auth** on Cloudflare D1 ([ADR 0014](docs/decisions/0014-identity-via-better-auth-on-d1.md)):

- **Passwordless Verification:** Authentication uses WebAuthn passkeys (Touch ID, Face ID, security keys) as primary credentials, with time-limited (10-minute), rate-limited 6-digit email One-Time Passcodes (OTP) as the bootstrap and fallback factor.
- **Zero Public Sign-Up:** Public registration is disabled across all auth endpoints and database hooks. Member accounts are strictly pre-created and linked by group administrators.
- **Database Sessions:** Sessions are database-backed in Cloudflare D1 with instant server-side revocation upon logout, member deactivation, or email modification. No unauthenticated client-side identity selection is permitted.
- **Role-Based Access Control:** Administrative functions (`/beheer`) are gated by cryptographically verified sessions:
  - **Group Administrators:** Configured via `members.role = 'admin'` to manage group rosters and ticket allocations.
  - **Platform Administrators:** Configured via `auth_user.role = 'admin'` for platform-wide operations.
- **Cross-Origin & CSRF Protection:** Mutating application endpoints enforce strict same-origin verification (`assertSameOrigin`), and Better Auth origin checks validate requests against an explicit trusted origins allowlist (`BETTER_AUTH_TRUSTED_ORIGINS`).
- **Telemetry Privacy:** Client-side telemetry reverse-proxied through `/ingest` strips session cookies and PII. Real names, email addresses, and passkey credentials are never sent to analytics backends.

---

## Reporting a Vulnerability

If you discover a security vulnerability (such as an authentication bypass, database injection, authorization flaw, cross-site request forgery, or credential leakage) in the application code or deployment configuration:

1. **Do not open a public GitHub issue.**
2. Report the vulnerability privately via [GitHub Security Advisories](https://github.com/goed-volk/passie/security/advisories) or by contacting the project maintainers directly.
3. Include detailed reproduction steps, environment details, and the estimated impact.

We take security issues seriously and will acknowledge reports promptly and coordinate a fix prior to public disclosure.
