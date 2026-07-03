# CLI_SPEC: Skills Doctor CLI Architecture

This document describes the actual Skills Doctor CLI architecture in this
repository. It is for maintainers and agents changing the CLI, domain scanner,
reporting flow, or public package surface.

The source of truth is the code in this repository. Keep this document
synchronized with entrypoint, JSON mode, prompt, repair handoff, and report
schema changes.

## Source Map

Use these files as implementation evidence:

- Package and binary surface:
  - `package.json`
  - `bin/skills-doctor.js`
  - `src/index.ts`
- CLI bootstrap and command workflow:
  - `src/cli/index.ts`
  - `src/cli/commands/scan.ts`
  - `src/cli/utils/handle-error.ts`
  - `src/cli/utils/json-mode.ts`
  - `src/cli/utils/prompts.ts`
  - `src/cli/utils/spinner.ts`
  - `src/cli/utils/cleanup-handoff-to-agent.ts`
  - `src/cli/utils/handoff-to-agent.ts`
  - `src/cli/utils/launch-agent.ts`
  - `src/cli/utils/run-command.ts`
  - `src/cli/utils/is-command-available.ts`
- Domain scanner and reporting:
  - `src/domain/discover-skill-roots.ts`
  - `src/domain/scan-skills.ts`
  - `src/domain/parse-skill.ts`
  - `src/domain/rules/structural.ts`
  - `src/domain/rules/quality.ts`
  - `src/domain/rules/security.ts`
  - `src/domain/build-report.ts`
  - `src/domain/analyze-skill-usage.ts`
  - `src/domain/discover-usage-sources.ts`
  - `src/domain/calculate-score.ts`
  - `src/domain/summarize-findings.ts`
  - `src/domain/write-cleanup-directory.ts`
  - `src/domain/write-findings-directory.ts`
  - `src/domain/build-cleanup-handoff-prompt.ts`
  - `src/domain/build-handoff-prompt.ts`
  - `src/domain/compare-findings.ts`
  - `src/domain/types.ts`
- Project specifications:
  - `docs/PRD.md`
  - `docs/SKILLS_SPEC.md`
  - `docs/RULES.md`
- Regression tests:
  - `test/cli-scan.test.ts`
  - `test/cli-bin.test.ts`
  - `test/domain-scan.test.ts`
  - `test/quality-rules.test.ts`
  - `test/structural-rules.test.ts`
  - `test/handoff.test.ts`
  - `test/reporting.test.ts`
  - `test/api-fixtures.test.ts`
  - `test/agent-selection.test.ts`
  - `test/command-utils.test.ts`

## Architecture Goals

Skills Doctor is a local-first CLI and programmatic scanner for Agent Skills.
The architecture is built around these goals:

- Keep the binary shim thin and import-safe.
- Keep Commander, prompts, process exits, and terminal output at the CLI edge.
- Keep scan discovery, parsing, rules, scoring, reports, and handoff content in
  reusable domain modules.
- Provide deterministic JSON mode for automation.
- Preserve a programmatic API that does not run CLI side effects on import.
- Make repair handoff explicit, local, and auditable through report files.
- Keep tests close to public behavior: CLI invocation, scanner outputs, report
  artifacts, and package exports.

## Package And Runtime Surface

`package.json` publishes one binary:

```json
{
  "bin": {
    "skills-doctor": "./bin/skills-doctor.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "engines": {
    "node": ">=22.13.0"
  }
}
```

The binary shim in `bin/skills-doctor.js` dynamically imports the compiled CLI
entrypoint and calls `runCli()`. It must stay small so package smoke tests
exercise the same path users run after installation.

The package exports `src/index.ts` as the public API. That module should export
domain types and helpers only. It must not parse CLI arguments, register signal
handlers, prompt, start spinners, or launch repair agents.

## CLI Entrypoint

`src/cli/index.ts` owns process-level setup:

1. Pre-detect JSON mode before Commander parsing when `--json` is present.
2. Register `SIGINT` and `SIGTERM` exits.
3. Ignore stdout `EPIPE` so piped output can be truncated safely.
4. Build the Commander program.
5. Parse arguments asynchronously.
6. Unref stdin after parsing completes.
7. Funnel thrown errors through `handleCliError`.

The root command currently accepts:

- optional `[directory]`, defaulting to `.`
- `--json`
- `--json-compact`
- `--usage`
- `--no-logs`
- `--fail-on <severity>`
- `--min-score <number>`
- `-y, --yes`
- `-v, --version`

The command action delegates to `scanAction()` in
`src/cli/commands/scan.ts`. Keep new CLI flags typed at the command boundary and
convert them into explicit domain inputs before doing scan work.

