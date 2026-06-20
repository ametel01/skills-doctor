# Implementation Plan

## Source Documents
- Path: Inline conversation brief supplied on 2026-06-20
  - Role: Primary feature brief and user-experience specification.
  - Summary: Add skill usage analysis to the normal `npx skills-doctor@latest` interactive flow. The feature should auto-read Codex local usage traces, rank skills by detected usage, detect context-budget pressure, recommend cleanup, and hand an auditable cleanup prompt to a local CLI agent through the same Claude/Codex launch flow used by repair handoff.
- Path: `docs/CLI_SPEC.md`
  - Role: Existing CLI architecture constraints.
  - Summary: Keep Commander, prompts, spinners, process exit behavior, and agent launches at the CLI edge; keep scanning, reporting, and handoff content in reusable domain modules; preserve JSON stdout as exactly one object.
- Path: `docs/API.md`
  - Role: Existing public report and API contract.
  - Summary: `ScanReport` is the JSON/report shape used by CLI and API consumers. New usage output must be documented, exported intentionally, and remain compatible with programmatic consumers.
- Path: `README.md`
  - Role: User-facing product documentation.
  - Summary: The primary user path is `npx skills-doctor@latest`; docs should explain that cleanup analysis is available through the main interactive prompt without requiring installation.

## Goals
- Add automatic skill usage analysis to the main interactive scan flow users already reach with `npx skills-doctor@latest`.
- Detect usage from local Codex session JSONL files by matching high-confidence assistant skill-use announcements against the scanned skill catalog.
- Detect context-budget pressure from local Codex traces, including warnings that skill descriptions were shortened and, when safely available, structured `logs_2.sqlite` render events.
- Rank skills from most used to unused or unknown and produce conservative cleanup recommendations.
- Add a cleanup handoff flow beside the existing repair handoff flow, reusing local Claude/Codex agent selection, launch preview, confirmation, report-directory writing, and post-agent re-scan patterns.
- Support automation with `--usage`, `--json --usage`, and `--yes --usage`, while keeping the happy path as `npx skills-doctor@latest`.
- Keep all log scanning local, best-effort, privacy-aware, and non-fatal.

## Non-Goals
- Do not require users to install `skills-doctor` globally.
- Do not require users to manually provide logs for normal operation.
- Do not upload logs, skill contents, or reports to any hosted service.
- Do not silently delete skills or plugins during the scan phase.
- Do not treat missing or unreadable Codex logs as a scan failure.
- Do not add a separate top-level command unless later CLI feedback shows the main prompt is too crowded.
- Do not depend on unstable Codex internals as a hard requirement; all Codex log readers must degrade to inventory-only recommendations.

## Assumptions and Open Questions
- Assumption: The most reliable current per-skill usage signal is assistant announcement text in `~/.codex/sessions/**/*.jsonl`, not a dedicated structured `skill_used` event. Impact: usage counts should carry confidence and may undercount skills when an agent failed to announce them.
- Assumption: `~/.codex/logs_2.sqlite` is useful for context-budget pressure events, but SQLite access must be optional. Impact: implement JSONL warning detection first and make SQLite reading best-effort through an adapter or optional runtime capability.
- Assumption: Adding optional usage fields to JSON reports is backward-compatible with `schemaVersion: 1` if existing fields are unchanged. Impact: if implementation finds consumers or tests require stricter schema semantics, bump the schema and document the migration.
- Assumption: Cleanup handoff should instruct the local agent to preserve project-local skills unless there is strong evidence, and to prefer disabling or moving unused global skills/plugins over destructive deletion. Impact: recommendations must distinguish "safe to propose" from "safe to perform".
- Open question: What is the canonical "disable" operation for plugin-provided skills in the current Codex environment? Impact: initial cleanup handoff may need to propose plugin disable steps instead of executing them directly.
- Open question: Should usage analysis run on every interactive scan or only after context-budget pressure is detected? Conservative choice: run a bounded best-effort analysis in interactive mode so the prompt can surface cleanup even when no quality findings exist.

