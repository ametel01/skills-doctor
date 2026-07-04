# Implementation Plan

## Source Documents

- Path: `/Users/alexmetelli/source/skills-doctor/docs/NATURAL_LANGUAGE_AWARE_ANALYZER.md`
  - Role: Primary design note for deterministic natural-language-aware analysis.
  - Summary: Requests a bounded analyzer improvement that keeps the scanner deterministic while moving from direct rule emission to a staged pipeline: suspicious signals, text context, adjudication, counterevidence, and false-positive fixtures. It explicitly preserves the current public report shape for the first slice and treats an LLM review layer as optional, advisory, and out of the deterministic default path.

## Goals

- Make security analysis more context-aware for `SKILL.md` and Markdown references without replacing deterministic scanning.
- Introduce a small internal model for suspicious signals, Markdown text context, adjudication decisions, rationale, and counterevidence.
- Reduce false positives for suspicious phrases that appear in examples, quoted text, anti-pattern sections, defensive instructions, negated guidance, or safe conditional workflows.
- Prefer connected action chains over isolated token matches for stronger security findings.
- Preserve existing public report schema and exported `Finding` shape during this first slice.
- Add focused regression coverage for natural-language false-positive and true-positive cases.

## Non-Goals

- Do not add an LLM-backed review layer in this plan.
- Do not make nondeterministic model output affect default scan results, scores, or exit codes.
- Do not redesign every quality or security rule in one pass.
- Do not change the public JSON schema version unless implementation proves an optional-field compatibility path is impossible.
- Do not remove existing security rule IDs, priority behavior, score behavior, or CLI gates.
- Do not broaden the scanner to new artifact types beyond what existing package security scanning already supports.

## Definition of Done

- A Markdown-aware context extractor identifies frontmatter, heading hierarchy, fenced code blocks, blockquotes, list items, links, examples, anti-pattern sections, safety sections, and nearby negation or warning language.
- Security rule evaluation can represent suspicious matches as internal signals with attached text context before creating `Finding` objects.
- A deterministic adjudication layer can classify selected security-rule candidates as `real`, `review`, `likely_false_positive`, or `suppressed` before public findings are emitted.
- Existing public findings remain compatible: `Finding`, JSON reports, CLI output, score behavior, and exit-code behavior continue to work for existing consumers.
- Prompt-injection, exfiltration, remote-code-execution, destructive-command, and capability-chain checks use the new context or adjudication path where it reduces false positives without weakening true positives.
- A false-positive fixture corpus covers negated prompt override, quoted malicious examples, anti-pattern examples, safe deletion with confirmation, pinned or local remote parsing, security research/documentation cases, and benign secret-handling docs.
- Tests prove known true positives still report findings with evidence, confidence, rationale, and counterevidence.
- `docs/NATURAL_LANGUAGE_AWARE_ANALYZER.md`, `docs/RULES.md`, and `docs/API.md` are updated only where the implemented behavior changes documented analyzer semantics or public helper behavior.
- `PROGRESS.md` is current, `CHANGELOG.md` follows Keep a Changelog 1.0.0, and all required quality gates pass or any pre-existing failure is documented before implementation starts.

## Assumptions and Open Questions

- Assumption: The first implementation should be internal-first. Public `Finding` objects should continue to expose confidence, rationale, counterevidence, evidence, capabilities, and evidence chains without exposing every internal signal.
- Assumption: `review` and `likely_false_positive` decisions are internal in this slice unless a later product decision adds a public review-hint output.
- Assumption: Suppressed and likely false-positive decisions should be testable through absence of findings and, where useful, through internal helper tests.
- Assumption: The existing `MarkdownSecurityCandidate` model in `src/domain/rules/security.ts` is the right migration point for `TextContext`; avoid creating a parallel parser that callers must manually keep in sync.
- Assumption: Existing false-positive suppressions in `test/security-rules.test.ts` should be preserved, then reorganized only when the new fixtures make the intent clearer.
- Open question: Whether `Signal` and adjudication types should be exported from `src/index.ts`. Conservative choice: keep them internal until a caller needs them.
- Open question: Whether `review` decisions should eventually appear in JSON output. Conservative choice: do not expose them in this plan.

