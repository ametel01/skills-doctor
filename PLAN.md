# Implementation Plan

## Source Documents

- Path: `/Users/alexmetelli/source/skills-doctor/docs/PRD.md`
  - Role: Primary product requirements document.
  - Summary: Defines Skills Doctor as an interactive local CLI that scans
    `.claude/skills/`, `.agents/skills/`, or both; evaluates skills against the
    Agent Skills spec; presents findings; builds a custom repair prompt; lets
    the user choose `claude` or `codex`; launches the selected local CLI; and
    re-scans after the handoff.
- Path: `/Users/alexmetelli/source/skills-doctor/docs/SKILLS_SPEC.md`
  - Role: Skill-quality rules and validation source.
  - Summary: Provides the required `SKILL.md` structure, frontmatter rules,
    progressive-disclosure limits, description quality guidance, script rules,
    eval expectations, portability expectations, and anti-patterns that the
    scanner must convert into deterministic findings.
- Path: `/Users/alexmetelli/source/skills-doctor/docs/CLI_SPEC.md`
  - Role: CLI architecture and quality-gate source.
  - Summary: Defines the TypeScript CLI structure, thin bin shim, Commander
    setup, prompt adapter, JSON-mode output discipline, spinner behavior,
    command execution, agent handoff, errors, process handling, and test matrix.
- Path: `/Users/alexmetelli/source/ritualai/.github/workflows/release.yml`
  - Role: Release workflow reference.
  - Summary: Uses Bun in GitHub Actions on version tags, runs install, verify,
    pack dry-run, extracts changelog release notes, publishes to npm, and
    creates a GitHub Release.
- Path: `/Users/alexmetelli/source/ritualai/scripts/extract-release-notes.mjs`
  - Role: Release-note extraction script reference.
  - Summary: Reads `CHANGELOG.md`, locates the requested version heading, prints
    that section, and fails if the section is missing or empty.
- Path: `/Users/alexmetelli/source/ritualai/CHANGELOG.md`
  - Role: Changelog format reference.
  - Summary: Uses Keep a Changelog and Semantic Versioning, with `Unreleased`
    and dated version sections grouped under headings such as `Added`,
    `Changed`, and `Fixed`.

## Goals

- Build a Bun-managed TypeScript ESM CLI package named for Skills Doctor.
- Use Biome for formatting and linting.
- Add Vitest-based tests, TypeScript typechecking, build output, and package
  dry-run gates.
- Add CI and tag-driven release workflows modeled after `ritualai`.
- Add a release-note extraction script and `CHANGELOG.md` in the Ritual format.
- Implement deterministic skill discovery, parsing, validation, reporting,
  interactive review, agent handoff, and post-handoff re-scan.
- Keep scanner logic reusable from tests and future programmatic APIs without
  importing prompt libraries or CLI-only process setup.

## Non-Goals

- Do not implement hosted accounts, cloud sync, or remote dashboards.
- Do not upload skill contents by default.
- Do not auto-fix skills without user approval.
- Do not embed a model provider; only hand off to local `claude` or `codex`.
- Do not build full trigger/output eval execution in the MVP.
- Do not implement every future agent ecosystem in the MVP.

## Assumptions and Open Questions

- Assumption: The package name will be `skills-doctor` until the user chooses a
  different npm name. Impact: package metadata, binary name, and release config
  can be renamed later before first publish.
- Assumption: MVP scans project-local roots by default and supports custom
  paths; global user-level roots can be added after project-local behavior is
  stable. Impact: the first implementation focuses on `./.claude/skills` and
  `./.agents/skills`.
- Assumption: The scanner remains deterministic before handoff. Impact: rule
  findings use heuristics and structural checks; LLM critique is left out of
  the MVP.
- Assumption: Same-name skill divergence across Claude and Codex is a warning,
  not a blocking error. Impact: users are informed but not forced to mirror
  skills.
