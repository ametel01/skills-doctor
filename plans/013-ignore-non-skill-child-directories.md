# Plan 013: Ignore non-skill child directories during discovery

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 75209d4..HEAD -- src/domain/scan-skills.ts src/domain/rules/structural.ts test/domain-scan.test.ts docs/PRD.md docs/SKILLS_SPEC.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `75209d4`, 2026-06-16

## Why this matters

The spec says a skill is discovered as a subdirectory containing `SKILL.md`. The current scanner treats every immediate directory under a skills root as a skill candidate and emits a blocking `missing-skill` finding when `SKILL.md` is absent. That creates false blocking errors for support or organizational directories that are not skills, and it can make a healthy skills root fail before repair handoff starts.

## Current state

Relevant files:

- `src/domain/scan-skills.ts` - scans direct child directories and currently builds missing-skill findings.
- `src/domain/rules/structural.ts` - defines `buildMissingSkillFinding()`.
- `test/domain-scan.test.ts` - already names the intended behavior but does not assert findings for non-skill directories.
- `docs/PRD.md` and `docs/SKILLS_SPEC.md` - define skill discovery semantics.

Current excerpts:

```ts
// src/domain/scan-skills.ts:30-39
for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  const skillDir = path.join(root.rootPath, entry.name);
  const skillPath = path.join(skillDir, "SKILL.md");
  const content = await readFile(skillPath, "utf8").catch(() => null);
  if (content === null) {
    findings.push(buildMissingSkillFinding({ root, skillDir }));
    continue;
  }
```

```ts
// src/domain/rules/structural.ts:21-38
export const buildMissingSkillFinding = (input: {
  readonly root: SkillRoot;
  readonly skillDir: string;
}): Finding => ({
  ruleId: "missing-skill",
  severity: "error",
  category: "frontmatter",
  title: "Missing SKILL.md",
  message: "A skill directory must contain a SKILL.md file.",
```

```md
// docs/SKILLS_SPEC.md:1004-1007
- A skill is discovered as a subdirectory containing a file named exactly
  `SKILL.md`.
- Non-skill files such as `README.md` in a skills directory are ignored.
- Clients may skip directories like `.git/` and `node_modules/`.
```

```md
// docs/PRD.md:153-154
6. Skills Doctor scans selected roots for skill directories containing
   `SKILL.md`.
```

```md
// docs/PRD.md:190-194
- Skip non-directory entries in skills roots.
- Treat a subdirectory containing `SKILL.md` as a skill directory.
- Ignore files such as `README.md` directly inside the skills root.
- Do not recursively treat nested subdirectories as separate skills unless they
  directly contain `SKILL.md` and are within the configured scan depth.
```

Repo conventions:

- Domain tests create temporary skills roots with `mkdtemp`, `mkdir`, and `writeFile`.
- Structural validation should run on `SkillRecord` instances after a skill file is found and parsed.
- Rule IDs are documented in `docs/RULES.md`; do not remove a public rule ID without a deliberate migration.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Focused tests | `bun test test/domain-scan.test.ts test/structural-rules.test.ts` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint/check | `bun run check` | exit 0, no fixes applied |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `src/domain/scan-skills.ts`
- `test/domain-scan.test.ts`
- `test/structural-rules.test.ts` only if existing tests assert the old false-positive behavior
- `docs/RULES.md` only if behavior/docs must clarify when `missing-skill` still applies

**Out of scope**:

- Recursive scanning or configurable scan depth.
- Custom root discovery behavior.
- Changing frontmatter validation rules for real `SKILL.md` files.

## Git workflow

- Branch: `advisor/013-ignore-non-skill-dirs`
- Commit message: `fix: ignore non-skill directories during scans`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a regression test for support directories

Update `test/domain-scan.test.ts`, preferably the existing `scans direct child skill directories that contain SKILL.md` test.

The test should:

- Create `.agents/skills/valid-skill/SKILL.md`.
- Create another directory under `.agents/skills`, for example `.agents/skills/support-files`, with no `SKILL.md`.
- Run `discoverSkillRoots()` and `scanSkillRoots()`.
- Assert `scan.skills` has only `valid-skill`.
- Assert `scan.findings.map((finding) => finding.ruleId)` does not contain `missing-skill`.

This test should fail before the implementation change if the non-skill directory emits a blocking finding.

**Verify**: `bun test test/domain-scan.test.ts` -> fails only the new assertion before the fix.

### Step 2: Stop emitting `missing-skill` for ordinary child directories

In `src/domain/scan-skills.ts`, change the no-`SKILL.md` branch so it skips the directory instead of pushing `buildMissingSkillFinding()`.

Keep these existing behaviors:

- Continue scanning other directories.
- Still parse and validate malformed `SKILL.md` files when the file exists.
- Still collect unreadable-root diagnostics from the `readdir` catch.

After this change, check whether `buildMissingSkillFinding()` remains used. If it is unused, either remove it and update exports/docs/tests deliberately, or keep it only if a current public API/test still needs it. Prefer the smallest source-compatible change if public API consumers might import it.

**Verify**: `bun test test/domain-scan.test.ts test/structural-rules.test.ts` -> exit 0.

### Step 3: Align rule catalog only if needed

If `missing-skill` can no longer be emitted by scanner behavior, update `docs/RULES.md` to avoid promising a rule that never fires. If the function remains exported as a helper for programmatic consumers, note that the scanner ignores non-skill child directories and only reports malformed files it actually discovers.

**Verify**: `bun test test/quality-rules.test.ts test/structural-rules.test.ts` -> exit 0.

### Step 4: Run the standard gates

**Verify**:

- `bun run typecheck` -> exit 0
- `bun run check` -> exit 0, no fixes applied
- `bun run verify` -> exit 0

## Test plan

- Regression in `test/domain-scan.test.ts`: support directories without `SKILL.md` do not produce blocking findings.
- Existing malformed-frontmatter coverage remains unchanged.
- Existing structural-rule tests still pass or are intentionally updated if the unused helper is removed.

## Done criteria

- [ ] A direct child directory without `SKILL.md` is ignored by scanner discovery.
- [ ] A direct child directory with malformed `SKILL.md` still produces a blocking frontmatter finding.
- [ ] No new recursive scan behavior is introduced.
- [ ] `bun run verify` exits 0.
- [ ] No files outside the in-scope list are modified except `plans/README.md` status update.

## STOP conditions

Stop and report back if:

- Maintainers intentionally want every child directory under a skills root to be a skill, despite the spec excerpts above.
- Removing or changing `buildMissingSkillFinding()` would break the exported public API in a way that needs a versioning decision.
- The fix requires introducing a new configuration surface for scan depth or ignored folders.

## Maintenance notes

Reviewers should focus on false positives: roots may contain README files, generated folders, or support directories. A future recursive scanner should still use the same rule: only directories containing `SKILL.md` are skills.
