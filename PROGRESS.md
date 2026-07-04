# Natural Language-Aware Analyzer Progress

## Sources

- `PLAN.md`
- `docs/NATURAL_LANGUAGE_AWARE_ANALYZER.md`

## Current Status

- Status: In progress.
- Current step: Step 6 - Align Reports, Repair Prompts, and Documentation.
- Next step: Step 7 - Final Verification and Cleanup.

## Step Checklist

- [x] Step 0: Progress and Changelog Tracking Setup
- [x] Step 1: Baseline Gates and Characterization Fixtures
- [x] Step 2: Add Markdown Text Context Extraction
- [x] Step 3: Introduce Security Signals and Adjudication
- [x] Step 4: Migrate Natural-Language-Sensitive Rules
- [x] Step 5: Improve Capability Chain Adjudication
- [ ] Step 6: Align Reports, Repair Prompts, and Documentation
- [ ] Step 7: Final Verification and Cleanup

## Update Rule

After each completed step, update this file with:

- Completed step and summary.
- Validation commands and results.
- Commit reference if available.
- Current status.
- Next step.

## Completed Steps

### Step 0: Progress and Changelog Tracking Setup

- Summary: Replaced the previous full security scanner progress tracker with this natural-language analyzer plan checklist and confirmed `CHANGELOG.md` already exists with an `## [Unreleased]` section.
- Validation:
  - `test -f PROGRESS.md && test -f CHANGELOG.md && grep -q "## \\[Unreleased\\]" CHANGELOG.md && grep -q "Step 7: Final Verification" PROGRESS.md` passed.
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test` passed: 22 files, 257 tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: No changelog entry added because this step did not ship a functional change.
- Commit: Step 0 commit (`chore: initialize natural language analyzer plan tracking`).

### Step 1: Baseline Gates and Characterization Fixtures

- Summary: Recorded a clean `bun run verify` baseline and added natural-language characterization coverage for negated prompt override guidance, quoted malicious examples, anti-pattern examples, safe deletion with confirmation, remote docs parsed by local tools, security research documentation, and a true-positive prompt override finding with counterevidence metadata.
- Baseline:
  - `bun run verify` passed before analyzer implementation changes: `biome check`, `tsc --noEmit`, 22 test files / 257 tests, and `tsc -p tsconfig.build.json`.
- Validation:
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test -- test/security-rules.test.ts test/security-capabilities.test.ts` passed: 2 files, 77 passing tests, 4 expected-failing characterization tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: No changelog entry added because this step only added characterization coverage.
- Commit: Step 1 commit (`test: characterize natural language security contexts`).

### Step 2: Add Markdown Text Context Extraction

- Summary: Enriched `MarkdownSecurityCandidate` with `TextContext`, including heading path, section role, code-fence language, blockquote/list markers, example and anti-pattern flags, nearby negation, warning language, and defensive intent. Added assertions to the existing Markdown context test without changing emitted findings yet.
- Validation:
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test -- test/security-rules.test.ts` passed: 1 file, 75 passing tests, 4 expected-failing characterization tests.
  - `bun run test` passed: 22 files, 260 passing tests, 4 expected-failing characterization tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: No changelog entry added because this step added internal context plumbing without changing emitted findings.
- Commit: Step 2 commit (`feat: add markdown context for security candidates`).

### Step 3: Introduce Security Signals and Adjudication

- Summary: Added internal security signal, adjudication decision, and adjudicated signal types plus a deterministic adjudicator for non-operational examples, anti-patterns, reference notes, blockquotes, nearby negation, defensive intent, and parse-only command flows. Added direct tests for likely-false-positive and real prompt-override signal decisions without changing emitted findings yet.
- Validation:
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test -- test/security-rules.test.ts test/security-capabilities.test.ts` passed: 2 files, 79 passing tests, 4 expected-failing characterization tests.
  - `bun run test` passed: 22 files, 262 passing tests, 4 expected-failing characterization tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: No changelog entry added because this step added internal adjudication plumbing without changing emitted findings.
- Commit: Step 3 commit (`feat: adjudicate security signals before findings`).

### Step 4: Migrate Natural-Language-Sensitive Rules

- Summary: Routed prompt override, exfiltration-chain, remote-code-execution, and destructive-command body checks through deterministic signal adjudication. Converted the four natural-language false-positive characterization tests from expected failures into normal passing tests while preserving operational prompt override, command exfiltration, remote execution, and destructive-command true positives.
- Validation:
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test -- test/security-rules.test.ts test/reporting.test.ts test/cli-scan.test.ts` passed: 3 files, 132 tests.
  - `bun run test` passed: 22 files, 266 tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: Added a `Fixed` entry for reduced prompt-injection false positives in negated guidance, quoted examples, anti-patterns, and research notes.
- Commit: Step 4 commit (`fix: reduce security false positives with text context`).

### Step 5: Improve Capability Chain Adjudication

- Summary: Tightened package-level `SKILL004_EXFIL_CHAIN` to require connected `reads_secrets` and `network_egress` capability facts from the same non-`SKILL.md` artifact, preserved standalone secret-access findings, and expanded capability finding summaries to include all evidence-chain capability kinds. Added package-level tests for same-artifact exfiltration, unrelated artifact facts, local parse-only handling, and combined broad-tool/external-dependency denylist risk.
- Validation:
  - `bun run format:check` passed.
  - `bun run lint` passed.
  - `bun run test -- test/security-capabilities.test.ts test/security-rules.test.ts test/reporting.test.ts` passed: 3 files, 103 tests.
  - `bun run test` passed: 22 files, 269 tests.
  - `bun run typecheck` passed.
  - `bun run build` passed.
- Changelog: Added a `Fixed` entry for same-artifact package exfiltration chains and related capability summaries.
- Commit: Step 5 commit (`fix: adjudicate package security capability chains`).

## Update Log

- 2026-07-04: Completed Step 0 tracking refresh and validation.
- 2026-07-04: Completed Step 1 baseline verification and natural-language characterization fixtures.
- 2026-07-04: Completed Step 2 Markdown text context extraction and validation.
- 2026-07-04: Completed Step 3 security signal adjudication layer and validation.
- 2026-07-04: Completed Step 4 natural-language-sensitive rule migration and validation.
- 2026-07-04: Completed Step 5 package capability-chain adjudication and validation.
- 2026-07-04: Started implementation from `PLAN.md`; Step 0 tracking refresh is in progress.
