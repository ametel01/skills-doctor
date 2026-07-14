# Agent Team Status

## Coordinator Snapshot
- timestamp: 2026-07-10 Asia/Manila
- repo: https://github.com/ametel01/skills-doctor
- root worktree: /Users/alexmetelli/source/skills-doctor
- branch: main at 0991679fbab989611ba73ac99e7e2c558b9e2307, even with origin/main
- GitHub auth: authenticated as `ametel01` with repo/workflow scopes
- open PRs: none
- open target issues: #42, #43, #44, #45, #46, #47
- protected root changes: 9 tracked files modified with 478 insertions / 50 deletions, plus untracked coordinator ledgers; the tracked patch is pre-existing usage-progress work and must not be edited, moved, staged, or discarded by issue agents

## Dependency Graph
- #43 directly audits the protected uncommitted usage-progress patch and cannot be implemented from clean `origin/main` until that patch receives an explicit branch/baseline disposition.
- #42, #44, #46, and #47 overlap TUI/scan command surfaces and need spec-level conflict mapping before parallel implementation.
- #45 overlaps usage summary/reporting code and the protected #43 progress patch in `src/domain/analyze-skill-usage.ts` / `src/cli/commands/scan.ts`; contract and branch ancestry must be resolved before implementation.
- specification wave: complete for #42-#47.
- ready clean-main sequence: #47 -> #42 -> #44 -> #46, serialized where `scan.ts` / `tui-dashboard.ts` ownership overlaps; #47 lands first so #42 can consume the shared capability predicate while owning terminal-state cleanup.
- parallel-safe clean-main stream: #45 may proceed independently, but should merge before the captured-baseline/#43 stack or that stack must rebase afterward.
- protected-patch sequence: capture the exact nine-file progress diff from base `0991679fbab989611ba73ac99e7e2c558b9e2307` into an isolated baseline commit, then implement #43 as a second commit and ship both atomically in the #43 PR; never merge the buggy baseline alone.
- implementation wave: role routing is available through the current runtime's child-agent mechanism. Start #47 and #45 in isolated worktrees; capture the protected #43 baseline concurrently. Keep #42, #44, and #46 serialized behind the terminal/UI streams.

## Active Work
- issue: #42
  owner: maintainer-reviewer-42
  branch: codex/issue-42-terminal-lifecycle
  worktree: /Users/alexmetelli/source/skills-doctor-issue-42
  pr: https://github.com/ametel01/skills-doctor/pull/51
  phase: approved; ready for coordinator merge
  cycle: 1/5
