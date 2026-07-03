# Implementation Plan

## Source Documents
- Path: Inline feature brief supplied by the user on 2026-06-30
  - Role: Primary feature brief and implementation direction.
  - Summary: Add a deterministic malicious-skill detector as a security rule family inside the existing scanner. The first slice should scan only `SKILL.md`, avoid LLM classification, report suspicious instructions and capabilities without claiming intent, expose a pure `validateSecurityRules()` API, wire findings into normal scan/report/scoring behavior, and document/test the new rules.
- Path: `docs/CLI_SPEC.md`
  - Role: Existing architecture constraints.
  - Summary: Keep CLI orchestration at the edge, domain rules reusable and side-effect free, JSON output stable, and scanner behavior integrated through `scanSkillRoots()`.
- Path: `docs/API.md`
  - Role: Public API and report contract.
  - Summary: Public validators and types are exported through `src/index.ts`; `ScanReport` uses `schemaVersion: 1`; adding optional categories/rules must be documented for consumers.
- Path: `docs/RULES.md`
  - Role: Rule catalog documentation.
  - Summary: Every emitted rule ID must be documented with severity, category, and rationale.
- Path: `package.json`
  - Role: Toolchain and quality-gate source.
  - Summary: Existing commands are `bun run format:check`, `bun run lint`, `bun run test`, `bun run typecheck`, `bun run build`, and `bun run verify`.

## Goals
- Add a deterministic security detector for suspicious or malicious Agent Skill content.
- Integrate security findings into the existing scan pipeline, report JSON, human summaries, scoring, `--fail-on`, and repair handoff behavior without adding a new top-level command.
- Add a new `security` finding category so consumers can filter security findings separately from quality and script findings.
- Start with a conservative high-confidence rule set that detects instruction subversion, secret exfiltration, network exfiltration, remote execution bootstraps, high-risk destructive commands, agent safety disablement, and obfuscated external execution patterns.
- Export `validateSecurityRules()` and `SecurityRuleOptions` from the public API.
- Document the new rules and API behavior.

## Non-Goals
- Do not build an LLM classifier or hosted malware-scanning service.
- Do not add a separate `skills-doctor security` command in this slice.
- Do not scan referenced `scripts/`, `references/`, or `assets/` files in the first slice.
- Do not claim that a skill is definitely malicious; findings should describe suspicious instructions or capabilities.
- Do not add automatic deletion, quarantine, or remediation behavior.
- Do not change existing quality-rule semantics except where tests require category/report compatibility updates.

## Definition of Done
- `FindingCategory` includes `security`, and security findings appear in normal `ScanReport.findings` with deterministic `ruleId`, `severity`, `category`, `title`, `message`, `suggestion`, `line`, and `agentRepairable` fields.
- `src/domain/rules/security.ts` exists and exports a pure `validateSecurityRules(skills, options?)` function that scans only `SKILL.md` content in this first slice.
- `scanSkillRoots()` invokes `validateSecurityRules()` after structural and quality validation.
- The public root export includes `validateSecurityRules` and `SecurityRuleOptions`.
- `ruleCatalog` and `docs/RULES.md` include the new security rules.
- `docs/API.md`, `docs/CLI_SPEC.md`, and `README.md` describe the security detector at the right level of detail.
- Tests cover each security rule, line numbers, expected severities, integration through `scanSkillRoots()`, public API exports, and representative false-positive boundaries.
- No raw secrets or dangerous runnable payload examples are added to docs, tests, findings, or fixtures.
- `bun run verify` passes, and `bun run pack:dry-run` passes before final completion.
- `PROGRESS.md` and `CHANGELOG.md` are current.

