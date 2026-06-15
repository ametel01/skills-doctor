# Plan 002: Include scan diagnostics in reports and exit-code decisions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/types.ts src/domain/scan-skills.ts src/domain/build-report.ts src/domain/summarize-findings.ts test/reporting.test.ts test/domain-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

`scanSkillRoots()` records diagnostics for unreadable roots, but `buildScanReport()` does not expose diagnostics or consider error diagnostics when setting `ok` and exit code. That means automation can receive a successful report even when part of the selected scan failed. Reports should preserve diagnostics, and an error diagnostic should make the scan fail.

## Current state

Relevant files:

- `src/domain/types.ts` - defines `Diagnostic` and `ScanResult`.
- `src/domain/scan-skills.ts` - records unreadable-root diagnostics.
- `src/domain/build-report.ts` - builds JSON/human report fields but drops diagnostics.
- `src/domain/summarize-findings.ts` - determines process exit code from findings only.
- `test/reporting.test.ts` and `test/domain-scan.test.ts` - current report and scan coverage.

Current excerpts:

```ts
// src/domain/scan-skills.ts:18-27
const entries = await readdir(root.rootPath, { withFileTypes: true }).catch(
  (error: unknown) => {
    diagnostics.push({
      code: "skill-root-unreadable",
      severity: "error",
      message: error instanceof Error ? error.message : `Unable to read ${root.rootPath}`,
      path: root.rootPath,
    });
    return [];
  },
);
```

```ts
// src/domain/build-report.ts:41-58
export const buildScanReport = (input: BuildScanReportInput): ScanReport => {
  const errorCount = countSeverity(input.scan.findings, "error");
  const warningCount = countSeverity(input.scan.findings, "warning");
  const adviceCount = countSeverity(input.scan.findings, "advice");

  return {
    schemaVersion: 1,
    ok: errorCount === 0,
```

```ts
// src/domain/summarize-findings.ts:35
export const resolveScanExitCode = (report: ScanReport): 0 | 1 => (report.errorCount > 0 ? 1 : 0);
```

Repo conventions:

- Domain functions are pure where possible and covered through Vitest tests.
- Report schema uses `schemaVersion: 1`; adding an optional/explicit field is acceptable but should be tested.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/reporting.test.ts test/domain-scan.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/types.ts`
- `src/domain/build-report.ts`
- `src/domain/summarize-findings.ts`
- `test/reporting.test.ts`
- `test/domain-scan.test.ts`

**Out of scope**:

- Changing how roots are discovered.
- Changing finding severity semantics.
- Changing CLI prompts.

## Git workflow

- Branch: `advisor/002-preserve-scan-diagnostics`
- Commit message: `fix: preserve scan diagnostics in reports`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add diagnostics to the public scan report

Extend `ScanReport` in `src/domain/build-report.ts` with a `diagnostics` field typed as `readonly Diagnostic[]`. Import `Diagnostic` from `src/domain/types.ts`. Populate it from `input.scan.diagnostics`.

Also compute diagnostic counts or at least `hasErrorDiagnostics` inside `buildScanReport()`.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Make report success account for error diagnostics

Change `ok` so it is true only when there are no error findings and no diagnostics with `severity === "error"`.

Keep existing finding counts unchanged. Do not mix diagnostics into `findingCount`; diagnostics are scan-level facts, not skill-quality findings.

**Verify**: `bun run typecheck` -> exit 0.

### Step 3: Make exit code account for error diagnostics

Update `resolveScanExitCode(report)` so it returns `1` if `report.errorCount > 0` or if any `report.diagnostics` item has severity `"error"`.

**Verify**: `bun run typecheck` -> exit 0.

### Step 4: Add regression tests

Add tests covering a report built from a scan result with no findings but one error diagnostic:

- `report.ok` is false.
- `report.diagnostics` contains the diagnostic.
- `resolveScanExitCode(report)` returns `1`.

Use existing report test style in `test/reporting.test.ts`.

**Verify**: `bun test test/reporting.test.ts test/domain-scan.test.ts` -> exit 0.

### Step 5: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one focused report test for diagnostics-only failure.
- Preserve existing tests for finding-based failures.
- Full `bun run verify` must pass.

## Done criteria

- [ ] `ScanReport` includes diagnostics.
- [ ] Error diagnostics make `ok: false`.
- [ ] Error diagnostics make `resolveScanExitCode()` return `1`.
- [ ] Tests cover diagnostics-only failure.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- The change would require bumping `schemaVersion` and the maintainer has not approved it.
- Existing consumers require `ScanReport` to omit diagnostics.
- The code has drifted and diagnostics are already handled elsewhere.

## Maintenance notes

Reviewers should confirm that diagnostics remain distinct from findings. Future diagnostics should use severity consistently because automation will now treat `error` as a failing scan.
