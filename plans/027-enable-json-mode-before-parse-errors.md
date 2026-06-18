# Plan 027: Return JSON for parse-level CLI errors

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/cli/index.ts src/cli/commands/scan.ts src/cli/utils/json-mode.ts src/cli/utils/handle-error.ts test`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/026-add-packaged-cli-json-smoke.md
- **Category**: bug
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

JSON mode promises machine-readable stdout and JSON error output. Today JSON mode is enabled inside `scanAction`, after Commander has already parsed options. Unknown options or other parse-level failures can be handled before `scanAction` runs, producing human output for a command that included `--json`.

## Current state

```ts
// src/cli/index.ts:27-35
export const main = async (argv = process.argv) => {
  ...
  try {
    await buildProgram().parseAsync([...argv]);
  } finally {
    process.stdin.unref?.();
  }
};
```

```ts
// src/cli/commands/scan.ts:81-83
if (flags.json) {
  enableJsonMode({ compact: Boolean(flags.jsonCompact), directory: cwd });
}
```

Docs constraint from `README.md`: JSON mode writes one machine-readable report to stdout and suppresses prompts/spinners.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/cli-scan.test.ts` or packaged CLI smoke test | all pass |
| Check | `bun run check` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/index.ts`
- `src/cli/utils/json-mode.ts`
- `src/cli/utils/handle-error.ts`
- CLI tests

**Out of scope**:
- Changing normal human parse-error formatting when `--json` is absent.
- Changing JSON scan report schema.
- Adding new CLI flags beyond what is needed for error handling.

## Git workflow

- Branch: `advisor/027-enable-json-mode-before-parse-errors`
- Commit message: `fix: return json for parse errors`

## Steps

### Step 1: Add a failing parse-error test

Add a packaged or direct CLI test for `skills-doctor --json --bad-flag`. Assert:

- Exit code is 1.
- stdout is exactly one JSON object with `ok: false`.
- stderr does not contain Commander human error text in JSON mode.

If using direct `main()`, isolate `process.exitCode` and output streams. Prefer packaged subprocess coverage if plan 026 has landed.

**Verify**: the new test fails before implementation.

### Step 2: Enable JSON mode before parsing

In `src/cli/index.ts`, inspect `argv` before `parseAsync` for `--json` and `--json-compact`. Resolve the directory argument conservatively:

- If a non-option positional argument is present, resolve it against `process.cwd()`.
- Otherwise use `process.cwd()`.

Call `enableJsonMode({ compact, directory })` before Commander can emit parse errors.

**Verify**: focused test still fails only if Commander exits before `handleCliError` can render JSON.

### Step 3: Route Commander errors through the existing handler

Configure Commander so parse errors throw instead of printing/exiting directly, then let `runCli().catch(handleCliError)` render JSON through `writeJsonErrorReport`. Preserve `--help` and `--version` behavior.

**Verify**: parse-error test passes, `node bin/skills-doctor.js --version` still prints the version, and `node bin/skills-doctor.js --help` still prints help.

### Step 4: Run full gates

Run the normal repo gates.

**Verify**: `bun run verify` exits 0.

## Test plan

- Unknown option with `--json` returns JSON error.
- Unknown option without `--json` remains human-readable.
- Version/help behavior remains intact.

## Done criteria

- [ ] Parse-level errors honor JSON mode.
- [ ] Human parse errors still work without `--json`.
- [ ] `--help` and `--version` still work.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Commander cannot be configured without breaking help/version.
- The fix requires changing `scanAction`'s public test API.

## Maintenance notes

Any future global flags that affect output mode should be detected before Commander parse or wired through the same top-level pre-parse mechanism.
