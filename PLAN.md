# Implementation Plan

## Source Documents
- Path: `docs/SECURITY_SPEC.md`
  - Role: Primary security scanner specification.
  - Summary: Defines a full Agent Skills security scanner that treats `SKILL.md` and related package files as operational code, scans skill markdown plus scripts/resources/configs, emits P0/P1/P2 security and hygiene rules, reasons across files, and reports capability deltas rather than a single malicious/safe verdict.
- Path: User-provided implementation gap summary in the 2026-07-03 prompt.
  - Role: Scope clarification and current-state gap analysis.
  - Summary: Confirms the current implementation is a `SKILL.md`-focused scanner and requests a plan to add package artifact discovery, package-level validation, spec rule IDs and priorities, capability-delta output, robust command/secret/network/config detectors, report schema changes, CLI gates, and fixture-heavy tests.

## Goals
- Implement the full `docs/SECURITY_SPEC.md` feature set as a multi-file security and capability scanner for Agent Skills.
- Preserve existing scan behavior for current consumers while adding package-level artifact analysis.
- Emit spec-aligned rule IDs from `SKILL001_PROMPT_OVERRIDE` through `SKILL206_LARGE_CONTEXT_BAIT`.
- Report capability deltas such as `reads_secrets`, `network_egress`, `remote_code_exec`, `persistence`, `self_modifies`, and `bypasses_approval`.
- Support cross-file evidence chains that explain why a package is risky, not just which single line matched.
- Add CLI and JSON output support for security priority, capability facts, artifact evidence, and security-specific gates.

## Non-Goals
- Do not implement a hosted model, remote analysis service, or network upload path.
- Do not replace deterministic local heuristics with nondeterministic LLM analysis.
- Do not remove existing public API exports without a compatibility path.
- Do not delete or mutate scanned skill packages during scanning.
- Do not implement full third-party Gitleaks integration unless the built-in pattern set is already complete and a later step explicitly expands scope.
- Do not change release automation except where package output validation requires updated docs or schema references.

