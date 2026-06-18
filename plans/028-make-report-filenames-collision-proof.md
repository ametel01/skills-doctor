# Plan 028: Make per-skill report filenames collision-proof

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/domain/write-findings-directory.ts test/handoff.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

Plan 003 fixed common per-skill report collisions by including the skill path in filenames. The current implementation still truncates sanitized filenames to 80 characters, so two long same-prefix paths can collapse to the same target and overwrite one report. Repair handoff can silently lose details for one affected skill.

## Current state

```ts
// src/domain/write-findings-directory.ts:55-58
const uniqueLabel = `${group.skillLabel}-${safeFileName(path.relative(input.report.directory, group.skillPath))}`;
const skillReportPath = path.join(skillDirectory, `${uniqueLabel}.md`);
await writeFile(skillReportPath, renderSkillFindingsMarkdown(group.skillLabel, group.findings));
```

```ts
// src/domain/write-findings-directory.ts:138-143
const safeFileName = (value: string): string =>
  value.toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "skill";
```

Existing related coverage: `test/handoff.test.ts:89` verifies same-name skills in different roots do not collide.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/handoff.test.ts` | all pass |
| Check | `bun run check` | exit 0 |
| Full tests | `bun run test` | all pass |

## Scope

**In scope**:
- `src/domain/write-findings-directory.ts`
- `test/handoff.test.ts`

**Out of scope**:
- Changing report directory layout beyond per-skill filenames.
- Changing `findings.json` or `findings.md` schema/content.

## Git workflow

- Branch: `advisor/028-make-report-filenames-collision-proof`
- Commit message: `fix: prevent truncated report filename collisions`

## Steps

### Step 1: Add a truncation-collision test

In `test/handoff.test.ts`, create two findings whose `skillPath` values differ only after the first 80 sanitized characters. Call `writeFindingsDirectory` and assert:

- `skillReportPaths` has length 2.
- The two paths are distinct.
- Each file contains the expected distinct rule ID.

**Verify**: `bun run test -- test/handoff.test.ts` fails before implementation.

### Step 2: Add deterministic uniqueness

Update filename generation to include a deterministic short hash of the full relative skill path, or a deterministic collision counter. Prefer a hash from Node's built-in `crypto`:

```ts
createHash("sha256").update(value).digest("hex").slice(0, 8)
```

Keep the readable prefix, but append the hash after truncation.

**Verify**: `bun run test -- test/handoff.test.ts` passes.

### Step 3: Run gates

Run focused and full gates.

**Verify**: `bun run check && bun run typecheck && bun run test` exits 0.

## Test plan

- Keep existing same-name different-root test.
- Add long same-prefix collision regression.
- Assert contents, not only path count.

## Done criteria

- [ ] Long same-prefix skill report filenames are distinct.
- [ ] Existing report filenames remain readable.
- [ ] `bun run check`, `bun run typecheck`, and `bun run test` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The fix requires changing report JSON schema.
- A maintainer requires stable exact filenames from previous releases.

## Maintenance notes

Per-skill report file paths are user-facing but not documented as stable. Prefer deterministic hashed names over global mutable counters for reproducible handoff artifacts.