## Assumptions and Open Questions
- Assumption: Adding a new `FindingCategory` union value is acceptable in a minor feature because reports already expose category strings and `schemaVersion: 1` permits additive-compatible changes. Impact: update API docs and fixture tests; if consumers require stricter schema semantics, stop and ask before bumping schema.
- Assumption: Existing score behavior is acceptable: distinct `error` security rule IDs deduct like other error rules, and `warning` security rule IDs deduct like other warning rules. Impact: no separate risk score is added in this slice.
- Assumption: Security findings should be `agentRepairable: true` because repair handoff can ask an agent to remove or rewrite suspicious instructions. Impact: if a finding should require human review only, add a rule-specific comment and set `agentRepairable: false` deliberately.
- Assumption: Rule implementation should favor phrase combinations and proximity checks over single-word matches to reduce false positives. Impact: tests must include benign mentions of secrets, shells, network tools, and sandbox flags.
- Open question: Should future referenced-file scanning inspect scripts by default or behind an opt-in flag? Deferred from this plan.

## Implementation Approach
- Add a new domain validator module `src/domain/rules/security.ts` that mirrors local conventions from `rules/quality.ts`: module-level patterns, a top-level exported validator, small helper functions, and local `createFinding()`/line-number helpers.
- Keep the first slice pure and synchronous. The validator should inspect `skill.content` and parsed frontmatter body only; it should not read the filesystem.
- Use explicit rule definitions with safe evidence patterns. Avoid storing or rendering matched secret-like values in finding messages. Findings should name the suspicious behavior, not reproduce sensitive content.
- Implement `SecurityRuleOptions` with `enabledRuleIds?: readonly string[]` for tests and future selective use. If supplied, only emit enabled rule IDs.
- Add the `security` category to `FindingCategory` and update all docs/tests that enumerate categories.
- Wire `validateSecurityRules()` into `scanSkillRoots()` after quality rules so the scan order remains deterministic.
- Use conservative severities:
  - `error`: high-confidence instruction subversion, secret exfiltration, network exfiltration near secret/file-reading language, and remote execute-from-network bootstraps.
  - `warning`: high-risk destructive commands, agent safety disablement, and obfuscation patterns that require review.
  - `advice`: only if a rule is intentionally weak; avoid adding advice-only rules in the first implementation unless tests justify them.
- Keep CLI behavior implicit through existing report/render/exit-code paths. Do not add new prompts or command flags.

## Quality Gates
- Setup status: Existing gates are configured in `package.json`, `biome.json`, `vitest.config.ts`, `tsconfig.json`, and `tsconfig.build.json`. No separate quality-gates setup step is required.
- Baseline command: `bun install --frozen-lockfile && bun run verify`
- Format command: `bun run format:check`
- Lint command: `bun run lint`
- Test command: `bun run test`
- Additional gates: `bun run typecheck`, `bun run build`, `bun run verify`, and `bun run pack:dry-run` before final completion.

## Progress Tracking
- File: `PROGRESS.md`
- Requirement: Create `PROGRESS.md` before any quality-gate setup or implementation work begins.
- Update rule: After each step is completed, update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.

## Changelog Tracking
- File: `CHANGELOG.md`
- Standard: Keep a Changelog 1.0.0, <https://keepachangelog.com/en/1.0.0/>
- Requirement: Verify the existing `CHANGELOG.md` before implementation starts and keep its `## [Unreleased]` section updated after each completed step.
- Initial content: `CHANGELOG.md` already exists in this repo. If it no longer has `# Changelog`, the standard preamble, and `## [Unreleased]`, repair that structure in Step 0.
- Update rule: After each step is completed and validated, update `CHANGELOG.md` with human-readable notable changes under the appropriate `Unreleased` change-type headings before creating that step's commit.

## Goal Handoff
- Readiness: This plan is ready to be used as a `/goal` payload.
- Scope: The `/goal` should execute only the work described in this plan unless the user explicitly expands it.
- Done: The `/goal` is complete only when every item in `## Definition of Done` is satisfied, all incremental steps are complete, required quality gates pass or documented pre-existing failures are handled, `PROGRESS.md` and `CHANGELOG.md` are current, and the final state is summarized for the user.