## Quality Gates
- Setup status: Existing gates are configured in `package.json`, `biome.json`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.build.json`, and `.github/workflows/ci.yml`. No new quality-gate setup step is required.
- Baseline command: `bun install --frozen-lockfile && bun run verify`
- Format command: `bun run format:check`
- Lint command: `bun run lint`
- Test command: `bun run test`
- Additional gates: `bun run typecheck`, `bun run build`, `bun run verify`, and `bun run pack:dry-run` before final release-facing completion.

## Progress Tracking
- File: `PROGRESS.md`
- Requirement: Create `PROGRESS.md` before any implementation work begins.
- Update rule: After each step is completed, update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.

## Changelog Tracking
- File: `CHANGELOG.md`
- Standard: Keep a Changelog 1.0.0, <https://keepachangelog.com/en/1.0.0/>
- Requirement: Verify the existing `CHANGELOG.md` before implementation work begins and keep its `## [Unreleased]` section updated after each completed step.
- Initial content: `CHANGELOG.md` already exists with `# Changelog`, the standard preamble, and `## [Unreleased]`.
- Update rule: After each step is completed and validated, update `CHANGELOG.md` with human-readable notable changes under the appropriate `Unreleased` change-type headings before creating that step's commit.

## Incremental Steps

### Step 0: Progress and Changelog Tracking Setup
Goal: Create durable progress tracking and verify changelog tracking before feature implementation begins.

Depends on:
- None

Changes:
- Create `PROGRESS.md` in the project root.
- Add the plan title, source summary, full step checklist, current status, and a short update log.
- Document that `PROGRESS.md` must be updated after every completed step.
- Verify that `CHANGELOG.md` exists and follows Keep a Changelog 1.0.0 structure.
- If `CHANGELOG.md` is missing required structure, repair it before implementation starts.

Acceptance criteria:
- `PROGRESS.md` exists and lists every step in this plan.
- `CHANGELOG.md` has `# Changelog`, the standard preamble, and `## [Unreleased]`.
- No feature implementation has started.

Validation:
- Run `test -f PROGRESS.md`
- Run `test -f CHANGELOG.md`
- Run `rg "^## \\[Unreleased\\]" CHANGELOG.md`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Mark Step 0 complete in `PROGRESS.md`, record validation results, set current status to Step 1, and identify the next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for establishing progress tracking for the usage-cleanup feature plan.

Commit:
- `chore: add usage cleanup implementation tracking`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 1: Baseline Verification
Goal: Establish a clean baseline before usage-analysis implementation so later failures can be attributed to feature work.

Depends on:
- Step 0

Changes:
- Run the repository's full verification command before code changes.
- Record the result in `PROGRESS.md`.
- Do not change source code unless the baseline reveals an existing blocker that must be documented or fixed before proceeding.

Acceptance criteria:
- Baseline `bun run verify` result is recorded.
- Any pre-existing failures are clearly separated from feature failures.

Validation:
- Run `bun install --frozen-lockfile`
- Run `bun run verify`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with baseline results, commit reference if available, current status, and next step.

Changelog:
- If no source changes are made, no changelog entry is required. If a baseline blocker is fixed, update `CHANGELOG.md` under `Fixed`.

Commit:
- `chore: record baseline verification`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 2: Add Skill Usage Analysis Domain Module
Goal: Produce deterministic per-skill usage rankings from scanned skills and local Codex session JSONL content.

Depends on:
- Step 0
- Step 1

Changes:
- Add `src/domain/analyze-skill-usage.ts`.
- Add usage types to `src/domain/types.ts` or export-specific types from the new module:
  - `SkillUsageTier`: `frequent`, `recent`, `rare`, `unused`, `unknown`
  - `SkillUsageConfidence`: `high`, `medium`, `none`
  - `SkillUsageSummary`
  - `SkillCleanupRecommendation`
  - `SkillUsageAnalysis`
  - `SkillUsageEvent`
- Build a catalog from `SkillRecord` entries using frontmatter `name`, directory name, ecosystem, source, root path, skill path, and optional plugin-prefixed names when they can be inferred from paths.
- Implement high-confidence matcher support for assistant announcements such as:
  - `Using the \`gh-fix-ci\` skill`
  - `I’ll use the \`create-plan-from-doc\` skill`
  - `I’m using the \`teach\` skill`
- Implement medium-confidence matching only when a phrase can map to one known skill, such as "agent coding workflow skill" to `agent-coding-workflow`.
- Deduplicate usage by source file, timestamp or turn marker when present, and skill name so duplicated stored messages do not double-count one turn.
- Classify usage tiers with deterministic thresholds, for example:
  - `frequent`: 5 or more detected uses in the selected window
  - `recent`: last detected use within the selected window but below frequent threshold
  - `rare`: one or two older detected uses
  - `unused`: no detected uses while usage sources were readable
  - `unknown`: no usage sources were readable
- Generate conservative cleanup recommendations:
  - `keep` for frequent or recent skills
  - `review` for unknown skills
  - `disable-candidate` for unused global/custom skills
  - `shorten-description` for useful skills with high description/context cost
  - `merge-candidate` for duplicate same-name or strongly overlapping skills
