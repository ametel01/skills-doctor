# Plan 029: Cover script help guidance for existing scripts

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/domain/rules/quality.ts test/quality-rules.test.ts docs/RULES.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The public rule catalog documents `script-without-help-guidance`, but current tests mostly reference missing scripts. Because the implementation continues after missing resources, the branch that emits help-guidance warnings for existing scripts is not directly protected. A documented rule can drift without a failing test.

## Current state

```ts
// src/domain/rules/quality.ts:268-284
const absolutePath = path.join(skill.skillDir, referencePath);
if (!(await exists(absolutePath))) {
  findings.push(createFinding(skill, { ruleId: "missing-referenced-resource", ... }));
  continue;
}

if (referencePath.startsWith("scripts/") && !/\b--help\b/.test(body)) {
  findings.push(createFinding(skill, { ruleId: "script-without-help-guidance", ... }));
}
```

```ts
// test/quality-rules.test.ts:112-122
const skill = buildRecord("script-skill", [
  ...
  "- Run scripts/missing.py.",
]);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/quality-rules.test.ts` | all pass |
| Full tests | `bun run test` | all pass |

## Scope

**In scope**:
- `test/quality-rules.test.ts`
- Test helper adjustments in the same file

**Out of scope**:
- Changing scanner behavior.
- Changing `docs/RULES.md` unless a rule ID changes, which this plan should not do.

## Git workflow

- Branch: `advisor/029-cover-existing-script-help-guidance`
- Commit message: `test: cover script help guidance`

## Steps

### Step 1: Add an existing-script warning case

In `test/quality-rules.test.ts`, add a temp-backed test that writes:

- A skill directory with `SKILL.md`.
- A real `scripts/tool.py` or `scripts/tool.sh` file.
- Body text that references `scripts/tool.py` but does not mention `--help`.

Run `scanSkillRoots` or `validateQualityRules` with a `SkillRecord` whose `skillDir` points at the temp directory. Assert `script-without-help-guidance` appears.

**Verify**: `bun run test -- test/quality-rules.test.ts` passes.

### Step 2: Add the suppression case

Add a paired case where body text references the same existing script and includes `--help`. Assert `script-without-help-guidance` does not appear.

**Verify**: focused tests pass.

### Step 3: Run full tests

Run the full suite to catch fixture interactions.

**Verify**: `bun run test` passes.

## Test plan

- Existing script without `--help` emits `script-without-help-guidance`.
- Existing script with `--help` suppresses it.
- Missing-script tests remain unchanged.

## Done criteria

- [ ] The documented rule has direct positive and negative tests.
- [ ] No production code changed.
- [ ] `bun run test` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The only way to add the test requires changing production code.
- Temp filesystem setup becomes platform-specific beyond normal Node APIs.

## Maintenance notes

When adding future documented rule IDs, include at least one test that reaches the exact branch emitting the rule.
