# Plan 026: Add packaged CLI smoke coverage for JSON output

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- bin/skills-doctor.js src/cli/commands/scan.ts src/cli/utils/json-mode.ts src/cli/utils/handle-error.ts test package.json`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

JSON mode is the automation contract: one machine-readable report on stdout with correct exit behavior. Current tests cover helpers and injected `scanAction`, but not the packaged boundary through `bin/skills-doctor.js` and built `dist`. A regression in the bin shim, build output, Commander wiring, or stdout/stderr separation can pass unit tests.

## Current state

```json
// package.json:8-11
"bin": { "skills-doctor": "./bin/skills-doctor.js" },
"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

```js
// bin/skills-doctor.js:13
const { runCli } = await import("../dist/cli/index.js");
await runCli();
```

```ts
// src/cli/commands/scan.ts:81-83, 141-142
if (flags.json) enableJsonMode(...);
if (flags.json) writeJsonReport(report, writeStdout);
```

Existing helper coverage: `test/reporting.test.ts:155` tests `writeJsonReport`, not the installed CLI path.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `bun run build` | exit 0 |
| Focused tests | `bun run test -- <new test file>` | all pass |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- New test file under `test/` or additions to `test/cli-scan.test.ts`
- Minimal test helpers
- `package.json` only if adding a dedicated script is necessary

**Out of scope**:
- Changing JSON schema.
- Changing default exit-code semantics.
- Testing interactive prompts through a real TTY.

## Git workflow

- Branch: `advisor/026-add-packaged-cli-json-smoke`
- Commit message: `test: cover packaged json cli output`

## Steps

### Step 1: Add subprocess smoke tests

Create a test that:

- Creates a temp project with `.agents/skills/good-skill/SKILL.md`.
- Runs `bun run build` before invoking the bin, or assumes the test itself invokes the build in a setup step.
- Spawns `node bin/skills-doctor.js --json --json-compact --yes <tempdir>` using `execFile`.
- Parses stdout as exactly one JSON object.
- Asserts `ok: true`, `skillCount: 1`, `findingCount: 0`, and exit code 0.
- Asserts stderr does not contain JSON or human summary text.

Model subprocess style after `test/release-notes.test.ts`.

**Verify**: focused test passes.

### Step 2: Add blocking-scan exit coverage

Add a second temp project with a skill whose `name` does not match the directory. Invoke the same bin command and assert:

- Process exits with code 1.
- stdout parses as one JSON object.
- JSON has `ok: false`, `errorCount > 0`, and a `name-directory-mismatch` finding.

**Verify**: focused test passes.

### Step 3: Keep tests deterministic

Use temp directories from `mkdtemp`, clean with `rm(..., { recursive: true, force: true })`, and avoid relying on user home roots by passing the temp directory argument. Do not scan this real repository in the smoke tests.

**Verify**: `bun run verify` exits 0.

## Test plan

- New packaged CLI smoke tests for clean JSON success and blocking JSON failure.
- Existing `scanAction` and JSON helper tests remain unchanged.

## Done criteria

- [ ] Packaged bin path is covered by tests.
- [ ] JSON stdout parses in success and failure cases.
- [ ] Exit status is asserted for success and blocking findings.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Running `bun run build` from tests causes unacceptable recursion or persistent source edits beyond `dist`.
- The test cannot avoid scanning real user global skill roots.

## Maintenance notes

This test should catch future regressions from JSON parse-error work, bin changes, and package export changes. Keep it narrow so it remains cheap.
