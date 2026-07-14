# Agent Team Status Archive

## 2026-07-09 - Issue #32 / PR #37
- issue: #32 Model skill usage as structured evidence events
- branch: codex/issue-32-structured-usage-events
- worktree: /Users/alexmetelli/source/skills-doctor-issue-32
- PR: https://github.com/ametel01/skills-doctor/pull/37
- commits: 03c84badc299e08521c39badda907456d024f26e, c1e945a49e5a8e379c5e0be7892543e167d1d61d
- merge: 92da349e4e459b6fc9995959f6c5adeee5a05348

### Contract Summary
- Discover recent Codex usage sources by event timestamps instead of mtime tail heuristics.
- Stream full JSONL sources for classification.
- Emit sanitized usage evidence kinds for user invocation, markdown `SKILL.md` links, tool/function `SKILL.md` reads, assistant announcements, and reserved legacy cases.
- Represent incomplete source coverage with diagnostics/metadata.
- Keep duplicate-name and plugin alias resolution conservative.
- Preserve privacy by omitting raw prompts, transcript text, and full tool payloads.

### Builder Evidence
- Changed usage discovery, usage analysis, report/API exports, README/API/CLI docs, and focused tests.
- Initial validation: `bun run typecheck`, targeted usage/report/CLI tests, `bun run check`, `git diff --check`, and `bun run verify` passed with 22 test files / 293 tests.
- Review-fix validation: `bun test test/skill-usage.test.ts test/usage-sources.test.ts`, `git diff --check`, and `bun run verify` passed with 22 test files / 294 tests.

### Checker Evidence
- First checker result: ALL GREEN on initial implementation.
- Maintainer-reviewer found one blocking gap: no-source analysis and capped source discovery could overclaim complete coverage.
- Second checker result after c1e945a: ALL GREEN; no-source analysis reports `usage-source-none` and incomplete coverage, capped discovery reports `usage-source-discovery-truncated`.

### Reviewer Evidence
- First maintainer review: request changes via same-author COMMENT fallback at https://github.com/ametel01/skills-doctor/pull/37#pullrequestreview-4657986363.
- Final maintainer review: approve-equivalent via same-author COMMENT fallback at https://github.com/ametel01/skills-doctor/pull/37#pullrequestreview-4658059854.
- PR context gate passed before merge; `closingIssuesReferences` contained only #32.

### Merge And Cleanup
- All GitHub checks passed before merge: verify 22.13.0, verify 24.x, React Doctor, CodeRabbit, GitGuardian, Socket Project Report, Socket Pull Request Alerts.
- `gh pr merge 37 --squash --delete-branch` merged remotely but failed local branch checkout cleanup with: `failed to run git: fatal: 'main' is already used by worktree at '/Users/alexmetelli/source/skills-doctor'`.
- Coordinator verified PR state was MERGED, fast-forwarded root `main` to origin/main, removed the clean issue worktree, and deleted the local/remote feature branch explicitly.

## 2026-07-09 - Issue #35 / PR #39
- issue: #35 Show usage evidence and coverage in reports and cleanup handoff
- branch: codex/issue-35-usage-report-evidence
- worktree: /Users/alexmetelli/source/skills-doctor-issue-35
- PR: https://github.com/ametel01/skills-doctor/pull/39
- commits: 8bb014d, a81fd3f
- merge: 9318ce92e8865b8ae2bc2aee41f34e8e0dc2a563

### Contract Summary
- Render sanitized usage evidence and coverage metadata through JSON, Markdown cleanup reports, human/TUI summaries, usage rankings, cleanup recommendations, cleanup handoff prompts, and public docs.
- Preserve privacy by avoiding raw prompt/transcript leakage.
- Keep policy-specific behavior owned by sibling issues #33 and #34.

### Checker Evidence
- Checker result: ALL GREEN.
- Focused reporting, handoff, TUI, usage, and CLI tests passed.
- `bun run verify` passed before PR.

### Reviewer Evidence
- Maintainer review was approve-equivalent via same-author fallback comment at https://github.com/ametel01/skills-doctor/pull/39#issuecomment-4919568725.
- PR context gate passed before merge; live `closingIssuesReferences` contained only #35.

### Merge And Cleanup
- All GitHub checks passed before merge: verify 22.13.0, verify 24.x, React Doctor, CodeRabbit, GitGuardian, Socket Project Report, Socket Pull Request Alerts.
- `gh pr merge 39 --squash --delete-branch` merged remotely but failed local worktree branch cleanup with: `failed to delete local branch codex/issue-35-usage-report-evidence: failed to run git: error: cannot delete branch 'codex/issue-35-usage-report-evidence' used by worktree at '/Users/alexmetelli/source/skills-doctor-issue-35'`.
- Coordinator verified PR state was MERGED, issue #35 was CLOSED, fast-forwarded root `main` to origin/main, removed the clean issue worktree, and deleted the local/remote feature branch explicitly.

