# Plan 012: Keep the review menu open after viewing findings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 75209d4..HEAD -- src/cli/commands/scan.ts test/cli-scan.test.ts docs/PRD.md README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, dx
- **Planned at**: commit `75209d4`, 2026-06-16

## Why this matters

The PRD flow says users review findings, then choose what to fix. The current interactive review action prints one findings view and returns, so the CLI exits before the user can launch the repair flow from that same scan. This makes the default interactive workflow brittle: users must rerun the scan if they view findings before choosing repair.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - owns the interactive review menu and repair flow.
- `test/cli-scan.test.ts` - contains prompt-adapter tests for scan/review behavior.
- `docs/PRD.md` and `README.md` - document the intended interactive repair flow.

Current excerpts:

```ts
// src/cli/commands/scan.ts:202-229
const reviewFindings = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  const { prompts, write } = input;
  const action = await prompts.select<ReviewAction>("Next step", [
    { name: "Fix skills with Claude or Codex", value: "repair" },
    ...(report.errorCount > 0 ? [{ name: "View errors", value: "errors" as const }] : []),
    { name: "View all findings", value: "all" },
    { name: "View findings by skill", value: "by-skill" },
    { name: "Exit", value: "exit" },
  ]);

  if (action === "exit") return;
  if (action === "repair") {
    return runRepairAgentFlow(report, input);
  }

  const selectedFindings =
    action === "errors"
      ? report.findings.filter((finding) => finding.severity === "error")
      : report.findings;
  if (action === "by-skill") {
    write(renderFindingsBySkill(selectedFindings));
    return;
  }
  write(renderFindings(selectedFindings));
  return undefined;
};
```

```md
// docs/PRD.md:163-165
9. The user reviews findings by skill or severity.
10. The user chooses whether to fix all findings or only a selected subset.
11. Skills Doctor detects local `claude` and `codex` executables.
```

```md
// README.md:91-96
When findings exist, the CLI can:

1. Show a concise score, skill count, and issue count.
2. Let you choose a repair subset: errors, errors plus warnings, all findings,
   or selected skills.
3. Detect local `claude` and `codex` executables.
```

Repo conventions:

- Tests use fake `PromptAdapter` implementations with queued select/confirm answers.
- Human output assertions use `stdout.join("")` and `toContain`.
- Existing commits use conventional messages such as `fix: expose grouped findings review`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint/check | `bun run check` | exit 0, no fixes applied |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`

**Out of scope**:

- Redesigning prompt labels or the repair subset choices.
- Changing agent detection, launch arguments, or post-handoff comparison.
- Changing JSON mode behavior.

## Git workflow

- Branch: `advisor/012-loop-review-menu`
- Commit message: `fix: keep review menu open after viewing findings`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a regression test for view-then-repair

In `test/cli-scan.test.ts`, add a test near the existing review/repair tests. Model it after `shows grouped findings when by-skill is selected` and `launches an injected repair agent and reports fixed findings after re-scan`.

The test should:

- Create one invalid skill under `.agents/skills/bad-skill`.
- Use `queuedPrompts` with selects like `["by-skill", "repair", "errors"]`.
- Provide confirms `[true, true, false]` for one available agent, launch confirmation, and no second pass.
- Inject `isRepairAgentAvailable` so only one agent is available.
- Inject `launchAgent` to rewrite the skill to a valid one with the existing `writeSkill` helper.
- Assert stdout contains the grouped view before repair, contains `Post-handoff re-scan:`, and the returned report has `errorCount === 0`.

This test should fail before the implementation change because `reviewFindings()` returns after `by-skill`.

**Verify**: `bun test test/cli-scan.test.ts` -> fails only the new test for the current review flow.

### Step 2: Loop the review menu for view actions

Update `reviewFindings()` in `src/cli/commands/scan.ts` so `errors`, `all`, and `by-skill` render their output and then prompt again against the same report. Keep the current return behavior for:

- `exit` -> `undefined`
- `repair` -> `runRepairAgentFlow(report, input)`

A simple acceptable shape is a `while (true)` loop around the select and render logic. Do not recurse indefinitely for repeated view actions.

**Verify**: `bun test test/cli-scan.test.ts` -> all tests in the file pass.

### Step 3: Run the standard gates

Run the repo checks after the focused test passes.

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0, no fixes applied
- `bun run verify` -> exit 0

## Test plan

- New regression in `test/cli-scan.test.ts`: user can view findings by skill and then continue to repair without rerunning the scan.
- Existing repair tests must still pass unchanged.
- Existing grouped-view test must still pass; it can answer `["by-skill", "exit"]` if the implementation loops.

## Done criteria

- [ ] `reviewFindings()` does not exit after `errors`, `all`, or `by-skill`.
- [ ] Users can view findings and then choose repair in the same scan session.
- [ ] `bun test test/cli-scan.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list are modified except `plans/README.md` status update.

## STOP conditions

Stop and report back if:

- The review flow has already been replaced by a different menu architecture.
- The new behavior requires changing prompt adapter types or agent launch APIs.
- Prompt looping causes existing tests to hang rather than fail clearly.

## Maintenance notes

Reviewers should verify that the menu loop has an explicit exit path and does not re-run the scan when users only view findings. Future view actions should follow the same pattern: render, then return to the review menu unless the action starts a terminal-owning workflow.
