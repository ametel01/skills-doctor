# Plan 034: Index findings once for reports and grouped output

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/domain/build-report.ts src/domain/write-findings-directory.ts src/domain/build-handoff-prompt.ts src/cli/commands/scan.ts test`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

Report construction and grouped output repeatedly filter or copy findings arrays. This is fine for tiny fixtures, but scanning global roots or generated findings can make JSON mode and repair handoff slower than necessary. A shared grouping helper reduces duplicated logic and keeps ordering behavior explicit.

## Current state

```ts
// src/domain/build-report.ts:67-70
skills: input.scan.skills.map((skill) => {
  const skillFindings = input.scan.findings.filter(
    (finding) => finding.skillPath === skill.skillPath,
  );
```

```ts
// src/domain/write-findings-directory.ts:124-128
const groups = new Map<string, Finding[]>();
for (const finding of findings) {
  groups.set(finding.skillPath, [...(groups.get(finding.skillPath) ?? []), finding]);
}
```

```ts
// src/cli/commands/scan.ts:439-444
const groups = new Map<string, Finding[]>();
for (const finding of findings) {
  const key = finding.skillName ?? finding.skillPath;
  groups.set(key, [...(groups.get(key) ?? []), finding]);
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/reporting.test.ts test/handoff.test.ts test/cli-scan.test.ts` | all pass |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/build-report.ts`
- `src/domain/write-findings-directory.ts`
- `src/domain/build-handoff-prompt.ts`
- `src/cli/commands/scan.ts`
- New shared helper under `src/domain/` if useful
- Existing tests for reports, handoff, CLI output

**Out of scope**:
- Changing report schema.
- Changing user-visible sort order.
- Adding external dependencies.

## Git workflow

- Branch: `advisor/034-index-findings-once`
- Commit message: `perf: reuse grouped findings`

## Steps

### Step 1: Add a shared grouping helper

Create a domain helper, for example `src/domain/group-findings.ts`, that groups findings by `skillPath` using `push` instead of array spreading. Include deterministic ordering helpers only where needed.

**Verify**: `bun run typecheck` passes.

### Step 2: Use the helper in report building

Update `buildScanReport` to compute the grouped findings once and use it when building each `SkillSummary`. Preserve counts and ordering.

**Verify**: `bun run test -- test/reporting.test.ts test/api-fixtures.test.ts` passes.

### Step 3: Use the helper in handoff/report rendering

Replace local grouping implementations in `write-findings-directory.ts` and `build-handoff-prompt.ts`. Preserve existing output order and filenames.

**Verify**: `bun run test -- test/handoff.test.ts` passes.

### Step 4: Update CLI by-skill rendering carefully

Either reuse the helper or keep a small CLI-specific grouping if grouping by display label is semantically different. If using the helper, preserve `renderFindingsBySkill` output from current tests.

**Verify**: `bun run test -- test/cli-scan.test.ts` passes.

### Step 5: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- Existing report, handoff, and CLI tests should catch order/schema drift.
- Add a small helper unit test only if the helper has nontrivial sorting behavior.

## Done criteria

- [ ] Report building no longer filters all findings once per skill.
- [ ] Repeated grouping uses `push` or equivalent linear accumulation.
- [ ] User-visible ordering and schemas are unchanged.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Preserving order requires behavior not encoded in tests and the maintainer cannot decide expected order.
- The helper would create circular imports.

## Maintenance notes

Future report or prompt surfaces should reuse the helper to avoid reintroducing slightly different grouping rules.
