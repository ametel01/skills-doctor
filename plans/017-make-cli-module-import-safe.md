# Plan 017: Make the CLI module import-safe

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3433e24..HEAD -- src/cli/index.ts bin/skills-doctor.js test/cli-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `3433e24`, 2026-06-16

## Why this matters

`src/cli/index.ts` calls `main()` at module import time. That makes importing `buildProgram` or `main` execute argument parsing, install process handlers, and potentially set process exit state. The package intentionally keeps CLI internals out of the public API, but tests and future internal integrations still import this module directly; import side effects make those integrations brittle.

## Current state

- `src/cli/index.ts` exports `buildProgram` and `main`, but also executes `main()` unconditionally.
- `bin/skills-doctor.js` imports the compiled CLI module for side effects.
- `test/cli-scan.test.ts` imports `buildProgram` from `src/cli/index.ts`, which currently also triggers top-level `main()`.

Relevant current excerpts:

```ts
// src/cli/index.ts:27-41
export const main = async (argv: readonly string[] = process.argv): Promise<void> => {
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
  });

  try {
    await buildProgram().parseAsync([...argv]);
  } finally {
    process.stdin.unref?.();
  }
};

main().catch(handleCliError);
```

```js
// bin/skills-doctor.js:13
await import("../dist/cli/index.js");
```

```ts
// test/cli-scan.test.ts:5-7
import packageJson from "../package.json" with { type: "json" };
import { scanAction } from "../src/cli/commands/scan.js";
import { buildProgram } from "../src/cli/index.js";
```

Repo conventions to match:

- The bin shim is intentionally thin and uses dynamic import.
- CLI tests import command modules directly instead of going through the public package facade.
- Completed plan 011 keeps `src/index.ts` domain-only; do not export CLI internals there.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts` | exit 0, CLI scan tests pass |
| Build | `bun run build` | exit 0, `dist/` emits |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/index.ts`
- `bin/skills-doctor.js`
- `test/cli-scan.test.ts`

**Out of scope**:
- `src/index.ts` public package exports.
- CLI command behavior in `src/cli/commands/scan.ts`.
- Release workflow and package metadata unless the bin path changes, which this plan should avoid.

## Git workflow

- Branch: `advisor/017-make-cli-module-import-safe`
- Commit message: `refactor: make cli module import safe`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Remove import-time execution from the CLI module

In `src/cli/index.ts`, remove the unconditional `main().catch(handleCliError)` call.

Keep `handleCliError` imported if `main` still uses it indirectly, or remove the import if it becomes unused.

**Verify**: `bun run typecheck` -> exit 0, no unused import or type errors.

### Step 2: Move process execution into the bin shim

In `bin/skills-doctor.js`, replace the side-effect import with an explicit call:

```js
const { main } = await import("../dist/cli/index.js");
await main().catch((error) => {
  // call the compiled module's exported error handler only if it is exported,
  // otherwise preserve the current top-level CLI error handling by adding a small exported run function in src/cli/index.ts.
});
```

Preferred implementation: export a `runCli` or `runMain` helper from `src/cli/index.ts` that wraps `main().catch(handleCliError)`, then call that helper from the bin shim. This keeps the bin thin and avoids duplicating error handling.

Do not add `src/cli/index.ts` to `src/index.ts`.

**Verify**: `bun run build` -> exit 0 and `bin/skills-doctor.js` still points at `../dist/cli/index.js`.

### Step 3: Add an import-safety regression test

In `test/cli-scan.test.ts`, add a test that imports `../src/cli/index.js` and asserts that importing it does not parse arguments or mutate `process.exitCode`.

A simple shape:

- Set `process.exitCode = undefined`.
- Dynamically import `../src/cli/index.js`.
- Assert the module has `buildProgram` and `main`.
- Assert `process.exitCode` is still `undefined`.

If module caching makes this ineffective because the module is already imported at file top level, move the existing static `buildProgram` import to a dynamic import inside the current version test.

**Verify**: `bun test test/cli-scan.test.ts` -> exit 0.

## Test plan

- Focused CLI test: `bun test test/cli-scan.test.ts`.
- Build test: `bun run build`.
- Full gate: `bun run verify`.
- Manual smoke, if requested by the maintainer: after build, run `node bin/skills-doctor.js --version` and expect `0.3.0`.

## Done criteria

- [ ] Importing `src/cli/index.ts` does not call `main()`.
- [ ] `bin/skills-doctor.js` still runs the CLI by explicitly calling an exported runner.
- [ ] `src/index.ts` remains domain-only and does not export CLI internals.
- [ ] `bun test test/cli-scan.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 017 `DONE`.

## STOP conditions

Stop and report back if:

- The bin shim no longer imports `../dist/cli/index.js`.
- The package has gained a separate compiled CLI entrypoint not visible in the excerpts above.
- Making imports safe requires changing the public `exports` map in `package.json`.

## Maintenance notes

Future CLI utilities should remain import-safe unless they are true binary entrypoints. Reviewers should reject new top-level `main()` calls in modules that export testable helpers.
