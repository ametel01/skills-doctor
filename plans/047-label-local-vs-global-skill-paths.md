# Plan 047: Label local and global skill paths accurately in CLI output

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc7b239..HEAD -- src/cli/commands/scan.ts src/cli/utils/tui-dashboard.ts test/cli-scan.test.ts test/tui-dashboard.test.ts README.md docs/CLI_SPEC.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `dc7b239`, 2026-07-08
- **Issue**: https://github.com/ametel01/skills-doctor/issues/24

## Why this matters

The CLI compacts any path containing `/.agents/skills/` to
`~/.agents/skills/...` and any path containing `/.claude/skills/` to
`~/.claude/skills/...`. That is accurate for user-global roots but misleading
for project-local roots like `/repo/.agents/skills/foo/SKILL.md`. Cleanup and
security output should distinguish project-local skills from global skills
because the cleanup rules intentionally treat them differently.

## Execution order and parallelism

This plan is independent and can be worked in parallel with plans 043, 044, and
045. It can also run in parallel with plan 046, but coordinate if either plan
moves usage rendering helpers. It is the lowest-priority follow-up because it
improves display correctness without changing scanner results.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - has `compactSkillPath`, used by usage ranking,
  cleanup recommendations, and security incident artifact output.
- `src/cli/utils/tui-dashboard.ts` - renders root scope labels separately; use
  its wording as a reference if needed.
- `test/cli-scan.test.ts` - covers usage ranking and cleanup recommendation
  output.
- `test/tui-dashboard.test.ts` - covers dashboard labels and width behavior.

Path compaction currently ignores whether a path is under the configured home
directory or project directory:

```ts
// src/cli/commands/scan.ts:1542-1555
const compactSkillPath = (skillPath: string): string => {
  const normalizedPath = skillPath.split(path.sep).join("/");
  const agentsMatch = normalizedPath.match(/\/\.agents\/skills\/(.+)$/u);
  if (agentsMatch?.[1] !== undefined) return `~/.agents/skills/${agentsMatch[1]}`;
  const claudeMatch = normalizedPath.match(/\/\.claude\/skills\/(.+)$/u);
  if (claudeMatch?.[1] !== undefined) return `~/.claude/skills/${claudeMatch[1]}`;
  const pluginMatch = normalizedPath.match(
    /\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\/(.+)$/u,
  );
  if (pluginMatch?.[1] !== undefined && pluginMatch[2] !== undefined) {
    return `${pluginMatch[1]}:skills/${pluginMatch[2]}`;
  }
  return skillPath;
};
```

README distinguishes project-local and global roots:

```md
# README.md:55-62
Skills Doctor detects these project-local roots relative to the directory you
run it from:

- `.claude/skills/`
- `.agents/skills/`

It also detects these global user-level roots:

- `~/.claude/skills/`
- `~/.agents/skills/`
```

Usage ranking tests currently only assert the global case:

```ts
// test/cli-scan.test.ts:484-487
expect(output).toContain("Skill         Path");
expect(output).toContain(
  "\x1b[36munused-skill\x1b[39m  \x1b[2m~/.agents/skills/unused-skill/SKILL.md\x1b[22m",
);
```

Repo conventions to follow:

- Keep compact output readable in narrow terminals.
- Do not expose raw Codex transcript text in usage output.
- Do not change the JSON report schema for a display-only improvement.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| CLI output tests | `bun test test/cli-scan.test.ts` | exit 0 |
| TUI tests | `bun test test/tui-dashboard.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full tests | `bun run test` | exit 0 |
| Lint/format check | `bun run check` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `test/tui-dashboard.test.ts` only if shared compact-label behavior moves
  there
- `docs/CLI_SPEC.md` or README only if display wording changes materially

**Out of scope**:

- Changing scan roots or discovery behavior.
- Changing cleanup recommendation logic.
- Changing JSON report paths.
- Reworking the full terminal dashboard layout.

## Git workflow

- Branch: `advisor/047-label-local-vs-global-skill-paths`
- Commit message: `fix: label local skill paths accurately`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add output coverage for local and global paths

In `test/cli-scan.test.ts`, add or extend usage output tests so they cover:

- a global Codex skill path under the temp `homeDir`, which should still render
  as `~/.agents/skills/...`;
- a project-local Codex skill path under the temp `cwd`, which should render as
  a project-relative path such as `.agents/skills/<skill>/SKILL.md`, not
  `~/.agents/skills/...`;
- if easy, a Claude local/global pair for the same behavior.

**Verify**: `bun test test/cli-scan.test.ts` -> new local-path assertion fails
against the current implementation.

### Step 2: Make compaction context-aware

Update `compactSkillPath` so it knows enough context to distinguish local and
global roots. Acceptable approaches:

- Pass `cwd` and `homeDir` into render helpers that call `compactSkillPath`.
- Or build a path-label helper from `report.scannedRoots` so it uses each
  `SkillRoot.source` and `SkillRoot.rootPath`.

Expected labels:

- Paths under a global root render as `~/.agents/skills/...` or
  `~/.claude/skills/...`.
- Paths under a local root render as `.agents/skills/...` or
  `.claude/skills/...`.
- Plugin cache paths keep the existing `plugin:skills/...` style.
- Unknown/custom paths remain absolute or use a clearly non-home shorthand.

Do not change JSON report data. This is display-only.

**Verify**: `bun test test/cli-scan.test.ts` -> exit 0.

### Step 3: Check dashboard width behavior if shared code moved

If you move compaction logic into a shared helper used by the TUI, run and fix
TUI width tests. Do not let longer local labels overrun fixed-width dashboard
lines.

**Verify**: `bun test test/tui-dashboard.test.ts` -> exit 0.

### Step 4: Run full gates

Run:

1. `bun run typecheck`
2. `bun run test`
3. `bun run check`

**Verify**: all commands exit 0.

## Test plan

- `test/cli-scan.test.ts` should assert both global and local compact path
  labels.
- `test/tui-dashboard.test.ts` should remain green if any shared display helper
  affects dashboard output.
- No JSON snapshot/schema tests should need updates unless a test was
  incorrectly asserting rendered text inside JSON.

## Done criteria

- [ ] Global skill paths still render with `~/.agents/skills` or
      `~/.claude/skills`.
- [ ] Project-local skill paths render with `.agents/skills` or
      `.claude/skills`, not `~`.
- [ ] Plugin cache path compaction still works.
- [ ] JSON report paths are unchanged.
- [ ] `bun test test/cli-scan.test.ts` exits 0.
- [ ] `bun test test/tui-dashboard.test.ts` exits 0 if touched.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The renderer cannot reliably access root source information without changing
  the report schema.
- Fixing labels requires a broad TUI redesign.
- A proposed helper would make custom paths ambiguous or hide important path
  information.

## Maintenance notes

Reviewers should check usage cleanup output specifically. Mislabeling local
skills as global can lead users to make the wrong cleanup decision, even when
the underlying recommendations are conservative.
