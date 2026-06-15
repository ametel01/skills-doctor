# Plan 016: Hide repair subset choices that select no findings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3433e24..HEAD -- src/cli/utils/handoff-to-agent.ts test/handoff.test.ts`
> If either in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3433e24`, 2026-06-16

## Why this matters

The repair handoff prompt always offers "Blocking errors only", even when a scan has only warnings or advice. If the user chooses that empty subset, the flow errors with "No findings were selected for repair" instead of letting them repair the findings they can see. This is a small interactive correctness bug in the main product path.

## Current state

- `src/cli/utils/handoff-to-agent.ts` owns repair subset selection and handoff preparation.
- `test/handoff.test.ts` covers subset filtering and empty selected-skill handling, but not warning-only or advice-only reports.
- `src/cli/commands/scan.ts` only enters repair flow when `report.findingCount > 0`, so `chooseRepairFindings` can assume there is at least one finding.

Relevant current excerpts:

```ts
// src/cli/utils/handoff-to-agent.ts:35-37
const findings = await chooseRepairFindings(input.report, input.prompts);
if (findings.length === 0) {
  throw new CliInputError("No findings were selected for repair.");
}
```

```ts
// src/cli/utils/handoff-to-agent.ts:72-80
const subset = await prompts.select<RepairFindingSubset>("Choose findings to repair", [
  { name: "Blocking errors only", value: "errors" },
  { name: "Blocking errors and warnings", value: "errors-and-warnings" },
  { name: "All findings", value: "all" },
  { name: "Selected skills", value: "selected-skills" },
]);

if (subset === "errors") {
  return report.findings.filter((finding) => finding.severity === "error");
}
```

```ts
// test/handoff.test.ts:129-147
it("selects blocking errors plus warnings and writes a prompt file", async () => {
  const findings = [
    makeFinding({ severity: "error", ruleId: "error-rule" }),
    makeFinding({ severity: "warning", ruleId: "warning-rule" }),
    makeFinding({ severity: "advice", ruleId: "advice-rule" }),
  ];
```

Repo conventions to match:

- Tests use Vitest with temporary directories and direct helper calls.
- Prompt adapters in tests are small fakes returning queued or fixed values.
- User-facing errors for expected interactive problems use `CliInputError`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/handoff.test.ts` | exit 0, handoff tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/utils/handoff-to-agent.ts`
- `test/handoff.test.ts`

**Out of scope**:
- `src/cli/commands/scan.ts` repair menu ordering.
- Agent detection and launch behavior in `src/cli/utils/launch-agent.ts`.
- Changing repair subset names in the public README unless a maintainer asks for copy updates.

## Git workflow

- Branch: `advisor/016-hide-empty-repair-subsets`
- Commit message: `fix: hide empty repair subset choices`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Build subset choices from available findings

In `src/cli/utils/handoff-to-agent.ts`, change `chooseRepairFindings` so the prompt choices are computed from counts:

- Include `Blocking errors only` only when `report.errorCount > 0`.
- Include `Blocking errors and warnings` only when `report.errorCount + report.warningCount > 0`.
- Always include `All findings` when `report.findingCount > 0`.
- Always include `Selected skills` when there is at least one skill with findings.

Keep the `RepairFindingSubset` union unchanged unless TypeScript requires a narrower internal helper type.

**Verify**: `bun run typecheck` -> exit 0, no TypeScript errors.

### Step 2: Preserve the existing no-selection guard

Keep the `findings.length === 0` guard in `prepareRepairHandoff`. It still protects selected-skill checkbox cancellation and unexpected fake prompt values.

Do not change the error message unless a new test requires it.

**Verify**: `bun test test/handoff.test.ts` -> existing tests still pass.

### Step 3: Add regression tests for warning-only and advice-only reports

In `test/handoff.test.ts`, add tests that call `prepareRepairHandoff` with:

- A report containing only one warning finding. Assert the fake prompt sees no `errors` choice, selecting `all` succeeds, and the returned findings contain the warning.
- A report containing only one advice finding. Assert the fake prompt sees neither `errors` nor `errors-and-warnings`, selecting `all` succeeds, and the returned findings contain the advice.

If the existing `fakePrompts` helper cannot inspect choices, extend it narrowly so tests can capture the choices passed to `select` without changing unrelated prompt tests.

**Verify**: `bun test test/handoff.test.ts` -> exit 0, new tests pass.

## Test plan

- Add focused unit coverage in `test/handoff.test.ts`.
- Use the existing `makeReport`, `makeFinding`, and `fakePrompts` patterns.
- Run `bun test test/handoff.test.ts`, then `bun run verify`.

## Done criteria

- [ ] Warning-only reports do not offer an empty `errors` repair subset.
- [ ] Advice-only reports do not offer empty `errors` or `errors-and-warnings` repair subsets.
- [ ] `prepareRepairHandoff` still rejects an empty selected-skill checkbox.
- [ ] `bun test test/handoff.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 016 `DONE`.

## STOP conditions

Stop and report back if:

- The repair subset copy or values have already changed from the excerpts above.
- Fixing this requires changing the scan review menu or launch-agent flow.
- The report model no longer exposes `errorCount`, `warningCount`, or `findingCount`.

## Maintenance notes

Reviewers should check that every offered repair subset is non-empty for the current report. If future severities are added, this choice builder must be updated so new severities do not create another empty-path prompt.