## Definition of Done
- The scanner discovers and classifies all artifact types named by `docs/SECURITY_SPEC.md`: `SKILL.md`, `agents/openai.yaml`, `scripts/**`, `references/**`, `assets/**`, `.agents/skills/**`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings*.json`, `.claude/agents/**`, `.mcp.json`, hook configs, package manifests, shell scripts, Dockerfiles, CI files, and symlinked skill folders/resources.
- Each scanned artifact has structured metadata including path, artifact type, content or unreadable diagnostic, content hash, symlink status, symlink target/escape status, executable bit where available, and hidden-file status.
- Security validation operates on package-level records while maintaining a compatibility path for existing `SkillRecord`-based callers.
- All P0, P1, and P2 rules from the spec are implemented with deterministic tests and documented in `docs/RULES.md`, `docs/API.md`, `docs/CLI_SPEC.md`, and README content where user-facing behavior changes.
- Security findings include priority (`P0`, `P1`, `P2`), capabilities, artifact evidence, and cross-file evidence chains where applicable.
- CLI and JSON reports expose security priorities and capability deltas; P0 findings fail by default, P1 can be gated with a documented security option, and P2 hygiene contributes to score as specified.
- Existing quality, structural, usage, repair handoff, and current security rule behavior remains covered by tests or explicitly migrated to spec-aligned rule IDs.
- `docs/SECURITY_SPEC.md` is cleaned up so the malformed `SKILL007_REMOTE_CODE_EXEC` table row is readable and can serve as source-of-truth documentation.
- `PROGRESS.md` is current, `CHANGELOG.md` follows Keep a Changelog 1.0.0, and all required quality gates pass or any pre-existing failure is documented before implementation starts.

## Assumptions and Open Questions
- Assumption: Existing internal rule IDs may either be replaced by spec IDs or kept as compatibility aliases, but externally reported findings should use spec IDs after the migration.
- Assumption: P0 findings should fail default scan gates because the spec calls them blockers; P1 findings should not fail by default unless a new security gate is requested; P2 findings should affect score.
- Assumption: For unreadable non-`SKILL.md` artifacts, the scanner should emit diagnostics rather than fail the whole scan unless the unreadable file is required to classify a P0 chain.
- Assumption: Symlinked skill folders should be followed for scanning, but symlink escape metadata must be preserved and reported.
- Open question: Whether the public JSON `schemaVersion` should remain `1` with optional fields or bump to `2`. Conservative implementation should add optional fields first, then bump only if compatibility tests show a breaking change.
- Open question: Whether P2 findings should use existing `warning`/`advice` severity scoring or a separate security hygiene score. Initial plan maps P2 to existing score mechanics with explicit docs.
- Open question: How broad the built-in secret value detector should be. Initial scope should include common token/API-key patterns and path-based secret access, leaving full Gitleaks parity for future work.

## Implementation Approach
- Add a package model beside the current `SkillRecord` model instead of rewriting all scan code at once. A `SkillPackage` should contain the existing parsed `SKILL.md` record plus discovered `SkillArtifact` records and derived `CapabilityFact` records.
- Keep artifact discovery local-first and bounded to known skill package roots. Use `lstat`, `stat`, `realpath`, and recursive directory walking with deterministic ordering and clear limits.
- Extract shared detection primitives into focused modules: artifact classification, command extraction/classification, secret indicators, network indicators, permission/config parsing, obfuscation indicators, and capability chain building.
- Migrate security rules incrementally by introducing spec rule IDs while preserving current rule behavior through tests. Prefer compatibility wrappers over deleting existing exports.
- Represent cross-file findings as chains of evidence items. A chain may include a manifest/frontmatter line, script command line, config artifact, and derived capability facts.
- Update reports and CLI summaries after the core model is stable so each output change can be validated against fixtures.
- Keep every step small enough for a focused commit and leave the repository runnable after each step.

## Quality Gates
- Setup status: Existing gates are configured in `package.json`, Biome, TypeScript, Vitest, and GitHub Actions. No quality-gate setup step is required.
- Baseline command: `bun run verify`
- Format command: `bun run format:check`
- Lint command: `bun run lint`
- Test command: `bun run test`
- Additional gates: `bun run typecheck`, `bun run build`, `bun run pack:dry-run` when package exports, bundled files, CLI JSON schema, or release-facing docs change.

## Progress Tracking
- File: `PROGRESS.md`
- Requirement: Create `PROGRESS.md` before any implementation work begins.
- Update rule: After each step is completed, update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.

## Changelog Tracking
- File: `CHANGELOG.md`
- Standard: Keep a Changelog 1.0.0, <https://keepachangelog.com/en/1.0.0/>
- Requirement: Ensure `CHANGELOG.md` exists before implementation work begins. If it already exists, preserve existing release history and normalize only if required.
- Initial content: Include `# Changelog`, the standard preamble, and an `## [Unreleased]` section.
- Update rule: After each step is completed and validated, update `CHANGELOG.md` before creating that step's commit only if the step shipped a functional change. Omit entries for chores, progress tracking, implementation plans, docs-only updates, tests or coverage, CI or validation runs, framework migration housekeeping, and empty category headings.

## Goal Handoff
- Readiness: This plan is ready to be used as a `/goal` payload.
- Scope: The `/goal` should execute only the work described in this plan unless the user explicitly expands it.
- Done: The `/goal` is complete only when every item in `## Definition of Done` is satisfied, all incremental steps are complete, required quality gates pass or documented pre-existing failures are handled, `PROGRESS.md` and `CHANGELOG.md` are current, and the final state is summarized for the user.

## Incremental Steps

### Step 0: Progress and Changelog Tracking Setup
Goal: Create durable progress and changelog files the user can consult while the plan is being executed.

Depends on:
- None.

Changes:
- Create `PROGRESS.md` in the project root.
- Add this plan title, source documents, a checklist for every incremental step, current status, and a short update log.
- Document that `PROGRESS.md` must be updated after every completed step.
- Ensure `CHANGELOG.md` exists in the project root before implementation starts.
- If `CHANGELOG.md` is missing, create it with Keep a Changelog 1.0.0 structure: `# Changelog`, the standard preamble, and `## [Unreleased]`.
- If `CHANGELOG.md` already exists, preserve existing entries and verify the `## [Unreleased]` section is present.
- Document that `CHANGELOG.md` must be updated after each step is completed and validated, before that step is committed, only when the step ships a functional change.

Acceptance Criteria:
- `PROGRESS.md` exists and includes the full step checklist from this plan.
- `CHANGELOG.md` exists and includes `# Changelog` and `## [Unreleased]`.
- No scanner behavior changes are made in this step.

Advances Definition of Done:
- Establishes required execution tracking before feature work begins.

Validation:
- Run `test -f PROGRESS.md`
- Run `test -f CHANGELOG.md`
- Run `grep -q "## \\[Unreleased\\]" CHANGELOG.md`
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Do not add a changelog entry for progress and changelog tracking setup because it is not a functional change.

Commit:
- `chore: set up security scanner progress tracking`

### Step 1: Clean Up The Security Spec Source Document
Goal: Make `docs/SECURITY_SPEC.md` readable and stable as the source document for implementation.

Depends on:
- Step 0.

Changes:
- Edit `docs/SECURITY_SPEC.md` to fix the malformed `SKILL007_REMOTE_CODE_EXEC` table row where examples containing `|` broke Markdown table columns.
- Prefer inline code examples with escaped pipes or a bullet list outside the table.
- Do not change intended requirements except to clarify malformed formatting.
- Add a short note that spec priority labels map to scanner fields as `P0`, `P1`, and `P2`.

Acceptance Criteria:
- The P0 rules table renders coherently in Markdown.
- `SKILL007_REMOTE_CODE_EXEC` examples include `curl | sh`, `wget | bash`, PowerShell `irm ... | iex`, `eval`, `exec`, `subprocess(..., shell=True)`, dynamic URL imports, and base64 decode-and-run without splitting table cells.
- No implementation code changes are made in this step.

Advances Definition of Done:
- Ensures later implementation can trace behavior back to an unambiguous spec.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Do not add a changelog entry because this is a docs-only cleanup.

Commit:
- `docs: clarify remote code execution security spec`

### Step 2: Introduce Skill Package And Artifact Models
Goal: Add the data model needed to scan a whole skill package instead of only `SKILL.md`.

Depends on:
- Step 0.
- Step 1.

Changes:
- Update [src/domain/types.ts](/Users/alexmetelli/source/skills-doctor/src/domain/types.ts) with new exported types:
  - `SkillArtifactType`
  - `SkillArtifact`
  - `SkillPackage`
  - `CapabilityKind`
  - `CapabilityFact`
  - `SecurityPriority`
  - `FindingEvidenceChain` or an equivalent cross-artifact evidence structure.
- Preserve existing `SkillRecord`, `Finding`, and `FindingEvidence` fields for compatibility.
- Add optional fields to `Finding` for `priority`, `capabilities`, and cross-file evidence chains.
- Update [src/index.ts](/Users/alexmetelli/source/skills-doctor/src/index.ts) exports for the new public types.
- Add tests in `test/api-fixtures.test.ts` or a new focused type/API fixture test to confirm public exports remain stable.
- Update `docs/API.md` with the new optional fields and compatibility note.

Acceptance Criteria:
- Existing tests compile without changing current scan behavior.
- New types can express at least one `SKILL.md` artifact, one script artifact, a symlink escape artifact, and a capability fact.
- Existing JSON output remains compatible when no package artifact scanner is active.

Advances Definition of Done:
- Creates the compatibility-safe foundation for package-level validation and capability reporting.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` only if public API-visible types or JSON fields are shipped in this step.

Commit:
- `feat: add skill package security model`

### Step 3: Add Package Artifact Discovery
Goal: Discover, classify, and read all security-relevant files for a skill package.

Depends on:
- Step 2.

Changes:
- Add a new domain module such as `src/domain/discover-skill-artifacts.ts`.
- Extend [src/domain/scan-skills.ts](/Users/alexmetelli/source/skills-doctor/src/domain/scan-skills.ts) to build `SkillPackage` records for each scanned skill while preserving `ScanResult.skills`.
- Discover these package-relative artifact patterns when present:
  - `SKILL.md`
  - `agents/openai.yaml`
  - `scripts/**`
  - `references/**`
  - `assets/**`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.claude/settings*.json`
  - `.claude/agents/**`
  - `.mcp.json`
  - hook configs
  - package manifests
  - shell scripts
  - Dockerfiles
  - CI files
- Detect symlinked skill directories at root discovery time and either follow them safely or emit explicit artifact metadata when not followed.
- For each artifact, record relative path, absolute path, type, readable status, content hash, symlink status, realpath, escape status, executable bit where available, and hidden-file status.
- Add fixtures covering normal files, hidden files, executable files, missing/unreadable artifacts, symlinked resources inside the skill, symlinked resources escaping the skill, and symlinked skill folders.

Acceptance Criteria:
- A scan can produce artifact metadata without changing existing quality/security finding counts for simple skills.
- Symlinked skill folders are no longer silently skipped.
- Symlink escape metadata is deterministic and test-covered.

Advances Definition of Done:
- Implements the spec's file discovery and artifact metadata requirements.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because the scanner now inspects and reports package artifacts beyond `SKILL.md`.

Commit:
- `feat: discover security artifacts in skill packages`

### Step 4: Build Shared Capability Detectors
Goal: Convert artifact content into reusable capability facts before rule evaluation.

Depends on:
- Step 3.

Changes:
- Add focused detector modules under `src/domain/security/` or `src/domain/rules/security/`:
  - `commands.ts` for shell, PowerShell, Python `subprocess`, Node `child_process`, package scripts, Dockerfile commands, and CI commands.
  - `secrets.ts` for path-based secret reads and a small built-in token/API-key value pattern set.
  - `network.ts` for URLs, webhooks, sockets, tunneling tools, package downloads, and arbitrary repo clones.
  - `permissions.ts` for `allowed-tools`, Claude/Codex settings, hooks, agents, allow/deny rules, and broad MCP tool exposure.
  - `obfuscation.ts` for long base64/hex blobs, minified JavaScript, hidden comments, zero-width Unicode, homoglyph indicators, and decode-and-run chains.
  - `capabilities.ts` for deriving normalized `CapabilityFact` records.
- Reuse existing command parsing behavior where possible, but broaden it beyond inline/fenced Markdown.
- Add redaction helpers so secret-looking values are never emitted verbatim in evidence.
- Add unit tests with table-driven fixtures for every detector.

Acceptance Criteria:
- Detectors produce capability facts independently of findings.
- Capability facts include artifact path, line/range when available, kind, confidence, and redacted evidence.
- Existing false-positive suppression cases from `test/security-rules.test.ts` still pass.

Advances Definition of Done:
- Creates the capability-delta engine required by the spec.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because scans can now derive security capability facts from package artifacts.

Commit:
- `feat: derive security capability facts from artifacts`

### Step 5: Migrate Security Validation To Package-Level Evaluation
Goal: Make security rules evaluate `SkillPackage` records and evidence chains while preserving current API compatibility.

Depends on:
- Step 4.

Changes:
- Refactor [src/domain/rules/security.ts](/Users/alexmetelli/source/skills-doctor/src/domain/rules/security.ts) into a compatibility layer plus package-level validators.
- Add `validateSkillPackageSecurityRules(packages, options?)` or equivalent.
- Keep `validateSecurityRules(skills, options?)` working by wrapping `SkillRecord` values into minimal packages.
- Update [src/domain/scan-skills.ts](/Users/alexmetelli/source/skills-doctor/src/domain/scan-skills.ts) to use package-level validation.
- Add cross-artifact evidence chain construction and redaction.
- Add tests proving current `SKILL.md`-only behavior still works and new package-level evidence can include both `SKILL.md` and script/config artifacts.

Acceptance Criteria:
- Existing security tests pass.
- New tests show a script-only risky capability can be detected when the `SKILL.md` is benign.
- Findings can include both legacy `evidence` and new cross-file evidence when useful.

Advances Definition of Done:
- Replaces single-file validation with the package-level validation architecture required by the spec.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because security validation now covers package artifacts beyond `SKILL.md`.

Commit:
- `feat: evaluate security rules at package scope`

### Step 6: Implement P0 Blocker Rules
Goal: Add complete P0 security findings from `SKILL001_PROMPT_OVERRIDE` through `SKILL008_OBFUSCATION`.

Depends on:
- Step 5.

Changes:
- Implement spec-aligned P0 rule IDs:
  - `SKILL001_PROMPT_OVERRIDE`
  - `SKILL002_PERMISSION_BYPASS`
  - `SKILL003_SECRET_ACCESS`
  - `SKILL004_EXFIL_CHAIN`
  - `SKILL005_DESTRUCTIVE_COMMANDS`
  - `SKILL006_PERSISTENCE`
  - `SKILL007_REMOTE_CODE_EXEC`
  - `SKILL008_OBFUSCATION`
- Map or migrate existing rules:
  - `prompt-injection-instruction` to `SKILL001_PROMPT_OVERRIDE`
  - `agent-safety-disablement` to `SKILL002_PERMISSION_BYPASS`
  - `secret-exfiltration-instruction` and `network-exfiltration-command` to `SKILL004_EXFIL_CHAIN`
  - `destructive-command-high-risk` to `SKILL005_DESTRUCTIVE_COMMANDS`
  - `remote-code-execution-bootstrap` to `SKILL007_REMOTE_CODE_EXEC`
  - `external-resource-obfuscation` to `SKILL008_OBFUSCATION`
- Add standalone secret access behavior for `SKILL003_SECRET_ACCESS`.
- Add persistence behavior for shell rc files, cron, launch agents, systemd, git hooks, npm `postinstall`, pip setup hooks, VS Code tasks, and autostart folders.
- Broaden destructive command detection to actual command forms named by the spec.
- Update `docs/RULES.md` and `ruleCatalog` with P0 priority metadata.
- Add tests for each P0 rule, including false-positive counterevidence.

Acceptance Criteria:
- All P0 rules emit priority `P0` and category `security`.
- P0 findings include at least one capability fact and evidence chain.
- Legacy scenarios covered by current security tests still produce equivalent or clearly migrated findings.

Advances Definition of Done:
- Completes the spec's blocker rule set.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because the scanner now reports the full P0 security rule set.

Commit:
- `feat: implement p0 security blocker rules`

### Step 7: Implement P1 High-Risk Rules
Goal: Add high-risk package and permission rules from `SKILL101_BROAD_ALLOWED_TOOLS` through `SKILL108_MCP_SCOPE_EXCESS`.

Depends on:
- Step 6.

Changes:
- Implement spec-aligned P1 rule IDs:
  - `SKILL101_BROAD_ALLOWED_TOOLS`
  - `SKILL102_MISSING_DENYLIST`
  - `SKILL103_IMPLICIT_INVOCATION_RISK`
  - `SKILL104_EXTERNAL_DEPENDENCY`
  - `SKILL105_CROSS_MODAL_MISMATCH`
  - `SKILL106_SELF_MODIFYING_SKILL`
  - `SKILL107_UNTRUSTED_MCP`
  - `SKILL108_MCP_SCOPE_EXCESS`
- Parse `allowed-tools` values and classify broad grants such as `Bash`, `Write`, `Edit`, `WebFetch`, `Agent`, and `mcp__*`.
- Detect missing denylist protection when scripts/network/tool access are present and no secret/home/destructive deny rules exist.
- Detect broad implicit descriptions such as "use for any coding task", "always use", and "general assistant".
- Detect external dependencies including runtime URL fetches, unpinned installs, arbitrary repo clones, and remote markdown trust.
- Detect cross-modal mismatch between benign `SKILL.md` purpose and suspicious script/resource/config behavior.
- Detect self-modifying instructions for `SKILL.md`, scripts, references, assets, or registry metadata.
- Parse MCP config and tool exposure enough to flag broad MCP dependencies, OAuth scopes, and missing allowlists.
- Add tests for P1 rules and current known benign cases.

Acceptance Criteria:
- All P1 rules emit priority `P1`, capability facts where applicable, and actionable suggestions.
- Broad tools paired with clear deny rules are handled according to the spec's recommended scanner action.
- MCP tests cover broad tool exposure and scope excess without requiring network access.

Advances Definition of Done:
- Completes the spec's high-risk rule set and permission/config analysis.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because the scanner now reports the P1 high-risk rule set.

Commit:
- `feat: implement p1 high-risk security rules`

### Step 8: Implement P2 Quality And Hygiene Rules
Goal: Add non-blocking hygiene findings from `SKILL201_NO_BOUNDARIES` through `SKILL206_LARGE_CONTEXT_BAIT`.

Depends on:
- Step 7.

Changes:
- Implement spec-aligned P2 rule IDs:
  - `SKILL201_NO_BOUNDARIES`
  - `SKILL202_NO_HITL_FOR_RISKY_ACTIONS`
  - `SKILL203_AMBIGUOUS_AUTHORITY`
  - `SKILL204_UNPINNED_TOOLS`
  - `SKILL205_HIDDEN_FILES`
  - `SKILL206_LARGE_CONTEXT_BAIT`
- Map existing quality rules where appropriate:
  - `destructive-without-safety` into `SKILL202_NO_HITL_FOR_RISKY_ACTIONS` or keep as compatibility with a spec alias.
  - `unpinned-package-runner` into `SKILL204_UNPINNED_TOOLS`.
  - long `SKILL.md` rules into `SKILL206_LARGE_CONTEXT_BAIT`.
- Add boundary detection for missing "when not to use", allowed inputs/outputs, or forbidden actions.
- Add human-in-the-loop detection for deploy, email, payments, deletion, secrets, DB migrations, GitHub writes, and cloud infra changes.
- Add hidden file, unusual extension, executable asset, and symlink-outside-skill hygiene checks.
- Update scoring so P2 findings affect score as specified without making them default blockers.
- Add tests for each P2 rule and score impact.

Acceptance Criteria:
- All P2 rules emit priority `P2`.
- P2 findings affect score according to documented behavior but do not fail default gates unless configured.
- Existing quality rule tests either continue passing or are intentionally migrated with updated assertions.

Advances Definition of Done:
- Completes the spec's quality and hygiene rule set.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because the scanner now reports P2 security hygiene findings and score impact.

Commit:
- `feat: implement p2 security hygiene rules`

### Step 9: Add Security Gates And Report Schema Output
Goal: Expose priorities, capability deltas, and security gates in CLI and JSON reports.

Depends on:
- Step 8.

Changes:
- Update [src/domain/build-report.ts](/Users/alexmetelli/source/skills-doctor/src/domain/build-report.ts) so reports include security priority counts and package capability summaries.
- Update [src/domain/summarize-findings.ts](/Users/alexmetelli/source/skills-doctor/src/domain/summarize-findings.ts) so P0 findings fail by default and P1/P2 behavior follows the documented gate policy.
- Add CLI options in [src/cli/commands/scan.ts](/Users/alexmetelli/source/skills-doctor/src/cli/commands/scan.ts), such as `--fail-on-security P1` or an equivalent existing-style option.
- Update human summaries and TUI dashboard text to show P0/P1/P2 security counts and capability deltas without overwhelming output.
- Update JSON-mode tests to assert new optional fields, compact JSON behavior, and exit-code behavior.
- Update repair handoff prompt generation so selected security findings include priority, capabilities, and artifact evidence chains.

Acceptance Criteria:
- JSON output includes priority and capability fields for security findings.
- Human output clearly separates quality issues from security findings and shows P0/P1/P2 counts.
- P0 findings fail by default; P1 can be opted into as a blocking gate; P2 contributes to score but does not block by default.
- Existing `--fail-on warning`, `--fail-on advice`, and `--min-score` behavior remains documented and tested.

Advances Definition of Done:
- Makes the full security model usable through CLI and programmatic reports.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Update `CHANGELOG.md` under `## [Unreleased]` because CLI and JSON security reporting behavior changes.

Commit:
- `feat: expose security priorities and capability gates`

### Step 10: Update Documentation And Public Rule Catalog
Goal: Align user docs, API docs, CLI spec, and rule catalog with the completed security scanner.

Depends on:
- Step 9.

Changes:
- Update `docs/RULES.md` with every `SKILL001_*`, `SKILL101_*`, and `SKILL201_*` rule, priority, category, evidence requirements, counterevidence, and scoring/gating behavior.
- Update `docs/API.md` with new package/artifact/capability types and report fields.
- Update `docs/CLI_SPEC.md` with security gate options, exit-code behavior, and JSON/human output expectations.
- Update `README.md` "What It Scans", "What It Checks", "JSON Mode", and "Exit Codes" sections.
- Update `src/domain/rule-catalog.ts` and tests that enforce catalog/docs synchronization.
- Review `docs/SKILLS_SPEC.md` only if references to security behavior are now stale.

Acceptance Criteria:
- Documentation accurately describes all implemented security behavior.
- Rule catalog and docs synchronization tests pass.
- README gives users enough information to understand local-only scanning, P0 default blocking, and capability-delta output.

Advances Definition of Done:
- Completes user/operator-facing documentation and structured rule metadata.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Do not add a changelog entry for docs-only changes unless this step also ships observable CLI/API behavior not already recorded in earlier steps.

Commit:
- `docs: document full security scanner behavior`

### Step 11: Add End-To-End Fixture Coverage
Goal: Validate the full scanner against realistic package-level scenarios and regression fixtures.

Depends on:
- Step 10.

Changes:
- Add fixture builders or fixture directories for representative skill packages:
  - Clean package with benign scripts/resources/config.
  - Secret read only.
  - Secret read plus network egress.
  - Broad `allowed-tools` plus missing denylist plus external URL.
  - Benign `SKILL.md` with suspicious script.
  - MCP broad scope plus auto-approval language.
  - Self-modification plus executable script.
  - Hidden files, executable assets, and symlink escape.
  - Remote docs parsing that should remain benign.
  - Official API authentication that should remain benign.
- Add CLI JSON snapshot-style assertions where stable, avoiding brittle full-output snapshots where fields are intentionally optional.
- Add scan performance sanity coverage for artifact recursion limits if needed.
- Ensure all migrated legacy tests still express the intended behavior using spec IDs.

Acceptance Criteria:
- Every P0/P1/P2 rule has at least one positive test and one meaningful benign/counterevidence test where applicable.
- Cross-file combinations from the spec are explicitly covered.
- Tests prove artifact evidence chains include paths and redacted excerpts.

Advances Definition of Done:
- Provides regression confidence for the complete scanner.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Do not add a changelog entry for tests-only work.

Commit:
- `test: cover full package security scanner`

### Step 12: Final Verification And Release Readiness
Goal: Prove the full implementation is coherent, packaged, documented, and ready for review or release.

Depends on:
- Step 11.

Changes:
- Run final full validation.
- Inspect `git diff` for unrelated changes, generated files, and accidental fixture leaks.
- Confirm `CHANGELOG.md` contains only user-visible functional changes under `## [Unreleased]`.
- Confirm `PROGRESS.md` shows every step complete with validation results.
- Confirm package dry-run includes expected files and no unexpected large fixture artifacts.
- Update any final docs or tests only for issues discovered during final validation.

Acceptance Criteria:
- `bun run verify` passes.
- `bun run pack:dry-run` passes.
- `PROGRESS.md` is complete and current.
- `CHANGELOG.md` is current and follows Keep a Changelog 1.0.0.
- Final diff contains only intentional implementation, test, and documentation changes.

Advances Definition of Done:
- Completes final validation and makes the repository ready for handoff.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and final status.

Changelog:
- Update `CHANGELOG.md` only if final validation required a functional fix not already recorded.

Commit:
- `chore: verify full security scanner implementation`