- Open question: Should repair handoff default to all findings or only blocking
  errors plus high-confidence warnings? Conservative default in this plan:
  prompt the user and default to blocking errors plus warnings.

## Quality Gates

- Setup status: No package/tooling files currently exist in this repo; quality
  gates must be set up before feature implementation.
- Baseline command: after Step 1, run `bun install --frozen-lockfile && bun run verify`
- Format command: `bun run format:check`
- Lint command: `bun run lint`
- Test command: `bun run test`
- Additional gates: `bun run typecheck`, `bun run build`,
  `bun run pack:dry-run`, and `bun run verify`

Expected package scripts after quality-gate setup:

```json
{
  "scripts": {
    "check": "biome check .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "lint": "biome lint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json",
    "verify": "bun run check && bun run typecheck && bun run test && bun run build",
    "pack:dry-run": "bun pm pack --dry-run",
    "release:notes": "node scripts/extract-release-notes.mjs",
    "dev": "node dist/cli/index.js"
  }
}
```

## Progress Tracking

- File: `PROGRESS.md`
- Requirement: Create `PROGRESS.md` before any quality-gate setup or
  implementation work begins.
- Update rule: After each step is completed, update `PROGRESS.md` with the
  completed step, validation results, commit reference if available, current
  status, and next step.

## Incremental Steps

### Step 0: Progress Tracking Setup

Goal: Create a durable progress log the user can consult while the plan is being
executed.

Changes:

- Create `PROGRESS.md` in the project root.
- Add the plan title, source documents, step checklist, current status, and an
  update log.
- Document that `PROGRESS.md` must be updated after every completed step.

Acceptance Criteria:

- `PROGRESS.md` exists.
- `PROGRESS.md` contains every step from this plan.
- `PROGRESS.md` has fields for validation results, commit references, current
  status, and next step.

Validation:

- Confirm `PROGRESS.md` exists and contains the step checklist.

Progress:

- Mark Step 0 complete in `PROGRESS.md`, record validation results, set current
  status to Step 1, and identify Step 1 as next.

Commit:

- `docs: add implementation progress tracking`

### Step 1: Bun, TypeScript, Biome, Vitest, and Package Scaffold

Goal: Establish runnable quality gates and a minimal ESM CLI package before
feature work starts.

Depends on:

- Step 0

Changes:

- Create `package.json` using Bun as the package manager.
- Add `bun.lock` by running `bun install`.
- Add `tsconfig.json` and `tsconfig.build.json`.
- Add `biome.json` modeled after Ritual's Biome setup, with format and lint
  rules enabled.
- Add `vitest.config.ts`.
- Create `src/cli/index.ts`, `src/index.ts`, and a minimal bin shim under
  `bin/skills-doctor.js`.
- Configure package metadata:
  - `"type": "module"`
  - `"bin": { "skills-doctor": "./bin/skills-doctor.js" }`
  - `"files": ["bin/**", "dist/**", "scripts/**", "README.md", "CHANGELOG.md", "LICENSE"]`
  - Node engine compatible with the chosen runtime.
- Add scripts:
  - `check`
  - `format`
  - `format:check`
  - `lint`
  - `typecheck`
  - `test`
  - `build`
  - `verify`
  - `pack:dry-run`
  - `release:notes`
  - `dev`
- Add minimal smoke tests that can pass before domain behavior exists.

Acceptance Criteria:

- `bun install --frozen-lockfile` works after initial lockfile creation.
- `bun run verify` passes with the minimal scaffold.
- `bun run pack:dry-run` succeeds.
- The bin shim can import the built CLI after `bun run build`.

Validation:

- Run `bun install --frozen-lockfile`
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.

Commit:

- `chore: scaffold bun typescript cli package`

### Step 2: CI, Release Workflow, Release Notes Script, and Changelog

Goal: Add CI and release infrastructure before feature implementation diverges
from the package contract.

Depends on:

- Step 1

Changes:

