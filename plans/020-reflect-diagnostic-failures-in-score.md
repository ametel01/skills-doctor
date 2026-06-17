# Plan 020: Reflect diagnostic failures in score output

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d615d4..HEAD -- src/domain/build-report.ts src/domain/calculate-score.ts src/domain/summarize-findings.ts test/reporting.test.ts test/calculate-score.test.ts test/api-fixtures.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8d615d4`, 2026-06-18

## Why this matters

Reports can be `ok: false` because of blocking diagnostics, such as an unreadable skills root, even when there are no rule findings. Today the score is calculated only from findings, so a diagnostic-only failure can still show a perfect score. That makes human output and JSON consumers understate scan health.

## Current state

- `buildScanReport` detects error diagnostics and sets `ok: false`.
- `resolveScanExitCode` exits with `1` for diagnostic errors.
- `calculateScore` receives only findings, so diagnostics do not affect `score`.
- `test/reporting.test.ts` has a diagnostic-only failure test but does not assert score behavior.

Relevant excerpts:

```ts
// src/domain/build-report.ts:42-62
export const buildScanReport = (input: BuildScanReportInput): ScanReport => {
  const errorCount = countSeverity(input.scan.findings, "error");
  const warningCount = countSeverity(input.scan.findings, "warning");
  const adviceCount = countSeverity(input.scan.findings, "advice");
  const diagnosticErrorCount = countDiagnosticSeverity(input.scan.diagnostics, "error");
  const hasErrorDiagnostics = diagnosticErrorCount > 0;

  return {
    ok: errorCount === 0 && !hasErrorDiagnostics,
    ...
    score: calculateScore(input.scan.findings),
```

```ts
// src/domain/summarize-findings.ts:35-38
export const resolveScanExitCode = (report: ScanReport): 0 | 1 =>
  report.errorCount > 0 || report.diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? 1
    : 0;
```

```ts
// test/reporting.test.ts:64-90
it("fails when diagnostics include blocking errors", async () => {
  const scan = {
    roots: [],
    skills: [],
    findings: [],
    diagnostics: [
      {
        code: "skill-root-unreadable",
        severity: "error",
        message: "Unable to read root",
      },
    ],
  } satisfies ScanResult;
  ...
  expect(report.ok).toBe(false);
  expect(report.findingCount).toBe(0);
  expect(resolveScanExitCode(report)).toBe(1);
});
```

Repo conventions to match:

- Score labels are defined in `src/domain/calculate-score.ts`.
- Public JSON report shape is covered by `test/api-fixtures.test.ts`; prefer changing score values inside the existing shape rather than adding fields.
- The README documents that score penalties are based on distinct error and warning rules, so any diagnostic score policy should be documented if it changes user-facing semantics.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/reporting.test.ts test/calculate-score.test.ts test/api-fixtures.test.ts` | exit 0, tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/build-report.ts`
- `src/domain/calculate-score.ts` only if adding a helper there is cleaner
- `src/domain/summarize-findings.ts` only if summary text needs diagnostic score context
- `test/reporting.test.ts`
- `test/calculate-score.test.ts` only if score helper behavior changes
- `test/api-fixtures.test.ts` only if JSON fixture expectations need adjustment
- `README.md` only if the score policy wording changes

**Out of scope**:
- Changing `ScanReport` schema version.
- Adding diagnostic counts to the JSON report.
- Making warning diagnostics fail the scan.
- Reworking the score model beyond diagnostics.

## Git workflow

- Branch: `advisor/020-reflect-diagnostic-failures-in-score`
- Commit message: `fix: reflect diagnostic failures in scan score`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Choose and encode a minimal diagnostic score policy

Keep the current finding-based score model, but ensure diagnostic errors prevent a perfect score. The smallest acceptable policy is:

- Existing finding penalties remain unchanged.
- Each distinct `diagnostic.code` with severity `"error"` contributes the same penalty as a distinct error rule.
- Warning diagnostics do not affect score unless the maintainer explicitly decides otherwise.

Implement this in `buildScanReport` by adapting diagnostics into score inputs or by adding a small score helper that accepts diagnostic codes. Preserve the existing `ScoreSummary` shape.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add regression coverage for diagnostic-only scoring

Extend the diagnostic-only test in `test/reporting.test.ts` to assert:

- `report.ok` is `false`.
- `report.findingCount` is `0`.
- `report.score.value` is less than `100`.
- `report.score.penalty` is greater than `0`.
- `resolveScanExitCode(report)` is `1`.

Add a second assertion, in the same test or a new one, that warning diagnostics alone do not fail the scan and do not reduce score unless Step 1 intentionally included warning diagnostics.

**Verify**: `bun test test/reporting.test.ts` -> exit 0.

### Step 3: Refresh score documentation if needed

If Step 1 changes the user-facing score policy, update the README score paragraph so it mentions blocking diagnostics. Keep the wording short and factual.

Current README excerpt:

```md
The score starts at 100 and deducts 1.5
points for each distinct error rule and 0.75 points for each distinct warning
rule; repeated findings from the same rule do not increase the penalty.
```

**Verify**: `bun run check` -> exit 0.

## Test plan

- Add diagnostic-only and warning-diagnostic score assertions in `test/reporting.test.ts`.
- Run `bun test test/reporting.test.ts test/calculate-score.test.ts test/api-fixtures.test.ts`.
- Run `bun run verify`.

## Done criteria

- [ ] Diagnostic-only blocking failures cannot report a perfect score.
- [ ] Warning-only diagnostics remain non-blocking.
- [ ] JSON report shape remains stable.
- [ ] README score wording matches the implemented policy if the policy changed.
- [ ] `bun test test/reporting.test.ts test/calculate-score.test.ts test/api-fixtures.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 020 `DONE`.

## STOP conditions

Stop and report back if:

- The fix requires a `ScanReport` schema version bump.
- Existing consumers or tests require diagnostic failures to keep a perfect score.
- The score policy becomes more complex than distinct diagnostic-code penalties.

## Maintenance notes

The score is a scan-health signal, not a complete diagnostic model. Reviewers should make sure the score and `ok` fields cannot contradict each other for blocking root-level failures.
