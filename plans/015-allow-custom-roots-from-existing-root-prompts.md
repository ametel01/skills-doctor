# Plan 015: Allow custom roots when automatic discovery is incomplete

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 75209d4..HEAD -- src/cli/commands/scan.ts src/domain/discover-skill-roots.ts test/cli-scan.test.ts test/domain-scan.test.ts docs/PRD.md README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `75209d4`, 2026-06-16

## Why this matters

The PRD says custom paths should be allowed when automatic discovery is incomplete. The current CLI only asks for a custom path when no known root exists at all. If Skills Doctor finds one standard root but the user also keeps skills elsewhere, the interactive flow cannot add that custom root even though the domain discovery function already supports `customRoots`.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - controls root-scope and ecosystem prompts.
- `src/domain/discover-skill-roots.ts` - already supports `customRoots`.
- `test/cli-scan.test.ts` - covers root prompt behavior.
- `test/domain-scan.test.ts` - covers domain-level custom root discovery.
- `docs/PRD.md` and `README.md` - document custom root behavior.

Current excerpts:

```ts
// src/cli/commands/scan.ts:86-102
if (roots.length === 0) {
  if (skipPrompts) {
    throw new CliInputError(
      "No .claude/skills or .agents/skills root was found. Re-run interactively or add a supported skills root.",
    );
  }
  const customRoot = await prompts.input("Skills directory path", ".");
  const custom = await discoverSkillRoots({
    cwd,
    homeDir: options.homeDir,
    customRoots: [{ rootPath: customRoot, ecosystem: "custom" }],
  });
  roots = custom.roots;
} else if (!skipPrompts) {
  roots = await selectRootScopes(roots, prompts);
  roots = await selectRoots(roots, prompts);
}
```

```ts
// src/cli/commands/scan.ts:49-50
type RootSelection = "all" | "claude" | "codex" | "custom";
type RootScopeSelection = "all" | "local" | "global" | "custom";
```

```ts
// src/domain/discover-skill-roots.ts:47-51
...(input.customRoots ?? []).map((root) => ({
  ecosystem: root.ecosystem ?? "custom",
  rootPath: resolveRootPath(input.cwd, homeDir, root.rootPath),
  source: "custom" as const,
})),
```

```md
// docs/PRD.md:201-205
- Default to both when both roots exist.
- Default to the single detected root when only one exists.
- Allow custom paths when automatic discovery is incomplete.
- Allow cancellation at every prompt.
- In non-interactive mode, use conservative defaults and fail with a clear user
```

```md
// README.md:58-61
When local and global roots both exist, the interactive CLI first asks whether
to scan local project skills, global/root skills, or both. When both Claude and
Codex/agents roots exist in the selected scope, it asks whether to scan Claude,
Codex/agents, or both. When no known root exists, it prompts for a custom skills
```

Repo conventions:

- Prompt selection tests use string answer queues and injected `PromptAdapter`s.
- Non-interactive mode should not add prompts; it should keep conservative defaults.
- Domain discovery already resolves `~` and relative paths for custom roots.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/cli-scan.test.ts test/domain-scan.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint/check | `bun run check` | exit 0, no fixes applied |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `README.md` if user-visible custom root behavior changes

**Out of scope**:

- Changing `discoverSkillRoots()` path resolution unless a test exposes a real bug.
- Adding persistent config for custom roots.
- Adding custom roots to non-interactive `--yes` mode.

## Git workflow

- Branch: `advisor/015-custom-root-prompts`
- Commit message: `feat: allow custom root selection during scans`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Decide the prompt shape and add tests

Use the smallest prompt change that satisfies the PRD without disrupting defaults. Recommended behavior:

- When roots already exist and prompts are enabled, add an option such as `Custom path` to the scope prompt or root prompt.
- If selected, ask `Skills directory path` and add the resolved custom root to the selected roots.
- Do not ask for a custom path by default.
- Keep `--yes`, `--json`, CI, and non-TTY behavior unchanged.

Add a test in `test/cli-scan.test.ts` that:

- Creates a standard `.agents/skills/local-skill/SKILL.md`.
- Creates another valid custom root elsewhere in the temp directory.
- Answers the new custom option, then enters the custom root path.
- Asserts the report scans the custom skill.

Add or update a test that existing root selection still works without choosing custom.

**Verify**: `bun test test/cli-scan.test.ts` -> the new custom-root test fails before implementation.

### Step 2: Implement custom root selection

In `src/cli/commands/scan.ts`, add a helper rather than spreading custom-root code through both selection functions.

The helper should:

- Prompt for the custom root path.
- Call `discoverSkillRoots({ cwd, homeDir, customRoots: [{ rootPath: customRoot, ecosystem: "custom" }] })`.
- Return only custom roots from that call, or merge carefully without duplicating standard roots already selected.
- Preserve diagnostics behavior for missing custom roots; if no readable custom root is found, the existing `roots.length === 0` guard should still produce `CliInputError("No readable skills root was selected.")` or a clearer user error.

Be careful with existing selection order:

- Scope selection filters local/global.
- Ecosystem selection filters Claude/Codex.
- A custom root has `source: "custom"` and `ecosystem: "custom"`, so it should not be accidentally discarded by existing filters after it is added.

**Verify**: `bun test test/cli-scan.test.ts test/domain-scan.test.ts` -> exit 0.

### Step 3: Update README if behavior changes

If the CLI now allows custom root selection even when standard roots exist, update the "What It Scans" section in `README.md` so it no longer says custom prompts only happen when no known root exists.

**Verify**: `bun run check` -> exit 0, no formatting/lint errors.

### Step 4: Run the standard gates

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0, no fixes applied
- `bun run verify` -> exit 0

## Test plan

- New CLI test for selecting a custom root while a standard root also exists.
- Existing CLI tests for Claude/Codex selection and local/global selection still pass.
- Existing domain tests for custom root resolution still pass.

## Done criteria

- [ ] Interactive users can choose a custom root even when at least one standard root exists.
- [ ] Non-interactive defaults are unchanged.
- [ ] Custom roots are not filtered out by local/global or Claude/Codex selection after being added.
- [ ] README describes the final behavior accurately.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report back if:

- The desired UX requires a multi-select prompt or persistent custom-root config rather than a simple one-off path.
- Supporting custom roots together with standard roots requires changing the public `SkillRoot` type.
- Missing custom-root diagnostics need a broader report-schema change.

## Maintenance notes

This plan intentionally keeps custom roots interactive-only. If automation needs custom roots later, add explicit CLI flags rather than overloading `--yes`.
