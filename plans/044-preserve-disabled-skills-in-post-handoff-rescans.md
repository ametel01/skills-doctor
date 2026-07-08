# Plan 044: Preserve disabled Codex skills during post-handoff re-scans

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc7b239..HEAD -- src/cli/commands/scan.ts test/cli-scan.test.ts src/domain/scan-skills.ts src/domain/read-codex-disabled-skill-config.ts docs/CLI_SPEC.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `dc7b239`, 2026-07-08
- **Issue**: https://github.com/ametel01/skills-doctor/issues/23

## Why this matters

Initial scans correctly read `~/.codex/config.toml` and exclude disabled Codex
skills. After a repair, cleanup, or usage-recommendation agent exits, the CLI
re-scans the same roots without passing the disabled-skill selectors. That can
make disabled skills reappear in post-handoff summaries, usage rankings, and
cleanup candidates immediately after the user intentionally disabled them.

## Execution order and parallelism

This plan is independent and can be worked in parallel with plans 043, 046, and
047. It can also run in parallel with plan 045, but both plans may touch
`src/cli/commands/scan.ts`, so coordinate before editing that file. It is part
of the first execution wave because it protects post-handoff correctness.

## Current state

Relevant files:

- `src/cli/commands/scan.ts` - orchestrates initial scans, repair handoff,
  cleanup handoff, and post-agent re-scans.
- `src/domain/read-codex-disabled-skill-config.ts` - parses disabled skill
  selectors from Codex config.
- `src/domain/scan-skills.ts` - accepts `disabledSkills` and filters by path and
  name.
- `test/cli-scan.test.ts` - has interactive scan and cleanup flow tests.
- `docs/CLI_SPEC.md` - documents the disabled-skill contract.

Initial scan keeps the disabled selectors:

```ts
// src/cli/commands/scan.ts:193-200
const disabledCodexSkills = await spinner.run("Reading Codex skill settings...", () =>
  readCodexDisabledSkillConfig({ homeDir: options.homeDir }),
);
diagnostics.push(...disabledCodexSkills.diagnostics);

const startedAt = now();
const scan = await spinner.run("Scanning skills...", () =>
  scanSkillRoots({ roots, diagnostics, disabledSkills: disabledCodexSkills }),
);
```

Post-cleanup re-scan drops the selectors:

```ts
// src/cli/commands/scan.ts:811-814
const reScanStartedAt = input.now?.();
const nextScan = await input.spinner.run("Re-scanning skills...", () =>
  scanSkillRoots({ roots: input.roots }),
);
```

The same bare call appears in the usage-recommendation re-scan and repair
re-scan paths:

```ts
// src/cli/commands/scan.ts:910-913
const reScanStartedAt = input.now?.();
const nextScan = await input.spinner.run("Re-scanning skills...", () =>
  scanSkillRoots({ roots: input.roots }),
);
```

```ts
// src/cli/commands/scan.ts:1086-1089
const reScanStartedAt = input.now?.();
const nextScan = await input.spinner.run("Re-scanning skills...", () =>
  scanSkillRoots({ roots: input.roots }),
);
```

Domain scanner support already exists:

```ts
// src/domain/scan-skills.ts:24-28
export type ScanSkillRootsInput = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics?: readonly Diagnostic[] | undefined;
  readonly disabledSkills?: DisabledSkillSelectors | undefined;
};
```

```ts
// src/domain/scan-skills.ts:36-37
const disabledSkillFilter = buildDisabledSkillFilter(input.disabledSkills);
```

Documented contract:

```md
# docs/CLI_SPEC.md:316-317
Skills disabled through Codex `[[skills.config]]` entries are excluded from
scan, finding, usage-ranking, and cleanup-candidate results.
```

Repo conventions to follow:

- Keep process and prompt behavior at the CLI edge. Do not move prompt logic
  into domain modules.
- Use injected options in `ScanActionOptions` for testability.
- Tests in `test/cli-scan.test.ts` use injected fake prompts, fake launchers,
  temp roots, and `spinner: { run: async (_message, operation) => await operation() }`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Targeted tests | `bun test test/cli-scan.test.ts` | exit 0; new disabled re-scan cases pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Full tests | `bun run test` | exit 0 |
