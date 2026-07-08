# Plan 046: Bound usage-log discovery and analysis I/O

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc7b239..HEAD -- src/domain/discover-usage-sources.ts src/domain/analyze-skill-usage.ts test/usage-sources.test.ts test/skill-usage.test.ts docs/API.md docs/CLI_SPEC.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `dc7b239`, 2026-07-08
- **Issue**: https://github.com/ametel01/skills-doctor/issues/25

## Why this matters

Usage analysis is part of the interactive default flow, so it is on the startup
path for users with large Codex histories. The code has `maxSessionFiles` and
`maxFileBytes`, but discovery still recursively walks and stats every JSONL
session before slicing to the file cap, and usage analysis reads selected JSONL
files in full. The intended bounds should apply to both discovery and content
reads so startup cost scales with the cap, not with all historical logs.

## Execution order and parallelism

This plan is independent and can be worked in parallel with plans 043, 044, and
045. It can also run in parallel with plan 047, but coordinate if either plan
moves usage rendering helpers or changes `buildUsageReportInput`. It is a
second-wave performance plan unless a user is currently blocked by slow
interactive startup.

## Current state

Relevant files:

- `src/domain/discover-usage-sources.ts` - discovers Codex JSONL sources and
  detects context-pressure warnings.
- `src/domain/analyze-skill-usage.ts` - reads usage source contents and matches
  skill usage.
- `test/usage-sources.test.ts` - covers source discovery, recency filters,
  session caps, and context-pressure detection.
- `test/skill-usage.test.ts` - covers usage matching and reporting privacy.

Discovery has caps:

```ts
// src/domain/discover-usage-sources.ts:55-57
const DEFAULT_RECENT_WINDOW_DAYS = 90;
const DEFAULT_MAX_SESSION_FILES = 200;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
```

But it slices only after walking all session files:

```ts
// src/domain/discover-usage-sources.ts:76-84
const sessionFiles = (await findJsonlFiles({ directory: sessionsDir, since, diagnostics })).slice(
  0,
  maxSessionFiles,
);
const historyFile = await fileIfExists(historyPath, since, diagnostics);
const usageSourcePaths = [
  ...sessionFiles.map((candidate) => candidate.filePath),
  ...(historyFile === undefined ? [] : [historyFile.filePath]),
];
```

Recursive discovery has no early stop:

```ts
// src/domain/discover-usage-sources.ts:134-144
const filesByEntry = await Promise.all(
  entries.map(async (entry) => {
    const entryPath = path.join(input.directory, entry.name);
    if (entry.isDirectory()) return findJsonlFiles({ ...input, directory: entryPath });
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return [];
    const candidate = await fileIfExists(entryPath, input.since, input.diagnostics);
    return candidate === undefined ? [] : [candidate];
  }),
);

return filesByEntry.flat().sort(compareCandidateFiles);
```

Pressure detection reads only a tail:

```ts
// src/domain/discover-usage-sources.ts:187-190
const pressureByFile = await Promise.all(
  input.files.map(async (file) => {
    const content = await readTail(file.filePath, input.maxFileBytes).catch((error: unknown) => {
```

Usage analysis reads selected files in full:

```ts
// src/domain/analyze-skill-usage.ts:101-105
const sourceContents = await Promise.all(
  sourcePaths.map(async (sourcePath) => {
    try {
      return { sourcePath, content: await readFile(sourcePath, "utf8") };
```

Existing cap test only asserts final selection size:

```ts
// test/usage-sources.test.ts:49-68
it("caps session files and filters old sessions by the selected window", async () => {
  ...
  const result = await discoverUsageSources({
    homeDir,
    now: new Date("2026-06-20T12:00:00.000Z"),
    recentWindowDays: 30,
    maxSessionFiles: 1,
  });

  expect(result.usageSourcePaths).toHaveLength(1);
```

Repo conventions to follow:

- Usage analysis must not include raw prompts or full assistant transcript text
  in reports.
