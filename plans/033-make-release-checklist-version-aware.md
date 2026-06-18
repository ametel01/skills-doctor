# Plan 033: Make the release checklist version-aware

> **Executor instructions**: Follow this plan step by step. Run every verification command before moving on. If a STOP condition occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8ad9124..HEAD -- README.md scripts/extract-release-notes.mjs CHANGELOG.md .github/workflows/release.yml`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `8ad9124`, 2026-06-18

## Why this matters

The README release checklist hard-codes `0.1.0` for release-note extraction even though the current release section is `0.3.1` and CI derives the version from the tag. A manual releaser following README can generate old notes or fail the release-note check for the intended version.

## Current state

```md
<!-- README.md:162-166 -->
Before tagging a release:

```bash
bun run verify
bun run pack:dry-run
node scripts/extract-release-notes.mjs 0.1.0
```
```

```js
// scripts/extract-release-notes.mjs:13
const version = versionArg.replace(/^v/, "");
```

```yaml
# .github/workflows/release.yml:28
node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}" > release-notes.md
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Docs check | `bun run check` | exit 0 |
| Release notes smoke | `node scripts/extract-release-notes.mjs 0.3.1` | prints non-empty notes |

## Scope

**In scope**:
- `README.md`

**Out of scope**:
- Changing release workflow behavior.
- Changing changelog format.

## Git workflow

- Branch: `advisor/033-make-release-checklist-version-aware`
- Commit message: `docs: make release checklist version aware`

## Steps

### Step 1: Replace the hard-coded version

In README, replace `node scripts/extract-release-notes.mjs 0.1.0` with a placeholder or shell variable, for example:

```bash
VERSION=<x.y.z>
node scripts/extract-release-notes.mjs "$VERSION"
```

Add one sentence that the matching `## [x.y.z] - YYYY-MM-DD` changelog section must exist before tagging.

**Verify**: `rg -n "0\\.1\\.0" README.md` returns no release-checklist hit.

### Step 2: Mirror CI's tag-derived command

Optionally include the CI equivalent:

```bash
node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}"
```

Make clear this is for GitHub Actions, not local shell unless the variable is set.

**Verify**: README instructions are unambiguous.

### Step 3: Run checks

Run docs check and smoke the script for the current release.

**Verify**: `bun run check` exits 0 and `node scripts/extract-release-notes.mjs 0.3.1` prints release notes.

## Test plan

- Documentation-only, plus release-note script smoke.

## Done criteria

- [ ] Release checklist no longer hard-codes `0.1.0`.
- [ ] README tells releasers to create the changelog section before tagging.
- [ ] `bun run check` passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Maintainer wants README examples pinned to a real historical release.

## Maintenance notes

Keep manual release docs aligned with `.github/workflows/release.yml`; drift here creates failed or misleading release notes.
