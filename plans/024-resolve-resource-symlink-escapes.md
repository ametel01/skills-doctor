# Plan 024: Resolve resource targets before accepting in-skill references

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report; do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- src/domain/rules/quality.ts test/quality-rules.test.ts docs/RULES.md`
> If any in-scope file changed, compare the excerpts below with live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

Skills Doctor intends resource references to stay inside the skill directory. The current rule rejects literal `..` segments, but it accepts an in-skill symlink whose resolved target is outside the skill. That can falsely tell users and repair agents that an external resource is valid and portable.

## Current state

- `src/domain/rules/quality.ts` owns resource-reference validation.
- `test/quality-rules.test.ts` has missing-resource and literal traversal coverage.
- `docs/RULES.md` documents emitted rule IDs.

Current excerpts:

```ts
// src/domain/rules/quality.ts:248-269
const referencedPaths = [...new Set(skill.content.match(RESOURCE_REFERENCE_PATTERN) ?? [])];
for (const referencePath of referencedPaths) {
  if (hasParentTraversal(referencePath)) {
    findings.push(createFinding(skill, { ruleId: "resource-reference-escapes-skill", ... }));
    continue;
  }
  const absolutePath = path.join(skill.skillDir, referencePath);
  if (!(await exists(absolutePath))) {
    findings.push(createFinding(skill, { ruleId: "missing-referenced-resource", ... }));
    continue;
  }
}

// src/domain/rules/quality.ts:464-467
await access(targetPath);
```

Repo conventions: tests use `mkdtemp`, temp skill directories, and direct calls to `validateQualityRules`; follow `test/quality-rules.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Format/lint | `bun run check` | exit 0, no fixes applied |
| Typecheck | `bun run typecheck` | exit 0 |
| Focused tests | `bun run test -- test/quality-rules.test.ts` | all tests pass |
| Full tests | `bun run test` | all tests pass |

## Scope

**In scope**:
- `src/domain/rules/quality.ts`
- `test/quality-rules.test.ts`
- `docs/RULES.md` only if a new rule ID is added

**Out of scope**:
- Changing the public `Finding` shape.
- Removing support for normal non-symlink `scripts/`, `references/`, or `assets/` files.
- Following resource references outside the current skill as an accepted feature.

## Git workflow

- Branch: `advisor/024-resolve-resource-symlink-escapes`
- Commit message style: conventional commits, e.g. `fix: reject symlinked resource escapes`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add symlink-escape regression tests

In `test/quality-rules.test.ts`, add temp-backed tests that create a skill with `references/local.md` as a symlink to a file outside `skill.skillDir`. Assert `resource-reference-escapes-skill` is emitted. Add a paired case where `references/local.md` is a regular file inside the skill and no escape finding is emitted.

**Verify**: `bun run test -- test/quality-rules.test.ts` initially fails for the symlink escape case and passes the regular-file case.

### Step 2: Resolve real resource targets

In `src/domain/rules/quality.ts`, replace the simple `exists()` acceptance path with a helper that:

- Builds the candidate path with `path.resolve(skill.skillDir, referencePath)`.
- Resolves `skill.skillDir` and the candidate target using `realpath`.
- Treats missing targets as `missing-referenced-resource`.
- Treats resolved targets outside the resolved skill directory as `resource-reference-escapes-skill`.
- Keeps literal `..` handling intact.

Use path-relative containment, not string prefix alone. A target is inside when `path.relative(resolvedSkillDir, resolvedTarget)` is not empty traversal and not absolute.

**Verify**: `bun run test -- test/quality-rules.test.ts` passes.

### Step 3: Preserve rule catalog consistency

If you reuse `resource-reference-escapes-skill`, no docs update is needed. If you add a dedicated symlink rule ID, add it to `docs/RULES.md` and update the catalog coverage test expectations.

**Verify**: `bun run check && bun run typecheck && bun run test` exits 0.

## Test plan

- Add symlink escape test in `test/quality-rules.test.ts`.
- Add regular in-skill resource test to avoid blocking valid files.
- Preserve existing literal traversal test at `test/quality-rules.test.ts:214`.

## Done criteria

- [ ] Symlinked resource target outside the skill emits `resource-reference-escapes-skill`.
- [ ] Regular in-skill resource remains accepted.
- [ ] `bun run check`, `bun run typecheck`, and `bun run test` pass.
- [ ] Only in-scope files changed.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Node/Bun on the target platform cannot create symlinks in tests; report this instead of deleting coverage.
- The fix requires changing the public report schema.
- Existing users intentionally rely on accepted external symlink resources and the maintainer asks for a policy decision.

## Maintenance notes

Review path containment carefully on Windows and POSIX. Future resource rules should use the same resolver so scanner policy does not split between textual and real filesystem checks.
