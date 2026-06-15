# Skills Doctor PRD

## Summary

Skills Doctor is an interactive local CLI that scans agent skills in
`.claude/skills/`, `.agents/skills/`, or both, grades them against
`docs/SKILLS_SPEC.md`, builds a findings-specific repair prompt, lets the user
choose a local agent CLI (`claude` or `codex`), and launches that agent to fix
the skills in place.

The product wedge is:

> Your skills are only useful if agents can discover, activate, and follow them
> reliably. Skills Doctor finds weak skills, explains why they fall short, and
> hands the exact repair plan to your local coding agent.

Skills Doctor is not a generic markdown linter. It is a skill-quality auditor
and repair launcher for the Agent Skills format.

## Source Material

Primary requirements are derived from:

- `docs/SKILLS_SPEC.md`: skill format, progressive disclosure, authoring,
  description optimization, script design, eval expectations, portability, and
  validation rules.
- `docs/CLI_SPEC.md`: TypeScript CLI architecture, interactive prompts, JSON
  output discipline, command execution, handoff payloads, non-interactive
  behavior, errors, testing, and process handling.

Reference codebases:

- `/Users/alexmetelli/source/ritualai`: close reference for an interactive CLI
  that discovers skill-related local data, prompts the user, detects `claude`
  and `codex`, launches a selected agent, validates generated skills, and writes
  skill files.
- `/Users/alexmetelli/source/react-doctor`: production-grade CLI architecture
  reference for Commander setup, JSON mode, prompt wrappers, spinners, terminal
  safety, command execution, handoff prompts, and test coverage.

## Problem

Developers increasingly maintain multiple personal and project-local agent
skills. Those skills can silently degrade:

- The `description` may not trigger on the right tasks.
- Frontmatter may be malformed or incompatible across clients.
- A skill may be too generic to add value.
- A `SKILL.md` may be too large for progressive disclosure.
- References, scripts, or assets may be missing or poorly connected.
- Script instructions may be unsafe, interactive, or impossible for agents to
  run.
- Existing skills may work in one ecosystem but fail portability expectations in
  another.

Most issues are not obvious from a quick read. Users need a local scanner that
turns the Skills Spec into actionable findings and then hands those findings to
the coding agent they already use.

## Target Users

- Developers who maintain project-local `.claude/skills/` or `.agents/skills/`.
- Power users who share skills across Claude Code, Codex, and other compatible
  agents.
- Maintainers who want a repeatable quality gate before publishing or committing
  skills.
- Teams that want agent skills to follow a consistent standard without manually
  reviewing every `SKILL.md`.

## Product Principles

- Local-first: scan skill files on disk without uploading content by default.
- Interactive by default: users choose scope, findings to fix, and agent CLI
  through prompts.
- Deterministic scan first: identify structural and heuristic issues before any
  agent is launched.
- Agent handoff after consent: only launch `claude` or `codex` after the user
  sees the findings and prompt preview.
- Findings drive prompts: the generated prompt must be tailored to the exact
  scanned skills and violations.
- Preserve user work: never overwrite or rewrite skills directly from the scan
  phase.
- Verify after repair: re-scan after the agent exits and report remaining
  issues.
- Keep stdout clean in JSON mode: machine-readable reports must not mix with
  prompts, logs, spinners, or warnings.

## Goals

- Discover `.claude/skills/` and `.agents/skills/` skill roots in the current
  project.
- Let the user choose Claude skills, Codex/agents skills, or both.
- Scan each skill directory containing `SKILL.md`.
- Validate structural correctness against the Agent Skills format.
- Detect quality risks from `docs/SKILLS_SPEC.md`, including weak descriptions,
  overlarge instructions, poor progressive disclosure, generic body content,
  missing resource files, unsafe scripts, and missing evals.
- Group findings by skill and by rule.
- Classify findings as blocking errors, warnings, or advisory improvements.
- Build a concise agent handoff prompt tailored to the scan results.
- Write a full machine-readable scan report to disk for agent follow-up.
- Detect available local agent CLIs: `claude` and `codex`.
- Let the user choose which local CLI should fix the findings.
- Launch the selected CLI with an inherited terminal session and the generated
  prompt.
- Re-scan after the agent exits and show remaining findings.

## Non-Goals

- Hosted accounts, cloud sync, or a team dashboard.
- Uploading skill files to a remote service by default.
- Automatically fixing skills without user approval.
- Replacing the selected local agent CLI with an embedded model provider.
- Full semantic guarantee that a skill will trigger correctly in every agent.
- Building a complete skill marketplace or registry.
- Supporting every possible agent ecosystem in the MVP.
- Running expensive trigger/output eval suites automatically in the MVP.