- Add fixture-driven tests in `test/skill-usage.test.ts` using temporary JSONL fixtures; do not read real `~/.codex` data in tests.
- Export the public analysis function and types from `src/index.ts`.

Acceptance criteria:
- Given a fixed set of `SkillRecord` fixtures and JSONL fixture lines, analysis returns stable counts, tiers, last-used timestamps, confidence, and recommendations.
- Missing JSONL sources return `unknown` tiers and diagnostics rather than throwing.
- Medium-confidence alias matching cannot assign usage when two skills could match the same phrase.
- Reports never include raw user prompts or full assistant transcript text.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/skill-usage.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for the local Codex session usage analyzer.

Commit:
- `feat: add skill usage analysis domain module`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 3: Add Codex Usage Source Discovery and Context-Budget Pressure Detection
Goal: Automatically discover local Codex usage sources and detect when skill descriptions are being shortened due to context-budget pressure.

Depends on:
- Step 0
- Step 1
- Step 2

Changes:
- Add `src/domain/discover-usage-sources.ts` or a similarly named domain module.
- Discover default Codex sources from the configured home directory:
  - `~/.codex/sessions/**/*.jsonl`
  - `~/.codex/history.jsonl` for visible warning text when present
  - `~/.codex/logs_2.sqlite` as an optional pressure source
- Keep discovery bounded:
  - only inspect known Codex paths
  - ignore unreadable files with diagnostics
  - support a since/window option to avoid scanning unbounded history by default
  - cap per-file bytes or total file count if needed for responsiveness
- Add a context-pressure result model that captures:
  - pressure level: `low`, `medium`, `high`, `unknown`
  - recent warning count
  - latest warning timestamp when known
  - total active skills, included skills, omitted skills, truncated description count, and budget limit when available
- Implement JSONL/history warning detection for the user-visible warning text:
  - `Skill descriptions were shortened to fit the 2% skills context budget`
- Implement `logs_2.sqlite` pressure reading as best-effort only:
  - Prefer an internal adapter seam so tests can inject structured rows.
  - Do not make SQLite support a hard runtime dependency.
  - If using `sqlite3` CLI or `node:sqlite`, treat absence or failure as a warning diagnostic and continue.
- Add tests for discovery, bounded scanning, unreadable source diagnostics, warning extraction, and optional SQLite pressure rows.

Acceptance criteria:
- Interactive analysis can detect the warning from JSONL/history without SQLite.
- SQLite pressure data improves detail when available but never blocks the scan.
- No scanner path reads arbitrary home-directory files outside known Codex locations.
- Usage analysis remains deterministic in tests through injected fixtures and clocks.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/skill-usage.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for Codex usage-source discovery and context-budget pressure detection.

Commit:
- `feat: detect codex skill usage sources`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 4: Extend Reports and Rendering With Usage Analysis
Goal: Include usage rankings and cleanup recommendations in machine-readable reports and concise human summaries.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3

Changes:
- Extend `src/domain/build-report.ts` so `BuildScanReportInput` can accept optional usage analysis.
- Add an optional `usage` field to `ScanReport` containing:
  - source diagnostics
  - context pressure summary
  - total skills analyzed
  - used, unused, unknown, duplicate, and plugin-contributed counts
  - ranked `skillsByUsage`
  - top cleanup recommendations
- Keep existing report fields unchanged.
- Decide during implementation whether optional `usage` can remain under `schemaVersion: 1`; if schema version is bumped, update all docs and tests in the same step.
- Extend `src/domain/summarize-findings.ts` or add a dedicated renderer for usage summaries:
  - show context-budget pressure only when usage analysis ran
  - show "Recent Codex logs show skill descriptions were shortened" when detected
  - show compact counts for used, unused, duplicate, and cleanup candidates
- Add or update tests in `test/reporting.test.ts` for reports with and without usage.
- Update JSON-mode tests to verify `--json` remains unchanged without `--usage` and includes usage only when requested.

Acceptance criteria:
- Existing report tests pass unchanged or are updated only for intentional optional usage fields.
- `skills-doctor --json` without `--usage` preserves the current JSON contract.
- `skills-doctor --json --usage` emits one JSON object with usage analysis.
- Human rendering includes the context-budget note when pressure is detected.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/reporting.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for usage analysis in scan reports and summaries.

