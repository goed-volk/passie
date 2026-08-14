# ADR 0009: Strict i18n Dictionary Discipline (Dutch MVP)

## Status
Accepted

## Context
Passie is tailored for a Dutch supporter group, but future multi-club expansion and open-source contributions require clean separation of code, documentation, and user-facing copy.

## Decision
Code, comments, commits, and documentation are written in English. All user-facing UI text must be routed through `t()` with keys defined in `src/i18n/nl.ts`. Hardcoded Dutch literals in components are prohibited and lint-checked.

## Consequences
- Clean codebase ready for additional languages.
- Consistent terminology across all screens.
