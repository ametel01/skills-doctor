# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Fixed CLI `--version` to report the package `version` from `package.json` instead of a hard-coded value.
- Fixed scan reports to carry unreadable-root diagnostics into JSON output and to fail when diagnostics include blocking errors.

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
