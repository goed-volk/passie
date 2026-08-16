# Contributing to Passie

Thank you for your interest in contributing to Passie!

## Getting Started

Before contributing, please read the [README.md](README.md) for a general overview of the project, user experience, and local development setup.

## Code of Conduct

Please be respectful, constructive, and collaborative in all interactions across issues, discussions, and pull requests.

## Workflow and Conventions

1. **Architecture & Philosophy:**
   - Review `AGENTS.md` and `docs/architecture.md` before submitting substantial PRs.
   - **Domain Purity (`src/domain/**`):** All core business logic (seat allocation, queue ordering, and pass lifecycle transitions) is implemented as pure state reducer functions.
     - **Why it matters:** Pure functions have no side effects, never read from network/disk, and do not reference non-deterministic inputs like `Date.now()`, `Math.random()`, or environment variables. All state, timestamps, IDs, and actor context are explicitly passed in as arguments `(state, action, context) -> { nextState, events }`. This makes business rules 100% deterministic, testable in milliseconds with zero database mocks, and safe to execute inside optimistic concurrency retry loops without partial state leakage.
     - **Rule:** Never import `next/*`, Drizzle ORM, or database clients into `src/domain/**`.
   - **Atomic Mutations:** All database writes must go through `mutate()` in `src/server/commit.ts`, computing diff statements in memory and executing them in an atomic D1 `batch()` guarded by a `version` check.
   - **Localization:** User-facing UI strings must be localized using `src/i18n/` dictionary keys.

2. **Branching & Commits:**
   - Write readable, accessible, functional, short commit messages in plain English without semantic prefixes like "chore:" or "feat:".
   - Keep pull requests focused on a single change or feature.

3. **Pre-commit Verification:**
   Before pushing or requesting review, ensure all checks pass:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   pnpm build
   ```

4. **Privacy:**
   - Never commit real names, phone numbers, email addresses, or API secrets.
   - Use fictional seed data in `seed/group.example.json`. Keep real group information in untracked `seed/group.local.json`.
