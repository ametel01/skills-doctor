# Skills Doctor

Skills Doctor is a local-first CLI for auditing Agent Skills in project and
user-level skill roots. It scans `.claude/skills/`, `.agents/skills/`, or both,
checks each `SKILL.md` against the local skill quality specification, and can
hand a findings-specific repair prompt to `claude` or `codex`.

## Install And Run

From a repository that contains project-local skills, or from anywhere when you
want to scan global user-level skills:

```bash
bunx skills-doctor@latest
```

For local development in this repo:

```bash
bun install --frozen-lockfile
bun run build
bun run dev
```

You can also run the built binary through package managers after publishing:

```bash
skills-doctor
```

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
Codex/agents, or both. When no known root exists, it prompts for a custom skills
directory. Non-interactive runs use conservative defaults and fail with a clear
user error when a required choice cannot be made.

## What It Checks

The scanner validates skills against `docs/SKILLS_SPEC.md`, including:

- required YAML frontmatter and valid `name`/`description` fields
- trigger-oriented descriptions
- non-generic skill bodies with concrete workflow structure
- progressive disclosure for large or referenced material
- referenced `references/`, `scripts/`, and `assets/` files
- script guidance that is non-interactive and reproducible
- eval guidance for non-trivial skills
- divergent same-name skills across Claude and Codex/agents roots

Findings are grouped as blocking errors, warnings, and advisory improvements.

## Interactive Repair Flow

When findings exist, the CLI can:

1. Show blocking errors, all findings, or findings grouped by skill.
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
```

JSON mode writes one machine-readable report to stdout and suppresses prompts
and spinners. Human logs and expected errors stay out of stdout.

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
bun run verify
bun run pack:dry-run
node scripts/extract-release-notes.mjs 0.1.0
```

Then:

1. Update `package.json` version.
2. Move changelog entries from `Unreleased` into `## [x.y.z] - YYYY-MM-DD`.
3. Commit the release prep.
4. Tag `v<x.y.z>`.
5. Push the tag to trigger the release workflow.
