# Plan 036: Decouple exported quality rules from direct filesystem access

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/index.ts src/domain/rules/quality.ts src/domain/scan-skills.ts src/domain/types.ts test/quality-rules.test.ts test/api-fixtures.test.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

`validateQualityRules` is exported from the public API, but it performs hidden filesystem checks for referenced resources and `evals/evals.json`. API consumers cannot validate in-memory skill snapshots or alternate filesystems without creating real files. A small adapter boundary makes the rule engine easier to test and embed.

## Current state

```ts
// src/index.ts:24
export { validateQualityRules } from "./domain/rules/quality.js";
```

```ts
// src/domain/rules/quality.ts:1
import { access } from "node:fs/promises";
```

```ts
// src/domain/rules/quality.ts:268-269, 337-338
const absolutePath = path.join(skill.skillDir, referencePath);
if (!(await exists(absolutePath))) { ... }
const evalsPath = path.join(skill.skillDir, "evals", "evals.json");
if (await exists(evalsPath)) return [];
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/quality-rules.test.ts test/api-fixtures.test.ts` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/rules/quality.ts`
- `src/domain/scan-skills.ts` if scanner must pass adapters
- `src/index.ts` only to preserve/export new types if needed
- Tests for pure and filesystem-backed validation

**Out of scope**:
- Removing the existing exported `validateQualityRules` function.
- Changing emitted rule IDs or messages.
- Changing `SkillRecord` unless necessary and backward compatible.

## Git workflow

- Branch: `advisor/036-decouple-quality-rules-from-filesystem`
- Commit message: `refactor: inject quality rule filesystem checks`

## Steps

### Step 1: Add an options object without breaking callers

Update `validateQualityRules` to accept an optional second parameter, for example:

```ts
type QualityRuleOptions = {
  readonly resourceExists?: (skill: SkillRecord, referencePath: string) => Promise<boolean>;
  readonly evalsExist?: (skill: SkillRecord) => Promise<boolean>;
};
```

Default implementations should preserve current filesystem behavior.

**Verify**: `bun run typecheck` passes with existing callers unchanged.

### Step 2: Move direct `access` behind default adapters

Keep filesystem-backed default behavior but route resource/eval checks through the injected functions. Preserve path traversal checks and categories.

**Verify**: existing `test/quality-rules.test.ts` passes.

### Step 3: Add pure-rule tests

Add tests that call `validateQualityRules([skill], { resourceExists, evalsExist })` without creating real resource/eval files. Assert:

- Missing resource is emitted when adapter returns false.
- Existing resource suppresses missing-resource finding when adapter returns true.
- Missing eval advice is controlled by `evalsExist`.

**Verify**: focused tests pass.

### Step 4: Document the public API nuance if needed

If adding exported option types, update `docs/API.md` if it exists, or add a concise README/API note.

**Verify**: `bun run verify` exits 0.

## Test plan

- Existing filesystem-backed tests remain green.
- New injected-adapter tests cover in-memory behavior.

## Done criteria

- [ ] `validateQualityRules` can run with injected existence checks.
- [ ] Existing public call signature still works.
- [ ] Rule IDs/messages remain stable.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Backward compatibility requires a breaking public API change.
- The adapter design conflicts with the scanner's need for realpath symlink checks from plan 024.

## Maintenance notes

If plan 024 has landed, make sure injected resource checks can still represent "exists but escapes" distinctly enough for the scanner policy.