- issue: #43
  owner: maintainer-reviewer-43
  branch: codex/issue-43-usage-progress
  worktree: /Users/alexmetelli/source/skills-doctor-issue-43
  pr: https://github.com/ametel01/skills-doctor/pull/50
  phase: review; rebased checker ALL GREEN branch, PR Context Gate passes (`closingIssuesReferences`: #43)
  cycle: 1/5
- issue: #44
  owner: coordinator (contract complete)
  branch: none
  worktree: root read-only inspection only
  pr: none
  phase: queued behind #42 because both own dashboard interaction
  cycle: 0/5
- issue: #45
  owner: maintainer-reviewer-45
  branch: codex/issue-45-usage-population
  worktree: /Users/alexmetelli/source/skills-doctor-issue-45
  pr: https://github.com/ametel01/skills-doctor/pull/49
  phase: review; checker ALL GREEN, PR Context Gate passes after ready-state preflight (`closingIssuesReferences`: #45)
  cycle: 0/5
- issue: #46
  owner: coordinator (review routing)
  branch: codex/issue-46-responsive-details
  worktree: /Users/alexmetelli/source/skills-doctor-issue-46
  pr: https://github.com/ametel01/skills-doctor/pull/53
  phase: maintainer-approved via same-author comment fallback; one CodeRabbit test-only thread remains for the ineffective line-1980 width assertion
  cycle: 2/5

## Completion Contracts

### Issue #42
- status: ready; no issue-level dependency blocker. Implementation must wait for the coordinator's required custom-role routing capability and must use an isolated worktree rather than the protected dirty root.
- outcome: interactive scans preserve terminal scrollback and always leave raw mode, listeners, stdin state, and cursor visibility restored; a clean scan exits without advertising navigation controls that cannot be used.
- acceptance criteria:
  - TUI repainting may clear/redraw the current viewport, but it must not emit the `ESC 3 J` scrollback-erasure sequence by default.
  - Cursor hiding and viewport repainting are separate lifecycle operations; cursor visibility is restored exactly once after normal selection/quit, Ctrl-C cancellation, clean-scan early exit, setup/render/write failure, and any other rejected TUI path.
  - Raw mode returns to its pre-entry value, temporary `keypress`/`resize` listeners are removed, and stdin is paused/returned to the prior lifecycle state on every selection exit path; cleanup is safe if invoked more than once.
  - A clean report with no review actions renders either the normal non-interactive summary or a minimal dashboard without arrow/Enter/quit navigation instructions, and exits with the cursor visible.
  - JSON and non-TTY output remain unchanged and contain no terminal-control sequences.
  - Regression tests prove scrollback is not erased, controls are absent for a zero-choice clean dashboard, and terminal cleanup occurs on success, cancellation, and an injected failure.
- non-goals:
  - migrating the dashboard to Ink/OpenTUI or redesigning its visual layout.
  - changing shortcut assignment (#44), detail-view width behavior (#46), `TERM=dumb` capability policy (#47), usage-progress throttling (#43), usage metric populations (#45), scan findings, exit codes, or repair/cleanup behavior.
- likely touchpoints:
  - `src/cli/utils/tui-dashboard.ts`: split destructive clear/cursor-hide behavior into explicit repaint and enter/exit lifecycle operations; make selector cleanup exception-safe; suppress controls when there are no choices.
  - `src/cli/commands/scan.ts`: adjust the `useTui && !shouldReview` clean-scan branch so it cannot hide the cursor or imply an interactive selection lifecycle.
  - `test/tui-dashboard.test.ts`: renderer assertions plus direct selector lifecycle coverage using an injected/mock readable stream and writer.
  - `test/cli-scan.test.ts`: clean interactive scan regression and terminal-control/output boundary coverage.
  - `docs/CLI_SPEC.md` only if the implementation introduces or renames a durable terminal-lifecycle contract; no broad docs rewrite.
- required tests/gates:
  - `bun run test -- test/tui-dashboard.test.ts test/cli-scan.test.ts` with cases for normal selection/quit, Ctrl-C, injected render/write failure, prior raw-mode restoration, listener removal, no `\x1b[3J`, explicit cursor show on every cursor-hide path, and no clean-screen controls.
  - one PTY-style smoke test or equivalent lifecycle test that observes emitted escape sequences and final cursor/raw-mode state on both success and failure.
  - `bun run verify`.
  - `git diff --check` and a focused diff review confirming no usage-progress or unrelated TUI behavior was changed.
- risks:
  - a synchronous `setRawMode`, initial render/write, resize render, or keypress-handler failure can reject/throw before current cleanup runs, leaving the cursor hidden, raw mode enabled, or listeners attached.
  - blindly restoring `isRaw`/pausing stdin can disturb a stream that was already raw or active before entry; tests must cover both prior raw states and cleanup idempotence.
  - removing `ESC 3 J` must preserve full-screen redraw correctness without accumulating dashboard frames in the visible viewport.
  - injected `writeStdout`/TTY flags in tests do not automatically change `process.stdout`/`process.stdin`; lifecycle code should use one coherent injected terminal boundary so tests exercise the real path.
- do-not-touch areas:
  - do not edit, stage, move, discard, or reformat the protected dirty root patch in `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, `src/domain/analyze-skill-usage.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, `test/cli-scan.test.ts`, `test/skill-usage.test.ts`, or `test/usage-sources.test.ts`; issue work belongs in a separate clean worktree, with any later integration preserving those user-owned hunks.
  - keep domain scan/report schemas, public package exports, usage-analysis semantics, prompt adapters, and agent handoff flows unchanged.
- dependency blockers:
  - none at the issue/code level: #42 can branch from clean `origin/main`; it does not require the protected usage-progress patch or #43 to land first.
  - workflow-only blocker: the coordinator's global custom-agent-type routing capability gap currently prevents assigning the required builder/checker/reviewer roles; this is recorded under `## Blockers` and is not a missing product decision.
  - merge coordination: land or rebase #42 and #47 serially because both can change TUI enablement/entry in `src/cli/commands/scan.ts`; whichever lands second must rerun the complete #42 lifecycle suite. The protected #43 patch also changes `scan.ts` but in usage-progress hunks, so it is a rebase/conflict risk rather than an ancestry dependency.
- open questions:
  - none blocking. The builder may choose the existing human summary or a control-free minimal dashboard for clean scans, provided the acceptance criteria and lifecycle tests pass.
- likely file conflicts with #43-#47:
  - #43: low-to-moderate textual conflict in `src/cli/commands/scan.ts` and `test/cli-scan.test.ts`; semantic scopes are separate (usage progress versus clean/TUI lifecycle), and #42 must not absorb the protected root patch.
  - #44: moderate conflict in `src/cli/utils/tui-dashboard.ts` and its tests; #44 changes choice shortcut rendering/input while #42 changes controls and selection cleanup. Keep lifecycle constants/helpers separate from shortcut parsing.
  - #45: low conflict in `src/cli/utils/tui-dashboard.ts` metric rendering and `test/cli-scan.test.ts`; no semantic overlap with terminal cleanup.
  - #46: moderate conflict in `src/cli/utils/tui-dashboard.ts`, `src/cli/commands/scan.ts`, and dashboard/CLI tests; #46 owns width/layout policy, while #42 owns escape sequences and lifecycle.
  - #47: high conflict in `src/cli/commands/scan.ts` around `shouldUseTuiDashboard` and clean fallback behavior, plus possible shared terminal helpers/tests. Coordinate one terminal-capability/lifecycle boundary and serialize integration.

### Issue #43
- status: dependency-blocked (agent-actionable baseline capture); ready for implementation immediately after the protected progress patch is materialized on an isolated branch
- issue: https://github.com/ametel01/skills-doctor/issues/43
- outcome: ship the current usage-discovery/analysis progress feature with one bounded reporter lifecycle that provides useful live TTY signal, emits at most one summary for redirected stderr, and always finalizes on discovery failure, analysis failure, or success
- acceptance criteria:
  - resolve stderr capability from the actual scan output configuration (an injectable `stderrIsTty` alongside `writeStderr`), not directly from global `process.stderr.isTTY`; apply the resolved capability to the initial scan and both post-agent re-analysis paths
  - one CLI reporter owns throttling/coalescing for both discovery events and analysis events; live TTY updates rewrite in place, non-terminal updates are limited to at most 10 per second, and phase/final completion remains visible
  - redirected/non-TTY stderr receives no per-file or per-chunk stream; each usage-analysis pass emits at most one final progress summary line, including when the last available state is from discovery because a later phase failed
  - `finish()` is idempotent and is invoked exactly once by an outer `try/finally` that encloses both source discovery and usage analysis, so discovery rejection, analysis rejection, and success all close or flush reporter state
  - JSON mode remains a single JSON object on stdout with no progress contamination, and non-interactive runs without the existing explicit usage behavior remain unchanged
  - successful TTY output still reports useful final source/byte percentage, record, and match totals from the protected feature; domain progress event payloads remain consumable by programmatic API callers
- non-goals:
  - do not redesign spinner/TUI presentation, terminal raw-mode/cursor/scrollback handling, or the clean-dashboard lifecycle owned by #42
  - do not choose or change the enabled/disabled population model, usage tiering, recommendations, summaries, or README wording owned by #45
  - do not suppress or redesign the domain-level discovery/analysis progress event APIs merely to reduce CLI output; coalesce at the shared CLI reporter boundary
  - no release, tag, publish, dependency upgrade, report-schema change, or migration
- likely touchpoints:
  - `src/cli/utils/spinner.ts`: common reporter modes, throttling/coalescing, final summary, idempotent finalization, and an injectable clock if deterministic timing tests require it
  - `src/cli/commands/scan.ts`: resolve/inject stderr TTY capability, pass it through `ReviewFindingsInput`, reuse it in both re-analysis flows, and widen `buildUsageReportInput` finalization around discovery plus analysis
  - `test/cli-scan.test.ts`: redirected-stderr bound plus discovery-failure, analysis-failure, real-TTY, and post-analysis lifecycle regressions
  - a focused reporter unit test file (new or existing) if needed to prove cadence and idempotence without timing-flaky CLI tests
  - `CHANGELOG.md`: refine the existing protected Unreleased usage-progress entry only if needed; do not add a duplicate entry
- required tests/gates:
  - deterministic reporter tests with many synthetic discovery and analysis events proving the same throttle, a maximum 10 Hz live cadence, mandatory final state, non-TTY output of at most one line, and repeated `finish()` producing no extra output
  - `scanAction` regressions with injected `stderrIsTty` proving redirected output is bounded independently of the host process TTY and genuine TTY mode retains final totals
  - injected discovery rejection and analysis rejection regressions proving finalization/flush in both cases; retain the existing success-path usage-progress regression
  - cover the initial usage scan and both post-cleanup/post-usage-repair re-analysis call sites, directly or through a shared capability-propagation assertion
  - focused redirected-stderr evidence: `bun run test -- test/cli-scan.test.ts -t "redirected"` (use the final regression name if different)
  - targeted suite: `bun run test -- test/cli-scan.test.ts test/skill-usage.test.ts test/usage-sources.test.ts`
  - repository gate: `bun run verify`; then `git diff --check`
- risks:
  - the current implementation binds injected writers to global `process.stderr.isTTY`, which makes tests and embedders misclassify terminal capability
  - parallel source parsing can deliver progress callbacks close together; throttle state must not lose the final aggregate or emit after finalization
  - ordinary spinner lines and usage progress share stderr, so carriage returns/newlines must not concatenate or duplicate summaries
  - time-based throttling can make tests flaky unless the clock is injected and completion events bypass or flush the throttle deterministically
  - finalization that encloses only analysis recreates the reported discovery-failure leak
- do-not-touch areas:
  - the dirty root worktree and its nine tracked user-owned files: `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, `src/domain/analyze-skill-usage.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, `test/cli-scan.test.ts`, `test/skill-usage.test.ts`, and `test/usage-sources.test.ts`; implementation must occur only in isolated worktrees
  - `src/cli/utils/tui-dashboard.ts` and #42 terminal-state behavior
  - usage population/count semantics in `src/domain/analyze-skill-usage.ts`, `src/domain/summarize-findings.ts`, dashboard copy, README, and #45 tests
  - public progress event fields and source-coverage accounting introduced by the protected patch unless a failing compatibility test proves a narrowly necessary correction
- dependency blockers:
  - exact baseline dependency: clean `origin/main` is `0991679fbab989611ba73ac99e7e2c558b9e2307` and does not contain the feature under audit; first capture the exact protected nine-file tracked diff from that commit into a dedicated isolated baseline branch/worktree and commit it without staging, editing, moving, or cleaning the root worktree or including `STATUS*.md`
  - create the #43 branch/worktree from that captured baseline commit, not directly from `origin/main`; preserve the baseline as its own commit for provenance, then add the #43 fix as a second commit
  - the baseline branch must not merge by itself because it contains the bug this issue exists to prevent; the final #43 PR should target `main`, include both commits, and close #43 so progress and its hardening ship atomically
  - no linked PR, issue comment, or GitHub dependency currently blocks the work; the remaining coordinator-level custom-agent routing gap is tracked globally and is not a product dependency for this contract
- likely conflict map:
  - #42 directly overlaps `src/cli/commands/scan.ts` and `test/cli-scan.test.ts`, especially TTY capability setup and scan exit paths; keep #43 out of `tui-dashboard.ts`, serialize final integration, and rebase the #43 stack after #42 if #42 merges first
  - #45 overlaps the protected baseline in `src/domain/analyze-skill-usage.ts`, `test/skill-usage.test.ts`, and `test/cli-scan.test.ts`, but its count-model change is independent of reporter throttling; implement #45 from clean `main`, then rebase the captured baseline/#43 stack after #45 if it merges first, rather than stacking #45 on the unshipped progress baseline
  - capture the protected baseline before either sibling integration so rebases can use its immutable commit as provenance; never resolve shared-file conflicts by copying the dirty root wholesale
- open questions:
  - none requiring product judgment: the contract fixes the observable bounds and lifecycle while leaving the exact reporter helper shape to the builder

### Issue #44
- status: ready; completion contract written. Implementation must use an isolated worktree from `origin/main` and be scheduled so it does not share `src/cli/utils/tui-dashboard.ts` with an active #42 builder.
- outcome: the dashboard exposes only shortcuts representable by its single-key input model while every action in a ten-or-more-action review menu remains reachable.
- acceptance criteria:
  - centralize shortcut assignment so rendering and input resolution use the same mapping: `[1]` through `[9]` for the first nine non-exit choices and `[0]` for the exit choice.
  - the tenth and any later non-exit choices render with an aligned blank shortcut slot, not `[10]`, an alternate fake badge, or another advertised key; their names, descriptions, selection highlight, and row order remain visible.
  - choices without numeric shortcuts remain selectable through the existing Up/Down or `j`/`k`, Home/End, and Enter controls; in particular, the tenth non-exit choice can be selected with End/navigation plus Enter when Exit follows it.
  - direct numeric selection still selects actions 1 and 9, `0` still selects Exit, and `q` retains its existing quit behavior.
  - regression fixtures cover nine non-exit actions plus Exit and ten non-exit actions plus Exit, proving `[9]` and `[0]` are reachable, `[10]` is absent, and the tenth action is keyboard-selectable.
- non-goals:
  - no multi-key parser, timeout/buffering state, alternate letter shortcut scheme, action reordering, menu pagination, or TUI framework migration.
  - no changes to which review actions `scan.ts` builds or to non-TUI prompt behavior.
  - no terminal lifecycle, scrollback/cursor, narrow-detail-layout, or terminal-capability work owned by #42, #46, or #47.
- likely touchpoints:
  - `src/cli/utils/tui-dashboard.ts`: introduce one internal shortcut-assignment helper used by both `renderChoiceRow` and `resolveShortcutIndex`; preserve fixed row alignment when the helper returns no shortcut.
  - `test/tui-dashboard.test.ts`: add rendering boundary coverage and a fake raw-input interaction test for the unnumbered tenth action; pass fixed columns to avoid global resize-listener coupling.
- required tests/gates:
  - `bun test test/tui-dashboard.test.ts`
  - `bun run verify`
  - `git diff --check`
  - manual PTY smoke with the complete review state: visible keys are only `1`-`9` and `0`, the tenth action is reachable with End/Up then Enter (or equivalent navigation), and `0` exits.
- risks:
  - renderer/input drift could reintroduce unreachable labels; one shared mapping helper is required rather than duplicate range checks.
  - an unnumbered selected row must remain visually obvious and aligned in both color and no-color output.
  - fake-stdin tests can leak keypress listeners or raw-mode state; assert cleanup and use an isolated event-emitter stream rather than mutating real `process.stdin`.
  - #42 edits the same selection lifecycle and renderer test file; #46 may edit the same dashboard test file and width helpers. Rebase and re-run focused interaction/layout tests after either merges.
- do-not-touch areas:
  - the protected root patch in `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, usage-analysis/discovery modules, exports, and their tests; do not stage, move, or discard any root-worktree change.
  - `src/cli/commands/scan.ts` action construction and `ReviewAction` semantics; the existing ten-action production state is the regression input, not something to reduce.
  - #42 terminal clear/cursor/raw-mode cleanup, #46 responsive detail renderers, and #47 `TERM=dumb` / prompt-suppression predicates.
  - `CHANGELOG.md` is coordinator-owned while the protected progress patch is unresolved; record any release-note consolidation as a coordinator follow-up instead of editing it in this stream.
- dependency blockers:
  - no repo-local code dependency, linked PR, CI failure, review thread, or protected-patch ancestry is required; issue #44 can branch cleanly from `origin/main` because its implementation is constrained to the dashboard utility and focused test.
  - scheduling constraint, not a semantic dependency: do not run #44 concurrently with #42 because both own `src/cli/utils/tui-dashboard.ts`; preferably merge #42 first, then rebase #44. #46 should avoid the shortcut helper/interaction tests or run after #44. #47 is low-conflict if it remains in `scan.ts`, `should-skip-prompts.ts`, and their focused tests.
  - coordinator runtime blocker still applies before assignment: the required custom `builder`, `checker`, and `maintainer_reviewer` agent types cannot currently be selected by the available API.
- open questions: none; the bounded numeric-shortcut approach above is the selected product behavior for this issue.

### Issue #45
- status: ready; no issue-level ancestry dependency. Implement from clean `origin/main` in an isolated worktree after the coordinator captures the protected usage-progress patch for #43 provenance.
- outcome: every `used` / `unused` / `unknown` rollup is a mutually exclusive classification of enabled skills, while disabled skills remain available as explicit recovery evidence and never become ordinary findings or cleanup candidates.
- acceptance criteria:
  - use one enabled-only rollup population: `usedSkillCount` counts enabled summaries whose tier is `frequent`, `recent`, or `rare`; `unusedSkillCount` counts enabled summaries whose tier is `unused`; `unknownSkillCount` counts enabled summaries whose tier is `unknown`.
  - enforce and test the invariant `usedSkillCount + unusedSkillCount + unknownSkillCount === enabledSkillCount`; weak assistant-only evidence belongs only to `unknown`, not both `used` and `unknown`.
  - keep `totalSkillsAnalyzed === enabledSkillCount + disabledSkillCount`, and keep every analyzed enabled and disabled skill in `skillsByUsage` with its existing `enabled`, tier, evidence, coverage, and recommendation metadata.
  - preserve issue #34 semantics: disabled skills stay excluded from normal scan counts/findings, repair inputs, security checks, and `disable-candidate` cleanup selection; a disabled skill with detected use keeps its `review` recommendation to recover or re-enable it; a disabled skill without use receives no cleanup recommendation.
  - normal usage tier/ranking sections show enabled skills only. Add a distinct disabled-recovery section/count for disabled rows with detected usage so those rows remain discoverable even when their tier is `unknown`; disabled-unused rows remain in JSON and cleanup report context without polluting enabled rollups.
  - dashboard, human summary, usage-ranking summary, cleanup prompt, and `usage.md` label the three rollup counts as enabled-skill usage; when disabled-used recovery items exist, human surfaces identify their count separately rather than folding them into `used` or generic cleanup candidates.
  - README, `docs/CLI_SPEC.md`, and `docs/API.md` state that disabled skills are excluded from quality scanning and enabled rollups/cleanup candidates, retained in usage evidence/report artifacts, and surfaced for recovery when detected as used.
  - do not add or rename report fields: retain schema version 1 and clarify the semantics of existing `totalSkillsAnalyzed`, `enabledSkillCount`, `disabledSkillCount`, `usedSkillCount`, `unusedSkillCount`, `unknownSkillCount`, and per-skill rows.
- non-goals:
  - no changes to usage evidence matching, coverage classification, tier thresholds, confidence, recency, duplicate detection, recommendation policy, or disabled-skill config discovery.
  - no new aggregate schema field solely for disabled recovery; derive the displayed recovery count from disabled `skillsByUsage` rows with detected use/review recommendations.
  - no progress-event, throttling, stderr, stream-reading, or finalization work owned by #43; no unrelated TUI lifecycle, shortcut, responsive-layout, or `TERM=dumb` work.
  - no release, tag, publish, migration, or dependency change.
- likely touchpoints:
  - `src/domain/analyze-skill-usage.ts`: compute the three enabled-only tier buckets and preserve all disabled per-skill summaries/recovery recommendations.
  - `src/domain/summarize-findings.ts`: label the rollup as enabled usage and render a separate disabled-recovery count when present.
  - `src/cli/commands/scan.ts`: label the usage summary population, restrict normal tier groups to enabled rows, and render disabled-used rows in a dedicated recovery section.
  - `src/cli/utils/tui-dashboard.ts`: make the usage-card population explicit and show disabled recovery separately without changing unrelated layout/lifecycle behavior.
  - `src/domain/write-cleanup-directory.ts` and `src/domain/build-cleanup-handoff-prompt.ts`: label aggregate counts as enabled-only while retaining disabled evidence and recovery instructions.
  - `README.md`, `docs/CLI_SPEC.md`, and `docs/API.md`: replace the stale statement that disabled skills disappear from usage ranking/reporting with the selected population contract.
  - `test/skill-usage.test.ts`, `test/cli-scan.test.ts`, `test/reporting.test.ts`, `test/tui-dashboard.test.ts`, and `test/handoff.test.ts`: update aggregate/output fixtures and add enabled-used, enabled-unused, enabled-unknown, disabled-used, and disabled-unused coverage.
- required tests/gates:
  - domain regression with all five cases in one analysis proving the enabled partition invariant, disabled-used recovery review, disabled-unused no-op, and no disabled cleanup candidate.
  - low-confidence assistant-only enabled evidence regression proving the skill is `unknown` and not included in `usedSkillCount`.
  - CLI/rendering regressions proving enabled-only labels/counts, a separate disabled-recovery section/count, and preservation of the disabled recovery recommendation in JSON and `usage.md`/handoff context.
  - focused suite: `bun run test -- test/skill-usage.test.ts test/cli-scan.test.ts test/reporting.test.ts test/tui-dashboard.test.ts test/handoff.test.ts`.
  - repository gate: `bun run verify`; then `git diff --check`.
  - manual/injected CLI output check using one enabled-used, one enabled-unused, one enabled-unknown, one disabled-used, and one disabled-unused skill; enabled rollup must read `1 used, 1 unused, 1 unknown` and disabled recovery must read `1` separately.
- risks:
  - counting `usageCount > 0` instead of tier membership would keep weak-only enabled evidence in both `used` and `unknown`; reviewers must verify the partition invariant.
  - filtering disabled rows out of `skillsByUsage`, `usage.json`, `usage.md`, recommendation repair, or post-cleanup re-analysis would regress merged issue #34/PR #40 behavior.
  - disabled rows can currently fall into normal recent/frequent tables when strong evidence exists; every normal ranking filter must require `enabled`, with one dedicated recovery renderer handling all disabled-used tiers.
  - summary copy is duplicated across dashboard, human output, ranking, report Markdown, handoff prompts, README, and API/CLI docs; unlabeled legacy wording would leave the population ambiguous.
  - layout edits in the dashboard card can collide with #42/#44/#46, so keep #45 changes to metric data/copy and re-run their focused renderer tests after rebasing.
- do-not-touch areas:
  - do not edit, stage, move, discard, or reformat the protected dirty root patch in `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, `src/domain/analyze-skill-usage.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, `test/cli-scan.test.ts`, `test/skill-usage.test.ts`, or `test/usage-sources.test.ts`; implementation belongs in a separate clean worktree.
  - preserve `scanSkillRoots` disabled filtering, `SkillRecord.enabled`, issue #34 recovery recommendation wording/behavior, cleanup safety rules, post-agent disabled-skill analysis, and raw-log privacy boundaries.
  - do not change public progress event types/exports, source streaming, progress reporter creation, or #43 failure/finalization behavior.
  - do not change report shape/schema version; `CHANGELOG.md` remains coordinator-owned while the protected progress entry is unresolved.
- dependency blockers:
  - no code dependency, linked PR, CI failure, or review thread blocks #45; the protected progress patch does not change the population decision and #45 must not be stacked on that unshipped patch.
  - branch-order coordination: first capture the exact protected nine-file progress diff as the immutable baseline required by #43 without changing the root; implement and merge #45 from clean `origin/main`; then rebase/cherry-pick the captured baseline plus #43 hardening onto the new main and resolve only the documented overlaps.
  - workflow-only blocker: the coordinator's global custom-agent-type routing gap still prevents assigning the required builder/checker/reviewer roles and is not a missing product decision.
- likely file conflicts with #43:
  - `src/domain/analyze-skill-usage.ts`: same file but separate semantics—#43 adds progress state/events and streaming around source parsing; #45 owns only `buildAnalysis` aggregate population. Expect line/context conflicts during rebase, not a behavioral dependency.
  - `src/cli/commands/scan.ts`: #43 changes usage-report assembly/re-analysis progress near `buildUsageReportInput`; #45 changes `renderUsageRanking` and output copy much later in the file. Preserve both rather than resolving by taking one whole file.
  - `test/skill-usage.test.ts` and `test/cli-scan.test.ts`: #43 adds progress/failure cases while #45 changes disabled-population assertions and output cases; reconcile imports/fixtures and rerun both focused suites.
  - `CHANGELOG.md` is touched only by the protected #43 baseline; #45 should avoid it. `src/cli/utils/spinner.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, and `test/usage-sources.test.ts` remain exclusively #43-owned.
- open questions: none; the enabled-only partition plus explicit disabled recovery model is the selected behavior.

### Issue #46
- status: ready; no repo-local code dependency. Implementation must use an isolated clean worktree and remains operationally gated by the coordinator's required custom-role routing capability.
- outcome: the dashboard, security review, usage ranking, and usage recommendations all honor one injected terminal-width budget, preserving readable labels and complete record meaning without horizontal overflow on narrow terminals.
- acceptance criteria:
  - extend the existing terminal rendering input with a `columns` budget resolved once from `ScanActionOptions.terminalColumns ?? process.stdout.columns`; pass that same value to the dashboard and all three post-dashboard detail renderers. Use 120 only when the width is absent/non-finite, and treat 20 columns as the minimum supported rendering budget.
  - visible width is ANSI-aware: for injected widths of 60 and 76, every emitted dashboard/detail line is at most that many printable columns. Wrapping/truncation must ignore escape-sequence bytes, preserve color reset sequences, and never split a Unicode code point.
  - dashboard: remove the current forced 76-column floor; below 96 columns omit the brand, render one complete metric per row, keep metric/action labels discoverable, and truncate or wrap descriptions within the frame. Do not change shortcut semantics, controls, cursor/scrollback lifecycle, or TUI eligibility.
  - security review: at 120 columns or wider, retain a tabular incident view but allocate/truncate cells to the actual budget; below 120, render each incident as a stacked record in this order: Severity, Category, Skill, Finding, Artifact. Severity/category summaries remain readable two-column lists, narrative lines wrap, and no incident field is silently omitted. Long artifact paths use middle ellipsis while preserving the basename and `:line` suffix.
  - usage ranking: Summary remains a bounded two-column list. Below 120, each frequent/recent/rare record becomes a stacked record containing Skill, Uses, Recent, Confidence, Evidence, Coverage, Enabled, and Last used; each unused record contains Skill, Enabled, Coverage, Evidence, and Path. Preserve current tier order, row order, preview limits, counts, and values.
  - usage recommendations: below 120, each recommendation becomes a stacked record containing Skill, Confidence, Enabled, Coverage, Evidence, and Path. Preserve group order, preview limits, headings, counts, color meaning, and every current value.
  - wide output at 120/150 columns retains the current information hierarchy and content; JSON, non-interactive summaries, report schemas, and programmatic API output are unchanged.
  - regression coverage exercises 60-, 76-, 120-, and 150-column rendering, including long skill names, finding titles, and paths; narrow output is bounded and still contains every required field label/value.
- non-goals:
  - no dashboard framework migration, visual redesign, horizontal scrolling, pagination, interactive resizing of already-open detail views, or changes to review action ordering.
  - no terminal lifecycle/scrollback fix (#42), numeric shortcut change (#44), `TERM=dumb`/prompt policy (#47), usage-progress behavior (#43), or usage-population semantics (#45).
  - no domain/report schema, finding classification, usage calculation, cleanup recommendation, exit-code, or public package-export changes.
- likely touchpoints:
  - `src/cli/commands/scan.ts`: add `columns` to internal `RenderTerminalOptions`; pass the resolved width through `reviewScan`; make `renderSecurityFindings`, `renderSecurityIncidentTable`, `renderUsageRanking`, `renderCleanupRecommendations`, and shared table/text/path helpers width-aware.
  - `src/cli/utils/tui-dashboard.ts`: replace the 76-column normalization floor and add the sub-96 single-metric/compact layout without changing input or lifecycle behavior.
  - `test/cli-scan.test.ts`: end-to-end width-budget regressions for security review, usage ranking (tier and unused tables), and usage recommendations.
  - `test/tui-dashboard.test.ts`: add 60/76-column cases alongside the existing 100+ breakpoints and assert ANSI-stripped maximum line width plus required labels.
  - `docs/CLI_SPEC.md`: document the shared width budget, 120-column table/stacked breakpoint, and narrow fallback contract; no broader README/PRD rewrite is required.
- required tests/gates:
  - `bun run test -- test/tui-dashboard.test.ts test/cli-scan.test.ts` with table/stacked boundary cases at 119/120 columns and full narrow fixtures at 60/76 columns.
  - assertions must strip ANSI before measuring every line and prove field completeness, stable ordering, preserved preview counts, basename/line-suffix path visibility, and no malformed color sequences.
  - one manual PTY smoke at approximately 60 columns that enters security review, usage ranking, and usage recommendations and returns to the dashboard without horizontal scrolling.
  - `bun run verify`, followed by `git diff --check` and focused diff inspection for accidental schema/semantic changes.
- risks:
  - JavaScript string length counts ANSI bytes and UTF-16 code units, so naive `slice`, `padEnd`, or width math can still overflow or corrupt colored/Unicode output.
  - a generic table helper that drops columns to fit would hide security/usage meaning; narrow mode must switch to explicit labeled records instead.
  - reading `process.stdout.columns` independently in each renderer makes injected tests and resize behavior inconsistent; resolve one width per review render/action.
  - path truncation can erase the differentiating basename or evidence line; preserve the tail and line suffix, and test two paths with common prefixes.
  - changes to dashboard normalization can collide with #42 lifecycle constants or #44 shortcut rows even though the semantic responsibilities differ.
- do-not-touch areas:
  - do not edit, stage, move, discard, or reformat the protected dirty root patch in `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, `src/domain/analyze-skill-usage.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, `test/cli-scan.test.ts`, `test/skill-usage.test.ts`, or `test/usage-sources.test.ts`; implement only in an isolated clean worktree and preserve those user-owned hunks during later integration.
  - do not alter #42 cursor/raw-mode/clear-screen helpers, #44 shortcut assignment/parser behavior, or #47 terminal-capability predicates while resolving layout conflicts.
  - do not change usage counts, tiers, recommendation membership, security incident grouping, or public report types to simplify rendering.
- dependency blockers:
  - none at the issue/code level: #46 can branch from clean `origin/main`; it does not depend on #42, #44, #47, the protected usage-progress patch, a linked PR, CI repair, or a review thread.
  - workflow-only blocker: the coordinator's global custom-agent-type routing gap currently prevents assigning the required builder/checker/reviewer roles; this is tracked under `## Blockers`, not a product dependency.
  - sequencing-only: preferably merge/rebase #42, then #44, then #46 because all touch `src/cli/utils/tui-dashboard.ts` and its tests. #47 may proceed independently if it stays within TUI capability predicates, but whichever branch lands second must rebase and rerun the complete terminal layout suite.
  - protected-patch sequencing: #43/progress work changes `src/cli/commands/scan.ts` and `test/cli-scan.test.ts` in separate usage-progress hunks. It is a textual rebase risk, not required ancestry; never resolve it by copying the dirty root wholesale.
- open questions:
  - none blocking; the 120-column table-to-stacked breakpoint, required field order, width fixtures, and path policy above are the selected implementation contract.
- likely file conflicts with #42/#44/#47:
  - #42: moderate-to-high textual conflict in `tui-dashboard.ts`, `scan.ts`, and both focused test files; #42 owns terminal entry/exit and zero-choice controls, while #46 owns width propagation and layout. Integrate serially and preserve both lifecycle and line-width assertions.
  - #44: moderate textual conflict in dashboard choice-row rendering/tests; #44 owns shortcut mapping and keyboard reachability, while #46 may only wrap/truncate row presentation. Prefer #44 before #46 and rerun its 9/10-action interaction fixtures after layout changes.
  - #47: low-to-moderate textual conflict in `scan.ts` around TUI setup/options; #47 owns whether TUI starts, while #46 owns rendering after width resolution. This is sequencing/rebase coordination only, not a semantic dependency.

### Issue #47
- status: ready; no issue-level dependency blocker. Implementation must use an isolated clean worktree and remains subject to the coordinator's global custom-role routing blocker.
- issue: https://github.com/ametel01/skills-doctor/issues/47
- outcome: use one explicit terminal-capability model so `TERM=dumb` and missing TTY/raw-mode capabilities select deterministic plain-text behavior, while `--yes`, `--json`, CI, and agent environments remain separate prompt-suppression policy inputs.
- acceptance criteria:
  - add one shared, side-effect-free terminal-capability resolver/predicate whose injected inputs are `env`, stdin TTY, stdout TTY, and stdin raw-mode availability; normalize `TERM` case-insensitively and treat only an explicit `TERM=dumb` value as an incapable terminal.
  - expose distinct decisions rather than one overloaded `interactive` boolean: `canPrompt` requires stdin TTY and a non-dumb terminal; `canUseTui` additionally requires stdout TTY and raw-mode support; ANSI/color/animation support requires a capable TTY output and is false for `TERM=dumb`.
  - keep noninteractive policy separate: `shouldSkipPrompts` combines explicit flags (`--yes`, `--json`), existing CI/hook/agent environment signals, and `!canPrompt`; those flags/signals must not be inputs that mutate the terminal-capability result.
  - TUI entry requires all three conditions: prompts are not suppressed, the shared capability says `canUseTui`, and the production Inquirer prompt adapter is in use. A raw-mode-capable TTY with `--yes`, `--json`, or CI must not enter the TUI merely because its hardware capabilities are present.
  - `TERM=dumb` with stdin/stdout attached and raw mode available skips prompts, does not emit the dashboard clear/control sequences, color, or animated score output, and renders the normal readable plain-text summary for an unambiguous root.
  - a capable stdin TTY with redirected/non-TTY stdout may still use line prompts, but must not enter the TUI or emit color; a capable TTY without raw-mode support may still use line prompts but must not enter the TUI.
  - ambiguous root selection under `TERM=dumb` follows the existing conservative skipped-prompt behavior and raises the same clear `CliInputError` rather than guessing.
  - default behavior for an unset/non-dumb `TERM` remains unchanged when the same TTY/raw-mode and prompt-policy inputs are supplied.
- non-goals:
  - do not change terminal cursor/raw-mode cleanup, scrollback erasure, or the clean-dashboard lifecycle owned by #42.
  - do not redesign width breakpoints, wrapping, truncation, security details, or usage tables owned by #46.
  - do not add terminal emulation detection, terminfo probing, `NO_COLOR` support, a new CLI flag, or a TUI framework migration.
  - do not change root-selection defaults, findings, report schemas, exit-code gates, usage analysis, agent handoffs, or JSON output shape.
- likely touchpoints:
  - new focused utility such as `src/cli/utils/terminal-capabilities.ts`: normalized capability input/result and the shared pure resolver.
  - `src/cli/utils/should-skip-prompts.ts`: consume `canPrompt` while keeping explicit flags and noninteractive environment signals as separate policy checks.
  - `src/cli/commands/scan.ts`: resolve capabilities once from `ScanActionOptions`/process defaults, make raw-mode availability injectable, gate TUI on both capability and `!skipPrompts`, and use output capability consistently for color and score animation.
  - `test/terminal-capabilities.test.ts` (or equivalent focused utility test), `test/prompt-behavior.test.ts`, and `test/cli-scan.test.ts`.
  - `docs/CLI_SPEC.md`: document the capability matrix, `TERM=dumb` prompt fallback, and separation between terminal capability and noninteractive policy; retain the matching `docs/PRD.md` output-discipline requirement.
- required tests/gates:
  - capability matrix tests for: `TERM=dumb` despite full TTY/raw support; normal TTY/raw support; stdin non-TTY; stdout non-TTY; and missing raw-mode support. Assert `canPrompt`, `canUseTui`, and ANSI/color capability independently.
  - policy tests proving `TERM=dumb` causes prompt suppression, while `--yes`, `--json`, CI, hook/agent signals, and a custom prompt adapter do not alter the pure terminal-capability result; verify raw-mode absence disables only TUI, not otherwise-capable line prompts.
  - `scanAction` regressions with injected terminal inputs proving `TERM=dumb` produces a plain summary with no ANSI/TUI control sequences or prompt calls, and that an ambiguous root still fails clearly.
  - regression proving an unsuppressed capable terminal can still select the TUI and that a capable terminal with `--yes` does not enter it.
  - targeted gate: `bun run test -- test/terminal-capabilities.test.ts test/prompt-behavior.test.ts test/cli-scan.test.ts` (adjust the first path if tests stay in an existing file).
  - one PTY-style or equivalent CLI smoke with `TERM=dumb`, a single unambiguous skills root, and no noninteractive flag; record that output is readable plain text and contains no dashboard/ANSI control sequences.
  - repository gate: `bun run verify`; then `git diff --check`.
- risks:
  - folding `--yes`/CI into a terminal predicate would conflate user/runtime policy with hardware capability and make the helper unusable by other terminal surfaces.
  - checking raw-mode support through global `process.stdin` while tests inject TTY flags recreates the existing split-brain predicate; raw support must be resolved through the same injectable boundary.
  - disabling only the dashboard but continuing to color or animate the fallback would still violate the documented `TERM=dumb` output boundary.
  - treating raw-mode absence as inability to line-prompt would unnecessarily remove usable non-TUI interaction; `canPrompt` and `canUseTui` must remain distinct.
  - an unset `TERM` is common and must not be treated as `dumb`; normalize only explicit values without inventing new incapability signals.
- do-not-touch areas:
  - do not edit, stage, move, discard, or reformat the protected root patch in `CHANGELOG.md`, `src/cli/commands/scan.ts`, `src/cli/utils/spinner.ts`, `src/domain/analyze-skill-usage.ts`, `src/domain/discover-usage-sources.ts`, `src/index.ts`, `test/cli-scan.test.ts`, `test/skill-usage.test.ts`, or `test/usage-sources.test.ts`; implement in a separate clean worktree and preserve those user-owned hunks during later integration.
  - leave `src/cli/utils/tui-dashboard.ts` lifecycle/escape behavior to #42 and its responsive layout/rendering behavior to #46 unless a minimal import/type adaptation is unavoidable after either lands.
  - do not modify domain modules, public package exports, usage metrics/progress, report serialization, or release metadata.
- dependency blockers:
  - none at the code/GitHub level: #47 has no comments, linked PR, upstream issue, migration, credential, or protected-patch ancestry requirement and can branch from clean `origin/main` at `0991679fbab989611ba73ac99e7e2c558b9e2307`.
  - workflow-only blocker: the required custom builder/checker/reviewer roles cannot currently be selected by the coordinator's available API; this is tracked under `## Blockers` and is not a product dependency or missing acceptance decision.
  - the protected #43 progress patch changes `src/cli/commands/scan.ts` and `test/cli-scan.test.ts`, but not the terminal predicate; this is a later rebase/file-conflict risk, not a reason to base #47 on that patch.
- sequencing/conflict map:
  - #42 is a high textual/integration conflict in `src/cli/commands/scan.ts`, `test/cli-scan.test.ts`, and possibly a shared terminal helper: #47 owns capability and entry eligibility, while #42 owns what happens after TUI entry and how terminal state is restored. Neither semantically depends on the other; preferably land #47 first so #42 consumes the shared predicate, otherwise rebase #47 and preserve #42's lifecycle guarantees.
  - #46 is a moderate sequencing-only conflict in `src/cli/commands/scan.ts`, terminal column/options plumbing, CLI tests, and `docs/CLI_SPEC.md`: #47 owns whether ANSI/TUI is permitted, while #46 owns width budgets after a rendering mode is selected. Either may land first; the second must rebase and rerun both capability and narrow-layout suites.
  - do not run #47 concurrently with an agent editing the same `scan.ts` capability/options block; shared files are coordination constraints, not dependency edges.
- open questions:
  - none blocking. The selected model is the three-way capability split (`canPrompt`, `canUseTui`, ANSI/color support) combined with, but not conflated with, the existing prompt-suppression policy.

## Handoffs
- from: coordinator
  to: builder-agent-43
  timestamp: 2026-07-10 Asia/Manila
  request: close checker coverage gaps for dense reporter throttling/final flush and all three injected stderr-capability paths; return for re-check.
  evidence: checker failed only these two coverage requirements; implementation/gates otherwise pass.
  next-action: recheck #43 after the focused commit.

## Gates
- #47 / PR #48: merged at 092f936; checker ALL GREEN and same-author reviewer COMMENT decision Approve, review id PRR_kwDOS7Czl88AAAABFjFWXA; required checks report none configured.
- #42 / PR #51: reviewer APPROVE decision recorded as same-author COMMENT review https://github.com/ametel01/skills-doctor/pull/51#pullrequestreview-4667397056 (GitHub rejected formal approval); PR Context Gate closes only #42; focused 58-test suite, local `bun run verify` (328 tests), `git diff --check`, and all GitHub checks pass. The continuation keypress-registration setup failure is covered by fe349d5 and its lifecycle regression.
- #45 / PR #49: checker ALL GREEN; maintainer review and GitHub CI pending.
- #43: checker found two coverage gaps; builder is addressing them. No implementation or canonical-gate failure.
- live reconciliation after #48: #47 closed; #42-#46 open; only PR #49 open; root remains intentionally dirty and behind origin/main by the #47 merge.

## Blockers
- none. Active #43 checker feedback is a normal fix loop, not an external blocker.

## Worktrees
- /Users/alexmetelli/source/skills-doctor
  branch: main
  owner: coordinator / user-owned protected tracked changes
  status: dirty; no implementation agent may edit this worktree
- /Users/alexmetelli/source/skills-doctor-issue-43
  branch: codex/issue-43-usage-progress
  owner: builder-agent-43
  status: active; atomic baseline plus hardening, checker-fix cycle 1/5
- /Users/alexmetelli/source/skills-doctor-issue-45
  branch: codex/issue-45-usage-population
  owner: maintainer-reviewer-45
  status: clean; PR #49 open
- /Users/alexmetelli/source/skills-doctor-issue-42
  branch: codex/issue-42-terminal-lifecycle
  owner: maintainer-reviewer-42
  status: clean; PR #51 approved and ready for coordinator merge

## Review Threads
- PR #48: same-author COMMENT review https://github.com/ametel01/skills-doctor/pull/48#pullrequestreview-4667299420 records Approve; no actionable findings; PR merged.
- PR #51: same-author formal `--approve` failed with `Review Can not approve your own pull request`; COMMENT review https://github.com/ametel01/skills-doctor/pull/51#pullrequestreview-4667397056 records explicit Approve. No actionable findings; GitHub checks pass; next action is coordinator merge.
- PR #49: reviewer assigned; no known actionable GitHub thread.

## Decisions And Lessons
- 2026-07-10: preserve the root progress patch and use it as read-only evidence for specs; implementation requires isolated worktrees and explicit ancestry.
- 2026-07-10: do not substitute generic sub-agents for required custom implementation/review roles when model routing cannot be selected.
- 2026-07-10: specification wave completed without implementation edits; contracts select enabled-only usage rollups, single-key dashboard shortcuts, explicit responsive breakpoints, a shared terminal-capability model, and atomic progress-feature hardening.

## Completed
- prior queue #32-#36: merged via PRs #37-#41; historical evidence retained in `STATUS.archive.md` and GitHub.
- issue #47: merged via https://github.com/ametel01/skills-doctor/pull/48 at `092f936`; same-author COMMENT review records explicit Approve; worktree and local/remote branch removed.

## Process Retrospective - Runtime Blocker
Work Item: issues #42-#47
Trigger: terminal-blocker

Signals:
- evidence: three consecutive audits found that the callable `spawn_agent` interface exposes no custom-role selector; generic child probes did not receive the builder contract, while `~/.codex/agents/{builder,checker,maintainer-reviewer}.toml` and the coordinator model configuration are valid.
  impact: no implementation stream, PR, builder gate, checker pass, or maintainer review could start; all six issues remain open at cycle 0/5.
- evidence: the public issue bodies identify valid findings but leave choices open for #44 shortcut policy, #45 metric population, and #46 responsive layout; the completed contracts select those behaviors and add dependencies, non-goals, gates, risks, and conflict maps for all six issues.
  impact: the issue specs were initially insufficient for direct autonomous implementation, but the issue-spec wave closed the gaps before any builder assignment; no issue-template defect blocked this run.
- evidence: the coordinator preserved the dirty root, completed the spec wave, attempted direct, native CLI, metadata-override, and role-contract probes, then stopped instead of substituting generic implementation/review agents.
  impact: routing was appropriate and prevented model/role drift; repeating the blocked audit to the required 3/3 threshold consumed time but produced a justified terminal handoff.
- evidence: `STATUS.md` records the protected baseline ancestry, complete contracts, merge order, live repo/GitHub state, probe results, role configuration, and exact resume action.
  impact: resume state is sufficient without rediscovery; its current size is warranted while six contracts remain active and should shrink as streams complete.
- evidence: no builder, checker, or reviewer work occurred in this loop; the prior status-write-preflight recommendation was previously downgraded and closed, and no unresolved carried process recommendation is recorded.
  impact: repository tests, CI, prompts, and issue templates have no new implementation evidence to act on.

Lessons:
- signal: required named roles can be configured locally yet unavailable through the active collaboration API.
  rule: preflight callable custom-role selection before assigning a dev-team queue; never infer capability from configuration files alone or silently replace required roles with generic children.
- signal: the specification wave produced durable, implementation-ready contracts despite the later runtime stop.
  rule: retain these contracts and resume at assignment/baseline capture rather than repeating issue analysis.

Recommendations:
- classification: create-process-issue
  disposition: pending-coordinator
  target: workflow-doc | prompt | status-contract
  rationale: the same selector failure repeated across three audits and terminally blocked the queue; startup detection would shorten future blocked loops without weakening role separation.
  smallest-change: add a dev-team intake preflight that verifies each required configured role is selectable through the callable spawn interface, records schema/config/contract-probe evidence, forbids generic substitution, and emits a resume-ready terminal handoff when unsupported. Builder acceptance: implement only that preflight and status wording in the owning workflow package. Checker acceptance: exercise supported and unsupported selector fixtures and prove unsupported mode spawns no generic builder/checker/reviewer. Maintainer-reviewer acceptance: confirm required-role separation and existing implementation gates remain unchanged.
  tracker: pending-coordinator because the owning Codex workflow/runtime is outside repository issues #42-#47 and this retrospective role may not create issues.
  owner: coordinator / Codex workflow owner
- classification: status-lesson-only
  disposition: lesson-only
  target: issue-template | status-contract
  rationale: the initial issue bodies required spec decisions, but the prescribed issue-spec role resolved every ambiguity before implementation and recorded conflict-safe sequencing.
  smallest-change: no issue-template change; preserve the completion contracts as the resume source of truth.
  tracker: STATUS.md
  owner: coordinator
- classification: no-action
  disposition: declined
  target: test | ci
  rationale: no builder/checker/reviewer work or repository change occurred, so there is no evidence for a repository test or CI change; the blocker is outside this codebase.
  smallest-change: none.
  tracker: none
  owner: none
- classification: no-action
  disposition: declined
  target: status-contract
  rationale: current resume state is complete, and the only located prior retrospective recommendation was explicitly downgraded and closed rather than left untracked.
  smallest-change: compact active contracts only after their streams merge or the queue is otherwise closed.
  tracker: none
  owner: coordinator
