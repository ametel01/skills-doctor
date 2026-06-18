# Plan 032: Document the public API and report schema

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/index.ts src/domain/types.ts src/domain/build-report.ts test/api-fixtures.test.ts README.md docs`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The package publishes a typed root export and README shows a short programmatic API snippet, but consumers must infer supported imports and report shapes from source and tests. That raises integration cost and makes accidental semver breaks harder to spot. A schema reference also helps agents and downstream automation consume JSON output safely.

## Current state

```json
// package.json:10-15
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

```ts
// src/index.ts:1-49
export { buildHandoffPrompt } ...
export { discoverSkillRoots } ...
export { parseSkillContent } ...
export { validateQualityRules } ...
export { scanSkillRoots } ...
export type { Diagnostic, Finding, ScanResult, SkillRoot } ...
```

```ts
// src/domain/build-report.ts:15-32
export type ScanReport = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly version: string;
  readonly directory: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly findings: readonly Finding[];
  readonly handoffRequested: boolean;
};
```

Existing shape lock: `test/api-fixtures.test.ts:72` asserts JSON report key order and core finding fields.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Docs check | `bun run check` | exit 0 |
| API fixture tests | `bun run test -- test/api-fixtures.test.ts` | all pass |

## Scope

**In scope**:
- `docs/API.md` (create) or README API section expansion
- `README.md` link to the API doc
- Optional tests only if docs are generated from source

**Out of scope**:
- Changing exported API names.
- Changing JSON schema.
- Adding new CLI flags.

## Git workflow

- Branch: `advisor/032-add-public-api-reference`
- Commit message: `docs: add public api reference`

## Steps

### Step 1: Create the API reference

Create `docs/API.md` with sections for:

- Install/import prerequisites.
- Supported exports from `src/index.ts`.
- Common call flow: `discoverSkillRoots` -> `scanSkillRoots` -> `buildScanReport`.
- `ScanReport`, `Finding`, `Diagnostic`, `SkillRoot`, and `SkillSummary` schemas.
- Exit-code relationship through `resolveScanExitCode`.
- Schema/version compatibility note: `schemaVersion: 1` is the machine-readable contract.

**Verify**: `rg -n "ScanReport|Finding|Diagnostic|resolveScanExitCode" docs/API.md` finds all sections.

### Step 2: Ground examples in current code

Use the existing README snippet as the basic example, but add:

- JSON mode equivalence: CLI JSON report and `buildScanReport` share the report shape.
- Diagnostics example for unreadable roots/files without including secret values.
- Note that `validateQualityRules` currently performs filesystem checks for resources and eval files.

**Verify**: examples compile conceptually against exports in `src/index.ts`.

### Step 3: Link from README

Add a short README sentence under "Programmatic API" pointing to `docs/API.md` for schema details.

**Verify**: `bun run check` exits 0.

## Test plan

- Documentation-only. Run `bun run check`.
- Run `bun run test -- test/api-fixtures.test.ts` to ensure documented schema still matches locked shape.

## Done criteria

- [ ] `docs/API.md` exists and documents supported exports.
- [ ] `ScanReport`, `Finding`, and `Diagnostic` are documented.
- [ ] README links to the API doc.
- [ ] `bun run check` and `bun run test -- test/api-fixtures.test.ts` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer cannot decide which exports are stable.
- Accurate docs require changing the public API.

## Maintenance notes

When adding or removing exports, update this doc and `test/api-fixtures.test.ts` together. Schema docs should track `schemaVersion`.