## Incremental Steps

### Step 0: Progress and Changelog Tracking Setup
Goal: Create durable progress tracking and verify changelog tracking before feature implementation begins.

Depends on:
- None

Changes:
- Create `PROGRESS.md` in the project root.
- Add the plan title, source summary, full step checklist, current status, and a short update log.
- Document that `PROGRESS.md` must be updated after every completed step.
- Verify `CHANGELOG.md` exists and follows Keep a Changelog 1.0.0 structure.
- If `CHANGELOG.md` is missing required structure, repair it before implementation starts.

Acceptance criteria:
- `PROGRESS.md` exists and lists every step in this plan.
- `CHANGELOG.md` has `# Changelog`, the standard preamble, and `## [Unreleased]`.
- No feature implementation has started.

Validation:
- Run `test -f PROGRESS.md`
- Run `test -f CHANGELOG.md`
- Run `rg "^## \\[Unreleased\\]" CHANGELOG.md`
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Mark Step 0 complete in `PROGRESS.md`, record validation results, set current status to Step 1, and identify the next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for establishing progress tracking for the malicious-skill detector plan.

Commit:
- `chore: add malicious skill detector implementation tracking`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 1: Baseline Verification
Goal: Establish the pre-feature verification baseline.

Depends on:
- Step 0

Changes:
- Run the repository's full verification command before implementation changes.
- Record the result in `PROGRESS.md`.
- Do not change source code unless a baseline blocker must be fixed or documented before continuing.

Acceptance criteria:
- Baseline `bun run verify` result is recorded.
- Any pre-existing failures are clearly separated from feature failures.

Validation:
- Run `bun install --frozen-lockfile`
- Run `bun run verify`

Progress:
- Update `PROGRESS.md` with baseline results, commit reference if available, current status, and next step.

Changelog:
- If no source changes are made, no changelog entry is required. If a baseline blocker is fixed, update `CHANGELOG.md` under `Fixed`.

Commit:
- `chore: record malicious detector baseline verification`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 2: Add Security Category and Validator Skeleton
Goal: Establish the public/domain shape for security findings without changing scan behavior yet.

Depends on:
- Step 0
- Step 1

Changes:
- Update `src/domain/types.ts` to add `"security"` to `FindingCategory`.
- Add `src/domain/rules/security.ts`.
- Export `SecurityRuleOptions` and `validateSecurityRules()` from `src/domain/rules/security.ts`.
- Implement `SecurityRuleOptions` with `enabledRuleIds?: readonly string[]`.
- Add helper functions for finding creation, line lookup, rule enablement, and safe pattern matching.
- Return an empty finding list initially or include one minimal disabled-by-test fixture path only if needed to prove types compile.
- Export `validateSecurityRules` and `SecurityRuleOptions` from `src/index.ts`.
- Add `test/security-rules.test.ts` with a minimal no-findings test for a benign skill and an `enabledRuleIds` behavior test.
- Update API fixture/export tests if they assert the public export list.

Acceptance criteria:
- `validateSecurityRules()` is importable from the package root.
- A benign skill produces no security findings.
- Typecheck proves `security` is a valid category.
- The scanner is not wired to security rules yet, so existing report behavior is unchanged except type/API exports.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/security-rules.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for the public security-rule validator API.

Commit:
- `feat: add security rule validator surface`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 3: Implement Instruction Subversion and Exfiltration Rules
Goal: Detect the highest-confidence malicious instruction patterns in `SKILL.md`.

Depends on:
- Step 2

Changes:
- Implement `prompt-injection-instruction`.
  - Severity: `error`.
  - Category: `security`.
  - Detect instructions to ignore, override, bypass, hide, or contradict system/developer/user instructions; conceal actions from the user; or suppress disclosure of the skill's behavior.
