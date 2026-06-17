# Plan 021: Report unreadable SKILL.md files

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d615d4..HEAD -- src/domain/scan-skills.ts src/domain/types.ts test/domain-scan.test.ts test/reporting.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8d615d4`, 2026-06-18

## Why this matters

Skills Doctor should continue scanning other skills when one `SKILL.md` cannot be read, but it should not silently hide the unreadable file. Today any read failure is treated the same as a non-skill child directory and skipped. That can produce false clean scans for permission problems, broken symlinks, or transient filesystem errors.

## Current state

- Plan 013 intentionally changed scanning to ignore non-skill child directories.
- The current implementation uses `readFile(...).catch(() => null)` and `continue`, so it cannot distinguish "no SKILL.md" from "SKILL.md exists but cannot be read".
- Report construction already carries diagnostics and fails on diagnostic errors.

Relevant excerpts:

```ts
// src/domain/scan-skills.ts:30-38
for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const skillDir = path.join(root.rootPath, entry.name);
  const skillPath = path.join(skillDir, "SKILL.md");
  const content = await readFile(skillPath, "utf8").catch(() => null);
  if (content === null) {
    continue;
  }
```

```ts
// test/domain-scan.test.ts:83-109
it("scans direct child skill directories that contain SKILL.md", async () => {
  const skillsRoot = path.join(directory, ".agents", "skills");
  await mkdir(path.join(skillsRoot, "valid-skill"), { recursive: true });
  await mkdir(path.join(skillsRoot, "not-a-skill"), { recursive: true });
  ...
  expect(scan.skills).toHaveLength(1);
  expect(scan.findings.map((finding) => finding.ruleId)).not.toContain("missing-skill");
});
```

```ts
// src/domain/build-report.ts:46-51
const diagnosticErrorCount = countDiagnosticSeverity(input.scan.diagnostics, "error");
const hasErrorDiagnostics = diagnosticErrorCount > 0;

return {
  ok: errorCount === 0 && !hasErrorDiagnostics,
```

Repo conventions to match:

- Non-skill child directories are ignored; do not reintroduce `missing-skill` findings for them.
- Root-level filesystem problems are represented as diagnostics, not findings.
- Expected filesystem errors should be captured and scanning should continue.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/domain-scan.test.ts test/reporting.test.ts` | exit 0, tests pass |
| Typecheck | `bun run typecheck` | exit 0, no errors |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `src/domain/scan-skills.ts`
- `src/domain/types.ts` only if a diagnostic code helper/type is added
- `test/domain-scan.test.ts`
- `test/reporting.test.ts` only if report assertions need a diagnostic case

**Out of scope**:
- Reinstating `missing-skill` findings for child directories without `SKILL.md`.
- Recursively scanning nested skills.
- Changing parse-error findings for readable malformed `SKILL.md`.

## Git workflow

- Branch: `advisor/021-report-unreadable-skill-files`
- Commit message: `fix: report unreadable skill files`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Distinguish absent SKILL.md from unreadable SKILL.md

In `src/domain/scan-skills.ts`, replace the catch-all `readFile(...).catch(() => null)` with logic that checks the failure code:

- If the error is `ENOENT`, continue silently because the child directory is not a skill.
- For any other error, push a diagnostic and continue scanning other entries.

Use a diagnostic shaped like:

```ts
{
  code: "skill-file-unreadable",
  severity: "error",
  message: error instanceof Error ? error.message : `Unable to read ${skillPath}`,
  path: skillPath,
}
```

Do not add a `SkillRecord` when content could not be read.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Add a focused domain scan test

In `test/domain-scan.test.ts`, add a regression test that creates:

- One valid skill directory with a readable `SKILL.md`.
- One directory with a `SKILL.md` that cannot be read in the test environment.

On Unix-like systems, `chmod(pathToSkillMd, 0o000)` is acceptable. If cross-platform permission behavior is unreliable, inject a filesystem reader is too large for this plan; instead create a broken symlink only if the existing test environment supports it. Keep the test deterministic on CI.

Assert:

- The readable skill is still scanned.
- `scan.diagnostics` contains `skill-file-unreadable` with severity `error`.
- The diagnostic `path` is the unreadable `SKILL.md` path.

**Verify**: `bun test test/domain-scan.test.ts` -> exit 0.

### Step 3: Confirm report behavior for the new diagnostic

If the new diagnostic test only exercises `scanSkillRoots`, add or extend a reporting test to show `buildScanReport` marks the report not ok and `resolveScanExitCode` returns `1` for `skill-file-unreadable`.

**Verify**: `bun test test/domain-scan.test.ts test/reporting.test.ts` -> exit 0.

## Test plan

- Add a domain scan regression test for an unreadable `SKILL.md`.
- Add a report assertion only if existing diagnostic report coverage does not cover the new code.
- Run `bun test test/domain-scan.test.ts test/reporting.test.ts`.
- Run `bun run verify`.

## Done criteria

- [ ] Direct child directories without `SKILL.md` remain ignored.
- [ ] Direct child directories with unreadable `SKILL.md` emit an error diagnostic.
- [ ] Other readable skills in the same root are still scanned.
- [ ] Diagnostic error behavior makes the final report fail.
- [ ] `bun test test/domain-scan.test.ts test/reporting.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 021 `DONE`.

## STOP conditions

Stop and report back if:

- Cross-platform unreadable-file simulation cannot be made deterministic without refactoring filesystem access.
- The fix would require treating every missing `SKILL.md` as an error again.
- The codebase already changed to emit unreadable-file diagnostics.

## Maintenance notes

This plan preserves the product distinction between "not a skill" and "a skill file that could not be read". Reviewers should verify the diagnostic message never exposes file contents, only path and error text.
