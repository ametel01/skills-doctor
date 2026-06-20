# Usage Cleanup Implementation Progress

## Source Summary

This tracker follows `PLAN.md`, which adds local Codex skill usage analysis,
context-budget pressure detection, cleanup recommendations, and local cleanup
handoff to the normal `npx skills-doctor@latest` flow.

`PROGRESS.md` must be updated after every completed step with completion notes,
validation results, commit reference when available, current status, and the
next step.

## Step Checklist

- [x] Step 0: Progress and Changelog Tracking Setup
- [x] Step 1: Baseline Verification
- [x] Step 2: Add Skill Usage Analysis Domain Module
- [x] Step 3: Add Codex Usage Source Discovery and Context-Budget Pressure Detection
- [x] Step 4: Extend Reports and Rendering With Usage Analysis
- [x] Step 5: Add Usage Flags and Main Interactive Prompt Integration
- [x] Step 6: Add Cleanup Report Directory and Handoff Prompt
- [x] Step 7: Add Cleanup Recommendation Views
- [x] Step 8: Update Public API, Docs, and Package Smoke Coverage
- [x] Step 9: Final End-to-End Verification

## Current Status

All plan steps are complete.

Next step: none.

## Update Log

### 2026-06-20: Step 0 Tracking Setup

- Created this durable progress tracker before feature implementation.
- Verified `CHANGELOG.md` contains `# Changelog`, the Keep a Changelog preamble, and `## [Unreleased]`.
- Validation passed:
  - `test -f PROGRESS.md`
  - `test -f CHANGELOG.md`
  - `rg "^## \\[Unreleased\\]" CHANGELOG.md`
  - `bun run format:check`
  - `bun run lint`
  - `bun run test` (16 files, 114 tests)
  - `bun run typecheck`
  - `bun run build`
- Commit: `9059460` (`chore: add usage cleanup implementation tracking`).

### 2026-06-20: Step 1 Baseline Verification

- Ran the repository baseline before usage-analysis implementation.
- `bun install --frozen-lockfile` passed with no lockfile or dependency changes.
- `bun run verify` passed:
  - `bun run check`
  - `bun run typecheck`
  - `bun run test` (16 files, 114 tests)
  - `bun run build`