- Implement `secret-exfiltration-instruction`.
  - Severity: `error`.
  - Category: `security`.
  - Detect combinations of secret-reading language and send/post/upload/copy-to-remote language.
  - Include `.env`, credentials, tokens, SSH keys, private keys, browser/session files, npm tokens, GitHub tokens, and cloud credentials as secret sources.
- Implement `network-exfiltration-command`.
  - Severity: `error`.
  - Category: `security`.
  - Detect network transfer tools or webhook/HTTP POST patterns near secret/file-reading language.
- Ensure finding messages never echo secret-like matched substrings or runnable payloads.
- Add tests in `test/security-rules.test.ts` for each rule, including deterministic line numbers and representative benign false-positive cases:
  - Benign docs that say "do not upload secrets" should not trigger.
  - Benign security-audit skills that inspect `.env.example` or explain secret hygiene without transmission should not trigger.
  - A skill that mentions `curl` for downloading public docs without secret/file-reading language should not trigger exfiltration rules.

Acceptance criteria:
- The three rule IDs produce expected findings and severities.
- Findings describe suspicious behavior without copying sensitive content.
- Benign counterexamples do not trigger.
- `enabledRuleIds` can isolate each rule in tests.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/security-rules.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add a `Security` entry under `## [Unreleased]` for detecting instruction-subversion and secret-exfiltration patterns in skill files.

Commit:
- `feat: detect malicious instruction and exfiltration patterns`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 4: Implement Execution, Destruction, Safety-Disablement, and Obfuscation Rules
Goal: Detect suspicious command-capability patterns that require blocking or review.

Depends on:
- Step 3

Changes:
- Implement `remote-code-execution-bootstrap`.
  - Severity: `error`.
  - Category: `security`.
  - Detect execute-from-network patterns such as downloading remote content and piping or passing it to shells/interpreters.
- Implement `destructive-command-high-risk`.
  - Severity: `warning`.
  - Category: `security`.
  - Detect broad destructive operations, recursive deletion of home/root/project directories, permission weakening, disk wipe commands, shell history removal, config tampering, or credential cleanup that hides traces rather than protects users.
- Implement `agent-safety-disablement`.
  - Severity: `warning`.
  - Category: `security`.
  - Detect instructions to use `--yolo`, `--dangerously-skip-permissions`, approve all prompts, disable sandboxing, avoid confirmation, or bypass review outside Skills Doctor's own documented repair-handoff launch context.
- Implement `external-resource-obfuscation`.
  - Severity: `warning`.
  - Category: `security`.
  - Detect suspicious encoded or staged execution patterns such as base64 decode plus shell execution, hidden remote files plus execution, or multi-stage command chains that obscure the executed content.
- Add tests for each rule and false-positive boundaries:
  - Skills Doctor docs mentioning its own launch preview should not trigger when the context is descriptive and not instructing a skill to bypass safety.
  - Benign base64 examples that decode static test fixtures without execution should not trigger.
  - Destructive commands paired with clear dry-run/confirmation may still trigger only if the target is broad or trace-hiding.

Acceptance criteria:
- Each new rule has tests for positive and benign cases.
- No new rule duplicates the existing quality rule `destructive-without-safety`; the security rule is reserved for broader/high-risk patterns.
- Line numbers point to the triggering instruction line when possible.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/security-rules.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add a `Security` entry under `## [Unreleased]` for detecting remote execution, safety-disablement, destructive, and obfuscated command patterns.

Commit:
- `feat: detect high-risk skill command patterns`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 5: Wire Security Rules Into Scanning and Reports
Goal: Make security findings appear in normal CLI/API scan results.

Depends on:
- Step 4

Changes:
- Import `validateSecurityRules` in `src/domain/scan-skills.ts`.
- Append security findings after quality findings:
  - `findings.push(...skills.flatMap(validateStructuralRules));`
  - `findings.push(...(await validateQualityRules(skills)));`
  - `findings.push(...validateSecurityRules(skills));`
