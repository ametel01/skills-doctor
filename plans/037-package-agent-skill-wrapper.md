# Plan 037: Package the agent skill wrapper as a distribution path

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- package.json README.md skills/skills-doctor/SKILL.md test`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The repo already has an agent-facing wrapper skill and README documents "Distribution as an Agent Skill", but npm package contents exclude `skills/**`. Shipping the wrapper gives agent users a direct discovery/install path without cloning the repository. It also creates a versioned artifact, so the package surface and docs need to be explicit.

## Current state

```md
<!-- README.md:32-41 -->
## Distribution as an Agent Skill
Skills Doctor is also available as an agent-facing skill wrapper at `skills/skills-doctor/SKILL.md`.
```

```md
<!-- skills/skills-doctor/SKILL.md:1-4 -->
---
name: skills-doctor
description: Use this skill to run Skills Doctor checks, get structured findings, and launch repair handoff flows.
---
```

```json
// package.json:16-23
"files": [
  "bin/**",
  "dist/**",
  "scripts/**",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
]
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Package dry run | `bun run pack:dry-run` | output includes `skills/skills-doctor/SKILL.md` if shipping |
| Verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `package.json`
- `README.md`
- `skills/skills-doctor/SKILL.md` only if wrapper copy needs minor packaging-safe wording
- Tests or package dry-run assertions if added

**Out of scope**:
- Duplicating scanner logic in the skill wrapper.
- Creating an installer for every client.
- Changing CLI rule behavior.

## Git workflow

- Branch: `advisor/037-package-agent-skill-wrapper`
- Commit message: `feat: package skills doctor agent skill`

## Steps

### Step 1: Confirm distribution policy

Decide whether npm should include `skills/skills-doctor/SKILL.md`. If the maintainer rejects this direction, mark this plan `REJECTED` in `plans/README.md` with the rationale and stop.

**Verify**: decision is recorded in the PR/commit message or plan status.

### Step 2: Include the wrapper in package files

If accepted, add `skills/**` to `package.json` `files`.

**Verify**: `bun run pack:dry-run` output includes `skills/skills-doctor/SKILL.md`.

### Step 3: Document install/copy usage

Update README with a concrete example for users who install from npm and want to copy or reference the wrapper. Keep the CLI as source of truth; do not tell users the skill itself performs scanning logic.

**Verify**: `bun run check` passes.

### Step 4: Run full gates

**Verify**: `bun run verify && bun run pack:dry-run` exits 0.

## Test plan

- Package dry-run is the main verification.
- Optional: add a test/script that checks expected package files if the repo has a pattern for packaging assertions.

## Done criteria

- [ ] Maintainer distribution policy is clear.
- [ ] If accepted, npm package includes `skills/skills-doctor/SKILL.md`.
- [ ] README explains how to use the packaged wrapper.
- [ ] `bun run verify` and `bun run pack:dry-run` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer does not want npm to ship agent skills.
- Package dry-run output cannot be made stable without changing release tooling.

## Maintenance notes

Keep the wrapper thin. Any rule logic belongs in the CLI and docs, not duplicated inside `SKILL.md`.
