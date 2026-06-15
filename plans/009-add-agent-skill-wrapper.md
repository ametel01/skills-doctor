# Plan 009: Add a companion agent skill for Skills Doctor

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- README.md docs/PRD.md docs/SKILLS_SPEC.md package.json`
> If any in-scope file changed since this plan was written, compare the current product intent against the plan before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

A user asked whether Skills Doctor should be distributed as an agent skill with bundled scripts instead of only as a Bun CLI. The CLI remains valuable for humans and CI, but an agent-native wrapper can make the tool easier for Codex/Claude-style agents to discover and use. The key design constraint is to avoid duplicating the rule engine in Markdown; the skill should invoke the CLI or a bundled script that delegates to the same implementation.

## Current state

Relevant files:

- `README.md` - positions Skills Doctor as a local-first CLI run with `bunx skills-doctor@latest`.
- `docs/PRD.md` - defines the product wedge and local repair handoff.
- `docs/SKILLS_SPEC.md` - defines valid skill shape if this repo ships a sample or installable skill.
- `package.json` - package files currently include `bin/**`, `dist/**`, `scripts/**`, docs/license/readme/changelog.

Current excerpts:

```md
// README.md:1-7
# Skills Doctor

Skills Doctor is a local-first CLI for auditing Agent Skills in project and
user-level skill roots. It scans `.claude/skills/`, `.agents/skills/`, or both,
checks each `SKILL.md` against the local skill quality specification derived
from the Agent Skills standards at <https://agentskills.io/home>, and can hand a
findings-specific repair prompt to `claude` or `codex`.
```

```md
// docs/PRD.md:47-53
- Local-first: scan skill files on disk without uploading content by default.
- Interactive by default: users choose scope, findings to fix, and agent CLI
  through prompts.
- Deterministic scan first: identify structural and heuristic issues before any
  agent is launched.
```

```json
// package.json:9-16
"files": [
  "bin/**",
  "dist/**",
  "scripts/**",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
],
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests | `bun run test` | exit 0 |
| Pack check | `bun run pack:dry-run` | exit 0, intended skill files included if package ships them |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- A new skill directory, recommended `skills/skills-doctor/SKILL.md`, or another maintainer-approved path.
- Optional bundled helper under that skill, for example `skills/skills-doctor/scripts/run-skills-doctor.mjs`.
- `README.md` documenting the skill wrapper.
- `package.json` `files` only if the skill wrapper should ship in the npm package.

**Out of scope**:

- Reimplementing rule regexes in Markdown.
- Removing the Bun CLI.
- Changing scanner behavior.
- Publishing to a marketplace.

## Git workflow

- Branch: `advisor/009-add-agent-skill-wrapper`
- Commit message: `feat: add skills doctor agent skill wrapper`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Decide the skill packaging target

Choose one target and document it in the PR description:

- Repo-local example skill only: create `skills/skills-doctor/SKILL.md` but do not package it.
- Packaged skill artifact: create the skill and include `skills/**` in `package.json.files`.

Recommended for first pass: repo-local example plus docs, unless maintainers explicitly want npm package distribution of the skill.

**Verify**: no command; document the decision in the plan execution notes or PR summary.

### Step 2: Create the skill wrapper

Create a valid Agent Skill with frontmatter:

```md
---
name: skills-doctor
description: Audit Agent Skills for quality, portability, progressive disclosure, missing resources, and repair-readiness. Use this skill when reviewing `.claude/skills`, `.agents/skills`, SKILL.md files, or when a user asks whether skills are well-formed.
---
```

Body requirements:

- Tell the agent to run `bunx skills-doctor@latest --json` when the user wants a scan.
- Tell the agent to use `bunx skills-doctor@latest` for interactive repair handoff only after user consent.
- Explain that the CLI is the source of truth for rules.
- Explain not to duplicate or manually reinterpret every regex unless the CLI cannot run.
- Include fallback guidance for reading `docs/SKILLS_SPEC.md` when offline.

**Verify**: `bunx skills-doctor@latest --json --yes` is not required in this repo because it would scan the developer environment; use `bun run typecheck` to ensure no TS breakage from package changes.

### Step 3: Add a small helper script only if it reduces agent friction

If adding a script, keep it non-interactive by default and document `--help`. It should delegate to the CLI, not duplicate scanner logic.

Example responsibility:

- Resolve whether local `skills-doctor` binary exists.
- Fall back to `bunx skills-doctor@latest`.
- Pass through user flags.

If this script adds complexity or tests are not obvious, skip it for the first pass.

**Verify**: if script is added, run `node skills/skills-doctor/scripts/<script>.mjs --help` -> exit 0 and prints usage.

### Step 4: Document the distribution tradeoff

Update `README.md` with a short section explaining:

- CLI is for CI, humans, deterministic checks.
- Skill wrapper is for agent discovery and invocation.
- Both use the same rule engine.

**Verify**: `bun run check` -> exit 0.

### Step 5: Run packaging and verification gates

If `package.json.files` changes, run `bun run pack:dry-run` and confirm intended files are included.

**Verify**: `bun run verify` -> exit 0.

## Test plan

- If only Markdown/docs are added, run `bun run check` and `bun run verify`.
- If a helper script is added, add or run a direct `--help` smoke test.
- If packaging changes, run `bun run pack:dry-run`.

## Done criteria

- [ ] A valid `skills-doctor` skill wrapper exists or the executor records why it was intentionally not created.
- [ ] The wrapper delegates to the CLI rule engine.
- [ ] README documents CLI vs skill distribution.
- [ ] `bun run verify` exits 0.
- [ ] `bun run pack:dry-run` confirms package contents if packaging changed.

## STOP conditions

Stop and report if:

- The maintainer wants the skill to replace the CLI rather than wrap it.
- A helper script would duplicate scanner rules.
- The package inclusion target is ambiguous and cannot be resolved from docs.

## Maintenance notes

This plan is intentionally a wrapper, not a rewrite. Reviewers should reject duplicated regex/rule logic because it will drift from the CLI.
