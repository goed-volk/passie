# ADR 0005: Polling via TanStack Query without Push Notifications

## Status
Accepted

## Context
Passie is actively checked by group members leading up to match kickoff. Real-time WebSockets or push notifications add infrastructure complexity.

## Decision
Use TanStack Query with a 5-second polling interval enabled only when the document tab is visible (`document.hidden === false`), with immediate optimistic UI updates on user action.

## Consequences
- Zero push notification server infrastructure required.
- Minimal battery impact when backgrounded.
- Freshness guaranteed during active matchday interaction.