## Scan Workflow

`src/cli/commands/scan.ts` orchestrates one scan-and-optional-repair workflow:

1. Resolve the requested directory.
2. Enable JSON mode when requested.
3. Discover available local, global, and custom skill roots.
4. Prompt for root and ecosystem choices when needed and allowed.
5. Scan selected roots.
6. Run usage analysis in interactive mode, or in non-interactive/JSON mode only
   when `--usage` is set.
7. Build a `ScanReport`.
8. Render JSON or human output.
9. Set `process.exitCode` when blocking findings or diagnostics remain.
10. Optionally prepare repair or cleanup handoff, launch a local agent, and
    re-scan.

The command may use prompts and spinners, but domain modules should not import
prompt or terminal UI dependencies.

## JSON Mode

`src/cli/utils/json-mode.ts` owns machine-readable output. JSON mode is a
process-wide context that records:

- whether output should be compact
- the report directory
- the scan start time

Contract:

- stdout contains exactly one JSON object.
- prompts and spinner output are suppressed.
- expected parse and scan errors are represented as JSON error reports when
  `--json` is set.
- human-readable errors stay on stderr outside JSON mode.
- `--json` keeps the existing report shape unless `--usage` is also set.
- `--json --usage` emits the same single JSON object with optional `usage`
  data included.

Any new output path must preserve this contract. Add or extend
`test/cli-bin.test.ts` when changing package-level JSON behavior.

## Domain Boundary

Domain modules live under `src/domain/` and should remain reusable without CLI
process side effects.

Responsibilities:

- `discover-skill-roots.ts`: detect project-local, user-global, and custom
  roots.
- `scan-skills.ts`: read `SKILL.md` files and collect diagnostics for unreadable
  roots or skill files.
- `discover-usage-sources.ts`: discover bounded local Codex usage sources and
  detect context-budget pressure.
- `analyze-skill-usage.ts`: derive per-skill usage rankings and cleanup
  recommendations from scanned skills and Codex JSONL sources.
- `parse-skill.ts`: parse YAML frontmatter and body content.
- `rules/structural.ts`: validate required skill shape.
- `rules/quality.ts`: validate skill-quality heuristics, resources, scripts,
  evals, and cross-ecosystem divergence.
- `rules/security.ts`: validate deterministic security heuristics for
  suspicious `SKILL.md` instructions and capabilities. Findings are warnings or
  errors about suspicious patterns, not proof of malicious intent. Security
  findings may carry confidence, rationale, and counterevidence metadata.
- `build-report.ts`: build the stable scan report object.
- `calculate-score.ts`: compute the score from distinct blocking and warning
  rules.
- `summarize-findings.ts`: group findings for human output.
- `write-findings-directory.ts`: write `findings.json`, `findings.md`, and
  per-skill report files.
- `write-cleanup-directory.ts`: write `usage.json` and `usage.md` cleanup
  artifacts.
- `build-handoff-prompt.ts`: create the compact repair prompt.
- `build-cleanup-handoff-prompt.ts`: create the conservative cleanup prompt.
- `compare-findings.ts`: compare pre- and post-handoff findings.

When a domain function needs filesystem access, keep it explicit in the module
contract or isolate it behind a small helper. Avoid importing CLI utilities into
domain modules.

## Findings And Reports

Findings use the shared types in `src/domain/types.ts`. Rule IDs emitted by
structural, quality, and security rules must be documented in `docs/RULES.md`;
the test suite checks this.

Scan reports include:

- schema version
- package version
- scanned directory and roots
- skill counts
- finding counts by severity
- diagnostics
- score
- findings
- optional usage analysis, source diagnostics, context pressure, rankings, and
  cleanup recommendations
- handoff-request status

Security findings remain in `findings` and count toward `findingCount` and
`securityFindingCount`. They do not contribute to `errorCount`, `warningCount`,
`adviceCount`, per-skill quality counts, score penalties, or default exit-code
gates. Human summary output includes security confidence counts when security
findings have confidence metadata; JSON mode exposes the same optional
`confidence`, `rationale`, and `counterevidence` fields on each finding.

Report files written for repair handoff are local artifacts under the OS temp
directory, for example `/tmp/skills-doctor-<uid>/reports/<timestamp>/` on
Linux, unless a test or caller passes another output root. Per-skill report
filenames must be deterministic and collision resistant. Findings Markdown,
per-skill reports, and repair handoff prompts include security metadata when it
is present.

Usage cleanup report files are also local artifacts under the OS temp directory
and include `usage.json`, `usage.md`, and `cleanup-prompt.md`. Usage reports
must not include raw Codex prompts or full assistant transcript text.

