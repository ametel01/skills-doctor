# Plan 003: Prevent per-skill report filename collisions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/write-findings-directory.ts test/handoff.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

The repair handoff writes one Markdown file per affected skill. If two affected skills have the same `skillName`, the current filename logic writes both to `skills/<name>.md`, causing the later write to overwrite the earlier one. This is realistic when scanning Claude and Codex roots with same-name skills, or local and global roots together.

## Current state

Relevant files:

- `src/domain/write-findings-directory.ts` - writes `findings.json`, `findings.md`, and per-skill Markdown files.
- `test/handoff.test.ts` - covers findings directory output.

Current excerpts:

```ts
// src/domain/write-findings-directory.ts:55-58
for (const group of groupFindingsBySkill(findings)) {
  const skillReportPath = path.join(skillDirectory, `${safeFileName(group.skillLabel)}.md`);
  await writeFile(skillReportPath, renderSkillFindingsMarkdown(group.skillLabel, group.findings));
  skillReportPaths.push(skillReportPath);
}
```

```ts
// src/domain/write-findings-directory.ts:123-134
const groupFindingsBySkill = (findings: readonly Finding[]): readonly SkillFindingGroup[] => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    groups.set(finding.skillPath, [...(groups.get(finding.skillPath) ?? []), finding]);
  }
  return [...groups.entries()]
    .map(([skillPath, skillFindings]) => ({
      skillPath,
      skillLabel: skillFindings[0]?.skillName ?? path.basename(path.dirname(skillPath)),
      findings: skillFindings,
    }))
```

Repo conventions:

- Tests create temp directories with `mkdtemp` and clean them in `afterEach`.
- Output paths are asserted exactly where deterministic.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/handoff.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/write-findings-directory.ts`
- `test/handoff.test.ts`

**Out of scope**:

- JSON report shape except `skillReportPaths` values.
- Handoff prompt grouping.
- Cross-ecosystem divergence rule behavior.

## Git workflow

- Branch: `advisor/003-avoid-report-file-collisions`
- Commit message: `fix: avoid skill report filename collisions`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Make per-skill filenames unique and deterministic

Change the filename generation so it includes enough path-derived information to avoid collisions. A simple target shape is:

```ts
const uniqueLabel = `${group.skillLabel}-${safeFileName(path.relative(report.directory, group.skillPath))}`;
```

Do not include raw path separators in the filename; pass the full composed string through `safeFileName()`.

If `report.directory` is not available at the point of filename creation, thread it through as a helper parameter rather than using `process.cwd()`.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add a collision regression test

In `test/handoff.test.ts`, add a test where two findings have the same `skillName` but different `skillPath` values, for example:

- `/repo/.claude/skills/shared-review/SKILL.md`
- `/repo/.agents/skills/shared-review/SKILL.md`

Call `writeFindingsDirectory()` and assert:

- `result.skillReportPaths` has length `2`.
- The two paths are not equal.
- Both files exist and contain the expected distinct rule IDs.

**Verify**: `bun test test/handoff.test.ts` -> exit 0.

### Step 3: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one regression test for same-name skills with different paths.
- Existing handoff tests should continue passing.

## Done criteria

- [ ] Same-name skills produce distinct per-skill Markdown files.
- [ ] Collision regression test exists and passes.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- A deterministic unique filename cannot be created without leaking unsafe absolute path characters.
- Existing tests or docs require the old `skills/<name>.md` exact filename.
- The current write logic has already been replaced.

## Maintenance notes

Reviewers should inspect generated filenames for readability and safety. Future report output should avoid using display labels as unique identifiers.
