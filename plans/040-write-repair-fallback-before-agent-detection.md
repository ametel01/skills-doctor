# Plan 040: Write repair fallback artifacts before agent detection

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52d6f0e..HEAD -- src/cli/commands/scan.ts src/cli/utils/handoff-to-agent.ts src/cli/utils/launch-agent.ts test/cli-scan.test.ts test/handoff.test.ts docs/PRD.md README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52d6f0e`, 2026-06-18

## Why this matters

The PRD says that when no local repair agent is available, Skills Doctor should stop after writing the scan report and print the generated prompt path or an inline prompt fallback. The current repair flow detects `claude`/`codex` first, so a machine without either binary exits before `prepareRepairHandoff()` can write `findings.json`, `findings.md`, per-skill report files, or `handoff-prompt.md`. That makes the no-agent fallback much less useful for users who want to copy the prompt into another tool.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - orchestrates interactive review and repair handoff.
- `src/cli/utils/launch-agent.ts` - detects and chooses local repair agents.
- `src/cli/utils/handoff-to-agent.ts` - selects findings and writes report/prompt artifacts.
- `test/cli-scan.test.ts` - covers scan action and interactive repair flow.
- `test/handoff.test.ts` - covers report and prompt preparation details.

Current control flow in `runRepairAgentFlow()` chooses an agent before preparing handoff artifacts:

```ts
// src/cli/commands/scan.ts:381
const agent = await chooseRepairAgent({
  prompts: input.prompts,
  isAvailable: input.isRepairAgentAvailable,
});
if (agent === undefined) {
  input.write("Repair handoff cancelled.\n");
  return undefined;
}
const handoff = await prepareRepairHandoff({
  report,
  prompts: input.prompts,
  outputRoot: input.repairReportOutputRoot,
  timestamp: input.repairReportTimestamp,
});
```

When no local agent is present, `chooseRepairAgent()` throws before artifacts are written:

```ts
// src/cli/utils/launch-agent.ts:72
if (agents.length === 0) {
  throw new CliInputError(
    "No local repair agent was found. Install `claude` or `codex` on PATH to use repair handoff.",
  );
}
```

The artifact writer already has the correct fallback behavior when writing succeeds or fails:

```ts
// src/cli/utils/handoff-to-agent.ts:40
const reportResult = await tryWriteFindingsDirectory({
  report: input.report,
  findings,
  outputRoot: input.outputRoot,
  timestamp: input.timestamp,
  writeDirectory: input.writeDirectory ?? writeFindingsDirectory,
});
const prompt = buildHandoffPrompt({
  report: input.report,
  findings,
  reportDirectory: reportResult.result?.directory,
});
```

The PRD requirement this plan must satisfy:

```md
<!-- docs/PRD.md:439 -->
- Detect `claude` on `PATH`.
- Detect `codex` on `PATH`.
- If neither is available, stop after writing the scan report and print the
  generated prompt path or inline prompt as a fallback.
