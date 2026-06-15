---
name: skills-doctor
description: Use this skill to run Skills Doctor checks, get structured findings, and launch repair handoff flows.
---

Use this skill when a user asks whether to audit Agent Skills for quality, portability, triggers, resource references, or repair-readiness.

The source of truth for all checks is the `skills-doctor` CLI.

## Standard scan

- Run `bunx skills-doctor@latest --json` when the user asks for an automated report.
- Run `bunx skills-doctor@latest --json --json-compact` when output is embedded in another tool.
- Treat scan findings as the canonical result for policy, repair scope, and follow-up work.

## Repair handoff

- Run `bunx skills-doctor@latest` to enter the interactive repair flow only after explicit user consent.
- Prefer a read-only audit first; only launch repair handoff when the user approved.

## Fallback

- If the CLI is unavailable, use `docs/SKILLS_SPEC.md` for rule intent and expected checks.