## Repair Handoff

Repair handoff is an explicit post-scan workflow. The CLI:

1. Asks which findings to repair.
2. Detects available local `claude` and `codex` executables.
3. Writes the full findings directory.
4. Writes `handoff-prompt.md`.
5. Previews the command.
6. Asks for confirmation before launching the selected agent.
7. Re-scans after the agent exits and compares fixed, remaining, and new
   findings.

Launch behavior is implemented in `src/cli/utils/launch-agent.ts`. Keep command
execution argument-based, not shell-string based, except where a platform wrapper
must be resolved deliberately.

## Usage Cleanup Handoff

Cleanup handoff is an explicit post-scan workflow available when usage analysis
has cleanup recommendations. The CLI:

1. Lets users view usage ranking or cleanup recommendations before launch.
2. Lets users choose which unused `disable-candidate` skills to disable.
3. Writes `usage.json` and `usage.md` with the full usage context.
4. Writes `cleanup-prompt.md` with only the selected disable candidates.
5. Detects available local `claude` and `codex` executables.
6. Previews the command.
7. Asks for confirmation before launching the selected agent.
8. Re-scans and re-analyzes usage after the agent exits.

If no findings exist but usage cleanup is available, the same next-step prompt
still appears. If report writing fails, the CLI keeps an inline cleanup prompt.
Cleanup prompts must forbid deletion and limit unused global/plugin cleanup to
reversible Codex skills-config disable operations in `~/.codex/config.toml`.
Cleanup handoff must act only on the user's selected `disable-candidate`
recommendations and leave unselected candidates, keep, review,
shorten-description, and merge-candidate recommendations as read-only report
context.
Skills disabled through Codex `[[skills.config]]` entries are excluded from
scan, finding, usage-ranking, and cleanup-candidate results.

## Error Handling

Expected user errors use `CliInputError` from
`src/cli/utils/handle-error.ts`. They render as concise user-facing messages in
human mode and as JSON error reports in JSON mode.

Unexpected errors also flow through `handleCliError`. Do not add ad hoc
top-level `try/catch` rendering paths unless they preserve JSON mode and exit
code behavior.

## Prompt And Non-Interactive Behavior

Prompt behavior is centralized through `src/cli/utils/prompts.ts` and
`src/cli/utils/should-skip-prompts.ts`.

Prompts are skipped when:

- `--yes` is set
- `--json` is set
- CI or another non-interactive signal is detected
- stdin is not interactive

When prompts are skipped, the CLI should choose conservative defaults only when
that is unambiguous. A single detected standard root is unambiguous. Multiple
local/global scopes or multiple Claude/Codex ecosystems are ambiguous and should
throw a `CliInputError` with clear next steps instead of scanning all roots.

## Terminal Output

Human output should be concise and deterministic enough to test. The current
terminal surface includes:

- score header rendering
- grouped findings
- repair subset prompts
- agent launch preview
- post-handoff comparison summary
- usage ranking and cleanup recommendation views
- cleanup handoff preview and post-cleanup summary

Spinners are edge-only and live behind `src/cli/utils/spinner.ts`. Never write
spinner or prompt output to stdout in JSON mode.

## Testing Strategy

Use the existing test layers before adding new harnesses:

- CLI behavior: `test/cli-scan.test.ts`
- packaged binary behavior: `test/cli-bin.test.ts`
- root discovery and scanner behavior: `test/domain-scan.test.ts`
- structural rules: `test/structural-rules.test.ts`
- quality rules: `test/quality-rules.test.ts`
- report and handoff files: `test/handoff.test.ts`
- rendering and score headers: `test/reporting.test.ts` and
  `test/score-header.test.ts`
- public package API: `test/api-fixtures.test.ts`
- agent detection and launch command construction: `test/agent-selection.test.ts`
- subprocess helpers: `test/command-utils.test.ts`

Default local verification:

```bash
bun run check
bun run typecheck
bun run test
bun run build
```

Use `bun run verify` when a change is ready to commit. Use
`bun run pack:dry-run` for package surface, bin, export, release, or file-list
changes.

## Maintenance Rules

- Update this spec when changing CLI entrypoints, flags, JSON mode, prompts,
  repair handoff, report files, package exports, or runtime support.
- Update `docs/RULES.md` when adding, removing, or renaming emitted rule IDs.
- Update `CHANGELOG.md` for user-visible behavior, public API changes,
  packaging changes, and test coverage requested by implementation plans.
- Keep documentation source maps pointing at files that exist in this
  repository.
