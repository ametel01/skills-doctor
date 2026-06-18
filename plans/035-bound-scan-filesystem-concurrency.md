# Plan 035: Add bounded filesystem concurrency to skill scanning

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/domain/scan-skills.ts src/domain/rules/quality.ts test/domain-scan.test.ts test/api-fixtures.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

`scanSkillRoots` reads roots and child `SKILL.md` files serially. Users scanning both project and global skill roots pay the sum of filesystem latency before validation starts. Bounded concurrency can improve scan latency while keeping deterministic output order.

## Current state

```ts
// src/domain/scan-skills.ts:18-38
for (const root of input.roots) {
  const entries = await readdir(root.rootPath, { withFileTypes: true }).catch(...);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillDir, "SKILL.md");
    content = await readFile(skillPath, "utf8");
```

```ts
// src/domain/rules/quality.ts:23
const perSkillFindings = await Promise.all(skills.map(validateSkillQuality));
```

Existing tests assume stable order in several places, including `test/domain-scan.test.ts:106` and fixture API tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/domain-scan.test.ts test/api-fixtures.test.ts` | all pass |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/scan-skills.ts`
- Test coverage under `test/domain-scan.test.ts`

**Out of scope**:
- Changing public `ScanResult` shape.
- Recursively scanning nested directories.
- Parallelizing quality rule semantics beyond existing `Promise.all`.

## Git workflow

- Branch: `advisor/035-bound-scan-filesystem-concurrency`
- Commit message: `perf: bound concurrent skill file reads`

## Steps

### Step 1: Add deterministic ordering coverage

Add a test with multiple roots and multiple skill directories whose names would reveal ordering drift. Assert `scan.skills.map((skill) => skill.skillPath)` remains deterministic across repeated scans.

**Verify**: focused test passes on current serial implementation.

### Step 2: Collect read tasks before reading files

Refactor `scanSkillRoots` to:

- Read root directory entries.
- Sort entries by `entry.name` if deterministic ordering is not already guaranteed.
- Build tasks containing root index and entry index.
- Read `SKILL.md` with bounded concurrency.

Use a tiny local concurrency helper; do not add a dependency.

**Verify**: `bun run typecheck` passes.

### Step 3: Preserve diagnostics and skip semantics

Keep these behaviors unchanged:

- Unreadable root adds `skill-root-unreadable`.
- Missing direct-child `SKILL.md` is ignored.
- Unreadable existing `SKILL.md` adds `skill-file-unreadable`.
- Other skills continue scanning.

Sort/flatten results by original root/entry indexes before returning.

**Verify**: `bun run test -- test/domain-scan.test.ts` passes.

### Step 4: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- Existing unreadable file/root tests keep behavior stable.
- New order test protects deterministic output after concurrency.

## Done criteria

- [ ] Skill file reads use bounded concurrency.
- [ ] `ScanResult.skills`, diagnostics, and findings order remain deterministic.
- [ ] Missing-skill child directories remain ignored.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Deterministic ordering conflicts with existing public expectations.
- The concurrency helper becomes complex enough to warrant separate design review.

## Maintenance notes

Keep the concurrency limit conservative. This is a local filesystem scanner, not a benchmark harness; determinism matters more than maximum throughput.
