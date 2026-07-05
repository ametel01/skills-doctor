---
name: skills-doctor
description: Use this skill when the user asks to audit Agent Skills, scan skill quality/security findings, inspect skill portability, or launch a Skills Doctor repair handoff.
---

Use this skill when a user asks whether to audit Agent Skills for quality, portability, triggers, resource references, security findings, or repair readiness.

The source of truth for all checks is the `skills-doctor` CLI.

## Standard scan

- Run `skills-doctor --json` when the user asks for an automated report.
- Run `skills-doctor --json --json-compact` when output is embedded in another tool.
- Run `skills-doctor --help` if the local command interface is unclear.
- Treat scan findings as the canonical result for policy, repair scope, and follow-up work.

## Repair handoff

- Run `skills-doctor` to enter the interactive repair flow only after explicit user consent.
- Prefer a read-only audit first; only launch repair handoff when the user approved.

## Fallback

- If the CLI is unavailable, use `docs/SKILLS_SPEC.md` for rule intent and expected checks.
- Do not fetch or run a remote package-runner fallback unless the user explicitly approves the exact version or release automation supplies it.
