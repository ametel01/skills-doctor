# Plan 006: Populate elapsed scan duration in reports

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/cli/commands/scan.ts src/cli/utils/json-mode.ts test/cli-scan.test.ts test/reporting.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, dx
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

`ScanReport.elapsedMilliseconds` exists but is always `0`. This makes JSON reports less useful for automation and hides scan performance regressions. The CLI should measure elapsed time around discovery and scanning, including post-handoff re-scans.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - creates reports with `elapsedMilliseconds: 0`.
- `src/cli/utils/json-mode.ts` - stores `startTime` but does not expose it to report construction.
- `test/cli-scan.test.ts` and `test/reporting.test.ts` - CLI/report tests.

Current excerpts:

```ts
// src/cli/commands/scan.ts:107-112
const report = buildScanReport({
  version: options.version ?? "0.0.0",
  directory: cwd,
  elapsedMilliseconds: 0,
  scan,
});
```

```ts
// src/cli/commands/scan.ts:278-284
const nextReport = buildScanReport({
  version: input.version,
  directory: input.cwd,
  elapsedMilliseconds: 0,
  scan: nextScan,
  handoffRequested: true,
});
```

```ts
// src/cli/utils/json-mode.ts:24-28
context = {
  compact: input.compact ?? false,
  directory: input.directory,
  startTime: input.startTime ?? performance.now(),
};
```

Repo conventions:

- Tests often inject dependencies through `ScanActionOptions`; follow that style for deterministic time tests.
- Do not make tests depend on real elapsed wall-clock timing if an injection is simple.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts test/reporting.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `test/reporting.test.ts` if needed
- `src/cli/utils/json-mode.ts` only if you choose to expose/reset timing there

**Out of scope**:

- Changing report schema field names.
- Adding telemetry.
- Optimizing scan performance.

## Git workflow

- Branch: `advisor/006-measure-scan-duration`
- Commit message: `fix: measure scan report duration`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a testable clock to scan action options

Extend `ScanActionOptions` with an optional clock, for example:

```ts
readonly now?: () => number;
```

Inside `scanAction`, set:

```ts
const now = options.now ?? performance.now.bind(performance);
const startedAt = now();
```

Use `Math.max(0, Math.round(now() - startedAt))` when building the first report.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Measure post-handoff re-scan duration

Thread the same clock through `ReviewFindingsInput` and `runRepairAgentFlow()`. For the post-handoff scan, measure only the re-scan/report phase or the full repair flow; choose one and name the behavior in a test. Recommended: measure the post-handoff re-scan duration separately so `nextReport.elapsedMilliseconds` reflects the current scan.

**Verify**: `bun run typecheck` -> exit 0.

### Step 3: Add deterministic tests

Add a CLI test that injects a clock returning controlled values, for example `1000` then `1034`, and assert `report.elapsedMilliseconds === 34`.

If adding post-handoff coverage is cheap, assert the returned post-handoff report also has non-zero elapsed time using controlled clock values.

**Verify**: `bun test test/cli-scan.test.ts test/reporting.test.ts` -> exit 0.

### Step 4: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one deterministic elapsed-time test for the initial scan report.
- Optional: add a post-handoff elapsed-time test if the current test harness makes it straightforward.
- Full verification must pass.

## Done criteria

- [ ] Initial scan report duration is measured, not hard-coded to `0`.
- [ ] Post-handoff report duration is measured or explicitly documented in code/tests.
- [ ] Tests do not rely on real wall-clock timing.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- Timing injection forces broad API churn outside CLI scan orchestration.
- Existing consumers require elapsed time to remain `0`.
- The report-building flow has drifted substantially.

## Maintenance notes

Reviewers should check that duration measurement is monotonic and deterministic in tests. Future performance work can use this field as a baseline.