## MVP Invocation

The default command should be interactive:

```bash
bunx skills-doctor@latest
```

The CLI may also expose a local package binary such as:

```bash
skills-doctor
```

MVP flags may exist for automation, but the happy path must not require flags.
The interactive flow should ask the user to choose scan targets and repair
handoff behavior.

## MVP User Flow

1. The user runs `bunx skills-doctor@latest` inside a project.
2. Skills Doctor detects whether `./.claude/skills/` and `./.agents/skills/`
   exist.
3. If both roots exist, the user chooses one of:
   - Claude skills.
   - Codex/agents skills.
   - Both.
4. If no known root exists, the user can enter an extra skills directory path or
   cancel.
5. Skills Doctor scans selected roots for skill directories containing
   `SKILL.md`.
6. Skills Doctor validates each skill against `docs/SKILLS_SPEC.md`.
7. Skills Doctor prints a summary:
   - number of roots scanned
   - number of skills scanned
   - blocking errors
   - warnings
   - advisory improvements
   - top affected skills
8. The user reviews findings by skill or severity.
9. The user chooses whether to fix all findings or only a selected subset.
10. Skills Doctor detects local `claude` and `codex` executables.
11. The user chooses the local CLI to use.
12. Skills Doctor builds a custom repair prompt from the selected findings.
13. Skills Doctor writes the full report to a local output directory.
14. Skills Doctor previews the command and asks for confirmation.
15. Skills Doctor launches the selected CLI with `stdio: "inherit"` and the
    generated prompt.
16. The selected agent edits the skill files directly.
17. When the agent exits, Skills Doctor re-scans the same roots.
18. Skills Doctor reports which findings were fixed and which remain.

## Functional Requirements

### Skills Root Discovery

- Detect project-local Claude skills at `./.claude/skills/`.
- Detect project-local Codex/agents skills at `./.agents/skills/`.
- Support scanning either root or both roots in one run.
- If neither root exists, prompt for a custom skills root.
- Resolve all selected roots to absolute paths.
- Refuse paths that do not exist unless the user explicitly chooses a future
  path for a repair session.
- Skip non-directory entries in skills roots.
- Treat a subdirectory containing `SKILL.md` as a skill directory.
- Ignore files such as `README.md` directly inside the skills root.
- Do not recursively treat nested subdirectories as separate skills unless they
  directly contain `SKILL.md` and are within the configured scan depth.

### Interactive Target Selection

- Show detected roots with labels:
  - `Claude: ./.claude/skills`
  - `Codex/agents: ./.agents/skills`
- Default to both when both roots exist.
- Default to the single detected root when only one exists.
- Allow custom paths when automatic discovery is incomplete.
- Allow cancellation at every prompt.
- In non-interactive mode, use conservative defaults and fail with a clear user
  error when required decisions cannot be made.

### Skill Parsing

For each discovered skill:

- Read `SKILL.md`.
- Parse YAML frontmatter between `---` delimiters.
- Extract `name`, `description`, optional frontmatter fields, and body content.
- Preserve file path, skill root, ecosystem label, and parse diagnostics.
- Continue scanning other skills if one skill cannot be parsed.
- Emit a blocking finding for malformed or missing `SKILL.md`.

### Structural Validation Rules

Blocking errors:

- Missing `SKILL.md`.
- `SKILL.md` does not start with YAML frontmatter.
- YAML frontmatter cannot be parsed.
- Missing `name`.
- Missing `description`.
- `name` is longer than 64 characters.
- `name` contains characters other than lowercase letters, numbers, and hyphens.
- `name` starts or ends with a hyphen.
- `name` contains consecutive hyphens.
- `name` does not match the parent directory name.
- `description` is empty or longer than 1024 characters.
- `compatibility` is present and longer than 500 characters.
- `metadata` is present but is not a mapping.
- `allowed-tools` is present but is not a string.

Warnings:

- Optional `license` is unusually long or unclear.
- Frontmatter uses unsupported fields not described by the spec.
- `allowed-tools` is used without acknowledging that support is experimental.
- Skill body is empty or mostly placeholder text.

### Description Quality Rules

Detect weak activation descriptions.

Warnings:

- Description does not say when to use the skill.
- Description focuses on implementation rather than user intent.
- Description is vague, for example "Helps with PDFs."
- Description lacks trigger phrases such as "Use when", "Use this skill when",
  "whenever", or clear task contexts.
