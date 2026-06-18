# Plan 030: Align the Node engine floor with tested runtime support

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- package.json bun.lock .github/workflows/ci.yml .github/workflows/release.yml README.md docs/CLI_SPEC.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The package advertises Node `>=22.0.0`, but CI does not test that minimum and release verification uses Node 24. Typechecking also uses `@types/node` 24.x. This can let the project publish code that fails on Node 22.0-22.12 while still claiming support.

## Current state

```json
// package.json:45-46
"engines": {
  "node": ">=22.0.0"
}
```

```yaml
# .github/workflows/release.yml:20-25
- uses: actions/setup-node@v5
  with:
    node-version: "24"
    registry-url: "https://registry.npmjs.org"
```

```md
<!-- docs/CLI_SPEC.md:124-126 reference template -->
"engines": {
  "node": "^20.19.0 || >=22.13.0"
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install check | `bun install --frozen-lockfile` | exit 0 |
| Verify | `bun run verify` | exit 0 |
| Pack dry run | `bun run pack:dry-run` | exit 0 |

## Scope

**In scope**:
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md` or docs if runtime support text exists
- `bun.lock` only if dependency metadata changes require it

**Out of scope**:
- Supporting Node 20 unless a maintainer explicitly chooses that policy.
- Rewriting the CLI for older Node versions.

## Git workflow

- Branch: `advisor/030-align-node-engine-floor`
- Commit message: `chore: align node runtime support`

## Steps

### Step 1: Choose the runtime support policy

Use one of these policies:

- Preferred: set `engines.node` to `>=22.13.0` or `>=24.0.0`, matching what CI can test.
- Alternative: keep `>=22.0.0`, pin Node types to a compatible minimum, and add CI coverage for Node 22.0.

Do not silently keep the mismatch.

**Verify**: policy is reflected in `package.json`.

### Step 2: Add CI coverage for the declared floor

If the floor remains below Node 24, update CI to run at the declared minimum Node version or at least the declared minimum minor. Release can still publish with Node 24, but CI should prove the supported floor.

**Verify**: workflow YAML contains the chosen minimum runtime.

### Step 3: Run package gates

Run normal verification and packaging checks.

**Verify**: `bun install --frozen-lockfile`, `bun run verify`, and `bun run pack:dry-run` exit 0.

## Test plan

- CI workflow review for runtime matrix/minimum.
- Local `bun run verify` and `bun run pack:dry-run`.

## Done criteria

- [ ] `package.json` engine range matches tested support.
- [ ] CI covers the chosen floor or docs clearly state the tested runtime.
- [ ] `bun run verify` and `bun run pack:dry-run` pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer has not decided whether Node 22.0-22.12 should be supported.
- A lower Node floor requires code changes outside metadata and CI.

## Maintenance notes

Runtime support is a compatibility promise. When bumping `@types/node` or using newer Node APIs, update engine policy and CI together.
