# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
