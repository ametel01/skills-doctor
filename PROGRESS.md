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
- [ ] Step 5: Add Usage Flags and Main Interactive Prompt Integration
- [ ] Step 6: Add Cleanup Report Directory and Handoff Prompt
- [ ] Step 7: Add Cleanup Recommendation Views
- [ ] Step 8: Update Public API, Docs, and Package Smoke Coverage
- [ ] Step 9: Final End-to-End Verification

## Current Status

Step 4 is complete.

Next step: Step 5: Add Usage Flags and Main Interactive Prompt Integration.

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
- Commit: pending until this step is committed.