- Additional quality gates passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test` (16 files, 114 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: no entry required because no source behavior changed.
- Commit: `408d290` (`chore: record baseline verification`).

### 2026-06-20: Step 2 Skill Usage Analysis Domain Module

- Added `analyzeSkillUsage()` with deterministic usage ranking from caller-provided Codex JSONL session sources.
- Added public usage-analysis types and root package exports.
- Added high-confidence backticked skill announcement matching and unique medium-confidence phrase matching.
- Added per-skill usage tiers, deduped usage events, plugin-prefixed alias inference, duplicate-skill detection, and conservative cleanup recommendations.
- Added fixture-driven tests that use temporary JSONL files and never read real `~/.codex` data.
- Verified reports omit raw user prompts and assistant transcript text.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/skill-usage.test.ts` (1 file, 5 tests)
  - `bun run test` (17 files, 119 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for the local Codex session usage analyzer.
- Commit: `682692e` (`feat: add skill usage analysis domain module`).

### 2026-06-20: Step 3 Codex Usage Source Discovery and Context Pressure

- Added `discoverUsageSources()` for bounded discovery of known local Codex session JSONL files and `history.jsonl`.
- Added local context-budget pressure detection for the Codex skill-description warning text.
- Added optional injected SQLite pressure reading for `logs_2.sqlite` without introducing a hard runtime dependency.
- Added pressure summary fields for warning counts, latest warning timestamp, active/included/omitted skill counts, truncated descriptions, and budget limit when available.
- Added non-fatal diagnostics for unreadable usage sources and SQLite adapter failures.
- Added tests for bounded source discovery, known-path confinement, missing data, unreadable sources, warning extraction, and optional SQLite rows.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/skill-usage.test.ts` (1 file, 5 tests)
  - `bun run test -- test/usage-sources.test.ts` (1 file, 6 tests)
  - `bun run test` (18 files, 125 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for Codex usage-source discovery and context-budget pressure detection.
- Commit: `a471be8` (`feat: detect codex skill usage sources`).

### 2026-06-20: Step 4 Usage Analysis in Reports and Summaries

- Added optional `usage` data to `ScanReport` while preserving the current JSON shape when usage analysis is omitted.
- Added `ScanReportUsage` and `BuildScanReportUsageInput` public types.
- Added usage counts, context-pressure details, ranked skills, recommendations, and top recommendations to report usage data.
- Updated human summaries to render usage counts, context-budget pressure, warning notes, and cleanup candidate counts when usage analysis ran.
- Added reporting tests for reports with and without usage data and for usage summary rendering.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/reporting.test.ts` (1 file, 9 tests)
  - `bun run test` (18 files, 127 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for usage analysis in scan reports and summaries.
- Commit: `60ae2ba` (`feat: include usage analysis in scan reports`).

### 2026-06-20: Step 5 Usage Flags and Interactive Prompt Integration

- Added `--usage` for non-interactive and JSON usage analysis.
- Added `--no-logs` to opt out of default interactive Codex log discovery.
- Wired usage-source discovery and skill usage analysis into scan reports.
- Kept JSON reports unchanged unless `--usage` is requested.
- Ran usage analysis by default in interactive scans and surfaced cleanup as a main next-step action even when no quality findings exist.
- Added a lightweight usage cleanup summary action pending the full cleanup handoff in Step 6.
- Added CLI tests for `--json --usage`, `--yes --usage`, prompt skipping, and cleanup appearing with no findings.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/cli-scan.test.ts` (1 file, 24 tests)
  - `bun run test -- test/cli-bin.test.ts` (1 file, 9 tests)
  - `bun run test` (18 files, 130 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for the interactive usage-cleanup prompt and `--usage` automation flag.
- Commit: `f1b94d2` (`feat: add usage cleanup to interactive scan flow`).

### 2026-06-20: Step 6 Cleanup Report Directory and Handoff Prompt

- Added cleanup handoff prompt generation with conservative cleanup rules and `npx skills-doctor@latest` verification guidance.
- Added cleanup report directory writing for `usage.json` and `usage.md`.
- Added cleanup handoff preparation that writes `cleanup-prompt.md` and falls back to an inline prompt if report or prompt writing fails.
- Reused local Claude/Codex agent selection, launch preview, confirmation, and launch helpers for cleanup handoff.
- Added post-cleanup re-scan and summary output for skill count, context pressure, findings count, and report directory.
- Added tests for prompt content, report writing, fallback behavior, no-agent cleanup reports, and launch cancellation.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/handoff.test.ts` (1 file, 16 tests)
  - `bun run test -- test/cli-scan.test.ts` (1 file, 25 tests)
  - `bun run test` (18 files, 135 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for cleanup handoff reports and local agent launch support.
- Commit: `434d443` (`feat: add usage cleanup handoff`).

### 2026-06-20: Step 7 Cleanup Recommendation Views

- Added read-only interactive views for usage ranking and cleanup recommendations before launching cleanup handoff.
- Rendered deterministic usage details by skill name, tier, count, confidence, timestamp, and path without raw log text.
- Rendered cleanup recommendations with action, skill name, reason, and path.
- Added CLI coverage for opening both usage views and preserving transcript privacy.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/cli-scan.test.ts` (1 file, 26 tests)
  - `bun run test -- test/skill-usage.test.ts` (1 file, 5 tests)
  - `bun run test` (18 files, 136 tests)
  - `bun run typecheck`
  - `bun run build`
- Changelog: added an `Added` entry for interactive usage ranking and cleanup recommendation views.
- Commit: `4dc5719` (`feat: render skill usage cleanup recommendations`).

### 2026-06-20: Step 8 Public API, Docs, and Package Smoke Coverage

- Updated the README with context-budget cleanup, the default `npx skills-doctor@latest` flow, `--usage`, `--json --usage`, `--no-logs`, privacy behavior, and cleanup handoff details.
- Updated the CLI spec with usage analysis workflow placement, prompt behavior, JSON contract, usage flags, cleanup handoff, and local usage report artifacts.
- Updated the API docs with public usage helpers and types, the optional `ScanReport.usage` field, usage source diagnostics, and privacy notes.
- Confirmed root package exports include usage discovery, usage analysis, cleanup prompt generation, and cleanup report writing.
- Added packaged CLI smoke coverage for `--json --usage` while preserving the one-object JSON stdout contract.
- Validation passed:
  - `bun run format:check`
  - `bun run lint`
  - `bun run test -- test/api-fixtures.test.ts` (1 file, 8 tests)
  - `bun run test -- test/cli-bin.test.ts` (1 file, 10 tests)
  - `bun run test` (18 files, 137 tests)
  - `bun run typecheck`
  - `bun run build`
  - `bun run verify`
  - `bun run pack:dry-run`
- Note: one parallel `bun run test` attempt observed stale `dist` while `bun run build` was running concurrently; rerunning after build passed.
- Changelog: added `Added` and `Changed` entries for packaged usage smoke coverage and usage cleanup documentation.
- Commit: `a586d17` (`docs: document usage cleanup workflow`).

### 2026-06-20: Step 9 Final End-to-End Verification

- Ran the full repository verification and package dry-run after all implementation slices were committed.
- Exercised the built CLI against temporary fixture directories for:
  - `--json`
  - `--json --usage`
  - `--yes --usage`
- Verified `--json` still emits one JSON object without a `usage` field unless usage analysis is requested.
- Verified `--json --usage` includes detected skill usage and context-budget pressure while omitting raw assistant transcript text.
- Verified `--yes --usage` renders usage analysis without raw transcript text.
- Verified missing `~/.codex` data degrades to unknown context pressure, unknown skill usage, and inventory-only `review` recommendations.
- Exercised the cleanup handoff path through the built scan action with deterministic prompts:
  - cleanup appears in the next-step prompt
  - `usage.json`, `usage.md`, and `cleanup-prompt.md` are written
  - cleanup launch can be cancelled safely
  - usage artifacts omit raw Codex log text
  - cleanup prompt includes `npx skills-doctor@latest` verification guidance
- Validation passed:
  - `bun run verify` (18 files, 137 tests; build passed)
  - `bun run pack:dry-run`
  - final built CLI smoke script (`final e2e CLI checks passed`)
- Changelog: added a `Tests` entry for final end-to-end usage cleanup verification.
- Commit: `test: verify usage cleanup workflow`.
