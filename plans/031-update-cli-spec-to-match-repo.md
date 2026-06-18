# Plan 031: Replace stale CLI spec source map with Skills Doctor architecture

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- docs/CLI_SPEC.md src/cli src/domain package.json README.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

`docs/CLI_SPEC.md` says this repository is the concrete source of truth, but its source map points to React Doctor package paths that do not exist here and describes dependencies like `ora`/Effect/Sentry that this project does not use. Agents or maintainers following it can chase nonexistent files and import the wrong architecture into future changes.

## Current state

```md
<!-- docs/CLI_SPEC.md:8 -->
The concrete source of truth is this repository.
```

```md
<!-- docs/CLI_SPEC.md:16-43 -->
- `packages/react-doctor/package.json`
- `packages/react-doctor/src/cli/index.ts`
- `packages/core/src/run-inspect.ts`
...
```

Actual repo shape:

- `src/cli/index.ts` — Commander bootstrap and `runCli`.
- `src/cli/commands/scan.ts` — scan workflow orchestration.
- `src/domain/*` — scanner, rules, reports, scoring, handoff content.
- `package.json` runtime deps are `@inquirer/prompts`, `commander`, and `yaml`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Docs scan | `rg -n "react-doctor|packages/core|ora|Effect|Sentry" docs/CLI_SPEC.md` | no stale claims unless explicitly marked external reference |
| Check | `bun run check` | exit 0 |

## Scope

**In scope**:
- `docs/CLI_SPEC.md`
- `README.md` only if it links to the spec in a way that needs clarification

**Out of scope**:
- Production code changes.
- Rewriting `docs/SKILLS_SPEC.md` or `docs/PRD.md`.

## Git workflow

- Branch: `advisor/031-update-cli-spec-to-match-repo`
- Commit message: `docs: align cli spec with implementation`

## Steps

### Step 1: Decide document role

Choose one:

- Rewrite `docs/CLI_SPEC.md` as a Skills Doctor-specific architecture spec.
- Or retitle the current file as an external React Doctor reference and create a concise Skills Doctor architecture section at the top.

Prefer the first option unless the maintainer explicitly wants to preserve the reusable React Doctor reference.

**Verify**: top of the document clearly states its role.

### Step 2: Replace the source map

Update the source map to point at real files:

- `package.json`
- `bin/skills-doctor.js`
- `src/cli/index.ts`
- `src/cli/commands/scan.ts`
- `src/cli/utils/*.ts`
- `src/domain/*.ts`
- relevant tests under `test/`

**Verify**: `rg -n "packages/react-doctor|packages/core" docs/CLI_SPEC.md` returns no unqualified stale source-map entries.

### Step 3: Align architecture sections

Describe the actual boundaries:

- CLI edge: Commander, prompts, JSON mode, spinner, repair-agent launch.
- Domain: discovery, parsing, rule validation, scoring, reports.
- Public API: `src/index.ts`.
- Tests: injected adapters and fixture scans.

Remove claims about `ora`, Effect layers, telemetry/Sentry, or mark them as external inspiration only.

**Verify**: `rg -n "ora|Effect|Sentry" docs/CLI_SPEC.md` has no stale implementation claims.

### Step 4: Run docs-safe gate

Run the repo check.

**Verify**: `bun run check` exits 0.

## Test plan

- Documentation-only. Use `rg` checks above plus `bun run check`.

## Done criteria

- [ ] `docs/CLI_SPEC.md` points to real Skills Doctor files.
- [ ] Stale React Doctor architecture is removed or explicitly labeled external.
- [ ] `bun run check` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer wants `docs/CLI_SPEC.md` preserved as a reusable external template.
- The update would require changing production architecture rather than docs.

## Maintenance notes

Keep this doc synchronized with any future CLI entrypoint, JSON mode, prompt, or repair-handoff refactor. Stale architecture docs are worse than missing ones for agent-driven work.