- Create `.github/workflows/ci.yml` modeled after Ritual:
  - trigger on pull requests
  - trigger on pushes to `main`
  - use `actions/checkout@v5`
  - use `oven-sh/setup-bun@v2` with Bun `1.3.13` unless the package chooses a
    newer pinned Bun version
  - run `bun install --frozen-lockfile`
  - run `bun run verify`
- Create `.github/workflows/release.yml` modeled after
  `/Users/alexmetelli/source/ritualai/.github/workflows/release.yml`:
  - trigger on tags matching `v*`
  - set `permissions.contents: write`
  - run checkout, Bun setup, frozen install, `bun run verify`,
    `bun run pack:dry-run`
  - run `node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}" > release-notes.md`
  - run `bun publish` with `NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}`
  - create a GitHub Release with `softprops/action-gh-release@v2` and
    `body_path: release-notes.md`
- Create `scripts/extract-release-notes.mjs` from the Ritual pattern:
  - accepts `<version> [CHANGELOG.md]`
  - strips leading `v`
  - finds `## [<version>]`
  - prints the section until the next `##`
  - fails if the section is missing or empty
- Create `CHANGELOG.md` in the Ritual format:
  - title `# Changelog`
  - Keep a Changelog sentence
  - Semantic Versioning sentence
  - `## [Unreleased]`
  - initial unreleased entries for scaffold work as implementation proceeds
- Add instructions to update `CHANGELOG.md` in every user-visible or release
  relevant step:
  - use `Added` for new features
  - use `Changed` for behavior changes
  - use `Fixed` for bug fixes
  - before tagging, move relevant `Unreleased` entries into
    `## [x.y.z] - YYYY-MM-DD`

Acceptance Criteria:

- CI workflow matches the Bun verify contract.
- Release workflow matches Ritual's tag-driven publish and GitHub Release flow.
- `scripts/extract-release-notes.mjs` can extract a versioned section from a
  fixture changelog.
