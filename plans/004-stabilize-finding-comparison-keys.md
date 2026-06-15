# Plan 004: Compare findings with stable, specific keys

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/compare-findings.ts test/compare-findings.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

Post-handoff summaries tell users what the repair agent fixed, what remains, and what is new. The comparison key currently uses only `ruleId` and `skillPath`, so two different findings from the same rule in the same skill can be confused. The summary should distinguish findings by enough fields to avoid false fixed/remaining/new counts.

## Current state

Relevant files:

- `src/domain/compare-findings.ts` - computes fixed, remaining, and new findings.
- `test/compare-findings.test.ts` - existing comparison tests.

Current excerpt:

```ts
// src/domain/compare-findings.ts:66-75
const countFindingKeys = (findings: readonly Finding[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const key = findingKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const findingKey = (finding: Finding): string => `${finding.ruleId}\u0000${finding.skillPath}`;
```

Repo conventions:

- Finding objects include `ruleId`, `skillPath`, optional `line`, `message`, and `suggestion`.
- Comparison tests build synthetic findings and assert exact arrays/counts.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/compare-findings.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/compare-findings.ts`
- `test/compare-findings.test.ts`

**Out of scope**:

- Changing finding generation rules.
- Changing user-facing wording in `renderPostHandoffSummary()` except if tests require stable wording.

## Git workflow

- Branch: `advisor/004-stabilize-finding-comparison-keys`
- Commit message: `fix: compare findings with specific keys`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Expand the comparison key

Update `findingKey()` to include fields that identify the specific issue, not just the rule and file. A safe target key is:

```ts
const findingKey = (finding: Finding): string =>
  [
    finding.ruleId,
    finding.skillPath,
    finding.line ?? "",
    finding.message,
    finding.suggestion,
  ].join("\u0000");
```

Do not include severity unless you want severity changes to show as fixed+new. If uncertain, keep severity out so severity-only tuning does not look like a different finding.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add a regression test for same rule and skill path

Add a test where the previous scan has one finding and the current scan has a different finding with the same `ruleId` and `skillPath` but different `message` or `line`.

Expected result:

- Previous finding is counted as fixed.
- Current finding is counted as new.
- Remaining is empty.

**Verify**: `bun test test/compare-findings.test.ts` -> exit 0.

### Step 3: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one regression test for same `ruleId` + `skillPath` but different issue details.
- Existing comparison tests should continue passing.

## Done criteria

- [ ] Comparison key distinguishes separate same-rule findings in the same skill.
- [ ] Regression test covers fixed/new behavior for changed issue details.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- Existing tests intentionally require same-rule same-skill findings to collapse.
- The finding shape has changed and no stable issue-detail field exists.
- The code has already introduced explicit finding IDs.

## Maintenance notes

Reviewers should confirm the key is stable across harmless wording changes. If future rules add structured metadata, prefer that over message text for comparison.
