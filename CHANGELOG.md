# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added derived security capability facts for package artifacts, including secret access, network egress, remote execution, persistence, approval bypass, destructive actions, broad tools, MCP access, and obfuscation indicators.
- Added package artifact discovery metadata to scan results, including script/resource/config files and symlink status.
- Added package security model types for future artifact, capability, priority, and cross-file evidence reporting.
- Added a full-screen interactive TTY dashboard with scan progress, usage metrics, cleanup candidates, and keyboard-driven next-step actions.
- Added a public security-rule validator API surface for future malicious skill detection rules.

### Changed

- Security validation now evaluates package records and can report risky non-`SKILL.md` artifacts while preserving the existing `validateSecurityRules()` API.
- Added confidence, rationale, and counterevidence metadata to security findings in JSON and human reports.
- Replaced the plain interactive review prompt with a painted ANSI dashboard while preserving JSON, non-interactive, and injected-prompt output paths.
- Separated security findings from quality issue counts, scoring, and default exit gates.
- Added source excerpts to security findings and a per-finding security repair selection flow.

### Fixed

- Reduced prompt-injection false positives for ask-first admin flows and verified confirmation-skip CLI examples.
- Reduced exfiltration-rule false positives for webhook troubleshooting table rows and notification webhook destinations.
- Reduced exfiltration-rule false positives for webhook signing-secret setup and official API bearer-token examples while preserving arbitrary external secret-transfer findings.
- Suppressed prompt-injection false positives for defensive guidance about untrusted content, refusals, secret handling, signatures, and confirmations.
- Reduced false-positive remote-execution warnings for remote specs piped into local Node or shell parser scripts.
- Reduced false-positive remote-execution warnings for skills that fetch remote docs or specs for static parsing without executing the fetched content.
- Suppressed the reported real-world false positives for defensive untrusted-content handling and explicit public-issue confirmation guidance.
- Made `bun run dev` rebuild ignored `dist/` output before launching the packaged bin so local CLI runs reflect source changes.

### Security

- Surfaced security findings in the interactive CLI summary and review menu.
- Integrated security findings into normal skill scans and report exit-code behavior.
- Added deterministic detection for remote execution, safety-disablement, destructive, and obfuscated command patterns in skill files.
- Added deterministic detection for instruction-subversion and secret-exfiltration patterns in skill files.

## [0.5.2] - 2026-06-20

### Added

- Let users choose which unused cleanup candidates to include in cleanup handoff prompts.

### Changed

- Include all unused cleanup candidates in reports and handoff selection instead of capping the detected list.

## [0.5.1] - 2026-06-20

### Changed

- Store default repair and cleanup handoff reports under the OS temp directory instead of creating `.skills-doctor/reports` in the scanned project.

## [0.5.0] - 2026-06-20

### Added

- Added packaged CLI smoke coverage for `--json --usage` reports.
- Added interactive usage ranking and cleanup recommendation views before cleanup handoff.
- Added cleanup handoff reports, cleanup prompts, and local Claude/Codex launch support for usage cleanup.
- Added the `--usage` automation flag and interactive usage-cleanup prompt in the main scan flow.
- Added optional usage analysis in scan reports and human summaries, including context-budget pressure notes.
- Added bounded Codex usage-source discovery and context-budget pressure detection for local session/history logs.
- Added a local Codex session usage analyzer that ranks scanned skills by detected usage and emits conservative cleanup recommendations.
- Established progress tracking for the usage cleanup implementation plan.

### Changed

- Added color to human terminal scan summaries, usage ranking, usage recommendations, findings, and handoff summaries.
- Reformatted usage ranking and usage recommendations as grouped terminal tables with compact skill paths.
- Limited cleanup handoff to unused `disable-candidate` skills and Codex skills-config disable operations.
- Reworded interactive cleanup prompts to make clear unused skills are disabled, not deleted or moved.
- Clarified cleanup summary counts by showing total enabled unused candidates separately from the next cleanup batch size.
- Documented the usage cleanup workflow, optional usage report shape, public usage helpers, and local Codex log privacy behavior.

### Fixed

- Ignored Codex-disabled skills from scan, finding, usage-ranking, and cleanup-candidate results by reading `~/.codex/config.toml`.
- Fixed usage analysis for current Codex session JSONL records that store assistant messages under `payload`.

### Tests

- Verified the end-to-end usage cleanup workflow across built CLI JSON, usage, missing-log fallback, cleanup report writing, transcript privacy, and launch-cancellation paths.

## [0.4.1] - 2026-06-18

### Changed

- Documented `npx skills-doctor@latest` as the package-runner command in README examples.

### Fixed

- Ignored hidden metadata directories such as `.git` when scanning skills roots, and made `missing-skill` findings include the full candidate directory and expected `SKILL.md` path.

## [0.4.0] - 2026-06-18

### Added

- Exposed the rule catalog as structured public API metadata.
- Added opt-in `--fail-on` and `--min-score` scan quality gates for automation.
- Included the agent-facing `skills/skills-doctor` wrapper in the npm package.
- Added injectable resource and eval existence checks for `validateQualityRules`.
- Added a public API and `schemaVersion: 1` report schema reference.
- Tested the declared Node runtime floor in CI and aligned the package engine range to Node 22.13+.

### Changed

- Made non-interactive scans fail on ambiguous local/global or Claude/Codex root choices instead of scanning all detected roots.
- Added bounded concurrent `SKILL.md` reads while preserving deterministic scan order.
- Reused shared grouped-finding indexes for report summaries and grouped output.
- Made the manual release checklist version-aware and aligned with tag-derived release notes.
- Replaced the stale reusable CLI spec with a Skills Doctor-specific architecture map.