Commit:
- `feat: include usage analysis in scan reports`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 5: Add Usage Flags and Main Interactive Prompt Integration
Goal: Make usage cleanup available from the normal `npx skills-doctor@latest` interactive prompt and available to automation through explicit flags.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3
- Step 4

Changes:
- Update `src/cli/index.ts`:
  - add `--usage`
  - add `--no-logs` if implementation needs an explicit opt-out for local usage-source scanning
  - ensure `resolvePreParseJsonMode` and directory argument parsing still work
- Update `ScanFlags` and `ScanActionOptions` in `src/cli/commands/scan.ts`:
  - include `usage?: boolean`
  - include usage-reader injection seams for tests
  - include home-directory-aware source discovery
- Run usage analysis by default in interactive mode after skill scanning so the main prompt can show cleanup even when there are no quality findings.
- Run usage analysis in non-interactive/JSON mode only when `--usage` is present.
- Replace or generalize `reviewFindings` into a scan action menu that can show:
  - `Clean up unused skills and context-budget pressure`
  - `Fix skill quality issues with Claude or Codex` when findings exist
  - `View errors` when errors exist
  - `View all findings` when findings exist
  - `View findings by skill` when findings exist
  - `Exit`
- Ensure the cleanup option can appear even when `report.findingCount === 0`.
- If context pressure is high, render a pre-prompt note similar to:
  - `Context budget pressure: high`
  - `Recent Codex logs show skill descriptions were shortened.`
- Add `test/cli-scan.test.ts` coverage for:
  - interactive prompt includes cleanup action
  - cleanup action appears when no findings exist but usage analysis has recommendations
  - `--yes` does not prompt
  - `--json --usage` includes usage and suppresses prompts
  - `--json` without `--usage` remains unchanged

Acceptance criteria:
- A user running `npx skills-doctor@latest` can choose cleanup from the main prompt.
- Automation users can request usage data with `--usage`.
- Existing repair flow remains available and behaviorally unchanged.
- Prompt skipping rules remain conservative and test-covered.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/cli-scan.test.ts`
- Run `bun run test -- test/cli-bin.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for the interactive usage-cleanup prompt and `--usage` automation flag.

Commit:
- `feat: add usage cleanup to interactive scan flow`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 6: Add Cleanup Report Directory and Handoff Prompt
Goal: Write an auditable cleanup report and hand it to a local Claude or Codex CLI agent through the existing launch flow.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5

Changes:
- Add `src/domain/build-cleanup-handoff-prompt.ts`.
- Add `src/domain/write-cleanup-directory.ts` or generalize `write-findings-directory.ts` if the abstraction stays simple.
- Cleanup report files should be written under `.skills-doctor/reports/<timestamp>/`, matching repair handoff:
  - `usage.json`
  - `usage.md`
  - `cleanup-prompt.md`
  - optional per-skill recommendation files if helpful and deterministic
- Add `src/cli/utils/cleanup-handoff-to-agent.ts` or generalize `handoff-to-agent.ts` carefully.
- Reuse:
  - `chooseRepairAgent`
  - `formatRepairAgentPreview`
  - `launchRepairAgent`
  - local report write fallback behavior
- The cleanup prompt must instruct the local CLI model to:
  - inspect the usage report first
  - preserve frequently used and recently used skills
  - preserve project-local skills unless there is strong evidence and user intent
  - prefer disabling, moving aside, or proposing removal for unused global/plugin skills
  - avoid deleting skills solely because usage is unknown
  - avoid exposing raw logs
  - re-run `npx skills-doctor@latest` after changes
- Add post-agent re-scan and render a concise summary:
  - before/after skill count
  - before/after context pressure when detectable
  - whether quality findings changed
  - report directory path
- Add tests in `test/handoff.test.ts` or `test/cleanup-handoff.test.ts` for prompt content, report writing, fallback behavior, and launch cancellation.

Acceptance criteria:
- Choosing cleanup writes a local report and cleanup prompt before any agent launch.
- The CLI previews the selected local agent launch and asks for confirmation.
- If no local agent is available, the report and prompt are still shown or written for manual use.
- If writing report files fails, the CLI falls back to an inline cleanup prompt.
- The cleanup prompt references `npx skills-doctor@latest` as the verification command.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/handoff.test.ts`
- Run `bun run test -- test/cleanup-handoff.test.ts` if a new test file is added
- Run `bun run test -- test/cli-scan.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for cleanup handoff reports and local agent launch support.

Commit:
- `feat: add usage cleanup handoff`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 7: Add Cleanup Recommendation Views
Goal: Make the cleanup analysis useful before launching an agent by showing ranked usage and recommendations in the interactive CLI.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5
- Step 6