| Lint/format check | `bun run check` | exit 0 |

## Scope

**In scope**:

- `src/cli/commands/scan.ts`
- `test/cli-scan.test.ts`
- `docs/CLI_SPEC.md` only if the implementation changes the documented wording

**Out of scope**:

- Changing how `readCodexDisabledSkillConfig` parses TOML.
- Changing the `ScanReport` schema.
- Changing cleanup recommendation rules.
- Editing user-level `~/.codex/config.toml`.

## Git workflow

- Branch: `advisor/044-preserve-disabled-skills-in-post-handoff-rescans`
- Commit message: `fix: preserve disabled skills in post-handoff scans`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add regression coverage for repair re-scan filtering

In `test/cli-scan.test.ts`, add a test that:

1. Creates an active local/global Codex skill and a disabled Codex skill.
2. Writes a temp Codex config with `[[skills.config]]`, the disabled skill
   `path`, and `enabled = false`.
3. Runs `scanAction` interactively through a repair handoff with an injected
   `launchAgent` that exits 0.
4. Asserts the returned final report does not include the disabled skill in
   `report.skills`, `report.findings`, or serialized usage data if usage is
   part of the flow.

Use existing tests around cleanup and repair handoffs as the structure.

**Verify**: `bun test test/cli-scan.test.ts` -> the new test fails before the
implementation change because the disabled skill reappears after re-scan.

### Step 2: Keep disabled selectors in review flow state

Add disabled-skill selectors to the review-flow input. One low-risk shape:

- Extend `ReviewFindingsInput` with
  `readonly disabledSkills: DisabledSkillSelectors`.
- Pass `disabledCodexSkills` from `scanAction` into `reviewScan`.
- In every post-handoff `scanSkillRoots` call, pass
  `{ roots: input.roots, disabledSkills: input.disabledSkills }`.

Import `DisabledSkillSelectors` as a type from
`../../domain/read-codex-disabled-skill-config.js` or reuse an existing exported
type path. Preserve existing diagnostics behavior: diagnostics from reading
Codex config should be included in the initial report only unless the product
explicitly decides to re-read config on every post-agent scan.

**Verify**: `bun test test/cli-scan.test.ts` -> targeted test passes.

### Step 3: Cover cleanup and usage-recommendation re-scans if not covered

If the Step 1 test only exercises repair handoff, add one additional focused
test for either cleanup or usage-recommendation handoff. It should prove that
post-agent usage re-analysis uses a scan that still excludes disabled skills.

**Verify**: `bun test test/cli-scan.test.ts` -> all tests in the file pass.

### Step 4: Run full gates

Run:

1. `bun run typecheck`
2. `bun run test`
3. `bun run check`

**Verify**: all commands exit 0.

## Test plan

- New `test/cli-scan.test.ts` regression for post-repair re-scan.
- New or extended cleanup/usage-recommendation regression if the repair test
  does not cover usage re-analysis.
- Existing domain tests for disabled path/name filtering should remain
  unchanged.

## Done criteria

- [ ] Every post-agent `scanSkillRoots` call in `src/cli/commands/scan.ts`
      passes the same disabled-skill selectors used by the initial scan.
- [ ] Disabled Codex skills stay absent from the final report after repair
      handoff.
- [ ] Disabled Codex skills stay absent from post-cleanup usage analysis.
- [ ] `bun test test/cli-scan.test.ts` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The CLI must intentionally re-read `~/.codex/config.toml` after agent launch
  instead of preserving the initial selectors. That is a product decision and
  requires a different plan.
- The fix requires changing the public report schema.
- The tests need to mutate the real user home directory instead of temp
  `homeDir` fixtures.

## Maintenance notes

Future post-scan flows should use a shared helper for re-scanning so new flows
do not forget disabled skills. Reviewers should search for
`scanSkillRoots({ roots: input.roots })` and reject new bare calls in handoff
paths.
