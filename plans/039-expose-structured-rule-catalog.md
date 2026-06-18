# Plan 039: Expose the rule catalog as structured API and CLI data

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- docs/RULES.md src/domain/rules src/domain/types.ts src/index.ts src/cli/index.ts test README.md`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

`docs/RULES.md` is structured, and findings carry rule IDs, severities, and categories. Integrations still have to scrape Markdown or duplicate metadata to render explanations and validate unknown rule IDs. A structured catalog gives API and CLI users a stable machine-readable source of rule metadata.

## Current state

```md
<!-- docs/RULES.md:7-25 -->
| Rule ID | Severity | Category | What it checks |
| `missing-skill` | error | frontmatter | ... |
```

```ts
// src/domain/types.ts:43-57
export type Finding = {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
};
```

```ts
// test/quality-rules.test.ts:229-254
it("documents all emitted rule IDs", async () => {
  ...
  expect(ruleCatalog).toContain(`\`${ruleId}\``);
});
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/quality-rules.test.ts test/api-fixtures.test.ts` | all pass |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:
- New structured catalog module under `src/domain/`
- `src/index.ts` export
- Optional `skills-doctor rules --json` CLI surface
- `docs/RULES.md` generation/check updates
- Tests keeping emitted rule IDs and catalog synchronized

**Out of scope**:
- Changing existing rule IDs.
- Changing finding emission behavior.
- Building a web docs site.

## Git workflow

- Branch: `advisor/039-expose-structured-rule-catalog`
- Commit message: `feat: expose structured rule catalog`

## Steps

### Step 1: Create structured rule metadata

Add a source-of-truth module, for example `src/domain/rule-catalog.ts`, with entries:

```ts
type RuleCatalogEntry = {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly description: string;
};
```

Include all rule IDs currently emitted by `structural.ts` and `quality.ts`.

**Verify**: `bun run typecheck` passes.

### Step 2: Export the catalog

Export the catalog and its type from `src/index.ts`. If adding CLI support, add a `rules` subcommand or option that prints JSON without interfering with current default scan command.

**Verify**: `bun run test -- test/api-fixtures.test.ts` passes or is updated intentionally.

### Step 3: Keep docs synchronized

Either generate `docs/RULES.md` from the structured catalog or add a test that parses `docs/RULES.md` and asserts every catalog entry exists with matching severity/category. Replace the current source-regex-only test with catalog-based coverage.

**Verify**: `bun run test -- test/quality-rules.test.ts` passes.

### Step 4: Document the API/CLI surface

Update README or `docs/API.md` with the structured catalog export and, if added, the CLI command:

```bash
skills-doctor rules --json
```

**Verify**: `bun run check` passes.

### Step 5: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- Catalog contains every emitted rule ID.
- Catalog severity/category match docs.
- Public API exports catalog.
- Optional CLI JSON output parses and includes known rule IDs.

## Done criteria

- [ ] Structured rule catalog exists.
- [ ] Public API exposes it.
- [ ] Docs and emitted rule IDs are synchronized by tests.
- [ ] Optional CLI surface is documented if implemented.
- [ ] `bun run verify` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer does not want rule metadata to become a compatibility contract.
- CLI subcommand design conflicts with the current single-command Commander setup.

## Maintenance notes

Once exposed, rule metadata is semver-sensitive. Add review checklist coverage for new/renamed rules.
