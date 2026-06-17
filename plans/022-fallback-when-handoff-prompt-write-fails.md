# Plan 022: Fall back when handoff prompt writing fails

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d615d4..HEAD -- src/cli/utils/handoff-to-agent.ts src/domain/build-handoff-prompt.ts src/domain/write-findings-directory.ts test/handoff.test.ts test/cli-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8d615d4`, 2026-06-18

## Why this matters

The repair handoff already has a graceful fallback when writing the full findings directory fails. A narrower failure remains: if the report directory is created but writing `handoff-prompt.md` fails, `prepareRepairHandoff` throws and the CLI loses the inline prompt fallback. Users should still be able to launch or copy the generated prompt when only the prompt-file write failed.

## Current state

- `tryWriteFindingsDirectory` catches failures from `writeFindingsDirectory`.
- `prepareRepairHandoff` writes `handoff-prompt.md` after the caught block, so that write is not protected.
- Existing tests cover report-directory write failure but not prompt-file write failure.

Relevant excerpts:

```ts
// src/cli/utils/handoff-to-agent.ts:40-57
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

let promptPath: string | undefined;
if (reportResult.result !== undefined) {
  promptPath = path.join(reportResult.result.directory, "handoff-prompt.md");
  await writeFile(promptPath, `${prompt}\n`);
}
```

```ts
// test/handoff.test.ts:185-199
it("keeps an inline fallback prompt when report writing fails", async () => {
  const report = makeReport([makeFinding({})]);

  const handoff = await prepareRepairHandoff({
    report,
    prompts: fakePrompts({ selected: "errors" }),
    writeDirectory: async () => {
      throw new Error("disk full");
    },
  });

  expect(handoff.reportDirectory).toBeUndefined();
  expect(handoff.promptPath).toBeUndefined();
  expect(handoff.reportWriteError?.message).toBe("disk full");
  expect(handoff.prompt).toContain("Full findings report: unavailable");
});
```

Repo conventions to match:

- Expected handoff write failures are returned in `PreparedRepairHandoff.reportWriteError`, not thrown.
- CLI output prints either `Repair prompt: <path>` or the inline prompt.
- Keep the domain prompt builder pure.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/handoff.test.ts test/cli-scan.test.ts` | exit 0, tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/utils/handoff-to-agent.ts`
- `test/handoff.test.ts`
- `test/cli-scan.test.ts` only if CLI output needs refreshed assertions

**Out of scope**:
- Changing `buildHandoffPrompt`.
- Changing the findings directory format.
- Changing agent launch flags or agent selection.

## Git workflow

- Branch: `advisor/022-fallback-when-handoff-prompt-write-fails`
- Commit message: `fix: fall back when handoff prompt write fails`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Catch prompt-file write failures

In `src/cli/utils/handoff-to-agent.ts`, wrap the `writeFile(promptPath, ...)` call in a try/catch. If it fails:

- Return `promptPath: undefined`.
- Preserve the inline `prompt`.
- Set `reportWriteError` to the prompt-write error, unless `reportResult.error` already exists.

The prompt currently includes `Full findings report: <directory>` when the directory exists. That is acceptable if only `handoff-prompt.md` failed; the full findings report is still usable. Do not rebuild the prompt as unavailable unless the whole report directory failed.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add a regression test for prompt write failure

In `test/handoff.test.ts`, add a test near the existing fallback test. Use `writeDirectory` to return a valid `FindingsDirectoryResult` with a directory path that makes the subsequent `writeFile` fail. One deterministic option:

- Use a temporary file path as `result.directory` instead of a directory, so `path.join(result.directory, "handoff-prompt.md")` has a non-directory parent.

Assert:

- `handoff.promptPath` is `undefined`.
- `handoff.prompt` contains the repair instructions.
- `handoff.reportWriteError` is defined.
- `prepareRepairHandoff` does not throw.

**Verify**: `bun test test/handoff.test.ts` -> exit 0.

### Step 3: Confirm CLI output uses inline prompt fallback

If existing CLI tests do not cover this path, add a narrow `scanAction` test only if it is easy to inject the failure. Otherwise keep coverage at `prepareRepairHandoff`, because `runRepairAgentFlow` already prints inline prompt when `promptPath` is undefined.

Relevant CLI excerpt:

```ts
// src/cli/commands/scan.ts:352-358
if (handoff.promptPath !== undefined) {
  input.write(`Repair prompt: ${handoff.promptPath}\n`);
} else {
  input.write(`Repair prompt:\n${handoff.prompt}\n`);
}
if (handoff.reportWriteError !== undefined) {
  input.write(`Report write failed: ${handoff.reportWriteError.message}\n`);
}
```

**Verify**: `bun test test/handoff.test.ts test/cli-scan.test.ts` -> exit 0.

## Test plan

- Add a handoff unit test for prompt-file write failure after successful findings-directory creation.
- Run `bun test test/handoff.test.ts test/cli-scan.test.ts`.
- Run `bun run verify`.

## Done criteria

- [ ] `prepareRepairHandoff` does not throw when only `handoff-prompt.md` cannot be written.
- [ ] The returned handoff includes inline `prompt`, undefined `promptPath`, and a `reportWriteError`.
- [ ] Existing report-directory write failure fallback still works.
- [ ] `bun test test/handoff.test.ts test/cli-scan.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 022 `DONE`.

## STOP conditions

Stop and report back if:

- The fix requires changing the public `PreparedRepairHandoff` type shape.
- Tests show callers depend on prompt-file write failures throwing.
- The prompt would need to include secret or environment values to be useful inline.

## Maintenance notes

This is an error-boundary fix. Reviewers should make sure it does not hide failures silently: the user should still see a concise report write failure message while retaining the prompt content.
