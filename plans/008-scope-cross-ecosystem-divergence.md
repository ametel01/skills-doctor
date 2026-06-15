# Plan 008: Scope cross-ecosystem divergence checks by source

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/types.ts src/domain/scan-skills.ts src/domain/rules/quality.ts test/quality-rules.test.ts test/domain-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug, dx
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

The divergence rule is meant to flag same-name skills that exist in both Claude and Codex/agents roots but differ. When users scan local and global roots together, same-name local and global skills may be unrelated. The current grouping uses only skill `name`, so it can over-report divergence across scopes.

## Current state

Relevant files:

- `src/domain/types.ts` - `SkillRecord` currently does not store root source.
- `src/domain/scan-skills.ts` - creates `SkillRecord` from `SkillRoot`.
- `src/domain/rules/quality.ts` - implements cross-ecosystem divergence by name.
- `test/quality-rules.test.ts` - tests divergence behavior.
- `test/domain-scan.test.ts` - tests root discovery and scan records.

Current excerpts:

```ts
// src/domain/types.ts:68-76
export type SkillRecord = {
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly skillDir: string;
  readonly skillPath: string;
  readonly directoryName: string;
  readonly content: string;
  readonly parseResult: ParseResult;
};
```

```ts
// src/domain/scan-skills.ts:41-49
skills.push({
  ecosystem: root.ecosystem,
  rootPath: root.rootPath,
  skillDir,
  skillPath,
  directoryName: entry.name,
  content,
  parseResult: parseSkillContent(content),
});
```

```ts
// src/domain/rules/quality.ts:309-323
const validateCrossEcosystem = (skills: readonly SkillRecord[]): Finding[] => {
  const findings: Finding[] = [];
  const byName = new Map<string, SkillRecord[]>();

  for (const skill of skills) {
    if (!skill.parseResult.ok) continue;
    const name = readString(skill.parseResult.frontmatter.data.name);
    if (name === undefined) continue;
    byName.set(name, [...(byName.get(name) ?? []), skill]);
  }

  for (const [name, namedSkills] of byName) {
    const ecosystems = new Set(namedSkills.map((skill) => skill.ecosystem));
```

Product intent:

- README says users can scan local project skills, global/root skills, or both.
- Divergence is intended for same-name skills across Claude and Codex/agents roots, not for unrelated same-name personal/project skills.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/quality-rules.test.ts test/domain-scan.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/types.ts`
- `src/domain/scan-skills.ts`
- `src/domain/rules/quality.ts`
- `test/quality-rules.test.ts`
- `test/domain-scan.test.ts`

**Out of scope**:

- Changing root discovery prompts.
- Removing the divergence rule.
- Adding config to ignore divergence.

## Git workflow

- Branch: `advisor/008-scope-cross-ecosystem-divergence`
- Commit message: `fix: scope skill divergence by root source`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Preserve root source on scanned skill records

Add `source: SkillRoot["source"]` or equivalent to `SkillRecord` in `src/domain/types.ts`. Populate it from `root.source` in `scanSkillRoots()`.

Update any tests or helper builders that construct `SkillRecord` manually.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Group divergence by name and source

Change `validateCrossEcosystem()` so it groups by both skill name and source, for example `${name}\u0000${skill.source}`. This keeps local Claude vs local Codex comparable and global Claude vs global Codex comparable, but avoids comparing local vs global.

Keep custom roots conservative: either exclude `source === "custom"` from this rule or group custom separately. Recommended: exclude custom from cross-ecosystem divergence unless there is a clear ecosystem pair.

**Verify**: `bun run typecheck` -> exit 0.

### Step 3: Add regression tests

In `test/quality-rules.test.ts`, add tests for:

- Local Claude + local Codex same-name divergent skills still produce `cross-ecosystem-skill-divergence`.
- Local Codex + global Claude same-name divergent skills do not produce the rule.

Use existing skill fixture builder style.

**Verify**: `bun test test/quality-rules.test.ts test/domain-scan.test.ts` -> exit 0.

### Step 4: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add positive and negative divergence tests split by `source`.
- Update any `SkillRecord` test helpers to include `source`.
- Full verification must pass.

## Done criteria

- [ ] `SkillRecord` includes root source.
- [ ] Divergence is checked only within the same source scope.
- [ ] Local/global false positive regression test exists.
- [ ] Existing same-source divergence behavior still works.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- The maintainer wants local/global same-name divergence to remain reportable.
- Adding `source` to `SkillRecord` causes unexpected public API concerns.
- Existing custom-root semantics are unclear enough to need a product decision.

## Maintenance notes

Reviewers should confirm the rule still catches the intended portability issue. If users need more control later, add an explicit configuration/ignore mechanism rather than broadening the heuristic again.
