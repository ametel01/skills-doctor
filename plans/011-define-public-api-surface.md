# Plan 011: Define the package public API surface

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 769f1df..HEAD -- src/index.ts package.json README.md test/api-fixtures.test.ts tsconfig.build.json`
> If any in-scope file changed since this plan was written, compare the excerpts below against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction, dx
- **Planned at**: commit `769f1df`, 2026-06-16

## Why this matters

`src/index.ts` exports many domain APIs, and tests import from it, but `package.json` exposes only the CLI `bin` and has no `exports` or `main`. That ambiguity matters: either the package supports programmatic use, or the exports are internal test convenience. A clear public API decision prevents accidental breaking changes and makes the package easier to consume.

## Current state

Relevant files:

- `src/index.ts` - exports scanner/reporting APIs.
- `package.json` - has `bin` and package files, but no `exports` or `main`.
- `test/api-fixtures.test.ts` - imports public-looking APIs from `../src/index.js`.
- `tsconfig.build.json` - controls build output declarations.
- `README.md` - documents CLI usage but not programmatic API usage.

Current excerpts:

```ts
// src/index.ts:1-8
export const CLI_NAME = "skills-doctor";

export const getCliBanner = (): string => `${CLI_NAME}: scaffold ready`;

export {
  type BuildHandoffPromptInput,
  buildHandoffPrompt,
} from "./domain/build-handoff-prompt.js";
```

```json
// package.json:5-16
"type": "module",
"packageManager": "bun@1.3.13",
"bin": {
  "skills-doctor": "./bin/skills-doctor.js"
},
"files": [
  "bin/**",
  "dist/**",
  "scripts/**",
  "README.md",
  "CHANGELOG.md",
  "LICENSE"
],
```

```json
// tsconfig.build.json:1-8
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*.ts"],
  "exclude": ["test", "dist", "node_modules"]
}
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| API tests | `bun test test/api-fixtures.test.ts` | exit 0 |
| Build | `bun run build` | exit 0, dist contains declarations |
| Pack check | `bun run pack:dry-run` | exit 0, intended API files included |
| Full verification | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `src/index.ts`
- `README.md`
- `test/api-fixtures.test.ts`
- A new API smoke test if needed

**Out of scope**:

- Changing CLI behavior.
- Refactoring domain internals.
- Publishing a new release.

## Git workflow

- Branch: `advisor/011-define-public-api-surface`
- Commit message depends on decision:
  - `feat: expose programmatic api` if public API is supported.
  - `chore: mark api surface internal` if CLI-only is chosen.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Make an explicit API decision

Choose one path:

- Public API path: expose `./dist/index.js` and `./dist/index.d.ts` through `package.json.exports`.
- CLI-only path: document that `src/index.ts` is internal/test-facing and avoid advertising it.

Recommended: public API path, because `src/index.ts` already curates exports and tests exercise API fixtures.

**Verify**: no command; the selected path should be visible in the implementation.

### Step 2: If public, add package exports

Update `package.json` with an ESM export shape similar to:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

Do not remove `bin`.

**Verify**: `bun run build` -> exit 0 and `dist/index.d.ts` exists.

### Step 3: Clean up scaffold-only API if appropriate

`getCliBanner()` returns `skills-doctor: scaffold ready`, which looks like leftover scaffold API. If choosing public API, either remove it with tests updated or document it only if it has real value. Recommended: remove `getCliBanner()` and update `test/scaffold.test.ts` if it exists, unless doing so broadens scope too much.

**Verify**: `bun run typecheck` -> exit 0.

### Step 4: Add API usage documentation or internal note

If public API path:

- Add a short README section showing `import { scanSkillRoots, discoverSkillRoots } from "skills-doctor";`.
- Note that CLI remains the primary interface.

If CLI-only path:

- Add a short maintainer note that package API is not supported.

**Verify**: `bun run check` -> exit 0.

### Step 5: Add package API smoke coverage

Add or update a test to verify the package export shape after build if practical. If direct package self-import is awkward in Vitest before build, keep `test/api-fixtures.test.ts` focused on source API and rely on `bun run pack:dry-run` for packaging.

**Verify**: `bun test test/api-fixtures.test.ts` -> exit 0.

### Step 6: Run packaging and verification gates

**Verify**: `bun run pack:dry-run` -> exit 0 and package includes `dist/index.js` and `dist/index.d.ts`.

**Verify**: `bun run verify` -> exit 0.

## Test plan

- Existing API fixture tests must pass.
- Build must emit declarations.
- Pack dry-run must include intended API files.
- Full verification must pass.

## Done criteria

- [ ] `package.json` clearly either exposes or declines a programmatic API.
- [ ] README matches the decision.
- [ ] Scaffold-only exports are removed or intentionally retained.
- [ ] `bun run pack:dry-run` confirms package contents.
- [ ] `bun run verify` exits 0.

## STOP conditions

Stop and report if:

- The maintainer has not decided whether programmatic API should be supported and the codebase does not make it obvious.
- Removing scaffold exports breaks consumers outside visible tests.
- Package export changes conflict with Bun/Node ESM behavior.

## Maintenance notes

If the public API path is chosen, future changes to `src/index.ts` become semver-relevant. Reviewers should scrutinize exported types and avoid leaking unstable internals.