- `CHANGELOG.md` follows the referenced Keep a Changelog structure.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`
- Run a local script smoke test with a temporary changelog containing a version
  section.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.

Commit:

- `ci: add bun verify and release workflows`

### Step 3: Domain Types, Skill Root Discovery, and Skill Parsing

Goal: Discover project-local skill roots and parse skill files into structured
records without CLI prompts.

Depends on:

- Step 2

Changes:

- Create domain modules:
  - `src/domain/types.ts`
  - `src/domain/discover-skill-roots.ts`
  - `src/domain/scan-skills.ts`
  - `src/domain/parse-skill.ts`
- Define core types:
  - `SkillEcosystem`
  - `SkillRoot`
  - `SkillRecord`
  - `ParsedFrontmatter`
  - `Finding`
  - `ScanResult`
  - `Severity`
- Implement discovery for:
  - `./.claude/skills`
  - `./.agents/skills`
  - caller-provided custom roots
- Implement scan behavior:
  - skip non-directories
  - treat direct child directories with `SKILL.md` as skills
  - preserve root, ecosystem, file path, and parent directory name
  - continue after parse failures
- Implement frontmatter parsing with a real YAML parser or a deliberately
  constrained parser that supports the spec fields and fails clearly.
- Add unit tests for missing roots, single root, both roots, custom roots,
  valid skills, missing `SKILL.md`, and malformed frontmatter.

Acceptance Criteria:

- Domain scanner can be imported and run from tests without prompt, spinner, or
  process-exit side effects.
- Scan results include enough path and ecosystem metadata for findings and
  handoff prompts.
- Malformed skills produce findings instead of aborting the whole scan.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for skill root
  discovery and parsing.

Commit:

- `feat: discover and parse local agent skills`

### Step 4: Structural Rule Engine

Goal: Convert mandatory `SKILL.md` format requirements into deterministic
blocking findings.

Depends on:

- Step 3

Changes:

- Create `src/domain/rules/` with a rule registry and structural rules.
- Implement rule ids for:
  - missing `SKILL.md`
  - invalid or missing frontmatter
  - missing `name`
  - invalid `name` length, characters, hyphen placement, consecutive hyphens,
    and directory mismatch
  - missing or invalid `description`
  - invalid optional field shapes and lengths
  - unknown frontmatter fields
- Add line-number detection where practical.
- Add tests for every structural rule and for multi-finding output on one skill.

Acceptance Criteria:

- Every structural blocking error from the PRD is represented by a stable rule
  id.
- Findings include severity, skill, ecosystem, root, file path, explanation,
  suggested repair, and agent-repair suitability.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for structural skill
  validation.

Commit:

- `feat: add structural skill validation rules`

### Step 5: Quality, Progressive Disclosure, Script, Eval, and Cross-Ecosystem Rules

Goal: Add the spec-derived quality rules that distinguish valid skills from
effective skills.

Depends on:

- Step 4

Changes:

- Add rule modules for:
  - description quality
  - body quality
  - progressive disclosure
  - reference and asset links
  - script usage quality
  - eval guidance
  - duplicate and cross-ecosystem checks
- Implement heuristics for weak descriptions, generic body text, placeholder
  content, missing workflow steps, overlarge files, generic references, missing
  referenced files, unsafe script guidance, missing evals for non-trivial
  skills, and divergent same-name skills.
- Add helper utilities for:
  - approximate token count
  - markdown line/heading scans
  - relative path extraction
  - resource directory existence
  - simple duplicate comparison
- Add fixtures covering strong skills, weak skills, missing resources, scripts,
  evals, and duplicate names across ecosystems.

Acceptance Criteria:

- The scanner produces warnings and advice for the quality categories listed in
  the PRD.
- Rules remain deterministic and local.
- Rule tests document expected false-positive boundaries where heuristics are
  intentionally conservative.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for quality and
  progressive-disclosure checks.

Commit:

- `feat: add skill quality rule engine`

### Step 6: Report Model, Human Summary, JSON Output, and Exit Codes

Goal: Produce usable human and machine-readable scan output with clean stdout
discipline.

Depends on:

- Step 5

Changes:

- Create:
  - `src/domain/build-report.ts`
  - `src/domain/summarize-findings.ts`
  - `src/cli/utils/json-mode.ts`
  - `src/cli/utils/cli-logger.ts`
  - `src/cli/utils/handle-error.ts`
- Define JSON schema version and report shape:
  - CLI version
  - scanned roots
  - skill summaries
  - findings
  - elapsed time
  - handoff metadata when applicable
- Implement human summary rendering:
  - roots scanned
  - skills scanned
  - severity counts
  - top affected skills
  - top rule categories
- Implement exit-code policy:
  - completed scans with blocking errors set `process.exitCode = 1`
  - expected user errors render cleanly
  - JSON errors are valid JSON
- Add tests for JSON output, summary counts, error JSON, and exit-code
  decisions.

Acceptance Criteria:

- JSON output is valid and uncontaminated by human text.
- Human output gives a clear next action.
- Blocking findings cause a failing exit code without aborting rendering.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for human and JSON scan
  reports.

Commit:

- `feat: render skill scan reports`

### Step 7: CLI Entrypoint, Prompts, Spinners, and Scan Target Selection

Goal: Build the interactive CLI shell around the domain scanner.

Depends on:

- Step 6

Changes:

- Implement `src/cli/index.ts` bootstrap:
  - signal handlers
  - stdin guard/unref
  - Commander program
  - `EPIPE` handling
  - top-level error funnel
- Implement `src/cli/commands/scan.ts` as the default command action.
- Implement prompt adapter in `src/cli/utils/prompts.ts`.
- Implement spinner adapter in `src/cli/utils/spinner.ts`.
- Implement non-interactive detection in
  `src/cli/utils/should-skip-prompts.ts`.
- Add interactive target selection:
  - Claude
  - Codex/agents
  - both
  - custom path fallback
- Add finding review actions:
  - view all findings
  - view blocking errors
  - view by skill
  - continue to repair
  - exit without repair
- Add CLI tests using injectable prompt and output adapters.

Acceptance Criteria:

- `skills-doctor` runs a scan interactively with no required flags.
- Prompt cancellation exits cleanly.
- Non-interactive mode does not hang waiting for prompts.
- Spinners do not render in JSON or non-interactive modes.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`
- Run a local smoke command against fixture skill roots.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for the interactive CLI
  scan flow.