- Description is too narrow and only names one exact prompt.
- Description is too broad and could trigger on adjacent tasks.

Advisory improvements:

- Suggest using imperative phrasing.
- Suggest adding indirect user-intent cases.
- Suggest adding near-miss boundaries when the scope is ambiguous.

### Body Quality Rules

Warnings:

- Body contains generic filler such as "be helpful", "do the task", or "follow
  best practices" without concrete instructions.
- Body explains common concepts the model likely already knows instead of
  domain-specific guidance.
- Body lacks concrete workflow steps, examples, gotchas, templates, or
  validation loops.
- Body appears to hardcode one specific task instead of teaching a reusable
  procedure.
- Body presents many equal tool options instead of a default and fallback.
- Body contains a large menu of alternatives with no decision rule.
- Body contains fragile operations without an exact sequence.
- Body contains destructive operations without confirmation, dry-run, or
  validation guidance.

Advisory improvements:

- Add a `Gotchas` section when the skill contains non-obvious local facts.
- Add a checklist for multi-step workflows.
- Add a validation loop when outputs can be checked.
- Add a plan-validate-execute pattern for batch or risky operations.
- Add an output template when the skill must produce a specific format.

### Progressive Disclosure Rules

Warnings:

- `SKILL.md` exceeds 500 lines.
- `SKILL.md` appears to exceed the recommended 5,000-token guidance.
- Detailed reference material is embedded inline when it should be in
  `references/`.
- The body references `references/`, `scripts/`, or `assets/` generically
  without saying when to load a specific file.
- File references are deeply nested or chained.
- Referenced files do not exist.
- Critical-looking gotchas appear only in a reference file with no clear load
  trigger.

Advisory improvements:

- Move long reference material to `references/`.
- Move long templates to `assets/`.
- Replace "see references" with explicit "Read this file when..." guidance.

### Script Quality Rules

Warnings:

- A script referenced in `SKILL.md` does not exist.
- A script lacks usage documentation or `--help` guidance.
- Instructions tell the agent to run an interactive script.
- Script instructions do not specify required inputs.
- Script output expectations are free-form when structured output would be
  better.
- Script instructions mix stdout data with stderr diagnostics.
- Destructive script instructions lack `--dry-run`, `--confirm`, or equivalent
  safeguards.
- One-off package-runner commands use unpinned versions where reproducibility
  matters.

Advisory improvements:

- Prefer self-contained scripts with inline dependency metadata when repeated
  logic is complex.
- Prefer JSON, CSV, or TSV stdout for machine-readable results.
- Document safe defaults, exit codes, and predictable output sizes.

### Eval And Validation Rules

Warnings:

- Non-trivial skills have no `evals/evals.json`.
- `evals/evals.json` exists but lacks realistic prompts.
- Evals lack expected output descriptions.
- Evals do not compare with-skill behavior against a baseline or previous
  version.
- Assertions are vague or unverifiable.

Advisory improvements:

- Add trigger eval queries for non-trivial skills.
- Add near-miss negative trigger queries.
- Split description evals into train and validation sets.
- Track timing, token usage, grading evidence, and human review feedback for
  mature skills.

### Duplicate And Cross-Ecosystem Checks

When both `.claude/skills/` and `.agents/skills/` are scanned:

- Detect skills with the same `name` across both ecosystems.
- Compare their `SKILL.md` content.
- Warn when same-name skills diverge without an obvious reason.
- Warn when a skill appears in one ecosystem but not the other and the user
  selected both ecosystems for shared maintenance.
- Do not automatically mirror or delete skills.

### Findings Model

Each finding must include:

- Stable rule id.
- Severity: `error`, `warning`, or `advice`.
- Skill name when known.
- Ecosystem: `claude`, `codex`, or `custom`.
- Root path.
- File path.
- Line number when available.
- Human-readable title.
- Explanation tied to `docs/SKILLS_SPEC.md`.
- Suggested repair.
- Whether the finding is safe for agent repair.

Example categories:

- `frontmatter`
- `description`
- `body-quality`
- `progressive-disclosure`
- `references`
- `scripts`
- `evals`
- `portability`
- `cross-ecosystem`

### Summary Rendering

Human output should show:

- Roots scanned.
- Skills scanned.
- Count by severity.
- Top affected skills.
- Top rule categories.
- Clear next action prompt.

Detailed output should be available interactively:

- View all findings.
- View only blocking errors.
- View findings by skill.
- View findings by rule category.
- Continue to repair handoff.
- Exit without repair.

### JSON Report

The CLI must support a machine-readable report mode after the interactive MVP
stabilizes.

JSON mode contract:

