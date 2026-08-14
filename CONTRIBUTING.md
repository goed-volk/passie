# Contributing to Passie

Thank you for your interest in contributing to Passie!

## Code of Conduct

Please be respectful, constructive, and collaborative in all interactions across issues, discussions, and pull requests.

## Workflow and Conventions

1. **Architecture & Philosophy:**
   - Review `AGENTS.md` and `docs/architecture.md` before submitting substantial PRs.
   - All domain logic (`src/domain/**`) must remain 100% pure (no I/O, no framework dependencies, no wall-clock time inside reducer functions).
   - All database mutations must use `mutate()` with optimistic concurrency guards.
   - User-facing UI strings must be localized using `src/i18n/` dictionary keys.

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
   - Use fictional seed data in `seed/group.example.json`.