### Fixed

- Restored the documented `missing-skill` and `invalid-frontmatter` rule behavior so the structured rule catalog matches scanner findings.
- Stopped trailing sentence punctuation from creating false missing-resource warnings for valid skill resource references.
- Wrote repair handoff reports and prompts before stopping when no local `claude` or `codex` agent is available.
- Recognized normal `--help` mentions when checking script help guidance.
- Prevented long per-skill handoff report filenames from colliding after truncation.
- Returned JSON error reports for parse-level CLI failures when `--json` is set.
- Made the local `bun run dev` script execute the same CLI bin path used by packaged runs.
- Rejected symlinked skill resource references that resolve outside the skill directory.
- Preserved custom-root discovery diagnostics in scan reports when interactive scans add a missing custom skills path.
- Reflected blocking diagnostic failures in scan scores so diagnostic-only failures no longer report a perfect score.
- Reported unreadable direct-child `SKILL.md` entries as blocking diagnostics while continuing to scan other skills.
- Kept repair handoff prompts available inline when writing `handoff-prompt.md` fails after report-directory creation.
- Kept the release workflow on token-backed `bun publish` until npm trusted publishing is configured for the package.

### Tests

- Tightened rule-catalog synchronization coverage so docs-only, catalog-only, and emitted-rule drift fail together.
- Covered script help guidance warnings for existing script references.
- Added packaged CLI smoke coverage for JSON stdout and blocking-scan exit behavior.

## [0.3.1] - 2026-06-16

### Added

- Added line numbers to quality-rule findings where a specific source line can be resolved.

### Fixed

- Hid repair handoff subset options that do not match any findings (for warning-only and advice-only scans).
- Made CLI module import safe by removing side-effect execution and routing runtime entry through `bin/skills-doctor.js`.

## [0.3.0] - 2026-06-16

### Added

- Kept the interactive review menu available after viewing grouped and/or error findings so users can still launch repair in the same session.
- Added support for selecting a custom skills directory during interactive scans even when standard Claude/Codex roots are already detected.

### Fixed

- Ignored direct skill-root child directories that do not contain `SKILL.md` instead of reporting a blocking `missing-skill` finding.
- Classified missing referenced assets under the `assets` finding category instead of falling back to another resource category.

## [0.2.0] - 2026-06-16

### Added

- Added a repo-local `skills/skills-doctor` companion skill wrapper that delegates to the CLI.
- Added a programmatic API package surface (`exports` in `package.json`) and documentation for package consumers.
- Added `docs/RULES.md` and coverage to keep emitted rule IDs documented.
- Added scan duration measurement to reports using an injectable clock, including post-handoff scans.
- Added a grouped findings review action in the interactive review menu.

### Fixed

- Fixed CLI `--version` to report the package `version` from `package.json` instead of a hard-coded value.
- Fixed scan reports to carry unreadable-root diagnostics into JSON output and to fail when diagnostics include blocking errors.
- Prevented per-skill handoff report file collisions by including the skill path in generated report filenames.
- Improved post-handoff finding comparison so identical rule/skill findings are distinguished by message and location.
- Added boundary checks for resource references to prevent `scripts/`, `references/`, and `assets/` paths from escaping a skill directory.
- Scoped divergence checks to same source roots and added `source` to scanned skill records.

## [0.1.0] - 2026-06-15

### Added

- Initial Skills Doctor product requirements, skill quality specification, reusable CLI architecture specification, and incremental implementation plan.
- Bun-managed TypeScript CLI scaffold with Biome, Vitest, typecheck, build, verify, and package dry-run quality gates.
- GitHub Actions CI and tag-driven Bun release workflow.
- Release-note extraction from `CHANGELOG.md` for GitHub Releases created by CI.
- Project-local Claude and Codex/agents skill root discovery, `SKILL.md` scanning, and YAML frontmatter parsing.
- Structural Agent Skills validation for required frontmatter, naming, description length, optional fields, missing `SKILL.md`, and unsupported fields.
- Deterministic quality rules for weak descriptions, generic bodies, progressive-disclosure issues, missing resources, script guidance, missing evals, and divergent cross-ecosystem skills.
- Scan report construction, human summary rendering, JSON-mode helpers, and blocking-finding exit-code decisions.
- Interactive scan CLI with Commander, root selection prompts, non-interactive prompt skipping, spinner adapter, and findings review output.
- Claude and Codex repair-agent detection, prompt-based agent selection, command execution helpers, and launch preview construction.
- Findings-driven repair handoff prompts with local report directories, subset selection, and prompt/report file output.
- Local repair-agent launch flow with explicit confirmation, inherited-terminal launcher support, post-handoff re-scan, and fixed/remaining/new finding summaries.
- Domain-focused public API facade plus fixture coverage for valid, malformed, weak, missing-resource, script, and cross-ecosystem skill scans.
- README, MIT license, release checklist, and finalized initial release notes.
- Local score calculation for scan reports using distinct violated rules, with React Doctor-style labels in human, JSON, and repair-report output.
- React Doctor-style score header in human CLI output with a face, proportional bar, terminal-width clamping, score-threshold colors, and TTY animation.
- Concise human scan summary and streamlined review menu focused on fixing skills first.

### Fixed

- Avoid Node unsettled top-level-await warnings while the interactive CLI is waiting for prompts.
- Discover global `~/.claude/skills` and `~/.agents/skills` roots and prompt for local, global/root, or both when both scopes exist.
- Run tests under `CI=true` during local verification and isolate interactive CLI tests from ambient CI environment variables.
