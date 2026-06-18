# Plan 041: Make non-interactive root selection conservative

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52d6f0e..HEAD -- src/cli/commands/scan.ts src/domain/discover-skill-roots.ts test/cli-scan.test.ts test/domain-scan.test.ts README.md docs/PRD.md docs/CLI_SPEC.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `52d6f0e`, 2026-06-18

## Why this matters

Skills Doctor scans both project-local and global user-level skill roots. In interactive mode, users can choose local, global/root, or both. In non-interactive mode (`--json`, `--yes`, CI, or non-TTY stdin), the current code keeps every discovered root without checking whether the target choice is ambiguous. That can include personal global skills in automation output when the README says required choices should fail with a clear error.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - chooses discovered roots and skips prompts in non-interactive contexts.
- `src/domain/discover-skill-roots.ts` - discovers local, global, and custom roots.
- `test/cli-scan.test.ts` - covers scan action, prompt skipping, root selection, and JSON-related scan behavior.
- `test/domain-scan.test.ts` - covers raw discovery behavior.
- `README.md`, `docs/PRD.md`, and `docs/CLI_SPEC.md` - document root selection and non-interactive behavior.

Current prompt-skip behavior leaves all discovered roots selected:

```ts
// src/cli/commands/scan.ts:94
const discovered = await spinner.run("Finding local skill roots...", () =>
  discoverSkillRoots({ cwd, homeDir: options.homeDir }),
);
let roots = discovered.roots;
const diagnostics: Diagnostic[] = [...discovered.diagnostics];

if (roots.length === 0) {
  if (skipPrompts) {
    throw new CliInputError(
      "No .claude/skills or .agents/skills root was found. Re-run interactively or add a supported skills root.",
    );
  }
  ...
} else if (!skipPrompts) {
  const scopeSelection = await selectRootScopes(...);
  ...
}
```

Documented behavior:

```md
<!-- README.md:59 -->
When local and global roots both exist, the interactive CLI first asks whether
to scan local project skills, global/root skills, or both.
...
Non-interactive runs use conservative defaults and fail with a clear user error
when a required choice cannot be made.
```

```md
<!-- docs/PRD.md:184 -->
- If both local and global roots exist, prompt for local, global/root, or both.
...
- In non-interactive mode, use conservative defaults and fail with a clear user
  error when required decisions cannot be made.
```

Discovery intentionally returns all roots; do not remove that capability:

```ts
// src/domain/discover-skill-roots.ts:23
const candidates: readonly SkillRoot[] = [
  { ecosystem: "claude", rootPath: path.resolve(input.cwd, ".claude", "skills"), source: "local" },
  { ecosystem: "codex", rootPath: path.resolve(input.cwd, ".agents", "skills"), source: "local" },
  { ecosystem: "claude", rootPath: path.join(homeDir, ".claude", "skills"), source: "global" },
  { ecosystem: "codex", rootPath: path.join(homeDir, ".agents", "skills"), source: "global" },
  ...
];
```

Repo conventions to match:

