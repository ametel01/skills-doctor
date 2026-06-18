# Skills Doctor

Skills Doctor is a local-first CLI for auditing Agent Skills in project and
user-level skill roots. It scans `.claude/skills/`, `.agents/skills/`, or both,
checks each `SKILL.md` against the local skill quality specification derived
from the Agent Skills standards at <https://agentskills.io/home>, and can hand a
findings-specific repair prompt to `claude` or `codex`.

## Install And Run

From a repository that contains project-local skills, or from anywhere when you
want to scan global user-level skills:

```bash
bunx skills-doctor@latest
```

For local development in this repo:

```bash
bun install --frozen-lockfile
bun run verify
bun run dev
```

You can also run the built binary through package managers after publishing:

```bash
skills-doctor
```

## Distribution as an Agent Skill

Skills Doctor is also available as an agent-facing skill wrapper at `skills/skills-doctor/SKILL.md`.

Use the `skills-doctor` skill when people ask for an agent workflow to:

- audit skills with `bunx skills-doctor@latest --json` for deterministic, machine-readable output.
- launch interactive repair handoff through `bunx skills-doctor@latest` after explicit consent.

The CLI is the primary source of rule logic and output shape.
The skill wrapper is a convenience entrypoint so agents can discover and invoke the same scanner from within skill workflows.
When installed from npm, the wrapper is shipped at `node_modules/skills-doctor/skills/skills-doctor/SKILL.md`.
Copy or reference that file from an agent skill directory when you want an agent to discover the workflow, but keep scans delegated to `bunx skills-doctor@latest` or the installed `skills-doctor` binary.

## What It Scans

Skills Doctor detects these project-local roots relative to the directory you
run it from:

- `.claude/skills/`
- `.agents/skills/`

It also detects these global user-level roots:

- `~/.claude/skills/`
- `~/.agents/skills/`

When local and global roots both exist, the interactive CLI first asks whether
to scan local project skills, global/root skills, or both. When both Claude and
Codex/agents roots exist in the selected scope, it asks whether to scan Claude,
Codex/agents, or both. If you already have standard roots detected, it also lets
you add a custom skills directory path in the same interactive flow. Non-interactive
runs use conservative defaults and fail with a clear user error when a required
choice cannot be made.

## What It Checks

The scanner validates skills against `docs/SKILLS_SPEC.md`, which consolidates
the Agent Skills standards from <https://agentskills.io/home>, including:

- required YAML frontmatter and valid `name`/`description` fields
- trigger-oriented descriptions
- non-generic skill bodies with concrete workflow structure
- progressive disclosure for large or referenced material
- referenced `references/`, `scripts/`, and `assets/` files
- script guidance that is non-interactive and reproducible
- eval guidance for non-trivial skills
- divergent same-name skills across Claude and Codex/agents roots

See `docs/RULES.md` for a full rule catalog, severity, and intended rationale.

Findings are grouped as blocking errors, warnings, and advisory improvements.
The human summary opens with a score header showing a face, `0` to `100` score,
label, and proportional terminal bar. The score starts at 100 and deducts 1.5
points for each distinct error rule and 0.75 points for each distinct warning
rule; each distinct blocking diagnostic code is scored like an error rule.
Repeated findings from the same rule do not increase the penalty. Advisory
findings and warning diagnostics are counted in the report but do not affect the
score. Score labels are `Great` for 75 or higher, `Needs work` for 50 through
74, and `Critical` below 50.

## Interactive Repair Flow

When findings exist, the CLI can:

1. Show a concise score, skill count, and issue count.
2. Let you choose a repair subset: errors, errors plus warnings, all findings,
   or selected skills.
3. Detect local `claude` and `codex` executables.
4. Write a full report under `.skills-doctor/reports/<timestamp>/`.
5. Generate a compact `handoff-prompt.md` tailored to the selected findings.
6. Preview the launch command.
7. Ask for explicit confirmation before handing the terminal to the selected
   agent.
8. Re-scan the same roots after the agent exits and report fixed, remaining,
   and new findings.

Launch mappings:

- Claude: `claude --dangerously-skip-permissions <prompt>`
- Codex: `codex --yolo <prompt>`

Skills Doctor does not edit skill files during the scan phase. Repairs are made
only by the local agent after you confirm the handoff.

## JSON Mode

Use JSON output for automation:

```bash
skills-doctor --json
skills-doctor --json --json-compact
skills-doctor --yes --json
skills-doctor --yes --json --fail-on warning
skills-doctor --yes --json --min-score 95
```

JSON mode writes one machine-readable report to stdout and suppresses prompts
and spinners. Human logs and expected errors stay out of stdout.
By default, the exit code fails only for blocking errors and error diagnostics.
Use `--fail-on warning`, `--fail-on advice`, or `--min-score <number>` for stricter CI gates.

## Programmatic API

`skills-doctor` also exposes a programmatic API through `import { ... } from "skills-doctor"`.
Use it for embedded integrations that need scan, validation, scoring, and report artifacts.

```ts
import { discoverSkillRoots, scanSkillRoots, buildScanReport } from "skills-doctor";

const discovered = await discoverSkillRoots({ cwd: process.cwd(), homeDir: "/home/user" });
const scan = await scanSkillRoots({ roots: discovered.roots });
const report = buildScanReport({
  version: "0.0.0",
  directory: process.cwd(),
  elapsedMilliseconds: 0,
  scan,
});
```

The CLI remains the primary interface for interactive repair workflows.
See `docs/API.md` for supported exports and the `schemaVersion: 1` report schema.

## Exit Codes

- `0`: no blocking errors remain in the final scan.
- `1`: blocking errors remain, no readable skills root was available, or another
  expected user error occurred.

## Privacy

Skills Doctor reads local skill files and writes local report files. It does not
upload skill contents or call a hosted model. Content leaves the process only if
you explicitly launch a local agent CLI such as `claude` or `codex`, and that
agent then follows its own configuration.

## Release Checklist

Before tagging a release:

```bash
VERSION=<x.y.z>
bun run verify
bun run pack:dry-run
node scripts/extract-release-notes.mjs "$VERSION"
```

Then:

1. Update `package.json` version.
2. Move changelog entries from `Unreleased` into `## [x.y.z] - YYYY-MM-DD`.
3. Confirm `node scripts/extract-release-notes.mjs "$VERSION"` prints the intended notes.
4. Commit the release prep.
5. Tag `v<x.y.z>`.
6. Ensure npm trusted publishing is configured for this repository's release workflow.
7. Push the tag to trigger the release workflow.

The release workflow derives the same version from the pushed tag with
`node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}"`.