## Implementation Approach

- Add a small internal `TextContext` model near the current security candidate logic. It should enrich the existing `MarkdownSecurityCandidate` rather than forcing every rule to parse Markdown independently.
- Introduce internal `SecuritySignal` and `AdjudicatedSecuritySignal` types in a security-domain module. Keep the interface small: signal kind, artifact path, line, excerpt, confidence, text context, decision, rationale, and counterevidence.
- Build an adjudicator that uses deterministic context rules first: code fence role, section role, quote/example role, negation, defensive wording, confirmation gates, local-only destinations, official-service destinations, and pinned or parse-only flows.
- Migrate rules incrementally. Start with prompt override because it is highly natural-language-sensitive, then apply the same pattern to exfiltration and remote execution where command context already exists.
- Treat action-chain improvements as combinations of existing capability facts and command context. Do not rewrite package discovery.
- Add fixture-style tests before or alongside each migration so the repository documents which suspicious text is benign, ambiguous, or real.
- Update documentation after behavior stabilizes. Keep docs factual: describe deterministic context and counterevidence behavior, not future optional LLM review.

## Quality Gates

- Setup status: Existing gates are configured in `package.json`, Biome, TypeScript, Vitest, and GitHub Actions. No quality-gate setup step is required.
- Baseline command: `bun run verify`
- Format command: `bun run format:check`
- Lint command: `bun run lint`
- Test command: `bun run test`
- Additional gates: `bun run typecheck`; `bun run build`; `bun run pack:dry-run` when package exports, bundled files, CLI JSON behavior, README/API docs, or release-facing files change.

## Progress Tracking

- File: `PROGRESS.md`
- Requirement: Create or refresh `PROGRESS.md` before any implementation work begins. If the file already exists, preserve useful prior history only if it is still relevant to this plan; otherwise replace it with this plan's checklist and status log.
- Update rule: After each step is completed, update `PROGRESS.md` with the completed step, validation results, commit reference if available, current status, and next step.

## Changelog Tracking

- File: `CHANGELOG.md`
- Standard: Keep a Changelog 1.0.0, <https://keepachangelog.com/en/1.0.0/>
- Requirement: Ensure `CHANGELOG.md` exists before any implementation work begins. If it already exists, preserve existing release history and keep `## [Unreleased]` at the top.
- Initial content: Include `# Changelog`, the standard preamble, and an `## [Unreleased]` section.
- Update rule: After each step is completed and validated, update `CHANGELOG.md` before creating that step's commit only if the step shipped a functional change. Omit entries for chores, progress tracking, implementation plans, docs-only updates, tests or coverage, CI or validation runs, framework migration housekeeping, and empty category headings.

## Goal Handoff

- Readiness: This plan is ready to be used as a `/goal` payload.
- Scope: The `/goal` should execute only the work described in this plan unless the user explicitly expands it.
- Done: The `/goal` is complete only when every item in `## Definition of Done` is satisfied, all incremental steps are complete, required quality gates pass or documented pre-existing failures are handled, `PROGRESS.md` and `CHANGELOG.md` are current, and the final state is summarized for the user.

## Incremental Steps

### Step 0: Progress and Changelog Tracking Setup

Goal: Create durable progress and changelog state the user can inspect while this plan is executed.

Changes:

- Create or replace `PROGRESS.md` in the project root for this plan.
- Add the plan title, source document path, step checklist, current status, and update log.
- Document that `PROGRESS.md` must be updated after every completed step.
- Confirm `CHANGELOG.md` exists in the project root before implementation starts.
- If `CHANGELOG.md` is missing, create it with Keep a Changelog 1.0.0 structure: `# Changelog`, the standard preamble, and `## [Unreleased]`.
- If `CHANGELOG.md` already exists, preserve release history and confirm `## [Unreleased]` remains at the top.
- Document that `CHANGELOG.md` must be updated after each completed and validated step, before that step is committed, only when the step ships a functional change.

