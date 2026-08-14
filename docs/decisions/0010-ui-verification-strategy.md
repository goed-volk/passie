# ADR 0010: UI Verification Strategy (Built-in Browser Automation + Race Check Script)

## Status
Accepted

## Context
Automated end-to-end browser testing can introduce fragile dependencies and heavy MCP server requirements in AI agent workflows.

## Decision
1. Verify FCFS race safety and concurrency deterministically using `scripts/race-check.sh` (concurrent `curl` requests hitting the dev server and inspecting local D1).
2. Use Kilo Code's built-in Browser Use for the single-user golden path walkthrough.
3. Keep `@playwright/mcp` on the post-MVP roadmap.
4. Delegate responsive mobile layout validation to real iOS and Android physical devices.

## Consequences
- Zero external MCP dependencies.
- Deterministic verification of critical concurrency logic.
