# Malicious Skill Detector Implementation Progress

## Source Summary

This tracker follows `PLAN.md`, which adds a deterministic security rule family
for suspicious or malicious Agent Skill content. The first implementation slice
scans only `SKILL.md`, avoids LLM classification, reports suspicious
instructions and capabilities without claiming intent, exposes
`validateSecurityRules()`, and wires security findings into the existing scan
and report pipeline.

`PROGRESS.md` must be updated after every completed step with completion notes,
validation results, commit reference when available, current status, and the
next step.

## Step Checklist

- [x] Step 0: Progress and Changelog Tracking Setup
- [x] Step 1: Baseline Verification
- [x] Step 2: Add Security Category and Validator Skeleton
- [ ] Step 3: Implement Instruction Subversion and Exfiltration Rules
- [ ] Step 4: Implement Execution, Destruction, Safety-Disablement, and Obfuscation Rules
- [ ] Step 5: Wire Security Rules Into Scanning and Reports
- [ ] Step 6: Document Rule Catalog and Public API
- [ ] Step 7: Final Verification and Packaging Check

## Current Status

Step 2 is complete.

Next step: Step 3 Implement Instruction Subversion and Exfiltration Rules.

## Update Log

### 2026-06-30: Step 0 Tracking Setup

- Replaced the stale usage-cleanup progress tracker with this malicious skill
  detector progress tracker.
- Verified `CHANGELOG.md` contains `# Changelog`, the Keep a Changelog
  preamble, and `## [Unreleased]`.
- Validation passed:
  - `test -f PROGRESS.md`
  - `test -f CHANGELOG.md`
  - `rg "^## \\[Unreleased\\]" CHANGELOG.md`
  - `bun run format:check`
  - `bun run lint`
  - `bun run test` (18 files, 151 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for malicious skill detector implementation
  tracking.
- Commit: `0454eff` (`chore: add malicious skill detector implementation tracking`).

### 2026-06-30: Step 1 Baseline Verification

- Ran the repository baseline before malicious skill detector implementation.
- `bun install --frozen-lockfile` passed with no dependency or lockfile changes.
- `bun run verify` passed:
  - `bun run check`
  - `bun run typecheck`
  - `bun run test` (18 files, 151 tests)
  - `bun run build`
- Additional quality gates passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test` (18 files, 151 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: no entry required because no source behavior changed.
- Commit: `a8df1a4` (`chore: record malicious detector baseline verification`).

### 2026-06-30: Step 2 Security Category and Validator Skeleton

- Added the `security` finding category.
- Added `src/domain/rules/security.ts` with the public
  `validateSecurityRules()` validator and `SecurityRuleOptions`.
- Exported the security validator API from the package root.
- Added security-rule skeleton tests for benign skills and enabled-rule filters.
- Updated public API facade coverage for the new export.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/security-rules.test.ts` (1 file, 2 tests)
  - `bun run test` (19 files, 153 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for the public security-rule validator API.
- Commit: pending.