- JSON report goes to stdout.
- Human logs, warnings, prompts, and spinners do not write to stdout.
- Error output is valid JSON.
- Report includes schema version, CLI version, scanned roots, skill summaries,
  findings, elapsed time, and whether repair handoff was requested.

### Agent CLI Detection

- Detect `claude` on `PATH`.
- Detect `codex` on `PATH`.
- If both are available, let the user choose.
- If one is available, default to it and ask for confirmation.
- If neither is available, stop after writing the scan report and print the
  generated prompt path or inline prompt as a fallback.
- Use a shared command resolver that handles platform-specific executable
  behavior.

### Agent Handoff Prompt

Skills Doctor must generate a custom prompt from scan findings.

Prompt requirements:

- Name the selected roots and skills.
- Summarize the highest-priority findings.
- Include grouped findings by skill.
- Include exact file paths.
- Include line numbers when available.
- Include concise repair instructions grounded in `docs/SKILLS_SPEC.md`.
- Include the full report path for complete details.
- Instruct the agent to edit files directly.
- Instruct the agent to preserve unrelated user changes.
- Instruct the agent not to invent new requirements outside the spec.
- Instruct the agent to verify by rerunning Skills Doctor or an equivalent scan.
- Keep the inline prompt compact by including only top groups inline.

Full report behavior:

- Write complete scan results to a local output directory.
- Include `findings.json`.
- Include a readable `findings.md`.
- Include per-skill finding files when helpful.
- Add the output directory path to the handoff prompt.

### Agent Launch

- Launch the selected CLI with `stdio: "inherit"` so the chosen agent owns the
  terminal until it exits.
- Use the current project root as `cwd`.
- Preview the launch command before running.
- Ask for explicit confirmation before launch.
- Pass the generated prompt as the final argument.
- Use agent-specific approval-bypass flags only after user confirmation.

Initial launch mapping:

- Claude: `claude --dangerously-skip-permissions <prompt>`
- Codex: `codex --yolo <prompt>`

On Windows, avoid shell-based multiline prompt invocation if it would corrupt
arguments. Prefer direct binary execution or the resolved underlying Node entry
script pattern from `react-doctor`.

### Post-Handoff Re-Scan

After the selected agent exits:

- Re-scan the same roots.
- Compare previous findings to current findings by stable rule id and file path.
- Show fixed, remaining, and new findings.
- Set a non-zero exit code if blocking errors remain.
- Offer to launch another repair pass only in interactive human mode.

## CLI Architecture Requirements

The implementation should follow `docs/CLI_SPEC.md`.

### Package Shape

- TypeScript ESM package.
- Thin bin shim.
- Runtime should support modern Node as defined by the package.
- Domain scanner must be reusable from tests and future APIs without importing
  prompt libraries or telemetry.

Recommended layout:

```text
src/
  cli/
    index.ts
    commands/
      scan.ts
    utils/
      prompts.ts
      spinner.ts
      run-command.ts
      launch-agent.ts
      json-mode.ts
      handle-error.ts
      should-skip-prompts.ts
  domain/
    discover-skill-roots.ts
    scan-skills.ts
    parse-skill.ts
    rules/
    build-report.ts
    build-handoff-prompt.ts
    compare-scans.ts
  index.ts
```

### Interactive Behavior

- Centralize prompt handling in a prompt adapter.
- Cancellation should exit cleanly or return a typed cancellation result.
- Re-unref stdin after prompts.
- Disable prompts for `--yes`, `--json`, CI, non-TTY stdin, git hooks, and
  coding-agent subprocesses.

### Output Discipline

- Spinners render to stderr.
- Spinners disable animation in non-interactive terminals, CI, coding agents,
  git hooks, and `TERM=dumb`.
- JSON mode owns stdout.
- Human rendering uses a logger abstraction.
- Raw `process.stdout.write` is reserved for machine output or terminal control
  that cannot be expressed by the logger.

### Command Execution

- Use `execFile` for subprocess detection and non-interactive commands.
- Use `spawn` with `stdio: "inherit"` only for the selected agent handoff.
- Capture stdout and stderr for command checks.
- Return structured success/failure results.
- Treat missing binaries as expected user errors, not crashes.

### Error Policy

Expected user errors:

- No skills root found and user declines custom path.
- Selected path is not readable.
- No skills found.
- Invalid CLI flag combination.
- Neither `claude` nor `codex` is available when repair is requested.

Unexpected errors:

- Parser defects.
- Unhandled filesystem errors.
- Serialization failures.
- Internal invariant violations.

