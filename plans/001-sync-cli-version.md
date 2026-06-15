# Plan 001: Report the package version from the CLI

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/cli/index.ts package.json test/cli-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, dx
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

The published CLI currently reports `0.0.0` even though `package.json` says `0.1.0`. Users and maintainers rely on `skills-doctor --version` for bug reports, release verification, and support. The fix should make Commander use the package version without creating a second manual version constant.

## Current state

Relevant files:

- `src/cli/index.ts` - builds the Commander program and hard-codes the displayed version.
- `package.json` - source of truth for the package version.
- `test/cli-scan.test.ts` or a new CLI test file - existing tests call `scanAction`; add a focused version test where it best fits.

Current excerpts:

```ts
// src/cli/index.ts:5-10
export const buildProgram = (): Command => {
  const program = new Command()
    .name("skills-doctor")
    .description("Scan Agent Skills and report quality issues.")
    .version("0.0.0", "-v, --version", "display the version number")
    .argument("[directory]", "directory to scan from", ".")
```

```json
// package.json:2-4
{
  "name": "skills-doctor",
  "version": "0.1.0",
```

Repo conventions:

- TypeScript is strict ESM with `moduleResolution: "NodeNext"`.
- Tests use Vitest and import source modules directly.
- Existing commit style is conventional, for example `fix: ...`, `feat: ...`, `docs: ...`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts` or the new focused test file | exit 0, new version test passes |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/index.ts`
- `package.json` only if needed for supported JSON import shape; do not change the version value
- `test/cli-scan.test.ts` or a new focused test file under `test/`

**Out of scope**:

- Release workflow behavior in `.github/workflows/release.yml`
- Changelog contents
- Any package version bump

## Git workflow

- Branch: `advisor/001-sync-cli-version`
- Commit message: `fix: report package version in cli`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a single source of truth for the CLI version

Update `src/cli/index.ts` so `.version(...)` receives the version from package metadata instead of the string `"0.0.0"`. Prefer a simple JSON import if the existing TypeScript/Bun configuration supports it:

```ts
import packageJson from "../../package.json" with { type: "json" };
```

Then use `packageJson.version` in `buildProgram()`.

If TypeScript rejects JSON import attributes in this repo, STOP and report instead of adding a runtime filesystem read.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add regression coverage for `--version`

Add a Vitest test that builds the program and verifies the Commander version matches `package.json`. Keep it isolated from process-level `main()` execution; test `buildProgram()` directly.

Target assertion shape:

```ts
expect(buildProgram().version()).toBe(packageJson.version);
```

**Verify**: `bun test test/cli-scan.test.ts` or the new focused file -> exit 0 and the new test passes.

### Step 3: Run the full repo gate

Run the standard verification gate.

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one regression test that fails if the Commander version is hard-coded away from `package.json`.
- Existing CLI tests should continue passing.
- Full verification should pass.

## Done criteria

- [ ] `skills-doctor` Commander version comes from `package.json`.
- [ ] A regression test covers version synchronization.
- [ ] `bun run verify` exits 0.
- [ ] No files outside scope are modified except `plans/README.md` status.

## STOP conditions

Stop and report if:

- TypeScript does not support the chosen package JSON import shape.
- Fixing this requires a build-time code generation step.
- Existing code at `src/cli/index.ts:5-10` has drifted substantially.

## Maintenance notes

Reviewers should check that the package version remains defined in one place. Future release automation should not need to update source code when bumping `package.json`.