Commit:

- `feat: add interactive scan cli`

### Step 8: Command Execution, Agent Detection, and Agent Selection

Goal: Detect local `claude` and `codex` executables and let the user choose a
repair agent.

Depends on:

- Step 7

Changes:

- Create:
  - `src/cli/utils/run-command.ts`
  - `src/cli/utils/is-command-available.ts`
  - `src/cli/utils/launch-agent.ts`
- Implement command resolver:
  - split `PATH` on `path.delimiter`
  - handle Windows `PATHEXT`
  - require executable bit on non-Windows
- Implement executable detection for `claude` and `codex`.
- Implement agent selection behavior:
  - prompt when both exist
  - default with confirmation when one exists
  - stop repair flow cleanly when neither exists
- Prepare launch mappings:
  - Claude: `claude --dangerously-skip-permissions <prompt>`
  - Codex: `codex --yolo <prompt>`
- Include the Windows direct-entry-script safeguard from the React Doctor
  pattern if multiline prompts would otherwise go through `.cmd` wrappers.
- Add tests for binary detection, missing binaries, selection defaults, and
  launch invocation construction.

Acceptance Criteria:

- Agent detection is testable without spawning real agents.
- Missing agents are expected user errors.
- Launch commands are previewable before execution.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for Claude and Codex
  agent detection.

Commit:

- `feat: detect local repair agents`

### Step 9: Findings Report Directory and Custom Handoff Prompt

Goal: Build the repair payload that gives the selected agent concise inline
context and full findings on disk.

Depends on:

- Step 8

Changes:

- Create:
  - `src/domain/build-handoff-prompt.ts`
  - `src/domain/write-findings-directory.ts`
  - `src/cli/utils/handoff-to-agent.ts`
- Write report directories under `.skills-doctor/reports/<timestamp>/`.
- Include:
  - `findings.json`
  - `findings.md`
  - optional per-skill finding files
- Build compact prompts that include:
  - selected roots
  - selected skills/finding subset
  - top grouped findings
  - exact paths and line numbers
  - repair instructions grounded in `docs/SKILLS_SPEC.md`
  - full report path
  - preserve-unrelated-changes instruction
  - verify-by-rerunning instruction
- Add repair subset selection:
  - blocking errors only
  - blocking errors plus warnings
  - all findings
  - selected skills
- Add tests for prompt content, prompt size limits, report file contents, and
  fallback behavior when report writing fails.

Acceptance Criteria:

- The handoff prompt is tailored to actual findings.
- Complete findings are available on disk for the agent.
- The prompt does not dump every finding inline when the report is large.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for custom agent repair
  prompts.

Commit:

- `feat: build findings-driven repair handoff`

### Step 10: Agent Launch Flow and Post-Handoff Re-Scan

Goal: Launch the selected local agent and verify whether findings were fixed
after it exits.

Depends on:

- Step 9

Changes:

- Integrate agent launch into the interactive command:
  - preview command
  - ask explicit confirmation
  - spawn selected agent with `stdio: "inherit"`
  - use project root as `cwd`
  - pass generated prompt as final argument
- Implement post-handoff scan:
  - re-run scanner on same roots
  - compare previous and current findings by stable rule id and file path
  - report fixed, remaining, and new findings
  - set non-zero exit code if blocking errors remain
  - offer another repair pass only in interactive human mode
- Add tests with injected launchers so no real agent is run.
- Add fixture integration tests covering successful launch, launch failure,
  remaining errors, and no-agent fallback.

Acceptance Criteria:

