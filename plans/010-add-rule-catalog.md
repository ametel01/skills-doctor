# Plan 010: Add a public rule catalog for scanner findings

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/domain/rules/quality.ts src/domain/rules/structural.ts docs/SKILLS_SPEC.md README.md test/quality-rules.test.ts test/structural-rules.test.ts`
> If any in-scope file changed since this plan was written, compare the current rule IDs against the plan before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction, docs, dx
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

Rules are currently embedded inside validation functions. That works for scanning, but it makes it harder to document rule rationale, keep severities consistent, or expose a future `skills-doctor rules` command. A rule catalog creates a single reference for rule IDs, default severity, category, rationale, and spec citation without changing scanner behavior.

## Current state

Relevant files:

- `src/domain/rules/quality.ts` - contains quality rule IDs such as `weak-description-trigger`, `missing-skill-evals`, and `cross-ecosystem-skill-divergence`.
- `src/domain/rules/structural.ts` - contains structural/frontmatter rule IDs such as `missing-name` and `name-directory-mismatch`.
- `docs/SKILLS_SPEC.md` - source spec for rule rationale.
- `README.md` - lists what the scanner checks but not individual rule IDs.

Current excerpts:

```ts
// src/domain/rules/quality.ts:48-58
if (normalized.length > 0 && !TRIGGER_PATTERN.test(normalized)) {
  findings.push(
    createFinding(skill, {
      ruleId: "weak-description-trigger",
      severity: "warning",
      category: "description",
      title: "Description lacks a clear activation trigger",
```

```ts
// src/domain/rules/structural.ts:185-194
if (name !== skill.directoryName) {
  findings.push(
    createFinding(skill, {
      ruleId: "name-directory-mismatch",
      severity: "error",
      category: "frontmatter",
      title: "Skill name does not match directory",
```

README excerpt:

```md
// README.md:40-47
- required YAML frontmatter and valid `name`/`description` fields
- trigger-oriented descriptions
- non-generic skill bodies with concrete workflow structure
- progressive disclosure for large or referenced material
- referenced `references/`, `scripts/`, and `assets/` files
- script guidance that is non-interactive and reproducible
- eval guidance for non-trivial skills
- divergent same-name skills across Claude and Codex/agents roots
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Rule tests | `bun test test/quality-rules.test.ts test/structural-rules.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- New `src/domain/rules/catalog.ts` or `docs/RULES.md`.
- `src/domain/rules/quality.ts` and `src/domain/rules/structural.ts` only if moving constants into the catalog.
- Tests that ensure catalog coverage of emitted rule IDs.
- README link to rule catalog.

**Out of scope**:

- Changing rule behavior or severities unless a mismatch is found and explicitly justified.
- Adding a CLI `rules` subcommand in this plan.
- Rewriting the scanner architecture.

## Git workflow

- Branch: `advisor/010-add-rule-catalog`
- Commit message: `docs: add skills doctor rule catalog`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Choose catalog shape

Recommended first pass: add `docs/RULES.md` plus a lightweight TypeScript test helper that lists emitted rule IDs. Do not move all rule definitions into code constants unless you are prepared to update every `createFinding()` call.

If you choose a code catalog, define a typed object keyed by rule ID with fields:

- `severity`
- `category`
- `title`
- `rationale`
- `specReference`

**Verify**: no command; choice should be clear from changed files.

### Step 2: Write the rule catalog

Create `docs/RULES.md` with sections matching the scanner categories:

- Frontmatter
- Description
- Body quality
- Progressive disclosure
- References/scripts/assets
- Evals
- Cross-ecosystem portability

For each existing rule ID, include one short row with severity, what triggers it, and the relevant `docs/SKILLS_SPEC.md` section.

**Verify**: `bun run check` -> exit 0.

### Step 3: Add coverage that rule IDs are documented

Add a test that prevents future undocumented rule IDs. Keep it simple:

- Read `docs/RULES.md`.
- Maintain an array of known emitted rule IDs in the test, or export a `RULE_IDS` list if adding code catalog.
- Assert each rule ID appears in `docs/RULES.md`.

If a code catalog is added, assert emitted findings use IDs present in the catalog.

**Verify**: `bun test test/quality-rules.test.ts test/structural-rules.test.ts` or a new focused docs test -> exit 0.

### Step 4: Link from README

Add one short README sentence under "What It Checks" pointing to `docs/RULES.md` for rule IDs and rationale.

**Verify**: `bun run check` -> exit 0.

### Step 5: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add documentation coverage for rule IDs.
- Preserve all existing rule behavior tests.
- Full verification must pass.

## Done criteria

- [ ] `docs/RULES.md` documents all current rule IDs.
- [ ] A test prevents undocumented rule IDs from being added silently.
- [ ] README links to the catalog.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- You find rule IDs emitted dynamically in a way that cannot be cataloged reliably.
- The maintainer wants a CLI `rules` command included in the same change.
- Cataloging reveals severity/category inconsistencies requiring product decisions.

## Maintenance notes

Reviewers should check that the catalog describes current behavior, not aspirational rules. A future plan can add `skills-doctor rules` once the catalog is stable.
