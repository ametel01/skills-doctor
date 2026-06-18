# Plan 042: Stop resource reference matches at sentence punctuation

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52d6f0e..HEAD -- src/domain/rules/quality.ts test/quality-rules.test.ts docs/RULES.md docs/SKILLS_SPEC.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52d6f0e`, 2026-06-18

## Why this matters

Skills commonly reference files in prose, for example `Read references/spec.md.` at the end of a sentence. The current resource-reference regex allows `.` anywhere in the path and consumes trailing sentence punctuation. That makes the scanner check `references/spec.md.` instead of `references/spec.md`, producing false `missing-referenced-resource` warnings for valid skills.

## Current state

Relevant files:

- `src/domain/rules/quality.ts` - extracts `scripts/`, `references/`, and `assets/` paths and checks whether they exist.
- `test/quality-rules.test.ts` - covers resource reference behavior, symlink escapes, and rule catalog synchronization.
- `docs/SKILLS_SPEC.md` - explains that relative paths resolve from the skill root.
- `docs/RULES.md` - documents emitted rule IDs; update only if rule IDs or meanings change.

The current regex includes periods in the matched path:

```ts
// src/domain/rules/quality.ts:20
const RESOURCE_REFERENCE_PATTERN = /\b(scripts|references|assets)\/[A-Za-z0-9._/-]+/g;
```

The match is used directly for filesystem checks and user-facing messages:

```ts
// src/domain/rules/quality.ts:289
const resourceStatus = await resolveResourceStatus(skill, referencePath, options);
...
message: `The skill references ${referencePath}, but that path does not exist inside the skill directory.`,
```

The default filesystem check resolves that exact string:

```ts
// src/domain/rules/quality.ts:526
const targetPath = path.resolve(skill.skillDir, referencePath);
let resolvedTarget: string;
try {
  resolvedTarget = await realpath(targetPath);
} catch {
  return "missing";
}
```

A quick runtime probe against the current pattern shows the issue:

```text
"Read references/spec.md.".match(RESOURCE_REFERENCE_PATTERN)
=> ["references/spec.md."]
```

Repo conventions to match:

- Keep rule IDs stable. This should not add, remove, or rename `missing-referenced-resource`.
- Quality-rule tests build isolated temp skill directories and call `validateQualityRules()`.
- Resource checks must continue to reject `..` traversal and symlink escapes, already covered in `test/quality-rules.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/quality-rules.test.ts` | all tests in that file pass |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Lint/format check | `bun run check` | exit 0, no fixes applied |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/rules/quality.ts`
- `test/quality-rules.test.ts`
- `docs/RULES.md` only if the documented rule text needs a wording clarification
- `CHANGELOG.md` if this repo expects scanner false-positive fixes to be logged before release
- `plans/README.md` status row for this plan

**Out of scope**:

- Changing resource directory names or adding new resource categories.
- Changing missing-resource severity or rule ID.
- Reworking Markdown parsing generally.
- Changing symlink escape policy.
- Changing eval detection.

## Git workflow

- Branch: `advisor/042-stop-resource-reference-matches-at-punctuation`
- Commit message: `fix: stop resource references at punctuation`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add regression tests for punctuation after resource paths

In `test/quality-rules.test.ts`, add a test near `"accepts regular resource references that resolve inside the skill directory"`.

Create a temp skill directory with:

- `references/spec.md`
- `scripts/tool.py`
- `assets/template.md`

Build a skill body that references those files at sentence boundaries, for example:

```md
## Workflow

- Read references/spec.md.
- Run scripts/tool.py, then inspect the output.
- Copy assets/template.md) when creating the response.
```

Expected assertions:

- `missing-referenced-resource` is not reported for `references/spec.md.`
- the message list does not include paths with trailing `.`, `,`, `)`, or similar punctuation.
- existing script-help behavior still applies for `scripts/tool.py` unless the body documents `--help`. If that warning makes the test noisy, include `--help` in the script instruction.

Also add a negative case that a filename with an internal dot still works, such as `references/api-errors.v1.md`.

**Verify**: `bun run test -- test/quality-rules.test.ts` should fail before the implementation.

### Step 2: Narrow or post-process resource path extraction

In `src/domain/rules/quality.ts`, update resource reference extraction so trailing prose punctuation is not part of the path while internal filename dots remain valid.

Acceptable approaches:

- Replace the regex with one that ends on a valid filename character and excludes trailing punctuation.
- Keep the regex broad and normalize each match with a helper such as `stripTrailingResourcePunctuation(referencePath)`.

Prefer the helper approach if it is easier to read and test. It should strip trailing characters that are common prose delimiters but not valid final filename characters in this scanner context:

```ts
const normalizeReferencePath = (referencePath: string): string =>
  referencePath.replace(/[.,;:!?)}\]]+$/g, "");
```

If you use a helper, apply it before `new Set(...)` so duplicate references dedupe after normalization:

```ts
const referencedPaths = [
  ...new Set((skill.content.match(RESOURCE_REFERENCE_PATTERN) ?? []).map(normalizeReferencePath)),
].filter((referencePath) => referencePath.length > 0);
```

Do not strip internal dots, hyphens, underscores, or slashes. Do not allow parent traversal.

**Verify**: `bun run test -- test/quality-rules.test.ts` passes.

### Step 3: Preserve escape and missing-resource behavior

Confirm existing tests still pass for:

- `references/../../outside.md` -> `resource-reference-escapes-skill`
- symlinked resource resolving outside the skill directory -> `resource-reference-escapes-skill`
- genuinely missing `scripts/missing.py` -> `missing-referenced-resource`
- existing script without help guidance -> `script-without-help-guidance`

If a regression appears, fix only the extraction normalization. Do not weaken `hasParentTraversal()` or `resolveResourceStatus()`.

**Verify**: `bun run test -- test/quality-rules.test.ts` passes.

### Step 4: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- New `test/quality-rules.test.ts` coverage for existing resource files referenced with trailing `.`, `,`, `)`, and/or `]`.
- New or updated assertion that internal dotted filenames like `api-errors.v1.md` still resolve.
- Existing tests continue covering missing resources, script help guidance, parent traversal, and symlink escapes.

## Done criteria

- [ ] Valid references followed by sentence punctuation no longer produce `missing-referenced-resource`.
- [ ] User-facing missing-resource messages do not include trailing prose punctuation.
- [ ] Internal dotted filenames still work.
- [ ] Parent traversal and symlink escape warnings still fire.
- [ ] `bun run test -- test/quality-rules.test.ts` passes.
- [ ] `bun run verify` passes.
- [ ] No rule IDs or report schema fields change.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Resource extraction has already been replaced by a Markdown parser or a different mechanism and the cited regex no longer exists.
- Fixing punctuation requires a broad parser rewrite.
- A valid in-repo test fixture relies on filenames ending in punctuation such as `references/file.`. Treat that as a product decision for the maintainer.
- The fix changes the emitted rule catalog or finding schema.
- `bun run verify` fails twice after reasonable fixes.

## Maintenance notes

This scanner uses regex heuristics rather than a full Markdown parser. Review future resource-reference changes against ordinary prose examples, inline code spans, and security cases together so false-positive fixes do not weaken path escape checks.