Acceptance criteria:

- `PROGRESS.md` contains this plan's checklist and current status.
- `CHANGELOG.md` exists and follows the required Keep a Changelog 1.0.0 structure.
- No analyzer behavior changes are made in this step.

Advances Definition of Done:

- Establishes required execution tracking before implementation begins.

Validation:

- Confirm `PROGRESS.md` exists and contains the step checklist.
- Confirm `CHANGELOG.md` exists and contains `# Changelog` and `## [Unreleased]`.
- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Mark Step 0 complete in `PROGRESS.md`, record validation results, set the current status, and identify Step 1 as next.

Changelog:

- Do not add a changelog entry for progress and changelog tracking setup because it is not a functional change.

Commit:

- `chore: initialize natural language analyzer plan tracking`

### Step 1: Baseline Gates and Characterization Fixtures

Goal: Establish a trusted baseline and add failing or pending-focused fixtures that describe the desired natural-language judgments.

Depends on:

- Step 0

Changes:

- Inspect and, if useful, reorganize existing relevant cases in `test/security-rules.test.ts` without changing behavior.
- Add fixture helpers or grouped tests for:
  - negated prompt override.
  - quoted malicious example.
  - anti-pattern section containing malicious text.
  - safe deletion with explicit confirmation.
  - remote docs/spec parsing without executing fetched content.
  - documentation or security-research text that mentions secrets or injection attacks.
- Ensure each test states the intended judgment: no finding, normal finding, or finding with explicit counterevidence.
- Keep existing true-positive tests for prompt override, exfiltration, remote execution, destructive commands, and package capability chains.

Acceptance criteria:

- Baseline `bun run verify` result is recorded in `PROGRESS.md` before implementation changes begin.
- The new tests fail only where the current analyzer lacks the desired context awareness, or pass if existing suppressions already cover the case.
- True-positive coverage remains present and readable.

Advances Definition of Done:

- Creates the false-positive corpus and regression target for the implementation.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/security-rules.test.ts test/security-capabilities.test.ts`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Update `PROGRESS.md` with completion notes, baseline result, validation results, commit reference if available, current status, and Step 2 as next.

Changelog:

- Do not add a changelog entry if this step only adds tests or characterization coverage.

Commit:

- `test: characterize natural language security contexts`

### Step 2: Add Markdown Text Context Extraction

Goal: Enrich security candidates with deterministic Markdown context that rules and adjudication can reuse.

Depends on:

- Step 0
- Step 1

Changes:

- Update `src/domain/rules/security.ts` or extract a focused helper under `src/domain/security/` for Markdown context classification.
- Add internal types for `TextContext`, including at least:
  - current heading path.
  - section role, such as `instructions`, `examples`, `anti-patterns`, `safety`, `reference`, or `unknown`.
  - code-fence state and language.
  - quoted text state.
  - list item state if needed for evidence.
  - nearby negation, warning, or defensive wording.
- Enrich `MarkdownSecurityCandidate` with the new context instead of duplicating candidate reads.
- Add tests for frontmatter handling, heading hierarchy, fenced code blocks, blockquotes, example/anti-pattern sections, and nearby negation.
- Preserve existing line numbers and evidence excerpts.

Acceptance criteria:

- Context extraction is deterministic and stable across line endings.
- Existing security-rule tests pass or fail only in ways anticipated by Step 1 fixtures.
- No public API or report schema change is required.

Advances Definition of Done:

- Provides the Markdown-aware context extractor required by the design note.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/security-rules.test.ts`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and Step 3 as next.

Changelog:

- Do not add a changelog entry if this step only adds internal context plumbing without changing emitted findings.

Commit:

- `feat: add markdown context for security candidates`

### Step 3: Introduce Security Signals and Adjudication

