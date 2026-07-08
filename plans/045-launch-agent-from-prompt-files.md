# Plan 045: Launch repair agents from prompt files when available

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc7b239..HEAD -- src/cli/commands/scan.ts src/cli/utils/launch-agent.ts src/cli/utils/handoff-to-agent.ts src/cli/utils/cleanup-handoff-to-agent.ts test/agent-selection.test.ts test/cli-scan.test.ts test/handoff.test.ts docs/CLI_SPEC.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `dc7b239`, 2026-07-08
- **Issue**: https://github.com/ametel01/skills-doctor/issues/22

## Why this matters

The CLI writes `handoff-prompt.md` and `cleanup-prompt.md`, but still launches
`claude` or `codex` with the full prompt body as one command-line argument.
Large scans can produce large prompts and hit OS argument-length limits even
when the prompt file was written successfully. The launch path should use the
prompt file when one exists and keep the inline prompt only as the fallback when
writing the prompt file failed.

## Execution order and parallelism

This plan is independent and can be worked in parallel with plans 043, 046, and
047. It can also run in parallel with plan 044, but both plans may touch
`src/cli/commands/scan.ts`, so coordinate before editing that file. It is part
of the first execution wave because it fixes a repair-handoff reliability
failure for large scans.

## Current state

Relevant files:

- `src/cli/utils/handoff-to-agent.ts` - prepares repair handoff and writes
  `handoff-prompt.md`.
- `src/cli/utils/cleanup-handoff-to-agent.ts` - prepares cleanup handoff and
  writes `cleanup-prompt.md`.
- `src/cli/utils/launch-agent.ts` - builds and launches local agent commands.
- `src/cli/commands/scan.ts` - calls `input.launchAgent(agent.id,
  handoff.prompt, input.cwd)` in repair, cleanup, and usage-recommendation
  flows.
- `test/agent-selection.test.ts` - verifies launch invocation construction.
- `docs/CLI_SPEC.md` and `README.md` - document launch behavior.

Prompt files are written:

```ts
// src/cli/utils/handoff-to-agent.ts:57-64
let promptPath: string | undefined;
let promptWriteError: Error | undefined;
if (reportResult.result !== undefined) {
  const targetPromptPath = path.join(reportResult.result.directory, "handoff-prompt.md");
  try {
    await writeFile(targetPromptPath, `${prompt}\n`);
    promptPath = targetPromptPath;
  } catch (error) {
```

```ts
// src/cli/utils/cleanup-handoff-to-agent.ts:55-61
let promptPath: string | undefined;
let promptWriteError: Error | undefined;
if (reportResult.result !== undefined) {
  const targetPromptPath = path.join(reportResult.result.directory, "cleanup-prompt.md");
  try {
    await writeFile(targetPromptPath, `${prompt}\n`);
    promptPath = targetPromptPath;
```

Launch currently ignores the prompt path:

```ts
// src/cli/commands/scan.ts:1067-1076
writeRepairHandoffSummary(handoff, input.write, { color: input.color });
const shouldLaunch = await input.prompts.confirm(`Launch ${agent.displayName} now?`, false);
if (!shouldLaunch) {
  input.write("Agent launch cancelled.\n");
  return undefined;
}

let exitCode: number;
try {
  exitCode = await input.launchAgent(agent.id, handoff.prompt, input.cwd);
```

The utility builds argv with the prompt body as the final argument:

```ts
// src/cli/utils/launch-agent.ts:117-125
export const buildRepairAgentInvocation = (
  agentId: RepairAgentId,
  prompt: string,
): CommandInvocation => {
  const agent = REPAIR_AGENT_CONFIG[agentId];
  return {
    command: agent.binary,
    args: [...agent.autoApproveArgs, prompt],
  };
};
```

Current tests encode that behavior:

```ts
// test/agent-selection.test.ts:92-101
it("builds launch invocations with prompt as the final argument", () => {
  expect(buildRepairAgentInvocation("claude", "fix skills")).toEqual({
    command: "claude",
    args: ["--dangerously-skip-permissions", "fix skills"],
  });
  expect(buildRepairAgentInvocation("codex", "fix skills")).toEqual({
    command: "codex",
    args: ["--yolo", "fix skills"],
  });
  expect(formatRepairAgentPreview("codex")).toBe("codex --yolo <prompt>");
});
```

Documented handoff flow:

```md
# docs/CLI_SPEC.md:272-280
3. Writes the full findings directory.
4. Writes `handoff-prompt.md`.
5. Previews the command.
6. Asks for confirmation before launching the selected agent.

Launch behavior is implemented in `src/cli/utils/launch-agent.ts`. Keep command
execution argument-based, not shell-string based, except where a platform wrapper
```

Repo conventions to follow:

- Keep command execution argument-based. Do not build shell strings.
- Keep explicit user confirmation before launch.
- Preserve inline prompt fallback when writing the prompt file fails.
- Tests should use injected launchers rather than starting real `claude` or
  `codex`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Agent utility tests | `bun test test/agent-selection.test.ts` | exit 0 |
| CLI flow tests | `bun test test/cli-scan.test.ts test/handoff.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full tests | `bun run test` | exit 0 |
| Lint/format check | `bun run check` | exit 0 |

## Scope

**In scope**:

- `src/cli/utils/launch-agent.ts`
- `src/cli/commands/scan.ts`
- `test/agent-selection.test.ts`
- `test/cli-scan.test.ts`
- `docs/CLI_SPEC.md` and `README.md` if launch syntax changes

**Out of scope**:

- Removing the explicit launch confirmation.
- Changing the generated prompt contents.
- Changing findings or cleanup report file formats.
- Changing repair-agent auto-approval flags in this plan.
- Launching real local agents in tests.

## Git workflow

- Branch: `advisor/045-launch-agent-from-prompt-files`
- Commit message: `fix: launch repair agents from prompt files`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Decide and encode the file-launch contract

Inspect the current local agent CLI conventions. Prefer passing the prompt file
path in the command argument when that is how the local agent accepts prompt
files. If a command requires a specific flag, model it in
`src/cli/utils/launch-agent.ts` rather than string-concatenating a shell
command.

Expected outcome: launch utilities can build an invocation from either:

- inline prompt text, for fallback, or
- prompt file path, for the normal path after `handoff-prompt.md` or
  `cleanup-prompt.md` is written.

**Verify**: update or add `test/agent-selection.test.ts` cases before changing
the implementation; the new tests should fail against current code.

### Step 2: Thread prompt paths through launch calls

Update the launch abstractions so repair, cleanup, and usage-recommendation
flows can pass a prompt file path when available.

One acceptable shape:

- Replace `RepairAgentLauncher(agentId, prompt, cwd)` with an input object such
  as `{ agentId, prompt, promptPath, cwd }`, or add a fourth optional
  `promptPath` argument.
- In `runRepairAgentFlow`, `runCleanupAgentFlow`, and
  `runUsageRecommendationAgentFlow`, pass `handoff.promptPath` alongside
  `handoff.prompt`.
- In `launchRepairAgent`, prefer the prompt file path when defined and use
  inline prompt text only when `promptPath` is undefined.

Keep fake launchers in tests easy to write.

**Verify**: `bun test test/agent-selection.test.ts test/cli-scan.test.ts` ->
new and existing tests pass.

### Step 3: Update launch previews and docs

Update `formatRepairAgentPreview` and the README/docs snippets if the preview
should say `<prompt-file>` instead of `<prompt>`. The preview should match the
normal launch path when a prompt file exists and should not imply shell
evaluation.

**Verify**: `bun run check` -> exit 0.

### Step 4: Preserve inline fallback behavior

Add or update a test proving that when `promptPath` is undefined because prompt
file writing failed, launch still uses the inline prompt body. Existing tests in
`test/handoff.test.ts` already cover prompt-write fallback; add CLI launch
coverage only if needed to prove the launcher receives inline content.

**Verify**: `bun test test/handoff.test.ts test/cli-scan.test.ts` -> exit 0.

### Step 5: Run full gates

Run:

1. `bun run typecheck`
2. `bun run test`
3. `bun run check`

**Verify**: all commands exit 0.

## Test plan

- Update `test/agent-selection.test.ts` to cover prompt-file invocation and
  inline fallback invocation.
- Update `test/cli-scan.test.ts` injected launcher assertions so repair,
  cleanup, and usage-recommendation flows pass prompt-file information when
  available.
- Keep `test/handoff.test.ts` fallback coverage green.

## Done criteria

- [ ] Normal repair handoff launch uses `handoff-prompt.md` when it exists.
- [ ] Normal cleanup handoff launch uses `cleanup-prompt.md` when it exists.
- [ ] Usage-recommendation handoff launch uses `cleanup-prompt.md` when it exists.
- [ ] Inline prompt launch still works when prompt-file writing fails.
- [ ] Launch command construction remains argument-based, not shell-string based.
- [ ] `bun test test/agent-selection.test.ts` exits 0.
- [ ] `bun test test/cli-scan.test.ts test/handoff.test.ts` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Neither supported local agent can accept a prompt file path or file flag.
- Supporting prompt files requires a breaking CLI UX change that removes inline
  fallback.
- The only viable implementation requires shell-string execution.
- Tests would need to launch real `claude` or `codex`.

## Maintenance notes

Future handoff flows should pass file-backed prompts by default. Reviewers
should watch for accidental reintroduction of `launchAgent(agent.id,
handoff.prompt, ...)` style calls without prompt-path context.