- No scan-phase code mutates skill files.
- The selected local agent gets the terminal only after explicit user consent.
- The re-scan summary clearly distinguishes fixed, remaining, and new findings.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`
- Run a fixture-based end-to-end CLI smoke test with an injected fake agent.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` for local agent handoff
  and post-handoff re-scan.

Commit:

- `feat: launch repair agent and rescan findings`

### Step 11: Public API Facade and Fixture-Based Integration Coverage

Goal: Stabilize scanner behavior for programmatic callers and regression tests.

Depends on:

- Step 10

Changes:

- Export public types and pure domain helpers from `src/index.ts`.
- Ensure importing `src/index.ts` does not initialize CLI-only side effects.
- Add fixture directories under `test/fixtures/` for:
  - valid strong skills
  - malformed skills
  - weak descriptions
  - missing referenced resources
  - script warnings
  - duplicate cross-ecosystem skills
- Add integration tests that run the scanner over fixture roots and assert the
  full report shape.
- Add tests for JSON report stability.
- Add tests for prompt cancellation and non-interactive defaults.

Acceptance Criteria:

- Programmatic scanner API is reusable without Commander, prompts, or spinners.
- Fixture tests cover the main PRD acceptance criteria.
- JSON schema changes are deliberate and test-visible.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status, and next step.
- Add a `CHANGELOG.md` `Unreleased` entry under `Added` or `Changed` as
  appropriate for public API exposure and integration coverage.

Commit:

- `test: add fixture coverage for skills doctor`

### Step 12: Documentation, README, Changelog Finalization, and Release Readiness

Goal: Make the CLI understandable to users and ready for tag-driven release.

Depends on:

- Step 11

Changes:

- Create or update `README.md` with:
  - what Skills Doctor does
  - install/run command using Bun
  - interactive scan flow
  - supported roots
  - agent handoff behavior
  - privacy/data handling
  - JSON mode if implemented
- Update `docs/PRD.md` only if implementation decisions resolve open questions.
- Update `docs/CLI_SPEC.md` or `docs/SKILLS_SPEC.md` only if the implementation
  reveals a real correction to those specs.
- Finalize `CHANGELOG.md`:
  - keep `## [Unreleased]`
  - keep entries grouped by `Added`, `Changed`, `Fixed`
  - before a release tag, move entries into `## [x.y.z] - YYYY-MM-DD`
  - ensure `scripts/extract-release-notes.mjs <version>` can extract the new
    version section
- Add release checklist notes:
  - run `bun run verify`
  - run `bun run pack:dry-run`
  - update version in `package.json`
  - update `CHANGELOG.md`
  - tag `v<x.y.z>`
  - push tag to trigger release workflow

Acceptance Criteria:

- README gives enough context for a new user to run the CLI.
- Changelog follows the Ritual/Keep a Changelog format.
- Release notes script works against the finalized changelog.
- Package dry-run includes the expected files and excludes generated reports.

Validation:

- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run typecheck`
- Run `bun run test`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`
- Run `node scripts/extract-release-notes.mjs <planned-version>` after adding a
  versioned changelog section.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit
  reference if available, current status as complete or release-ready, and any
  remaining open questions.
- Add final `CHANGELOG.md` entries for documentation and release readiness.

Commit:

- `docs: document skills doctor release workflow`

## Release and Changelog Instructions

- Maintain `CHANGELOG.md` in the same format as
  `/Users/alexmetelli/source/ritualai/CHANGELOG.md`.
- Keep this header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```

- Add entries under `### Added`, `### Changed`, or `### Fixed`.
- During implementation, update `Unreleased` in the same step that changes
  user-visible behavior, release behavior, or public API behavior.
- Before release, create a dated section:

```markdown
## [0.1.0] - YYYY-MM-DD

### Added

- Initial Skills Doctor CLI.
```

- The release workflow must extract release notes with:

```bash
node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}" > release-notes.md
```

- The extraction script must fail if the version section is absent or empty, so
  every release tag requires an explicit changelog entry.
