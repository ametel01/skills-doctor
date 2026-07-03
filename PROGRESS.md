# Evidence-Based Security Scanner Progress

## Source Summary

This tracker records the current issue wave for the evidence-based security
scanner work. It is the durable handoff log for setup status, validation
results, current status, and the next unblocked wave.

## Issue Set

- Wave 0: #1 progress and changelog tracking.
- Wave 1: #2 and #3 after #1.
- Wave 2: #4 after #2; #5 after #2 and #3; #6 after #3.
- Wave 3: #7 after #4, #5, and #6.
- Wave 4: #8 after #7.
- Wave 5: #9 after #8.

## Update Rules

- Update this file after every completed issue wave or meaningful handoff.
- Record the completed setup or implementation step, validation commands and
  results, current status, commit reference when available, and next step.
- Keep `CHANGELOG.md` current under `## [Unreleased]` for user-visible or
  release-note-worthy changes.
- Preserve older progress entries as historical context unless they become
  archived by the coordinator.

## Current Status

Issue #1 is implemented in worktree
`/Users/alexmetelli/source/skills-doctor-issue-1` on branch
`fix/issue-1-progress-tracking`.

Next step: checker review of issue #1.

Next unblocked wave: #2 and #3 after #1 is accepted.

## Update Log

### 2026-07-03: Issue #1 Tracking Setup

- Set up the current issue-wave progress tracker with issue set, update rules,
  current status, and next unblocked wave.
- Verified `CHANGELOG.md` exists, preserves existing release history, and
  contains `## [Unreleased]`.
- Validation:
  - `bun run format:check` initially failed because dependencies were missing
    from the worktree:
    `/opt/homebrew/bin/bash: line 1: biome: command not found`
  - `bun install --frozen-lockfile` passed and installed the locked toolchain
    without source changes.
  - `bun run format:check` passed after install:
    `Checked 65 files in 18ms. No fixes applied.`
- Current status: issue #1 implementation is complete and ready for checker
  review.
- Next step: checker review of issue #1.
- Next unblocked wave after #1: #2 and #3.

## Historical Implementation Log

### 2026-06-30: Post-plan CLI Visibility Fix

- Added a human summary line when scans include security findings.
- Added a `View security findings` interactive review action when security
  findings exist.
- Added CLI and reporting regression coverage so security findings are visible
  from the CLI path, not only the domain scanner.
- Updated `bun run dev` to rebuild ignored `dist/` output before launching the
  packaged bin, so local CLI runs reflect latest source changes.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/reporting.test.ts test/cli-scan.test.ts test/cli-bin.test.ts` (3 files, 55 tests)
  - `bun run verify` (19 files, 167 tests)
- Changelog: added entries for surfacing security findings in the interactive
  CLI and keeping the development entrypoint fresh.
- Commit: development entrypoint follow-up (`fix: rebuild before dev cli launch`).

### 2026-06-30: Security Report Separation Follow-up

- Separated security findings from quality issue counts, scoring, per-skill
  quality summaries, and default exit-code gates.
- Downgraded security rules to review warnings and kept security findings in a
  separate interactive report.
- Added evidence excerpts to security findings so users can inspect the matched
  `SKILL.md` lines and deselect false positives.
- Added a `Fix selected security findings with Claude or Codex` flow that sends
  only checked security findings to the repair handoff prompt.
- Validation passed:
  - `bun run typecheck`
  - `bun run test -- test/security-rules.test.ts test/reporting.test.ts test/domain-scan.test.ts test/cli-scan.test.ts test/handoff.test.ts` (5 files, 89 tests)
  - `bun run check`
  - `bun run verify` (19 files, 168 tests)
- Changelog: added `Changed` entries for the separated security report and
  per-finding security handoff selection.
- Commit: security report separation follow-up (`feat: separate security review findings`).

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
- Commit: `d2d172d` (`feat: add security rule validator surface`).

### 2026-06-30: Step 3 Instruction Subversion and Exfiltration Rules

- Implemented `prompt-injection-instruction`.
- Implemented `secret-exfiltration-instruction`.
- Implemented `network-exfiltration-command`.
- Added deterministic line-number coverage and enabled-rule isolation coverage.
- Added benign false-positive coverage for defensive secret handling and public
  network examples.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/security-rules.test.ts` (1 file, 6 tests)
  - `bun run test` (19 files, 157 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added a `Security` entry for instruction-subversion and
  secret-exfiltration detection in skill files.
- Commit: `7d188e9` (`feat: detect malicious instruction and exfiltration patterns`).

### 2026-06-30: Step 4 Execution, Destruction, Safety-Disablement, and Obfuscation Rules

- Implemented `remote-code-execution-bootstrap`.
- Implemented `destructive-command-high-risk`.
- Implemented `agent-safety-disablement`.
- Implemented `external-resource-obfuscation`.
- Added benign false-positive coverage for descriptive launch previews, static
  fixture decoding, and scoped destructive cleanup with confirmation.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/security-rules.test.ts` (1 file, 11 tests)
  - `bun run test` (19 files, 162 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added a `Security` entry for remote execution,
  safety-disablement, destructive, and obfuscated command detection in skill
  files.
- Commit: `7805466` (`feat: detect high-risk skill command patterns`).

### 2026-06-30: Step 5 Security Scan and Report Integration

- Wired `validateSecurityRules()` into `scanSkillRoots()` after structural and
  quality validation.
- Added domain scan coverage proving security findings are emitted during normal
  scans.
- Added reporting coverage proving security error findings make reports fail
  through the existing `buildScanReport()` and `resolveScanExitCode()` paths.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/domain-scan.test.ts` (1 file, 14 tests)
  - `bun run test -- test/reporting.test.ts` (1 file, 12 tests)
  - `bun run test` (19 files, 164 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added a `Security` entry for integrating security findings into
  normal scans and reports.
- Commit: `16a6477` (`feat: include security findings in skill scans`).

### 2026-06-30: Step 6 Rule Catalog and Public API Documentation

- Added all security rule IDs to `ruleCatalog`.
- Added a Security section to `docs/RULES.md`.
- Updated `docs/API.md` with `validateSecurityRules()`, `SecurityRuleOptions`,
  and the `security` finding category.
- Updated `docs/CLI_SPEC.md` with the security rule module in the source map
  and domain boundary.
- Updated `README.md` with suspicious skill security checks and CI behavior.
- Extended rule catalog synchronization coverage to include
  `src/domain/rules/security.ts`.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/api-fixtures.test.ts` (1 file, 8 tests)
  - `bun run test -- test/reporting.test.ts` (1 file, 12 tests)
  - `bun run test` (19 files, 164 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for documenting the security detector and
  public API.
- Commit: `e68dd46` (`docs: document malicious skill detector rules`).

### 2026-06-30: Step 7 Final Verification and Packaging Check

- Ran final explicit quality gates after all implementation and documentation
  slices.
- Ran the aggregate verification suite.
- Ran package dry-run and confirmed the package includes
  `dist/domain/rules/security.js`, declarations, docs, and package exports.
- Deferred referenced-file scanning remains future work; this implementation
  intentionally scans only `SKILL.md` content.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test` (19 files, 164 tests)
  - `bun run typecheck`
  - `bun run build`
  - `bun run verify` (19 files, 164 tests; build passed)
  - `bun run pack:dry-run` (115 files, unpacked size 0.28MB)
- Changelog: added a `Security` entry for final release-readiness verification.
- Commit: final readiness commit (`chore: verify malicious skill detector release readiness`).