Expected errors should render direct messages. Unexpected errors should use the
top-level crash-reporting path if telemetry is later added.

## Data Handling Requirements

- Treat skill files as local developer data.
- Do not upload skill contents by default.
- Generated handoff prompts remain local unless the user launches a local agent
  CLI that may contact external services according to the user's configuration.
- Make that handoff explicit before launch.
- Store scan reports under a local generated directory such as
  `.skills-doctor/reports/<timestamp>/`.
- Do not write reports unless needed for handoff or explicitly requested.
- Do not mutate skill files during scan.
- Do not delete skills.
- Preserve unrelated user edits.

## Success Metrics

- A user can scan `.claude/skills/`, `.agents/skills/`, or both in one
  interactive session.
- Findings map clearly to rules from `docs/SKILLS_SPEC.md`.
- A repair prompt includes enough context for `claude` or `codex` to fix the
  highest-priority issues without dumping every finding inline.
- After an agent handoff, the re-scan shows fewer blocking findings.
- JSON reports can be consumed by tests or future CI integrations without
  stdout contamination.
- The CLI can be used successfully with only the default interactive command.

## MVP Acceptance Criteria

- Given `./.claude/skills/foo/SKILL.md`, the CLI discovers and scans `foo` when
  the user selects Claude skills.
- Given `./.agents/skills/foo/SKILL.md`, the CLI discovers and scans `foo` when
  the user selects Codex/agents skills.
- Given both roots, the CLI lets the user scan Claude, Codex/agents, or both.
- Given malformed frontmatter, the CLI reports a blocking finding and continues
  scanning other skills.
- Given a `name` that does not match the directory, the CLI reports a blocking
  finding.
- Given a weak description, the CLI reports a warning with a suggested repair.
- Given an overlarge `SKILL.md`, the CLI reports a progressive-disclosure
  warning.
- Given a missing referenced script or reference file, the CLI reports a
  missing-resource warning.
- Given both `claude` and `codex` are available, the CLI prompts the user to
  choose one.
- Given only one agent CLI is available, the CLI defaults to it with
  confirmation.
- Given no agent CLI is available, the CLI exits repair flow cleanly and prints
  where the report and prompt can be found.
- Given selected findings, the CLI writes a full report and generates a compact
  custom repair prompt.
- Given user confirmation, the CLI launches the selected agent with inherited
  stdio and the custom prompt.
- Given the agent exits, the CLI re-scans and reports fixed and remaining
  findings.
- Given remaining blocking errors after re-scan, the CLI sets a non-zero exit
  code.

## Test Matrix

### Discovery And Parsing

- Finds `.claude/skills`.
- Finds `.agents/skills`.
- Finds both roots.
- Handles custom roots.
- Ignores non-skill files.
- Continues after unreadable or malformed skills.
- Parses valid frontmatter.
- Reports invalid frontmatter.

### Rule Engine

- Validates `name` constraints.
- Validates `description` constraints.
- Validates optional frontmatter constraints.
- Detects weak descriptions.
- Detects placeholder bodies.
- Detects generic bodies.
- Detects overlarge `SKILL.md`.
- Detects missing referenced resources.
- Detects script quality warnings.
- Detects missing eval guidance for non-trivial skills.
- Detects divergent duplicate names across scanned ecosystems.

### Interactive CLI

- Prompts for root selection.
- Defaults to both roots when both exist.
- Handles prompt cancellation.
- Skips prompts in JSON and non-interactive modes.
- Renders summary before repair prompts.
- Allows repair subset selection.

### Handoff

- Detects `claude`.
- Detects `codex`.
- Handles no available agents.
- Builds compact prompt with top findings.
- Writes complete report to disk.
- Launches selected agent with inherited stdio.
- Uses the correct cwd.
- Re-scans after agent exit.

### Output And Process

- Human output does not corrupt JSON stdout.
- JSON errors are valid JSON.
- Spinners render only when interactive.
- `EPIPE` exits cleanly.
- Expected user errors do not render crash reports.
- Remaining blocking findings set `process.exitCode = 1`.

## Open Questions

- Should MVP scan only project-local roots, or also offer global user-level
  roots such as `~/.claude/skills` and `~/.agents/skills`?
- Should repair handoff default to fixing all findings or only blocking errors
  and high-confidence warnings?
- Should the scanner include an optional LLM critique pass, or keep MVP entirely
  deterministic before handoff?
- Should same-name skills across Claude and Codex be expected to match exactly,
  or should divergence only be advisory?
- What should the published package name be: `skills-doctor`,
  `agent-skills-doctor`, or another name?
