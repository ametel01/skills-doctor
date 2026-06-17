# Plan 023: Migrate release publishing to npm trusted publishing

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8d615d4..HEAD -- .github/workflows/release.yml package.json README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `8d615d4`, 2026-06-18

## Why this matters

The release workflow publishes to npm with a long-lived `NPM_TOKEN` secret. npm trusted publishing uses GitHub Actions OIDC so the workflow can publish without storing a reusable npm token, and it can attach provenance. This reduces blast radius if repository secrets are exposed.

## Current state

- Releases run on `v*` tags.
- The workflow installs with Bun, verifies, does a Bun pack dry run, extracts release notes, and runs `bun publish` with `NPM_CONFIG_TOKEN`.
- The package has `"packageManager": "bun@1.3.13"` and `"engines": { "node": ">=22.0.0" }`.

Relevant excerpts:

```yaml
# .github/workflows/release.yml:8-10
permissions:
  contents: write
```

```yaml
# .github/workflows/release.yml:19-29
- run: bun install --frozen-lockfile
- run: bun run verify
- run: bun run pack:dry-run
- name: Extract release notes
  run: node scripts/extract-release-notes.mjs "${GITHUB_REF_NAME#v}" > release-notes.md
- run: bun publish
  env:
    NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}
- uses: softprops/action-gh-release@v2
  with:
    body_path: release-notes.md
```

Official npm docs to consult before editing:

- `https://docs.npmjs.com/trusted-publishers/`
- `https://docs.npmjs.com/generating-provenance-statements/`

Repo conventions to match:

- CI and release workflows pin Bun through `oven-sh/setup-bun@v2`.
- Release checks should keep `bun run verify`, `bun run pack:dry-run`, and release-note extraction.
- Do not change package name, version, changelog, or publish trigger in this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Workflow sanity | `bun run verify` | exit 0 |
| Pack check | `bun run pack:dry-run` | exit 0 |
| Release notes | `node scripts/extract-release-notes.mjs 0.3.1` | exit 0, prints release notes |

## Scope

**In scope**:
- `.github/workflows/release.yml`
- `README.md` only if the release checklist must mention trusted publishing setup
- `package.json` only if npm provenance metadata or engine constraints must be adjusted

**Out of scope**:
- Publishing a real release.
- Rotating or deleting the existing npm token secret; a human maintainer must do that after trusted publishing succeeds.
- Changing package version or changelog entries.
- Reworking CI.

## Git workflow

- Branch: `advisor/023-migrate-release-to-trusted-publishing`
- Commit message: `ci: use npm trusted publishing for releases`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Confirm npm trusted publisher requirements

Read the current npm docs for trusted publishing and provenance. Confirm whether `bun publish` supports npm trusted publishing in the repo's pinned Bun version. If support is unclear, use the npm CLI for the publish step and keep Bun for install/build/test.

Expected GitHub Actions requirements at the time this plan was written:

- Add `id-token: write` permission.
- Use a Node/npm version new enough for trusted publishing.
- Remove the `NPM_CONFIG_TOKEN` publish secret from the workflow.
- Publish with provenance when supported.

**Verify**: Record the chosen publish command in the PR description or commit notes. Do not publish.

### Step 2: Update the release workflow

Edit `.github/workflows/release.yml` to:

- Add `id-token: write` under `permissions`.
- Keep `contents: write` for GitHub Release creation.
- Add `actions/setup-node` if npm CLI publishing is used, with a current Node version and npm registry configuration.
- Replace the token-based publish step with trusted publishing, for example:

```yaml
- uses: actions/setup-node@v5
  with:
    node-version: "24"
    registry-url: "https://registry.npmjs.org"
- run: npm publish --provenance
```

If the package must be built or packed before `npm publish`, keep those existing Bun steps before publishing.

**Verify**: `bun run verify` -> exit 0.

### Step 3: Update release documentation if needed

If the workflow no longer uses `NPM_TOKEN`, update the README release checklist to mention that the npm package must have GitHub trusted publishing configured for this repository and workflow. Do not include any token values.

Suggested wording:

```md
Ensure npm trusted publishing is configured for this repository's release workflow before pushing a release tag.
```

**Verify**: `bun run check` -> exit 0.

### Step 4: Validate local release checks

Run local checks that do not publish:

1. `bun run verify`
2. `bun run pack:dry-run`
3. `node scripts/extract-release-notes.mjs 0.3.1`

Do not run `npm publish`, `bun publish`, or push a tag locally.

**Verify**: all three commands exit 0.

## Test plan

- Workflow syntax is simple YAML; rely on review plus local release gate commands.
- Run `bun run verify`.
- Run `bun run pack:dry-run`.
- Run `node scripts/extract-release-notes.mjs 0.3.1`.

## Done criteria

- [ ] `.github/workflows/release.yml` no longer references `secrets.NPM_TOKEN`.
- [ ] Release workflow has `id-token: write`.
- [ ] Publish step uses trusted publishing-compatible npm publishing with provenance when supported.
- [ ] README release checklist documents the external npm trusted publishing prerequisite if needed.
- [ ] `bun run verify` exits 0.
- [ ] `bun run pack:dry-run` exits 0.
- [ ] `node scripts/extract-release-notes.mjs 0.3.1` exits 0.
- [ ] No files outside the in-scope list and `plans/README.md` are modified.
- [ ] `plans/README.md` marks plan 023 `DONE`.

## STOP conditions

Stop and report back if:

- The npm package is not configured for trusted publishing and no maintainer can configure it.
- npm docs show trusted publishing is incompatible with this workflow trigger.
- The publish command requires a package version or changelog change.
- Removing `NPM_TOKEN` would block releases before the external npm setup is complete.

## Maintenance notes

After trusted publishing succeeds once, a human maintainer should remove or rotate the old npm token secret. Reviewers should verify the workflow does not accidentally keep both trusted publishing and token-based publishing active.