- Add or update integration tests in `test/domain-scan.test.ts` proving `scanSkillRoots()` includes security findings.
- Update report/rendering tests if category summaries or counts include security findings.
- Verify `resolveScanExitCode()` fails on `error` security findings through existing behavior.
- Verify `--fail-on warning` catches warning-level security findings through existing behavior if CLI tests already cover warning gates; add a focused test only if current coverage does not exercise category-agnostic warning behavior.

Acceptance criteria:
- A scanned skill with a high-confidence security issue makes `report.ok` false through existing report construction.
- A scanned skill with only warning security findings appears in reports and can fail with `--fail-on warning`.
- Existing quality and structural findings remain unchanged.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/domain-scan.test.ts`
- Run `bun run test -- test/reporting.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` or `Security` entry under `## [Unreleased]` for integrating security findings into normal scans and reports.

Commit:
- `feat: include security findings in skill scans`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 6: Document Rule Catalog and Public API
Goal: Make the malicious-skill detector understandable and maintainable for CLI users and API consumers.

Depends on:
- Step 5

Changes:
- Add all new rule IDs to `src/domain/rule-catalog.ts` with severity, `security` category, and concise descriptions.
- Add a `Security` section to `docs/RULES.md`.
- Update `docs/API.md`:
  - Add `validateSecurityRules(input, options?)` to supported exports.
  - Add `SecurityRuleOptions` to exported types.
  - Add `security` to the `FindingCategory` documentation.
  - Explain that security findings are deterministic heuristic findings, not proof of malicious intent.
- Update `docs/CLI_SPEC.md` domain boundary/source map if needed to include `src/domain/rules/security.ts`.
- Update `README.md` "What It Checks" and JSON/CI guidance to mention suspicious skill security patterns and `--fail-on warning`/default error behavior.
- Update tests that assert rule catalog coverage, API docs fixtures, or README snippets.

Acceptance criteria:
- Every emitted security rule appears in `ruleCatalog` and `docs/RULES.md`.
- API docs describe the new public validator and category.
- User docs frame findings as suspicious patterns/capabilities, not definitive malware attribution.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test -- test/api-fixtures.test.ts`
- Run `bun run test -- test/reporting.test.ts`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`

Progress:
- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and next step.

Changelog:
- Add an `Added` entry under `## [Unreleased]` for documenting the security detector and public API.

Commit:
- `docs: document malicious skill detector rules`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.

### Step 7: Final Verification and Packaging Check
Goal: Prove the complete feature is ready for release-facing review.

Depends on:
- Step 6

Changes:
- Run the full verification suite and package dry run.
- Review generated/public package contents if `pack:dry-run` output indicates docs or dist expectations changed.
- Confirm `PROGRESS.md` and `CHANGELOG.md` are current.
- Do not introduce new feature scope in this step.

Acceptance criteria:
- `bun run verify` passes.
- `bun run pack:dry-run` passes.
- `PROGRESS.md` marks all steps complete with validation results.
- `CHANGELOG.md` has clear `Security`/`Added` entries under `## [Unreleased]`.
- Final summary identifies deferred referenced-file scanning as future work.

Validation:
- Run `bun run format:check`
- Run `bun run lint`
- Run `bun run test`
- Run `bun run typecheck`
- Run `bun run build`
- Run `bun run verify`
- Run `bun run pack:dry-run`

Progress:
- Update `PROGRESS.md` with final validation results, commit reference if available, current status `Complete`, and no next implementation step.

Changelog:
- Add or adjust final `## [Unreleased]` entries so the malicious-skill detector is represented accurately under `Security` and/or `Added`.

Commit:
- `chore: verify malicious skill detector release readiness`

End-of-step requirements:
1. Run all quality gates: format, lint, tests, and project-specific checks.
2. Fix any failures before proceeding.
3. Update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.
4. Update `CHANGELOG.md` with notable completed work under `## [Unreleased]`, using the appropriate Keep a Changelog change-type heading.
5. Create a commit for that completed step.
