# Skills Doctor

Skills Doctor is a local-first CLI for auditing Agent Skills in project and
user-level skill roots. It scans `.claude/skills/`, `.agents/skills/`, or both,
checks each `SKILL.md` against the local skill quality specification derived
from the Agent Skills standards at <https://agentskills.io/home>, and can hand a
findings-specific repair prompt to `claude` or `codex`.
It can also analyze local Codex usage traces to surface unused skills and
skills context-budget pressure before handing a cleanup prompt to a local agent.

## Install And Run

From a repository that contains project-local skills, or from anywhere when you
want to scan global user-level skills:

```bash
npx skills-doctor@latest
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

- audit skills with `npx skills-doctor@latest --json` for deterministic, machine-readable output.
- launch interactive repair handoff through `npx skills-doctor@latest` after explicit consent.

The CLI is the primary source of rule logic and output shape.
The skill wrapper is a convenience entrypoint so agents can discover and invoke the same scanner from within skill workflows.
When installed from npm, the wrapper is shipped at `node_modules/skills-doctor/skills/skills-doctor/SKILL.md`.
Copy or reference that file from an agent skill directory when you want an agent to discover the workflow, but keep scans delegated to `npx skills-doctor@latest` or the installed `skills-doctor` binary.

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
runs scan only a single unambiguous detected root. If multiple local/global
scopes or multiple ecosystems are detected, they fail with a clear user error
instead of guessing.

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
Programmatic consumers can import `ruleCatalog` for the same metadata as structured data.

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

The default interactive `npx skills-doctor@latest` flow scans skills and, when
available, reads local Codex usage traces from known `~/.codex` paths. It can:

1. Show a concise score, skill count, and issue count.
2. Show usage ranking and cleanup recommendations when usage analysis ran.
3. Let you choose a repair subset: errors, errors plus warnings, all findings,
   or selected skills.
4. Detect local `claude` and `codex` executables.
5. Write a full report under the OS temp directory, for example
   `/tmp/skills-doctor-<uid>/reports/<timestamp>/` on Linux.
6. Generate a compact `handoff-prompt.md` tailored to the selected findings or
   `cleanup-prompt.md` tailored to usage cleanup.
7. Preview the launch command.
8. Ask for explicit confirmation before handing the terminal to the selected
   agent.
9. Re-scan the same roots after the agent exits and report changed findings or
   cleanup summary details.

Launch mappings:

- Claude: `claude --dangerously-skip-permissions <prompt>`
- Codex: `codex --yolo <prompt>`

Skills Doctor does not edit skill files during the scan phase. Repairs are made
only by the local agent after you confirm the handoff.

Cleanup handoff writes `usage.json`, `usage.md`, and `cleanup-prompt.md` before
any agent launch. The prompt tells the agent to preserve recent/frequent skills,
never delete skills, ignore non-disable recommendations during cleanup, disable
unused global/plugin skills only through Codex `[[skills.config]]` entries in
`~/.codex/config.toml`, and verify with `npx skills-doctor@latest`.
Skills already disabled in Codex config are omitted from scan, usage-ranking,
and cleanup-candidate results.

## JSON Mode

Use JSON output for automation:

```bash
skills-doctor --json
skills-doctor --json --json-compact
skills-doctor --yes --json
skills-doctor --yes --json --fail-on warning
skills-doctor --yes --json --min-score 95
skills-doctor --yes --json --usage
```

JSON mode writes one machine-readable report to stdout and suppresses prompts
and spinners. Human logs and expected errors stay out of stdout.
By default, the exit code fails only for blocking errors and error diagnostics.
Use `--fail-on warning`, `--fail-on advice`, or `--min-score <number>` for stricter CI gates.

Use `--usage` to include local Codex usage analysis in JSON or non-interactive
runs. Interactive runs analyze usage by default; pass `--no-logs` to skip local
Codex log discovery. Usage analysis reads only known local Codex paths such as
`~/.codex/sessions/**/*.jsonl`, `~/.codex/history.jsonl`, and optional
`~/.codex/logs_2.sqlite` pressure data.

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

Usage analysis is local and best-effort. Reports include skill names, paths,
counts, timestamps, confidence, diagnostics, and recommendations, but not raw
Codex prompts or assistant transcript text.

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
6. Ensure the `NPM_TOKEN` repository secret can publish the npm package.
7. Push the tag to trigger the release workflow.

The release workflow derives the same version from the pushed tag with
`node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}"`.
