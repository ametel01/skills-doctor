# Plan 043: Keep the project-local React Doctor skill scanner-clean

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`
> unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat dc7b239..HEAD -- .agents/skills/react-doctor/SKILL.md .agents/skills/react-doctor/references/explain.md test/api-fixtures.test.ts docs/RULES.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `dc7b239`, 2026-07-08
- **Issue**: https://github.com/ametel01/skills-doctor/issues/21

## Why this matters

This repository is a skill scanner, but its tracked project-local
`.agents/skills/react-doctor` skill currently fails the scanner. The normal
verification suite keeps the packaged `skills/skills-doctor` wrapper clean, but
it does not cover the project-local React Doctor helper. That lets a
discoverable repo skill carry scanner warnings while `bun run verify` stays
green.

## Execution order and parallelism

This plan is independent and can be worked in parallel with plans 044, 045,
046, and 047. It is recommended in the first execution wave because it makes the
repository's own tracked project-local skill scanner-clean and adds a regression
guard. It mostly touches `.agents/skills/react-doctor/**` and
`test/api-fixtures.test.ts`, so it should not conflict with the other plans
unless another executor is also editing shared scanner-clean tests.

## Current state

Relevant files:

- `.agents/skills/react-doctor/SKILL.md` - tracked project-local React Doctor
  helper skill; this is what Codex discovers from this repository.
- `.agents/skills/react-doctor/references/explain.md` - referenced rule
  explanation workflow for React Doctor configuration tasks.
- `test/api-fixtures.test.ts` - already has a scanner-clean regression for the
  packaged `skills/skills-doctor` wrapper; use it as the pattern for adding the
  missing guard.
- `docs/RULES.md` - rule catalog documentation. Touch only if rule behavior is
  intentionally reclassified, which is not expected for this plan.

Current tracked skill excerpt:

```md
# .agents/skills/react-doctor/SKILL.md:1-5
---
name: react-doctor
description: Use when finishing a feature, fixing a bug, before committing React code, or when the user types `/doctor`, asks to scan, triage, or clean up React diagnostics. Covers lint, accessibility, bundle size, architecture. Includes a regression check and a full local-triage workflow that fetches the canonical playbook.
version: "1.2.0"
---
```

```md
# .agents/skills/react-doctor/SKILL.md:13-19
Run `npx react-doctor@latest --verbose --scope changed` and check the score did not regress.

If the score dropped, fix the regressions before committing.

## For general cleanup or code improvement:

Run `npx react-doctor@latest --verbose` (the default `--scope full`) to scan the full codebase. Fix issues by severity - errors first, then warnings.
```

````md
# .agents/skills/react-doctor/SKILL.md:23-33
When the user types `/doctor`, says "run react doctor", or asks for a full triage / cleanup pass (not just a regression check), fetch the canonical local-triage playbook and follow every step in it:

```bash
curl --fail --silent --show-error \
  --header 'Cache-Control: no-cache' \
  https://www.react.doctor/prompts/react-doctor-agent.md
```

The playbook is the single source of truth - a scan -> filter -> triage -> fix -> validate loop that edits the working tree directly (never commits, never opens PRs). Updating the prompt at its source updates every agent on its next fetch - no skill reinstall needed.
````

Existing packaged-wrapper guard:

```ts
// test/api-fixtures.test.ts:169-185
it("keeps the packaged Skills Doctor wrapper scanner-clean for known wrapper issues", async () => {
  const skillsRoot = fileURLToPath(new URL("../skills", import.meta.url));
  const scan = await scanSkillRoots({
    roots: [{ ecosystem: "custom", rootPath: skillsRoot, source: "custom" }],
  });
  const ruleIds = scan.findings.map((finding) => finding.ruleId);

  expect(ruleIds).not.toEqual(
    expect.arrayContaining([
      "weak-description-trigger",
      "missing-skill-evals",
      "unpinned-package-runner",
      "SKILL204_UNPINNED_TOOLS",
    ]),
  );
  expect(scan.findings).toEqual([]);
});
```

Observed current scanner result from the advisor pass against the repo-local
root:

- `unknown-frontmatter-field` at `.agents/skills/react-doctor/SKILL.md:4`
- `unpinned-package-runner` at `.agents/skills/react-doctor/SKILL.md:13`
- `missing-skill-evals`
- `SKILL204_UNPINNED_TOOLS` at `.agents/skills/react-doctor/SKILL.md:13`
- `SKILL206_LARGE_CONTEXT_BAIT` at `.agents/skills/react-doctor/SKILL.md:3`
- `SKILL102_MISSING_DENYLIST` at `.agents/skills/react-doctor/SKILL.md:72`
- `SKILL105_CROSS_MODAL_MISMATCH` at `.agents/skills/react-doctor/SKILL.md:72`

Repo conventions to follow:

- This is a Bun/TypeScript repo. Use two-space indentation, double quotes, and
  semicolons in TypeScript.
- Scanner regression tests usually live beside related API/fixture tests and
  import scanner helpers from `../src/index.js`.
- Keep skill bodies concise and push detail into `references/` when needed.
- The CLI is the source of truth for scanner behavior; do not add ad hoc test
  logic that reimplements scanner rules.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Targeted test | `bun test test/api-fixtures.test.ts` | exit 0; new project-local skill guard passes |
| Scanner API check | `bun -e 'import { scanSkillRoots } from "./src/index.ts"; const scan = await scanSkillRoots({ roots: [{ ecosystem: "codex", rootPath: `${process.cwd()}/.agents/skills`, source: "local" }] }); console.log(JSON.stringify(scan.findings.map((finding) => finding.ruleId))); if (scan.findings.length > 0) process.exit(1);'` | exit 0; prints `[]` |
| Full tests | `bun run test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint/format check | `bun run check` | exit 0 |

## Scope

**In scope**:

- `.agents/skills/react-doctor/SKILL.md`
- `.agents/skills/react-doctor/references/explain.md` only if moving existing
  explanatory material out of `SKILL.md`
- `.agents/skills/react-doctor/evals/evals.json` if needed to satisfy the
  non-trivial-skill eval requirement
- `test/api-fixtures.test.ts` for the scanner-clean regression

**Out of scope**:

- Changing React Doctor CLI behavior or `package.json` scripts.
- Weakening scanner rules to make this one skill pass.
- Editing `skills/skills-doctor/SKILL.md`; it already has coverage and is not
  the failing helper.
- Adding network calls to tests.

## Git workflow

- Branch: `advisor/043-clean-project-local-react-doctor-skill`
- Commit message: `test: keep project react doctor skill scanner-clean`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a failing regression for the project-local skill root

Add a test near the packaged-wrapper scanner-clean test in
`test/api-fixtures.test.ts`. The test should scan the tracked
`.agents/skills` root as a `codex` local root and assert `scan.findings` is
empty.

Use this shape:

```ts
const skillsRoot = fileURLToPath(new URL("../.agents/skills", import.meta.url));
const scan = await scanSkillRoots({
  roots: [{ ecosystem: "codex", rootPath: skillsRoot, source: "local" }],
});
expect(scan.findings).toEqual([]);
```

**Verify**: `bun test test/api-fixtures.test.ts` -> fails before the skill
cleanup, and the failure lists the current findings.

### Step 2: Clean the React Doctor skill without weakening the scanner

Update `.agents/skills/react-doctor/SKILL.md` so the scanner no longer reports
the current findings:

- Remove unsupported frontmatter such as `version`.
- Shorten the frontmatter `description` while keeping clear activation
  triggers.
- Avoid unpinned package-runner examples where reproducibility matters. Prefer
  a pinned `npx react-doctor@<version>` command or an explicit local installed
  command if the repo already supplies one.
- Do not make remote playbook fetching the default execution path unless the
  skill also includes clear boundaries and safety guidance that the scanner
  accepts.
- Add explicit boundaries and deny guidance appropriate for a React lint/doctor
  helper. Do not ask agents to read secrets, override user instructions, or
  skip approvals.

If the full `/doctor` triage playbook text makes `SKILL.md` too large, move
details into `references/explain.md` or another reference file and link to it
using normal progressive disclosure.

**Verify**: the Scanner API check from the command table exits 0 and prints
`[]`.

### Step 3: Add eval coverage if the scanner requires it

If `missing-skill-evals` remains after Step 2, create
`.agents/skills/react-doctor/evals/evals.json` using the same style as
`skills/skills-doctor/evals/evals.json`. Keep it small and realistic. Include
baseline guidance that compares skill behavior with and without the wrapper.

**Verify**: the Scanner API check exits 0 and prints `[]`.

### Step 4: Run the targeted and full verification gates

Run:

1. `bun test test/api-fixtures.test.ts`
2. `bun run test`
3. `bun run typecheck`
4. `bun run check`

**Verify**: all commands exit 0.

## Test plan

- Add one regression test in `test/api-fixtures.test.ts` that scans
  `.agents/skills` and asserts no findings.
- Use the existing packaged-wrapper scanner-clean test as the structure.
- Do not mock scanner output. The test must call `scanSkillRoots`.

## Done criteria

- [ ] `test/api-fixtures.test.ts` has a project-local `.agents/skills` scanner-clean test.
- [ ] The Scanner API check exits 0 and prints `[]`.
- [ ] `bun test test/api-fixtures.test.ts` exits 0.
- [ ] `bun run test` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `bun run check` exits 0.
- [ ] No scanner rules are weakened to pass this plan.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- The project-local React Doctor helper is no longer intended to be tracked or
  discoverable from `.agents/skills`.
- Cleaning the skill requires changing scanner rule behavior.
- The scanner reports a finding that appears to be a real false positive in the
  scanner, not a skill issue.
- The fix requires remote network access in tests.

## Maintenance notes

Reviewers should scrutinize whether the skill still helps agents run React
Doctor effectively without becoming a remote prompt loader by default. Future
changes to tracked skills should keep this scanner-clean guard green.