Goal: Add a deterministic internal adjudication layer that can decide whether suspicious signals should become public findings.

Depends on:

- Step 0
- Step 1
- Step 2

Changes:

- Add internal types for `SecuritySignal`, `SecuritySignalKind`, `SecurityAdjudicationDecision`, and `AdjudicatedSecuritySignal`.
- Add a small adjudicator module under `src/domain/security/` that accepts signals plus `TextContext` and returns decisions with rationale and counterevidence.
- Encode deterministic suppression/downgrade rules for:
  - quoted examples.
  - anti-pattern sections.
  - defensive negation.
  - explicit confirmation gates.
  - parse-only local command flows.
  - official-service destinations where current rules already treat them as benign.
- Keep the public `Finding` model unchanged. Convert only adjudicated `real` findings to public findings in this slice.
- Add direct unit tests for the adjudicator where useful, but prefer security-rule tests for behavior visible to callers.

Acceptance criteria:

- Adjudication decisions are deterministic and do not require network or model calls.
- Suppressed or likely-false-positive decisions do not emit public findings.
- Public findings still include confidence, rationale, counterevidence, and evidence.

Advances Definition of Done:

- Creates the staged signal-to-context-to-finding path requested by the source document.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/security-rules.test.ts test/security-capabilities.test.ts`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and Step 4 as next.

Changelog:

- Update `CHANGELOG.md` only if this step changes observable finding behavior. If it is internal-only, record no changelog entry.

Commit:

- `feat: adjudicate security signals before findings`

### Step 4: Migrate Natural-Language-Sensitive Rules

Goal: Route the highest-noise natural-language security rules through the context and adjudication path.

Depends on:

- Step 0
- Step 1
- Step 2
- Step 3

Changes:

- Update prompt-injection and authority-related checks in `src/domain/rules/security.ts` to emit or evaluate internal signals with `TextContext`.
- Update exfiltration, destructive-command, and remote-code-execution line checks where Markdown context or command context can distinguish examples, parse-only flows, local destinations, official destinations, and explicit confirmation.
- Preserve existing `SecurityRuleId` values, priorities, severities, messages, and suggestions unless a test proves wording must change.
- Preserve redaction behavior for secret-like evidence.
- Ensure existing package capability findings still include evidence chains and capabilities.

Acceptance criteria:

- False-positive corpus cases from Step 1 now pass.
- Existing true-positive tests still report the expected rule IDs and evidence lines.
- The analyzer does not silently weaken P0/P1 findings when no counterevidence exists.

Advances Definition of Done:

- Applies context and adjudication to the rules most likely to require natural-language judgment.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/security-rules.test.ts test/reporting.test.ts test/cli-scan.test.ts`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and Step 5 as next.

Changelog:

- Update `CHANGELOG.md` under `## [Unreleased]` if observable findings are suppressed, downgraded, or clarified for users.

Commit:

- `fix: reduce security false positives with text context`

### Step 5: Improve Capability Chain Adjudication

Goal: Prefer connected action chains over isolated capability facts for stronger package-level security findings.

Depends on:

- Step 0
- Step 1
- Step 2
- Step 3
- Step 4

Changes:

- Review `src/domain/security/capabilities.ts` and package-level security handling in `src/domain/rules/security.ts`.
- Add or adjust internal chain-building helpers so related facts can be evaluated as source, action, and sink stories.
- Preserve existing capability fact output and evidence-chain shape.
- Add tests for:
  - secret read plus external network sink as a strong finding.
  - secret read plus local parse-only handling as benign or lower risk.
  - broad tool access plus missing denylist plus external dependency as a stronger finding.
  - benign `SKILL.md` plus suspicious script behavior as cross-artifact review or finding according to existing rule priority.

Acceptance criteria:

- Package-level findings remain deterministic and retain capabilities/evidence chains.
- Isolated benign facts are less likely to produce high-confidence findings without connected risk.
- Existing package security tests continue to pass or are intentionally updated with clearer counterevidence.