Changes:
- Extend the interactive menu to include optional read-only views:
  - `View usage ranking`
  - `View cleanup recommendations`
  - or fold these into the cleanup flow before asking to launch an agent
- Render compact output like:
  - `Usage analysis:`
  - `- 20 skills used recently`
  - `- 41 skills with no detected usage`
  - `- 9 duplicate or overlapping skills`
  - `- 14 plugin-provided skills contributing to context pressure`
  - `Recommended cleanup:`
  - `- Disable unused global skills`
  - `- Disable unused plugins`
  - `- Merge duplicate planning/grilling skills`
  - `- Shorten descriptions for frequently used skills`
- Add grouped skill output for most used, rarely used, unused, unknown, and cleanup candidates.
- Ensure output uses only skill names, paths, counts, timestamps, confidence, and recommendations; never raw log message text.
- Add tests for rendering sorted output and preserving readable terminal summaries.

Acceptance criteria:
- Users can understand the cleanup recommendation before launching a local agent.
- Output is deterministic and sorted by usage count, recency, confidence, and name as appropriate.
- Unknown usage is clearly labeled and not presented as unused.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/cli-scan.test.ts`
- Run `bun run test -- test/skill-usage.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for interactive usage ranking and cleanup recommendation views.

Commit:
- `feat: render skill usage cleanup recommendations`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 8: Update Public API, Docs, and Package Smoke Coverage
Goal: Document the feature for `npx` users and programmatic consumers, then verify packaged behavior.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5
- Step 6
- Step 7

Changes:
- Update `README.md`:
  - mention context-budget cleanup in the main feature list
  - document `npx skills-doctor@latest` as the normal entrypoint
  - document `--usage`, `--json --usage`, and any `--no-logs` opt-out
  - describe privacy behavior for local Codex log scanning
  - show the interactive cleanup flow and local agent handoff
- Update `docs/CLI_SPEC.md`:
  - add usage analysis to scan workflow
  - document prompt behavior when no findings exist but cleanup is available
  - document usage flags and JSON contract
  - document cleanup handoff beside repair handoff
- Update `docs/API.md`:
  - document exported usage analysis helpers and types
  - document optional report `usage` field
  - document diagnostics for missing/unreadable usage sources
- Update `src/index.ts` exports for all intended public usage helpers and types.
- Update `test/api-fixtures.test.ts` and `test/cli-bin.test.ts`:
  - exported types/functions are available
  - packaged binary supports `--json --usage`
  - packaged binary keeps `--json` output as one JSON object
- Run package dry-run after all docs and package-surface updates.

Acceptance criteria:
- A user can discover and use the feature from README without installing globally.
- API consumers can understand the optional usage report shape.
- CLI spec accurately reflects implementation behavior.
- Packaged binary smoke tests cover usage JSON output.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/api-fixtures.test.ts`
- Run `bun run test -- test/cli-bin.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add `Added` and `Changed` entries under `## [Unreleased]` for documentation, public API, and packaged CLI support.

Commit:
- `docs: document usage cleanup workflow`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 9: Final End-to-End Verification
Goal: Validate the complete user flow and release readiness after all implementation slices are in place.

Depends on:
- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5
- Step 6
- Step 7
- Step 8

Changes:
- Add any final regression coverage discovered during integration.
- Manually exercise the interactive path with test fixtures or a temporary home directory:
  - normal scan
  - cleanup option appears
  - cleanup report writes
  - agent launch can be cancelled safely
  - post-cancel scan exits consistently
- Verify JSON paths:
  - `skills-doctor --json`
  - `skills-doctor --json --usage`
  - `skills-doctor --yes --usage`
- Verify no raw log text appears in usage reports.
- Verify missing `~/.codex` data degrades to unknown usage and inventory-only recommendations.

Acceptance criteria:
- Full verification passes.
- Pack dry-run succeeds.
- The final user experience matches the brief:
  - `npx skills-doctor@latest` surfaces context pressure
  - cleanup is part of the main prompt
  - cleanup handoff uses the same local CLI agent machinery as repair
  - verification instructions use `npx skills-doctor@latest`

Validation:
- Run `bun run verify`
- Run `bun run pack:dry-run`
- Run the packaged or built CLI against fixture directories for:
  - `--json`
  - `--json --usage`
  - `--yes --usage`

Quality gates:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with final validation results, commit reference if available, and completion status.

Changelog:
- Finalize all `## [Unreleased]` entries for the feature before committing.

Commit:
- `test: verify usage cleanup workflow`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.
