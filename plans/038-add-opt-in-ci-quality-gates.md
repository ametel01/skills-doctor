# Plan 038: Add opt-in CI quality gates for warnings and score thresholds

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/cli/index.ts src/cli/commands/scan.ts src/domain/summarize-findings.ts src/domain/calculate-score.ts README.md docs/PRD.md test`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/026-add-packaged-cli-json-smoke.md
- **Category**: direction
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The PRD names maintainers who want repeatable quality gates, and JSON mode already enables automation. Current exit behavior fails only on blocking errors or error diagnostics. Teams that want "no warnings" or "minimum score" must write their own JSON parser instead of using first-class CLI policy flags.

## Current state

```ts
// src/cli/index.ts:12-14
.option("--json", "output one machine-readable JSON report")
.option("--json-compact", "with --json, omit indentation")
.option("-y, --yes", "skip prompts and use conservative defaults")
```

```ts
// src/domain/summarize-findings.ts:35-38
export const resolveScanExitCode = (report: ScanReport): 0 | 1 =>
  report.errorCount > 0 || report.diagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? 1
    : 0;
```

```ts
// src/domain/calculate-score.ts:22
const distinctErrorRuleIds = new Set(...)
```

Product constraint: default behavior should stay unchanged; stricter gates must be opt-in.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused CLI tests | `bun run test -- test/cli-scan.test.ts` | all pass |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/index.ts`
- `src/cli/commands/scan.ts`
- `src/domain/summarize-findings.ts` or a new gate resolver
- README automation docs
- CLI tests

**Out of scope**:
- Changing default exit behavior.
- Adding changed-files-only gating.
- Changing score formula.

## Git workflow

- Branch: `advisor/038-add-opt-in-ci-quality-gates`
- Commit message: `feat: add opt-in scan quality gates`

## Steps

### Step 1: Design narrow flags

Add explicit flags such as:

- `--fail-on <severity>` with allowed values `error`, `warning`, `advice`; default remains `error`.
- `--min-score <number>` where failing score sets exit code 1.

Keep naming and semantics simple. Reject invalid values with `CliInputError`.

**Verify**: `bun run typecheck` passes after flag typing.

### Step 2: Implement gate resolution

Add a resolver that takes `ScanReport` plus gate options and returns `0 | 1`. Preserve current `resolveScanExitCode(report)` for default callers or extend it backward compatibly.

**Verify**: unit tests for default, warning gate, advice gate, and min-score gate pass.

### Step 3: Wire CLI flags

Parse the new flags in `src/cli/index.ts`, pass them into `scanAction`, and set `process.exitCode` from the new gate resolver.

**Verify**: CLI tests show warning-only scans exit 0 by default and exit 1 with `--fail-on warning`.

### Step 4: Document automation usage

Update README JSON/automation section with examples:

```bash
skills-doctor --yes --json --fail-on warning
skills-doctor --yes --json --min-score 95
```

**Verify**: `bun run check` passes.

### Step 5: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- Default exit behavior unchanged.
- `--fail-on warning` fails warning-only scans.
- `--fail-on advice` fails advice-only scans.
- `--min-score` fails below threshold and passes at/above threshold.
- Invalid flag values produce expected user errors.

## Done criteria

- [ ] Strict gates are opt-in.
- [ ] Defaults remain backward compatible.
- [ ] Human and JSON modes use the same gate semantics.
- [ ] README documents examples.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer has not decided flag names or severity semantics.
- Implementing changed-files-only policy becomes necessary; defer it to a separate plan.

## Maintenance notes

Exit-code semantics are automation-facing. Treat future changes as compatibility-sensitive and cover them at the packaged CLI boundary.