- Domain functions should stay reusable and dependency-injected where needed.
- Preserve deterministic ordering for reported usage sources.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Usage source tests | `bun test test/usage-sources.test.ts` | exit 0 |
| Skill usage tests | `bun test test/skill-usage.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full tests | `bun run test` | exit 0 |
| Lint/format check | `bun run check` | exit 0 |

## Scope

**In scope**:

- `src/domain/discover-usage-sources.ts`
- `src/domain/analyze-skill-usage.ts`
- `test/usage-sources.test.ts`
- `test/skill-usage.test.ts`
- `docs/API.md`, `docs/CLI_SPEC.md`, and `README.md` only if option semantics
  or documented bounds change

**Out of scope**:

- Changing the public `ScanReport` usage schema.
- Adding a SQLite dependency.
- Reading arbitrary files outside known Codex paths.
- Changing cleanup recommendation thresholds.

## Git workflow

- Branch: `advisor/046-bound-usage-log-io`
- Commit message: `perf: bound usage log scanning`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add tests for bounded discovery work

Add a test in `test/usage-sources.test.ts` that creates many nested JSONL files
and proves discovery honors `maxSessionFiles` without requiring every candidate
to be inspected. If direct filesystem stat counting is hard without
over-engineering, add a small injectable filesystem adapter to
`discoverUsageSources` and use it only in tests.

The expected behavior should be deterministic: newest files first by mtime, then
path tie-breaker.

**Verify**: `bun test test/usage-sources.test.ts` -> new test fails against the
current implementation if it observes all files before slicing.

### Step 2: Bound recursive session discovery

Refactor `findJsonlFiles` so the max-session cap can stop traversal early while
preserving deterministic newest-first output. Acceptable approaches:

- Traverse directory entries in deterministic order and maintain a bounded
  candidate heap/list of newest files.
- Or collect by directory batches with a hard cap and documented deterministic
  ordering if exact global newest-first is not feasible cheaply.

Do not silently drop diagnostics for unreadable directories encountered before
the cap is satisfied. Do not scan outside `~/.codex/sessions` and
`~/.codex/history.jsonl`.

**Verify**: `bun test test/usage-sources.test.ts` -> exit 0.

### Step 3: Bound content reads in usage analysis

Update `analyzeSkillUsage` to accept an optional `maxFileBytes` or equivalent
input and read only a bounded tail or bounded content window from each selected
usage source. Wire `buildUsageReportInput` in `src/cli/commands/scan.ts` if
needed so the same default bound applies to matching and pressure detection.

Preserve the privacy contract: usage reports should contain skill names, paths,
counts, timestamps, and diagnostics, not raw prompts or assistant text.

**Verify**: add a `test/skill-usage.test.ts` case with a large JSONL source
where the relevant recent record is in the retained window. `bun test
test/skill-usage.test.ts` exits 0.

### Step 4: Document any changed option semantics

If you add a public `AnalyzeSkillUsageInput.maxFileBytes` option or similar,
update `docs/API.md`. If interactive usage-analysis behavior changes in a
visible way, update `docs/CLI_SPEC.md` and README privacy/usage sections.

**Verify**: `bun run check` -> exit 0.

### Step 5: Run full gates

Run:

1. `bun run typecheck`
2. `bun run test`
3. `bun run check`

**Verify**: all commands exit 0.

## Test plan

- `test/usage-sources.test.ts`: cap traversal/inspection behavior and preserve
  deterministic selected source ordering.
- `test/skill-usage.test.ts`: bounded reads still detect recent skill-use
  records and do not leak transcript text.
- Existing usage cleanup CLI tests should continue to pass without changing
  report schema.

## Done criteria

- [ ] Source discovery work is bounded by `maxSessionFiles` or a clearly named
      discovery cap, not just final output slicing.
- [ ] Usage source content reads are bounded by a documented byte limit.
- [ ] Usage reports still omit raw user prompts and assistant transcript text.
- [ ] Selected source ordering remains deterministic.
- [ ] `bun test test/usage-sources.test.ts` exits 0.
- [ ] `bun test test/skill-usage.test.ts` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Correctly bounding discovery requires a broad filesystem abstraction that
  would touch unrelated scanner modules.
- The chosen bound would make usage analysis ignore all recent records in normal
  Codex session layouts.
- The fix requires storing or reporting raw transcript text.
- The public API change cannot be made backward-compatible.

## Maintenance notes

Reviewers should check that "bounded" applies to both the number of selected
files and bytes read per file. Future usage analyzers should avoid reading
unbounded local history by default.