- Expected user errors use `CliInputError` from `src/cli/utils/handle-error.ts`.
- JSON mode should convert expected CLI errors into JSON error reports through the existing top-level error path.
- Prompt behavior belongs in `src/cli/commands/scan.ts` and `src/cli/utils/should-skip-prompts.ts`; discovery should remain a reusable domain function.
- Tests should inject `cwd`, `homeDir`, `stdinIsTty`, `env`, and fake output writers.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun run test -- test/cli-scan.test.ts test/domain-scan.test.ts` | all tests in those files pass |
| JSON/bin tests | `bun run test -- test/cli-bin.test.ts` | all tests in that file pass; this command builds `dist/` in setup |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Lint/format check | `bun run check` | exit 0, no fixes applied |
| Full verify | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `test/cli-bin.test.ts` only if packaged JSON error behavior needs coverage
- `README.md`, `docs/PRD.md`, or `docs/CLI_SPEC.md` if the chosen conservative default differs from current wording
- `CHANGELOG.md` if this repo expects user-visible CLI behavior changes to be logged before release
- `plans/README.md` status row for this plan

**Out of scope**:

- Changing `discoverSkillRoots()` to stop detecting local or global roots.
- Adding new CLI flags for target selection. That is a possible follow-up, but this plan is the conservative behavior fix.
- Changing skill scanning, rule validation, findings schema, or report schema.
- Changing interactive prompt wording except as needed for tests.

## Git workflow

- Branch: `advisor/041-make-noninteractive-root-selection-conservative`
- Commit message: `fix: make noninteractive root selection conservative`
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the conservative rule in tests

Add focused tests in `test/cli-scan.test.ts` for prompt-skipped scans:

1. When only one standard root exists, `scanAction(".", { yes: true }, ...)` should scan it successfully. This behavior already has coverage; keep it passing.
2. When local and global roots both exist, `scanAction(".", { yes: true }, ...)` should reject with `CliInputError` because local/global scope is ambiguous.
3. When local Claude and local Codex roots both exist but no global roots exist, decide whether that is ambiguous for non-interactive mode. The README says required choices should fail when they cannot be made; the PRD also says the user chooses ecosystem when multiple ecosystems exist. Prefer failing here unless a maintainer explicitly wants "both ecosystems" as the conservative default.
4. If adding a packaged JSON test, assert `skills-doctor --json` returns one JSON error object for the ambiguous-root case and does not mix human logs into stdout.

Use `homeDir: path.join(directory, "home")` to keep tests isolated.

**Verify**: `bun run test -- test/cli-scan.test.ts` should fail before the implementation for the new ambiguous-root cases.

### Step 2: Add a prompt-skipped root selection guard

In `src/cli/commands/scan.ts`, add a small helper near the existing root-selection helpers, for example:

```ts
const assertNonInteractiveRootSelectionIsUnambiguous = (roots: readonly SkillRoot[]): void => {
  // Throw CliInputError when skipPrompts is true and more than one required
  // target decision is possible.
};
```

Call it after discovery and before scanning when `skipPrompts` is true and `roots.length > 0`.

Suggested rule:

- If both `source: "local"` and `source: "global"` are present, throw `CliInputError`.
- If both standard ecosystems (`claude` and `codex`) are present in the selected scope, throw `CliInputError`.
- If exactly one root exists, allow it.
- If custom roots are added by future flags or tests, include them only if the selection is unambiguous. Do not silently merge custom with standard roots in skipped-prompt mode unless the caller explicitly supplied them through a future flag.

Use an error message with clear next steps, such as:

```text
Multiple skills roots were found. Re-run interactively to choose local/global and Claude/Codex roots.
```

Do not change interactive behavior.

**Verify**: `bun run test -- test/cli-scan.test.ts` passes.

### Step 3: Preserve JSON mode contract

Run or add a test that exercises `--json` with ambiguous roots. It should produce exactly one JSON error report on stdout through the existing error handling path.

If this is covered at `scanAction()` level only, consider adding one packaged-bin test in `test/cli-bin.test.ts` because JSON stdout cleanliness is a public contract.

**Verify**: `bun run test -- test/cli-bin.test.ts` passes if changed. Note that this test builds ignored `dist/`.

### Step 4: Update docs for the exact rule

Update README or `docs/CLI_SPEC.md` if the implemented rule needs more precision than the current wording. Keep docs short.

Recommended wording:

```md
Non-interactive runs scan the single unambiguous detected root. If multiple
local/global scopes or multiple ecosystems are detected, they fail with a clear
message instead of guessing.
```

Do not change `docs/PRD.md` unless you are correcting a mismatch introduced by implementation.

**Verify**: `bun run check` passes.

### Step 5: Run full gates

**Verify**: `bun run verify` exits 0.

## Test plan

- `test/cli-scan.test.ts`:
  - single-root `--yes` scan remains successful.
  - local + global roots with prompt skipping rejects with `CliInputError`.
  - multiple ecosystems with prompt skipping rejects with `CliInputError`, unless a maintainer chooses a different conservative rule and the docs are updated accordingly.
- Optional `test/cli-bin.test.ts`:
  - packaged `--json` ambiguous-root error writes valid JSON only.

## Done criteria

- [ ] Prompt-skipped scans no longer silently scan both local and global roots.
- [ ] Prompt-skipped scans no longer silently choose between multiple ecosystems if the implemented rule treats that as ambiguous.
- [ ] Error messages tell users to re-run interactively or provide explicit selection once flags exist.
- [ ] JSON mode still writes exactly one JSON object to stdout on expected errors.
- [ ] `bun run test -- test/cli-scan.test.ts test/domain-scan.test.ts` passes.
- [ ] `bun run verify` passes.
- [ ] Docs match the implemented non-interactive rule.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- A maintainer says non-interactive mode must continue scanning all discovered roots.
- Fixing this requires adding new CLI flags; file a separate design/follow-up plan instead of expanding this one.
- JSON error handling requires changing `src/cli/index.ts` or `src/cli/utils/json-mode.ts` in a way that affects unrelated parse errors.
- Tests show existing automation explicitly depends on scanning local and global roots together with `--yes`.
- `bun run verify` fails twice after reasonable fixes.

## Maintenance notes

This plan intentionally fixes ambiguity without adding selection flags. A future direction plan can add explicit `--scope local|global|all`, `--ecosystem claude|codex|all`, or custom-root flags for automation that really does want multiple roots.
