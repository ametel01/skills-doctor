# Plan 019: Preserve custom-root diagnostics in scan reports

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d615d4..HEAD -- src/cli/commands/scan.ts src/domain/discover-skill-roots.ts src/domain/types.ts test/cli-scan.test.ts test/domain-scan.test.ts test/reporting.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8d615d4`, 2026-06-18

## Why this matters

When a user adds a custom skills directory during an interactive scan, `discoverSkillRoots` correctly creates a warning diagnostic if the path does not exist. The CLI currently drops that diagnostic because `selectCustomRoot` returns only `custom.roots`. The final JSON report can therefore look like a clean scan of the standard roots even though the user's requested custom path was ignored.

## Current state

- `src/domain/discover-skill-roots.ts` owns discovery and emits a warning for missing custom roots.
- `src/cli/commands/scan.ts` calls `discoverSkillRoots` once for standard roots, then again when a user enters a custom root.
- `src/domain/build-report.ts` already preserves `scan.diagnostics` in reports, so the missing piece is carrying discovery diagnostics into the scan result.

Relevant excerpts:

```ts
// src/domain/discover-skill-roots.ts:64-70
if (candidate.source === "custom") {
  diagnostics.push({
    code: "skill-root-not-found",
    severity: "warning",
    message: `Custom skills root does not exist: ${candidate.rootPath}`,
    path: candidate.rootPath,
  });
}
```

```ts
// src/cli/commands/scan.ts:81-84
const discovered = await spinner.run("Finding local skill roots...", () =>
  discoverSkillRoots({ cwd, homeDir: options.homeDir }),
);
let roots = discovered.roots;
```

```ts
// src/cli/commands/scan.ts:258-264
const customRoot = await input.prompts.input("Skills directory path", ".");
const custom = await discoverSkillRoots({
  cwd: input.cwd,
  homeDir: input.homeDir,
  customRoots: [{ rootPath: customRoot, ecosystem: "custom" }],
});
return mergeRoots(input.roots, custom.roots);
```

```ts
// src/domain/scan-skills.ts:56-60
return {
  roots: input.roots,
  skills,
  diagnostics,
  findings,
};
```

Repo conventions to match:

- CLI workflow orchestration lives in `src/cli/commands/scan.ts`.
- Domain scan/report data uses plain readonly object types from `src/domain/types.ts`.
- Tests inject prompts and temporary directories instead of invoking the real CLI process.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts test/domain-scan.test.ts test/reporting.test.ts` | exit 0, tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/cli/commands/scan.ts`
- `src/domain/scan-skills.ts`
- `src/domain/types.ts`
- `test/cli-scan.test.ts`
- `test/domain-scan.test.ts` only if a domain type change needs a fixture update
- `test/reporting.test.ts` only if report construction assertions need a diagnostic case

**Out of scope**:
- Changing root discovery semantics.
- Changing the text or severity of `skill-root-not-found`.
- Failing the scan for warning diagnostics.
- Re-opening plan 015 custom root selection behavior.

## Git workflow

- Branch: `advisor/019-preserve-custom-root-diagnostics`
- Commit message: `fix: preserve custom root diagnostics`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a way to pass pre-scan diagnostics into scanning

Update `src/domain/scan-skills.ts` so `ScanSkillRootsInput` can accept optional initial diagnostics:

```ts
export type ScanSkillRootsInput = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics?: readonly Diagnostic[] | undefined;
};
```

Initialize the local `diagnostics` array from that input:

```ts
const diagnostics: Diagnostic[] = [...(input.diagnostics ?? [])];
```

Do not change how unreadable root diagnostics are appended.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Accumulate discovery diagnostics in the CLI flow

In `src/cli/commands/scan.ts`, keep a mutable diagnostics array after initial discovery:

```ts
const diagnostics = [...discovered.diagnostics];
```

When `selectCustomRoot` performs another discovery, return both merged roots and the new diagnostics. A small local type is acceptable, for example:

```ts
type RootSelectionResult = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
};
```

Use this only inside `scan.ts`; do not export it.

When scanning, call:

```ts
scanSkillRoots({ roots, diagnostics })
```

**Verify**: `bun run typecheck` -> exit 0.

### Step 3: Cover missing custom root diagnostics from the CLI path

Add a test to `test/cli-scan.test.ts` that:

1. Creates a standard `.agents/skills/local-skill/SKILL.md`.
2. Runs `scanAction` interactively with prompts selecting `"custom"` and entering a missing path.
3. Asserts the report still scans the standard root.
4. Asserts `report.diagnostics` contains `{ code: "skill-root-not-found", severity: "warning" }`.
5. Asserts `process.exitCode` remains `0` when there are no blocking findings.

Use `writeSkill` and `fakePrompts` patterns already in that file.

**Verify**: `bun test test/cli-scan.test.ts` -> exit 0.

## Test plan

- Add the CLI regression test above.
- Run `bun test test/cli-scan.test.ts test/domain-scan.test.ts test/reporting.test.ts`.
- Run `bun run verify`.

## Done criteria

- [ ] Missing custom roots selected during interactive scans appear in `report.diagnostics`.
- [ ] Warning diagnostics do not make the scan fail.
- [ ] Existing unreadable-root diagnostics still appear and still fail scans when severity is `error`.
- [ ] `bun test test/cli-scan.test.ts test/domain-scan.test.ts test/reporting.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 019 `DONE`.

## STOP conditions

Stop and report back if:

- Preserving diagnostics requires changing the public JSON report schema version.
- The prompt flow has changed and no longer supports adding custom paths interactively.
- The implementation would make warning diagnostics fail the scan.

## Maintenance notes

Future discovery diagnostics should flow through the same path into `ScanReport`. Reviewers should check that diagnostics from both root discovery and root scanning are visible in JSON output without being double-counted.