Advances Definition of Done:

- Implements the action-chain emphasis from the source document without rewriting artifact discovery.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/security-capabilities.test.ts test/security-rules.test.ts test/reporting.test.ts`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and Step 6 as next.

Changelog:

- Update `CHANGELOG.md` under `## [Unreleased]` if observable package-level finding behavior changes.

Commit:

- `fix: adjudicate package security capability chains`

### Step 6: Align Reports, Repair Prompts, and Documentation

Goal: Make user-facing explanations match the new deterministic context-aware behavior.

Depends on:

- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5

Changes:

- Review report rendering in `src/domain/write-findings-directory.ts`, `src/domain/summarize-findings.ts`, and `src/domain/build-handoff-prompt.ts`.
- Ensure emitted findings continue to show enough evidence, confidence, rationale, and counterevidence for agents and humans to understand why a finding survived adjudication.
- Update `docs/RULES.md` if rule behavior changed materially.
- Update `docs/API.md` only if any helper, type, or output semantics visible to consumers changed.
- Update `docs/NATURAL_LANGUAGE_AWARE_ANALYZER.md` to mark implemented scope and explicitly leave LLM review as deferred.
- Avoid README changes unless CLI behavior, scan output, or repair handoff behavior changed in a user-visible way.

Acceptance criteria:

- Reports and handoff prompts do not imply findings are proof of malicious intent.
- Documentation accurately describes deterministic context and counterevidence behavior.
- No speculative LLM workflow is documented as implemented.

Advances Definition of Done:

- Keeps public docs and repair workflow aligned with the analyzer changes.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test -- test/handoff.test.ts test/reporting.test.ts test/cli-scan.test.ts`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.
- Run `bun run pack:dry-run` if public docs or package files changed in a release-facing way.

Progress:

- Update `PROGRESS.md` with completion notes, validation results, commit reference if available, current status, and Step 7 as next.

Changelog:

- Update `CHANGELOG.md` only for observable analyzer/reporting behavior changes. Do not add entries for docs-only updates.

Commit:

- `docs: document context-aware security analysis`

### Step 7: Final Verification and Cleanup

Goal: Verify the complete implementation, remove accidental churn, and leave the repository ready for review or handoff.

Depends on:

- Step 0
- Step 1
- Step 2
- Step 3
- Step 4
- Step 5
- Step 6

Changes:

- Inspect `git diff` for unrelated edits, generated files, and accidental fixture leaks.
- Confirm no user-owned unrelated files were modified.
- Confirm `PROGRESS.md` marks all completed steps and includes final validation results.
- Confirm `CHANGELOG.md` contains only qualifying functional changes under `## [Unreleased]`.
- Confirm docs and tests reflect the final implemented behavior.

Acceptance criteria:

- Full verification passes.
- The final diff is scoped to natural-language-aware analyzer behavior, tests, docs, progress, and changelog.
- Any known residual risk or deferred work is documented in `PROGRESS.md`.

Advances Definition of Done:

- Completes final validation and makes the implementation ready for user review.

Validation:

- Run `bun run format:check`.
- Run `bun run lint`.
- Run `bun run test`.
- Run `bun run typecheck`.
- Run `bun run build`.
- Run `bun run verify`.
- Run `bun run pack:dry-run` if package output or public docs changed.

Progress:

- Update `PROGRESS.md` with final validation results, commit reference if available, current status, and no remaining next step unless follow-up work is identified.

Changelog:

- Update `CHANGELOG.md` only if final validation required a functional fix not already recorded.

Commit:

- `chore: finalize natural language analyzer verification`

## Deferred Work

- Optional LLM advisory review over compact evidence and structured facts.
- Public JSON output for `review` or `likely_false_positive` decisions.
- Exported signal/adjudication APIs for external consumers.
- Broad redesign of non-security quality rules around the same context model.
- Full third-party secret-scanning parity beyond current deterministic patterns.