## 2026-07-09 - Issue #34 / PR #40
- issue: #34 Include disabled skills in usage analysis with enabled metadata
- branch: codex/issue-34-disabled-usage-metadata
- worktree: /Users/alexmetelli/source/skills-doctor-issue-34
- PR: https://github.com/ametel01/skills-doctor/pull/40
- commits: 364d50a, b5c2754
- merge: b591e4977b78c2e1c86469baa614dd5d30197cfb

### Contract Summary
- Include Codex-disabled skills in usage analysis with `enabled: false`.
- Keep disabled skills out of normal findings, score/report skill counts, package security checks, repair rescans, and default cleanup candidates.
- Route disabled-but-used skills to recovery review instead of cleanup.

### Checker Evidence
- Initial checker result: ALL GREEN at `364d50a`.
- Rebased after #35 to `b5c2754`; focused disabled-skill/report/handoff/TUI/CLI tests passed with 119 tests.
- `bun run verify` passed after rebase with 22 files / 301 tests.

### Reviewer Evidence
- Maintainer review was approve-equivalent at https://github.com/ametel01/skills-doctor/pull/40#issuecomment-4919631196.
- PR context gate passed before merge; live `closingIssuesReferences` contained only #34.

### Merge And Cleanup
- All GitHub checks passed before merge: verify 22.13.0, verify 24.x, React Doctor, CodeRabbit, GitGuardian, Socket Project Report, Socket Pull Request Alerts.
- `gh pr merge 40 --squash --delete-branch` merged remotely but failed local worktree branch cleanup with: `failed to delete local branch codex/issue-34-disabled-usage-metadata: failed to run git: error: cannot delete branch 'codex/issue-34-disabled-usage-metadata' used by worktree at '/Users/alexmetelli/source/skills-doctor-issue-34'`.
- Coordinator verified PR state was MERGED, issue #34 was CLOSED, fast-forwarded root `main` to origin/main, removed the clean issue worktree, and deleted the local/remote feature branch explicitly.

## 2026-07-09 - Issue #33 / PR #41
- issue: #33 Classify unused skills only with complete evidence coverage
- branch: codex/issue-33-complete-coverage-cleanup
- worktree: /Users/alexmetelli/source/skills-doctor-issue-33
- PR: https://github.com/ametel01/skills-doctor/pull/41
- commits: f4f6003, b27e076, bf9d3c8, 7da81b9, 626df72
- merge: 0991679fbab989611ba73ac99e7e2c558b9e2307

### Contract Summary
- Classify enabled skills as `unused` only when usage coverage is complete and no evidence is present.
- Route incomplete coverage to `unknown`/review instead of default cleanup.
- Route assistant-announcement-only evidence to `unknown`/review.
- Keep disabled no-evidence skills as `unknown`, while preserving #34 disabled-skill metadata and #35 report surfaces.

### Checker Evidence
- Initial checker failed because assistant-announcement-only evidence returned `rare` instead of `unknown`.
- Coordinator fixed that failure after rebasing onto #34 and #35.
- Focused usage/report/CLI tests passed with 76 tests.
- `bun run verify` passed with 22 files / 302 tests.

### Reviewer Evidence
- Maintainer review first requested changes at https://github.com/ametel01/skills-doctor/pull/41#issuecomment-4919676512 because disabled no-evidence skills still reported public tier `unused`.
- Coordinator fixed `classifyTier` to require `enabled` for public `unused` tier and added a disabled/no-evidence regression.
- Final maintainer review was approve-equivalent at https://github.com/ametel01/skills-doctor/pull/41#issuecomment-4919693548.
- PR context gate passed before merge; live `closingIssuesReferences` contained only #33.

### Merge And Cleanup
- All GitHub checks passed before merge: verify 22.13.0, verify 24.x, React Doctor, CodeRabbit, GitGuardian, Socket Project Report, Socket Pull Request Alerts.
- `gh pr merge 41 --squash --delete-branch` merged remotely but failed local worktree branch cleanup with: `failed to delete local branch codex/issue-33-complete-coverage-cleanup: failed to run git: error: cannot delete branch 'codex/issue-33-complete-coverage-cleanup' used by worktree at '/Users/alexmetelli/source/skills-doctor-issue-33'`.
- Coordinator verified PR state was MERGED, issue #33 was CLOSED, fast-forwarded root `main` to origin/main, removed the clean issue worktree, and deleted the local/remote feature branch explicitly.
