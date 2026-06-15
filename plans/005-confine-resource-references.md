# Plan 005: Reject resource references that escape the skill directory

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/rules/quality.ts test/quality-rules.test.ts docs/SKILLS_SPEC.md`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, bug
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

Resource references are supposed to point to files inside the skill directory. The current scanner joins the reference path to `skill.skillDir` but does not verify that the normalized path stays inside that directory. A reference like `references/../../outside.md` can be treated as existing if an outside file exists, violating the skill boundary and creating an unnecessary filesystem existence check outside the skill.

## Current state

Relevant files:

- `src/domain/rules/quality.ts` - extracts `scripts/`, `references/`, and `assets/` references and checks existence.
- `test/quality-rules.test.ts` - existing quality-rule coverage.
- `docs/SKILLS_SPEC.md` - product/spec language says resources are conventional folders inside a skill.

Current excerpts:

```ts
// src/domain/rules/quality.ts:20
const RESOURCE_REFERENCE_PATTERN = /\b(scripts|references|assets)\/[A-Za-z0-9._/-]+/g;
```

```ts
// src/domain/rules/quality.ts:223-239
const validateResources = async (skill: SkillRecord, body: string): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const referencedPaths = [...new Set(skill.content.match(RESOURCE_REFERENCE_PATTERN) ?? [])];

  for (const referencePath of referencedPaths) {
    const absolutePath = path.join(skill.skillDir, referencePath);
    if (!(await exists(absolutePath))) {
      findings.push(
        createFinding(skill, {
          ruleId: "missing-referenced-resource",
          severity: "warning",
          category: resourceCategory(referencePath),
          title: "Referenced resource does not exist",
          message: `The skill references ${referencePath}, but that path does not exist inside the skill directory.`,
```

Spec excerpt:

```md
// docs/SKILLS_SPEC.md:47-53
skill-name/
  SKILL.md
  scripts/
  references/
  assets/
```

Repo conventions:

- Rule findings are warning/advice unless structural correctness is impossible.
- Rule IDs are stable strings and should be tested by ID.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/quality-rules.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/rules/quality.ts`
- `test/quality-rules.test.ts`

**Out of scope**:

- Full markdown link parsing.
- Changing all resource-reference regex behavior beyond path confinement.
- Reading or validating resource file contents.

## Git workflow

- Branch: `advisor/005-confine-resource-references`
- Commit message: `fix: reject escaping skill resource references`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a helper that resolves references safely

In `src/domain/rules/quality.ts`, add a helper that resolves a matched reference and ensures it remains under `skill.skillDir`.

Target behavior:

- `references/foo.md` -> valid path inside skill directory.
- `references/../foo.md` -> valid only if normalized path is still inside skill directory and policy accepts it; recommended policy is reject any `..` segment for clarity.
- `references/../../outside.md` -> invalid finding.

A simple policy is:

```ts
const hasParentTraversal = referencePath.split(/[\\/]+/).includes("..");
```

If parent traversal exists, emit a warning finding and do not call `exists()` on the resolved path.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add a dedicated finding for escaping references

Add a new rule ID such as `resource-reference-escapes-skill` with category from `resourceCategory(referencePath)`, severity `warning`, and message explaining that resource references must stay inside the skill directory.

Keep `missing-referenced-resource` for normal missing in-skill paths.

**Verify**: `bun run typecheck` -> exit 0.

### Step 3: Add regression tests

In `test/quality-rules.test.ts`, add a test skill body that references `references/../../outside.md`. Assert that rule IDs include `resource-reference-escapes-skill` and do not rely on whether an outside file exists.

If practical, create an outside file and confirm the escaping reference is still rejected.

**Verify**: `bun test test/quality-rules.test.ts` -> exit 0.

### Step 4: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one regression test for a parent-directory escaping resource path.
- Preserve existing missing-resource tests.
- Full verification must pass.

## Done criteria

- [ ] Escaping references produce a dedicated warning finding.
- [ ] Escaping references are not checked with filesystem `access()` outside the skill directory.
- [ ] Normal missing resources still produce `missing-referenced-resource`.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- The maintainer wants to allow `..` references for a documented reason.
- Implementing this requires a full Markdown parser.
- Existing tests already encode parent traversal as supported.

## Maintenance notes

Reviewers should ensure the fix is about boundary enforcement, not broad security theater. Future resource parsing should keep a strict "inside skill directory" invariant.
