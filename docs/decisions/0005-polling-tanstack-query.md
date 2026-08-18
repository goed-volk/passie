# ADR 0005: Polling via TanStack Query without Push Notifications

## Status
Accepted

## Context
Passie is actively checked by group members leading up to match kickoff. Real-time WebSockets or push notifications add infrastructure complexity.

## Decision
Use TanStack Query with a 5-second polling interval enabled only when the document tab is visible (`document.hidden === false`) and refetch on window focus. Mutations perform server-confirmed round-trips with disabled action controls during inflight requests, immediately updating the query cache with the returned snapshot on success, and reporting localized error toasts on 409 Conflict or validation failure.

## Consequences
- Zero push notification or WebSocket server infrastructure required for MVP.
- Minimal battery impact when backgrounded.
- Deterministic matchday freshness during active interaction.