```

Repo conventions to match:

- Keep Commander, prompts, process exits, and terminal output in `src/cli/**`.
- Keep report and prompt content generation in `src/domain/**` and `src/cli/utils/handoff-to-agent.ts`.
- Tests use injected prompt adapters, fake availability probes, and fake launchers instead of real subprocesses. Follow the patterns in `test/cli-scan.test.ts`.
- Commit messages follow conventional style, for example `fix: return json for parse errors`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/cli-scan.test.ts test/handoff.test.ts` | all tests in those files pass |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Lint/format check | `bun run check` | exit 0, no fixes applied |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `test/handoff.test.ts` only if a handoff helper test is needed
- `docs/PRD.md` or `README.md` only if behavior wording changes from the existing documented fallback
- `CHANGELOG.md` if this repo expects user-visible fixes to be logged before release
- `plans/README.md` status row for this plan

**Out of scope**:

- Changing repair agent command flags (`--dangerously-skip-permissions` or `--yolo`).
- Changing the contents or schema of `findings.json`.
- Changing `buildHandoffPrompt()` wording unless necessary for the fallback.
- Adding new agent integrations.
- Running a real `claude` or `codex` process in tests.

## Git workflow

- Branch: `advisor/040-write-repair-fallback-before-agent-detection`
- Commit message: `fix: write repair fallback before agent detection`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a failing no-agent fallback test

In `test/cli-scan.test.ts`, update or add a test near the existing `"prints a no-agent fallback during repair handoff"` case.

The test should create a skill with at least one error, select repair, select a repair subset, and make `isRepairAgentAvailable` return `false`. Use an injected `repairReportOutputRoot` and `repairReportTimestamp` so paths are deterministic.

Assert all of these:

- stdout includes `No local repair agent was found.`
- stdout includes `Report directory: <expected report directory>` or `Repair prompt: <expected handoff-prompt.md>`.
- the expected `findings.json` exists, using `readFile()`.
- the expected `handoff-prompt.md` exists, using `readFile()`.
- no launch occurs.
- `process.exitCode` remains non-zero because the original blocking finding remains.

Model the test structure after the existing repair flow tests in `test/cli-scan.test.ts`.

**Verify**: `bun run test -- test/cli-scan.test.ts` should fail before the implementation because no report or prompt path is written in the no-agent path.

### Step 2: Reorder repair handoff preparation before agent detection

In `src/cli/commands/scan.ts`, change `runRepairAgentFlow()` so it prepares the handoff before choosing an agent:

1. Call `prepareRepairHandoff()` first.
2. Print the report directory, prompt path, inline prompt fallback, and report write error using the existing output wording.
3. Then call `chooseRepairAgent()`.
4. If `chooseRepairAgent()` throws the no-agent `CliInputError`, catch it with the existing `CliInputError` handling and return without launching or re-scanning.
5. Preserve the current behavior when the user cancels selecting the only available agent: print `Repair handoff cancelled.` and return.
6. Preserve the current behavior when the user declines the final launch confirmation: print `Agent launch cancelled.` and return.

Important ordering detail: the user should still select which findings to repair before no-agent fallback artifacts are written. Do not generate a prompt for all findings unless the user selected all findings.

**Verify**: `bun run test -- test/cli-scan.test.ts` passes, including the new no-agent fallback assertion.

### Step 3: Keep launch preview behavior for available agents

After the reorder, confirm the available-agent path still prints:

- `Selected <agent display name>.`
- `Launch preview: <command preview>`
- report directory and prompt path before asking `Launch <agent> now?`

If the reorder moved these lines, keep the output deterministic enough for existing tests.

**Verify**: `bun run test -- test/cli-scan.test.ts test/handoff.test.ts` passes.

### Step 4: Update user-visible docs only if needed

If the final behavior now matches existing README and PRD text, do not edit docs. If wording changed, update only the specific repair fallback sentence in `README.md` and/or `docs/PRD.md`.

**Verify**: `bun run check` passes.

### Step 5: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- Add or strengthen one `test/cli-scan.test.ts` case for no local repair agent:
  - selected findings are written to the findings directory.
  - `handoff-prompt.md` is written when report writing succeeds.
  - the launch path is not invoked.
- Existing repair tests must still pass:
  - successful injected repair agent re-scans.
  - launch failure does not re-scan.
  - report write failure keeps inline fallback prompt.

## Done criteria

- [ ] No-agent repair fallback writes `findings.json`, `findings.md`, and `handoff-prompt.md` before stopping.
- [ ] No-agent fallback prints enough information for the user to find the report or use the inline prompt.
- [ ] Available-agent repair flow still launches only after explicit confirmation.
- [ ] `bun run test -- test/cli-scan.test.ts test/handoff.test.ts` passes.
- [ ] `bun run verify` passes.
- [ ] No files outside the in-scope list are modified, except generated ignored build artifacts from verification if `bun run verify` creates `dist/`.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The code at the cited `runRepairAgentFlow()` or `chooseRepairAgent()` locations no longer matches the excerpts.
- Preparing a handoff before agent detection would require changing the repair subset prompt semantics.
- The fix appears to require changing report schema or prompt format.
- A test requires invoking a real `claude` or `codex` binary.
- `bun run verify` fails twice after reasonable fixes.

## Maintenance notes

Reviewers should check that this does not accidentally write reports before the user chooses the repair subset. Future repair-agent integrations should keep artifact generation separate from agent availability so users always retain a manual fallback.
