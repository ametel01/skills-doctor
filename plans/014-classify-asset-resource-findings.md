# Plan 014: Classify asset resource findings explicitly

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 75209d4..HEAD -- src/domain/types.ts src/domain/rules/quality.ts docs/RULES.md test/quality-rules.test.ts test/api-fixtures.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug, docs
- **Planned at**: commit `75209d4`, 2026-06-16

## Why this matters

The scanner recognizes `assets/...` references, but the report category type has no `assets` value and `resourceCategory()` falls through to `progressive-disclosure`. The public rule catalog also documents missing resources under `references` even when the missing resource is a script or asset. This makes grouped reports and automation less precise for one of the three supported resource directories.

## Current state

Relevant files:

- `src/domain/types.ts` - defines the allowed `FindingCategory` strings.
- `src/domain/rules/quality.ts` - detects resource references and assigns categories.
- `docs/RULES.md` - public rule catalog for emitted findings.
- `test/quality-rules.test.ts` - covers missing resources but not asset-specific categories.
- `test/api-fixtures.test.ts` - serializes reports and may need updates if category expectations are exact.

Current excerpts:

```ts
// src/domain/types.ts:31-40
export type FindingCategory =
  | "frontmatter"
  | "description"
  | "body-quality"
  | "progressive-disclosure"
  | "references"
  | "scripts"
  | "evals"
  | "portability"
  | "cross-ecosystem";
```

```ts
// src/domain/rules/quality.ts:20
const RESOURCE_REFERENCE_PATTERN = /\b(scripts|references|assets)\/[A-Za-z0-9._/-]+/g;
```

```ts
// src/domain/rules/quality.ts:407-413
const resourceCategory = (
  referencePath: string,
): "references" | "scripts" | "progressive-disclosure" => {
  if (referencePath.startsWith("references/")) return "references";
  if (referencePath.startsWith("scripts/")) return "scripts";
  return "progressive-disclosure";
};
```

```md
// docs/RULES.md:55-56
| `missing-referenced-resource` | warning | references | Referenced `scripts/`, `references/`, or `assets/` file does not exist in-skill. |
| `resource-reference-escapes-skill` | warning | references | Resource references attempt directory traversal outside the skill directory. |
```

Repo conventions:

- Rule IDs stay stable; this plan changes category values, not rule IDs.
- `docs/RULES.md` should stay aligned with emitted rules and categories.
- Tests prefer direct `ruleId` and field assertions over snapshots.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/quality-rules.test.ts test/api-fixtures.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint/check | `bun run check` | exit 0, no fixes applied |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/types.ts`
- `src/domain/rules/quality.ts`
- `docs/RULES.md`
- `test/quality-rules.test.ts`
- `test/api-fixtures.test.ts` only if exact category fixtures need updates

**Out of scope**:

- Changing resource path matching behavior.
- Changing severity, rule IDs, or repair suggestions.
- Reworking report grouping.

## Git workflow

- Branch: `advisor/014-asset-resource-category`
- Commit message: `fix: classify asset resource findings`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add asset-specific category coverage

In `test/quality-rules.test.ts`, add or extend a test that builds a skill body referencing `assets/missing-template.md`.

Assert the emitted `missing-referenced-resource` finding has:

- `ruleId === "missing-referenced-resource"`
- `category === "assets"`

If practical, also assert a `scripts/missing.py` reference remains `scripts` and `references/missing.md` remains `references`.

**Verify**: `bun test test/quality-rules.test.ts` -> fails on the asset category before the fix.

### Step 2: Add the `assets` category and use it

Update `FindingCategory` in `src/domain/types.ts` to include `"assets"`.

Update `resourceCategory()` in `src/domain/rules/quality.ts` to return `"assets"` when `referencePath.startsWith("assets/")`. Its return type should become `"references" | "scripts" | "assets"` unless another caller truly needs the old fallback.

**Verify**: `bun test test/quality-rules.test.ts` -> exit 0.

### Step 3: Update the rule catalog wording

Update `docs/RULES.md` so the resource rules do not imply all missing resources belong to `references`. Acceptable wording is to use a combined category like `references/scripts/assets` in the table, or to add a note under the table that these rules use the category matching the referenced resource directory.

Keep the rule IDs unchanged.

**Verify**: `bun test test/quality-rules.test.ts` -> exit 0, including the existing "documents all emitted rule IDs" test.

### Step 4: Run the standard gates

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0, no fixes applied
- `bun run verify` -> exit 0

## Test plan

- New test for `assets/...` missing references emitting category `assets`.
- Existing missing-resource tests continue to pass.
- API/report fixture tests pass if category serialization is covered.

## Done criteria

- [ ] `FindingCategory` includes `assets`.
- [ ] `assets/...` resource findings are not categorized as `progressive-disclosure`.
- [ ] `docs/RULES.md` accurately describes dynamic resource categories.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list are modified except `plans/README.md` status update.

## STOP conditions

Stop and report back if:

- A downstream consumer or fixture treats `FindingCategory` as a closed public contract that cannot add `assets` without a versioning decision.
- Existing report grouping relies on assets being grouped under `progressive-disclosure`.
- Fixing the category requires changing the resource reference parser itself.

## Maintenance notes

This is a small schema polish, but reviewers should check any generated docs or JSON fixtures that list allowed categories. Future resource directories should get explicit categories rather than falling through to an unrelated one.
