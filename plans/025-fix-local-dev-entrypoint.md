# Plan 025: Make `bun run dev` execute the CLI

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- package.json README.md test/cli-scan.test.ts bin/skills-doctor.js src/cli/index.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The README tells contributors to use `bun run dev`, but the current script runs `node dist/cli/index.js`. That module exports `runCli()` and does not invoke it directly, so the command can exit without running the CLI. Contributors can think they tested the tool while exercising no behavior.

## Current state

```json
// package.json:35
"dev": "node dist/cli/index.js"
```

```ts
// src/cli/index.ts:41-43
export const runCli = async (argv: readonly string[] = process.argv): Promise<void> => {
  await main(argv).catch(handleCliError);
};
```

```js
// bin/skills-doctor.js:13
const { runCli } = await import("../dist/cli/index.js");
await runCli();
```

Repo convention: CLI behavior is tested by injecting `scanAction` dependencies in `test/cli-scan.test.ts`; subprocess behavior can use `execFile`, as in `test/release-notes.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `bun run build` | exit 0, updates `dist` |
| Dev smoke | `bun run dev -- --version` | prints package version and exits 0 |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `package.json`
- `README.md` if local dev docs need adjustment
- A test file if adding subprocess coverage

**Out of scope**:
- Changing CLI behavior or flags.
- Reintroducing side-effect execution in `src/cli/index.ts`; plan 017 made imports safe.

## Git workflow

- Branch: `advisor/025-fix-local-dev-entrypoint`
- Commit message: `fix: make dev script run cli`

## Steps

### Step 1: Choose the least surprising dev path

Update `package.json` so `bun run dev -- <args>` invokes the real bin path after build. The simplest acceptable shape is:

```json
"dev": "node bin/skills-doctor.js"
```

This keeps import safety in `src/cli/index.ts` and uses the same runtime path as published users.

**Verify**: `bun run build && bun run dev -- --version` prints `0.3.1` or the current `package.json` version.

### Step 2: Add a smoke regression

Add or extend a test that proves the configured dev path reaches CLI behavior. Prefer a small subprocess test that runs the package script or bin with `--version`. If invoking `bun run dev` inside Vitest is too brittle, test `node bin/skills-doctor.js --version` and keep `package.json` script simple.

**Verify**: `bun run test -- test/cli-scan.test.ts` or the new focused test file passes.

### Step 3: Run full gates

Run the repo's normal verification after the script/test change.

**Verify**: `bun run verify` exits 0.

## Test plan

- Add one smoke test for the bin/dev path printing the package version.
- Keep existing import-safety test in `test/cli-scan.test.ts:80` passing.

## Done criteria

- [ ] `bun run dev -- --version` runs the CLI and prints the package version.
- [ ] Importing `src/cli/index.ts` still has no side effects.
- [ ] `bun run verify` passes.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The fix requires making `src/cli/index.ts` execute on import.
- `bun run dev -- --version` cannot forward args reliably on the supported Bun version.

## Maintenance notes

Future entrypoint changes should test both import-safety and executable behavior. The bin file is the source of truth for package execution.
