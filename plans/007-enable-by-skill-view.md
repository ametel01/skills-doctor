# Plan 007: Expose the grouped findings view in the review menu

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/cli/commands/scan.ts test/cli-scan.test.ts`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx, tech-debt
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

The CLI contains code to render findings grouped by skill, but users cannot choose that view because the review menu does not include it. Exposing the existing view improves interactive review with minimal risk. If the grouped view is no longer desired, remove the dead branch instead; do not leave unreachable UI code.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - review menu and renderers.
- `test/cli-scan.test.ts` - interactive scan behavior tests.

Current excerpts:

```ts
// src/cli/commands/scan.ts:48-50
type RootSelection = "all" | "claude" | "codex" | "custom";
type RootScopeSelection = "all" | "local" | "global" | "custom";
type ReviewAction = "all" | "errors" | "by-skill" | "repair" | "exit";
```

```ts
// src/cli/commands/scan.ts:201-206
const action = await prompts.select<ReviewAction>("Next step", [
  { name: "Fix skills with Claude or Codex", value: "repair" },
  ...(report.errorCount > 0 ? [{ name: "View errors", value: "errors" as const }] : []),
  { name: "View all findings", value: "all" },
  { name: "Exit", value: "exit" },
]);
```

```ts
// src/cli/commands/scan.ts:217-221
if (action === "by-skill") {
  write(renderFindingsBySkill(selectedFindings));
  return;
}
write(renderFindings(selectedFindings));
```

Repo conventions:

- Prompt tests use fake prompt adapters with queued `select` answers.
- Human output assertions use `stdout.join("")` contains checks.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`

**Out of scope**:

- Redesigning the full interactive flow.
- Changing finding selection for repair.
- Changing JSON output.

## Git workflow

- Branch: `advisor/007-enable-by-skill-view`
- Commit message: `fix: expose grouped findings review`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the menu option

Add a menu option to `reviewFindings()`:

```ts
{ name: "View findings by skill", value: "by-skill" },
```

Place it near `View all findings`. Keep `Fix skills with Claude or Codex` first if that is the intended happy path.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add an interactive regression test

Add a test that creates a bad skill, queues `"by-skill"`, and asserts stdout contains grouped output like:

- `other-name:` or the relevant skill name.
- `- [error] name-directory-mismatch` or another expected rule.

The test should not launch a repair agent.

**Verify**: `bun test test/cli-scan.test.ts` -> exit 0.

### Step 3: Run full verification

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Add one CLI test for selecting `by-skill`.
- Existing `exit`, `repair`, `errors`, and `all` paths should continue passing.

## Done criteria

- [ ] Interactive menu includes `View findings by skill`.
- [ ] Selecting it renders grouped findings.
- [ ] Regression test covers the path.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- The maintainer says grouped review should be removed instead of exposed.
- The renderer output has already been removed or redesigned.
- Adding the menu option conflicts with prompt ordering tests.

## Maintenance notes

Reviewers should check prompt ordering and wording. If future review actions grow, consider extracting review menu construction into a tested helper.
