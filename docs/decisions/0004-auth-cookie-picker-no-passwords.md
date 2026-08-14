# ADR 0004: No Authentication in MVP (Cookie Identity Selection)

## Status
Accepted

## Context
The MVP is used exclusively by a close-knit group of ~15 friends. Complex password management, OAuth providers, or magic links create unnecessary friction for fast matchday polling.

## Decision
Do not implement cryptographic authentication in MVP. Provide a `/wie-ben-jij` member selector that sets an HTTP-only session cookie (`passie_member`). Pair with `noindex` robots headers and visible social timeline accountability.

## Consequences
- Zero-friction onboarding for group members.
- Clear disclosure in docs and security policy that identity is not cryptographically verified.
- Path to Cloudflare Access / Zero Trust documented in `ROADMAP.md`.
