# Plan 018: Add line numbers to quality-rule findings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 3433e24..HEAD -- src/domain/rules/quality.ts src/domain/rules/structural.ts src/domain/build-handoff-prompt.ts test/quality-rules.test.ts test/handoff.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `3433e24`, 2026-06-16

## Why this matters

Structural findings already include frontmatter line numbers, and report rendering knows how to display `skillPath:line`. Quality-rule findings do not set `line`, so repair prompts and reports often point only at the whole `SKILL.md`. That makes the local-agent repair handoff less precise for large skills, especially for missing resources, script guidance, placeholder text, and destructive-operation warnings.

## Current state

- `Finding.line` is optional and already supported by report and prompt renderers.
- Structural rules pass `line` into `createFinding`.
- Quality rules use a local `createFinding` helper that has no `line` input and never sets `line`.
- Quality-rule tests currently assert rule IDs and categories, not line locations.

Relevant current excerpts:

```ts
// src/domain/types.ts:43-56
export type Finding = {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly skillDir: string;
  readonly skillPath: string;
  readonly skillName?: string | undefined;
  readonly line?: number | undefined;
  readonly agentRepairable: boolean;
};
```

```ts
// src/domain/rules/structural.ts:299-325
const createFinding = (
  skill: SkillRecord,
  input: {
    readonly ruleId: string;
    readonly severity: FindingSeverity;
    readonly category: FindingCategory;
    readonly title: string;
    readonly message: string;
    readonly suggestion: string;
    readonly line?: number | undefined;
  },
): Finding => ({
  ruleId: input.ruleId,
  severity: input.severity,
  category: input.category,
  title: input.title,
  message: input.message,
  suggestion: input.suggestion,
  ecosystem: skill.ecosystem,
  rootPath: skill.rootPath,
  skillDir: skill.skillDir,
  skillPath: skill.skillPath,
  skillName: skill.parseResult.ok
    ? readString(skill.parseResult.frontmatter.data.name)
    : skill.directoryName,
  line: input.line,
  agentRepairable: true,
});
```

```ts
// src/domain/rules/quality.ts:365-390
const createFinding = (
  skill: SkillRecord,
  input: {
    readonly ruleId: string;
    readonly severity: Finding["severity"];
    readonly category: FindingCategory;
    readonly title: string;
    readonly message: string;
    readonly suggestion: string;
  },
): Finding => ({
  ruleId: input.ruleId,
  severity: input.severity,
  category: input.category,
  title: input.title,
  message: input.message,
  suggestion: input.suggestion,
  ecosystem: skill.ecosystem,
  rootPath: skill.rootPath,
  skillDir: skill.skillDir,
  skillPath: skill.skillPath,
  skillName: skill.parseResult.ok
    ? readString(skill.parseResult.frontmatter.data.name)
    : skill.directoryName,
  agentRepairable: true,
});
```

```ts
// src/domain/build-handoff-prompt.ts:125-126
const formatFindingLocation = (finding: Finding): string =>
  `Location: ${finding.skillPath}${finding.line === undefined ? "" : `:${finding.line}`}`;
```

Repo conventions to match:

- Line numbers are 1-based. Structural frontmatter line calculation returns `index + 2` because raw frontmatter starts after the opening delimiter.
- Quality rules are deterministic regex heuristics; keep helpers simple and test with fixture strings.
- Do not make this a semantic parser. Approximate location of the matched text is enough.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/quality-rules.test.ts test/handoff.test.ts` | exit 0, tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/rules/quality.ts`
- `test/quality-rules.test.ts`
- `test/handoff.test.ts` only if prompt/report assertions need one line-number expectation refreshed.

**Out of scope**:
- `src/domain/rules/structural.ts` behavior; use it only as a pattern.
- `src/domain/build-handoff-prompt.ts` rendering; it already supports line numbers.
- Changing rule IDs, severities, categories, or finding messages.
- Building a Markdown AST parser.

## Git workflow

- Branch: `advisor/018-add-line-numbers-to-quality-findings`
- Commit message: `feat: include line numbers on quality findings`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Extend quality-rule finding creation to accept line numbers

In `src/domain/rules/quality.ts`, add `readonly line?: number | undefined` to the local `createFinding` input and set `line: input.line` in the returned `Finding`.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add deterministic line helper functions

In `src/domain/rules/quality.ts`, add small helpers near the existing `estimateTokens` and `exists` helpers:

- `findContentLine(content: string, pattern: RegExp): number | undefined`
- `findBodyLine(skill: SkillRecord, bodyTextOrPattern: string | RegExp): number | undefined`
- `findReferenceLine(content: string, referencePath: string): number | undefined`

Use 1-based line numbers against `skill.content`, not trimmed body-only strings. Escape literal strings before turning them into regexes.

Keep the implementation deterministic:

- Split content by `/\r?\n/`.
- Return the first matching line.
- For a `RegExp`, create a non-global copy before testing lines so repeated calls are not affected by `lastIndex`.

**Verify**: `bun test test/quality-rules.test.ts` -> existing tests still pass.

### Step 3: Attach lines to quality findings where evidence is local

Add `line` values for these rules:

- Description rules: line of the `description:` frontmatter key.
- Body pattern rules: line of the matched placeholder, generic text, workflow absence fallback to the first body line, tool menu, destructive term, interactive script guidance, and unpinned runner command.
- Progressive disclosure generic resource reference: line of the generic reference.
- Resource findings: line of the referenced `scripts/...`, `references/...`, or `assets/...` path.
- Script help guidance: line of the referenced script path.
- Missing evals: omit `line`; this finding is about an absent file, not a specific line.
- Cross-ecosystem divergence: omit `line`; this finding compares files.

If finding the first body line is awkward, use the first line after the closing frontmatter delimiter as the fallback for body-level findings.

**Verify**: `bun run typecheck` -> exit 0.

### Step 4: Add regression tests for representative line numbers

In `test/quality-rules.test.ts`, add assertions that:

- `missing-referenced-resource` for `scripts/missing.py` points at the line containing `scripts/missing.py`.
- `interactive-script-guidance` points at the line containing prompt guidance.
- `weak-description-trigger` points at the `description:` line.
- `missing-skill-evals` keeps `line` undefined.

Do not assert every rule's line number; representative coverage plus the helper implementation is enough.

**Verify**: `bun test test/quality-rules.test.ts` -> exit 0.

## Test plan

- Update `test/quality-rules.test.ts` with representative line assertions.
- Run `bun test test/quality-rules.test.ts test/handoff.test.ts`.
- Run `bun run verify`.

## Done criteria

- [ ] Quality findings that point to existing text include 1-based `line` values.
- [ ] Missing-file or cross-file quality findings only include `line` when there is a specific reference line in `SKILL.md`.
- [ ] Rule IDs, severities, categories, messages, and suggestions remain stable.
- [ ] `bun test test/quality-rules.test.ts test/handoff.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 018 `DONE`.

## STOP conditions

Stop and report back if:

- A quality rule has no reliable text anchor and would require a Markdown or YAML parser to locate.
- Adding line numbers would require changing the public `Finding` type shape.
- Tests reveal existing consumers depend on quality finding `line` being undefined.

## Maintenance notes

Line numbers are part of repair ergonomics, not rule identity. Plan 004 already stabilized finding comparison keys; reviewers should make sure adding lines does not reintroduce noisy post-handoff comparisons for findings whose message and suggestion are unchanged.
