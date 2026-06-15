# CLI_SPEC: Reusable TypeScript CLI Architecture

This document extracts the CLI architecture used in this repository into an
agnostic playbook for building production TypeScript CLIs on the same stack.
It is written for maintainers who want to reuse the patterns in another tool,
not for end users of this specific product.

The concrete source of truth is this repository. Product-specific nouns should
be replaced in new CLIs, but the structure, contracts, failure handling, output
discipline, and test matrix are reusable.

## Source Map

Use these files as implementation evidence when porting the architecture:

- Package and binary surface:
  - `packages/react-doctor/package.json`
  - `packages/react-doctor/bin/react-doctor.js`
  - `packages/react-doctor/src/cli/index.ts`
- Main command orchestration:
  - `packages/react-doctor/src/cli/commands/inspect.ts`
  - `packages/react-doctor/src/inspect.ts`
  - `packages/core/src/run-inspect.ts`
- Command registration and subcommands:
  - `packages/react-doctor/src/cli/commands/install.ts`
  - `packages/react-doctor/src/cli/commands/rules.ts`
  - `packages/react-doctor/src/cli/commands/version.ts`
  - `packages/react-doctor/src/cli/commands/why.ts`
- Runtime dependency wiring:
  - `packages/react-doctor/src/cli/utils/build-runtime-layers.ts`
  - `packages/core/src/services/progress.ts`
  - `packages/core/src/services/*.ts`
- Terminal and prompt adapters:
  - `packages/react-doctor/src/cli/utils/spinner.ts`
  - `packages/react-doctor/src/cli/utils/is-spinner-interactive.ts`
  - `packages/react-doctor/src/cli/utils/prompts.ts`
  - `packages/react-doctor/src/cli/utils/cli-logger.ts`
  - `packages/react-doctor/src/cli/utils/noop-console.ts`
  - `packages/react-doctor/src/cli/utils/write-stdout.ts`
- Machine-readable output:
  - `packages/react-doctor/src/cli/utils/json-mode.ts`
  - `packages/core/src/build-json-report.ts`
- Error handling and telemetry:
  - `packages/react-doctor/src/instrument.ts`
  - `packages/react-doctor/src/cli/utils/handle-error.ts`
  - `packages/react-doctor/src/cli/utils/report-error.ts`
  - `packages/react-doctor/src/cli/utils/build-run-context.ts`
  - `packages/react-doctor/src/cli/utils/build-sentry-scope.ts`
  - `packages/react-doctor/src/cli/utils/record-metric.ts`
  - `packages/react-doctor/src/cli/utils/scrub-sentry-event.ts`
  - `packages/react-doctor/src/cli/utils/scrub-sentry-metric.ts`
- Environment detection:
  - `packages/react-doctor/src/cli/utils/is-ci-environment.ts`
  - `packages/react-doctor/src/cli/utils/is-non-interactive-environment.ts`
  - `packages/react-doctor/src/cli/utils/should-skip-prompts.ts`
- Process and command execution:
  - `packages/react-doctor/src/cli/utils/run-command.ts`
  - `packages/react-doctor/src/cli/utils/is-command-available.ts`
  - `packages/react-doctor/src/cli/utils/guard-stdin.ts`
  - `packages/react-doctor/src/cli/utils/unref-stdin.ts`
  - `packages/react-doctor/src/cli/utils/exit-gracefully.ts`
- Optional install and agent handoff flows:
  - `packages/react-doctor/src/cli/utils/install-react-doctor.ts`
  - `packages/react-doctor/src/cli/utils/install-agent-hooks.ts`
  - `packages/react-doctor/src/cli/utils/handoff-to-agent.ts`
  - `packages/react-doctor/src/cli/utils/launch-agent.ts`
  - `packages/react-doctor/src/cli/utils/build-handoff-payload.ts`
- Regression tests that encode CLI guarantees:
  - `packages/react-doctor/tests/json-mode.test.ts`
  - `packages/react-doctor/tests/removed-cli-flags.test.ts`
  - `packages/react-doctor/tests/should-skip-prompts.test.ts`
  - `packages/react-doctor/tests/guard-stdin.test.ts`
  - `packages/react-doctor/tests/run-command.test.ts`
  - `packages/react-doctor/tests/is-ci-environment.test.ts`
  - `packages/react-doctor/tests/install-agent-hooks.test.ts`
  - `packages/react-doctor/tests/e2e/terminal-visuals.test.ts`

## Architecture Goals

The reusable architecture is built around these goals:

- The CLI entrypoint is thin and owns process setup, argument parsing, and the
  top-level error funnel.
- Command modules own user workflows and convert CLI flags into domain inputs.
- Domain orchestration is exposed as typed functions and Effect programs that
  can be called by the CLI, an API package, tests, editor integrations, or
  automation.
- Runtime dependencies are injected through Effect `Layer`s or explicit
  call-signature interfaces.
- Human terminal output, JSON output, telemetry, command execution, prompts,
  and spinners are adapters at the edge.
- Interactive behavior is disabled from one central non-interactive detector.
- Machine-readable output never shares stdout with logs, prompts, warnings, or
  spinners.
- Expected user errors are clean input/project errors; unexpected errors go
  through crash reporting and prefilled issue output.
- Long-running or fallible phases degrade gracefully when the core result can
  still be useful.

## Package And Binary Surface

Each published CLI package should expose a small bin shim and a compiled CLI
module.

Pattern:

```json
{
  "type": "module",
  "bin": {
    "my-cli": "./bin/my-cli.js"
  },
  "files": ["bin/**", "dist/**/*.js", "dist/**/*.d.ts", "dist/assets/**"],
  "exports": {
    ".": {
      "types": "./dist/cli.d.ts",
      "default": "./dist/cli.js"
    },
    "./api": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "engines": {
    "node": "^20.19.0 || >=22.13.0"
  }
}
```

The bin shim should:

1. Use `#!/usr/bin/env node`.
2. Enable Node's compile cache when available.
3. Fast-path stdio protocols before importing Commander, prompts, or spinner
   code.
4. Dynamically import the compiled CLI module for normal runs.

Template:

```js
#!/usr/bin/env node

import module from "node:module";

if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {}
}

if (process.argv[2] === "experimental-stdio-server") {
  const { startServer } = await import("../dist/server.js");
  startServer();
} else {
  await import("../dist/cli.js");
}
```

Fast-path any command that owns stdin/stdout as a protocol. Do not let the
general CLI layer touch stdin before an LSP, JSON-RPC, or other stdio transport
attaches.

## Recommended Module Layout

Use a package-local `src/cli/` tree for the shell and a separate domain package
or domain subtree for reusable logic.

```text
src/
  cli/
    index.ts                    # Commander setup and process bootstrap
    commands/
      main.ts                   # default command action
      install.ts                # optional setup command
      version.ts                # version/runtime command
    utils/
      apply-color-preference.ts
      build-runtime-layers.ts
      cli-logger.ts
      constants.ts
      guard-stdin.ts
      handle-error.ts
      is-ci-environment.ts
      is-non-interactive-environment.ts
      json-mode.ts
      normalize-help-command.ts
      prompts.ts
      removed-cli-flags.ts
      report-error.ts
      run-command.ts
      should-skip-prompts.ts
      spinner.ts
      strip-unknown-cli-flags.ts
      unref-stdin.ts
  index.ts                      # programmatic API facade
  instrument.ts                 # CLI-only telemetry initialization
domain/
  run-operation.ts              # Effect orchestration
  services/
    config.ts
    files.ts
    progress.ts
    reporter.ts
    ...
```

Keep the domain package free of Commander, prompts, ora, and Sentry SDK imports
unless telemetry is itself a domain service. This repo keeps `ora` in the CLI
package and exposes a generic `Progress` service to the core.

## Entrypoint Bootstrap

The CLI module is side-effectful by design. Its ordered bootstrap matters:

1. Initialize telemetry as early as possible.
2. Register signal handlers.
3. Unref stdin so a completed one-shot CLI can exit.
4. Guard stdin errors caused by disappearing terminals.
5. Build the Commander program.
6. Register commands and hidden compatibility flags.
7. Register stdout `EPIPE` handling.
8. Preprocess argv.
9. Apply color preference before help text renders.
10. Parse async.
11. Flush telemetry on success.
12. Funnel errors through one catch block.

Template:

```ts
initializeTelemetry();

process.on("SIGINT", exitGracefully);
process.on("SIGTERM", exitGracefully);
unrefStdin();
guardStdin();

const program = buildProgram();

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
});

const knownCommands = program.commands.flatMap((command) => [
  command.name(),
  ...command.aliases(),
]);
const strippedArgv = stripUnknownCliFlags(process.argv);

if (process.argv.includes("-V") && !strippedArgv.includes("-V")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

applyColorPreference(strippedArgv);
const argv = normalizeHelpInvocation(strippedArgv, knownCommands);

Promise.resolve()
  .then(() => assertNoRemovedFlags(process.argv))
  .then(() => program.parseAsync(argv))
  .then(() => flushTelemetry())
  .catch(async (error: unknown) => {
    const isUserError = isExpectedUserError(error);
    const eventId = isUserError ? undefined : await reportError(error);
    if (isJsonModeActive()) {
      writeJsonErrorReport(error, eventId);
      process.exit(1);
    }
    if (isUserError) {
      handleUserError(error);
      return;
    }
    handleError(error, { eventId });
  });
```

Why this order is important:

- Telemetry must be initialized before uncaught failures.
- Prompt libraries and spinners may re-reference stdin; unref it before and
  after prompts.
- Help output must honor `--no-color`, so color preference must be resolved
  before `program.parseAsync`.
- JSON mode needs a valid error report even if a later command throws.
- `EPIPE` should exit cleanly when output is piped to a consumer like `head`.

## Commander Program Construction

Use Commander for root commands and subcommands, but keep command action logic
outside the registration file.

Patterns used here:

- Root command has the default action.
- Subcommands are registered in the same file but implemented elsewhere.
- Help examples are generated by functions, not static strings, so color
  preference is applied before rendering.
- Deprecated aliases are hidden from help but still parsed when removing them
  would reinterpret following tokens.
- Repeatable options use an `argParser`.
- Colliding flags between root and subcommands use `optsWithGlobals()`.
- Stdio/protocol commands may be listed in help but fast-pathed in the bin shim.

Template:

```ts
const collectOption = (
  value: string,
  previousValues: string[] | undefined,
): string[] => [...(previousValues ?? []), value];

const program = new Command()
  .name("my-cli")
  .description("Do useful work")
  .version(VERSION, "-v, --version", "display the version number")
  .argument("[directory]", "directory to operate on", ".")
  .option("--json", "output one machine-readable JSON report")
  .option("--json-compact", "with --json, omit indentation")
  .option("-y, --yes", "skip prompts")
  .addOption(new Option("--category <name>", "filter category").argParser(collectOption))
  .addOption(new Option("--legacy [value]", "[deprecated] compatibility alias").hideHelp())
  .option("--color", "force colored output")
  .option("--no-color", "disable colored output")
  .addHelpText("after", renderRootHelpEpilog);

program.action(mainAction);

program
  .command("install")
  .alias("setup")
  .description("Install optional project integrations")
  .option("-y, --yes", "skip prompts")
  .option("--dry-run", "preview without writing files")
  .action(installAction);

const config = program.command("config").description("Manage configuration");

config
  .command("list")
  .option("--json", "output structured JSON")
  .action((_options, command) => configListAction(command.optsWithGlobals()));
```

Use a typed flags interface per command. Commander leaves many booleans as
`undefined`; treat that as useful signal. `undefined` means "the user did not
decide here", which lets config defaults win.

```ts
export interface MainFlags {
  json?: boolean;
  jsonCompact?: boolean;
  yes?: boolean;
  verbose?: boolean;
  color?: boolean;
  category?: string | string[];
  legacy?: boolean | string;
}
```

## Argument Preprocessing And Compatibility

This repo treats argv processing as part of the public contract.

Recommended preprocessing stages:

1. Strip unknown flags when the CLI intentionally allows users to paste noisy
   invocations or when a wrapper may forward extra options.
2. Reject removed flags before parsing so they produce clean migration errors
   instead of being silently stripped.
3. Normalize `help` and `help <command>` to Commander's `--help` form.
4. Handle special version aliases Commander cannot represent.
5. Keep `--` semantics intact; do not inspect flags after it.

Removed-flag behavior should throw a typed input error:

```ts
throw new CliInputError(
  "`--old-flag` was removed. Use `new-command <arg>` instead.",
);
```

The top-level error funnel should classify this as an expected user error, not
as a crash.

## Command Action Shape

Command actions should be thin workflow orchestrators:

1. Compute mode booleans.
2. Enable machine-readable output early.
3. Record invocation telemetry.
4. Validate flag combinations.
5. Resolve the target directory/project/config.
6. Resolve flags plus config into domain options.
7. Decide whether prompts are allowed.
8. Run domain operations.
9. Render human output or write JSON output.
10. Set `process.exitCode` for advisory/failure gates.
11. Offer optional follow-up prompts only after the main result is complete.
12. Catch errors and route through the same expected/unexpected split as the
    entrypoint.

Template:

```ts
export const mainAction = async (directory: string, flags: MainFlags): Promise<void> => {
  const isJsonMode = Boolean(flags.json);
  const isQuiet = isJsonMode || Boolean(flags.scoreOnly);
  const requestedDirectory = path.resolve(directory);
  const startTime = performance.now();

  if (isJsonMode) {
    enableJsonMode({ compact: Boolean(flags.jsonCompact), directory: requestedDirectory });
  }

  recordCount(METRIC.cliInvoked, 1, { command: "main" });

  try {
    validateModeFlags(flags);

    const target = await resolveTarget(requestedDirectory);
    setJsonReportDirectory(target.resolvedDirectory);

    if (!isQuiet) {
      await renderIntroOrHeader(flags);
    }

    const options = resolveCliOptions(flags, target.config);
    const skipPrompts = shouldSkipPrompts({ yes: flags.yes, json: flags.json });

    const results = await runSelectedProjects({ target, options, skipPrompts });

    finalizeResults({
      results,
      flags,
      isJsonMode,
      isQuiet,
      startTime,
      directory: target.resolvedDirectory,
    });

    if (canOfferFollowUp({ isQuiet, skipPrompts, results })) {
      await offerFollowUp(results);
    }
  } catch (error) {
    const isUserError = isExpectedUserError(error);
    const eventId = isUserError ? undefined : await reportError(error);
    if (isJsonMode) {
      writeJsonErrorReport(error, eventId);
      process.exitCode = 1;
      return;
    }
    if (isUserError) {
      handleUserError(error);
      return;
    }
    handleError(error, { eventId });
  }
};
```

## Flag, Config, And Prompt Precedence

The reusable precedence model is:

1. Explicit CLI flags.
2. Deprecated CLI aliases, with warning.
3. Config file values.
4. Deprecated config aliases, with warning.
5. Interactive prompt, only for human TTY sessions.
6. Conservative default.

Use pure resolver functions that do not perform domain work. Example:

```ts
export interface RequestedMode {
  readonly mode: "full" | "files" | "changed" | "lines" | undefined;
  readonly base: string | undefined;
  readonly usedDeprecatedAlias: boolean;
}

export const resolveRequestedMode = (
  flags: MainFlags,
  config: UserConfig | null,
): RequestedMode => {
  const base = flags.base ?? config?.base;

  if (isMode(flags.mode)) {
    return { mode: flags.mode, base, usedDeprecatedAlias: false };
  }

  const deprecatedFlag = coerceDeprecatedMode(flags.diff);
  if (deprecatedFlag) {
    return {
      mode: deprecatedFlag.mode,
      base: base ?? deprecatedFlag.base,
      usedDeprecatedAlias: true,
    };
  }

  if (isMode(config?.mode)) {
    return { mode: config.mode, base, usedDeprecatedAlias: false };
  }

  const deprecatedConfig = coerceDeprecatedMode(config?.diff);
  if (deprecatedConfig) {
    return {
      mode: deprecatedConfig.mode,
      base: base ?? deprecatedConfig.base,
      usedDeprecatedAlias: true,
    };
  }

  return { mode: undefined, base, usedDeprecatedAlias: false };
};
```

Then finalize against runtime facts:

```ts
export const finalizeMode = async ({
  requested,
  diffInfo,
  skipPrompts,
  isQuiet,
}: FinalizeModeInput): Promise<Mode> => {
  if (requested.mode !== undefined) {
    if (requested.mode === "full") return "full";
    if (diffInfo !== null) return requested.mode;
    if (!isQuiet) warn("Could not compute diff. Running full operation.");
    return "full";
  }

  if (diffInfo === null || skipPrompts || isQuiet) return "full";

  const answer = await prompts({
    type: "select",
    name: "mode",
    message: "Choose what to process",
    choices: [
      { title: "Full project", value: "full" },
      { title: "Changed files", value: "changed" },
    ],
  });

  return answer.mode === "changed" ? "changed" : "full";
};
```

## Non-Interactive Detection

Centralize all decisions about prompts and animation.

Reusable rules:

- `--yes` skips prompts.
- `--json` skips prompts.
- Non-TTY stdin skips prompts.
- CI env vars skip prompts.
- Git hook env vars skip prompts.
- Coding-agent subprocess env vars skip prompts.

Keep CI detection and non-interactive detection separate. CI affects reporting,
share links, and scoring metadata. Non-interactive affects prompts and spinner
animation.

Template:

```ts
export const isCiEnvironment = (): boolean =>
  ["GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI"].some((name) => Boolean(process.env[name])) ||
  isTruthyCi(process.env.CI);

export const isCodingAgentEnvironment = (): boolean =>
  detectCodingAgent() !== null;

export const isNonInteractiveEnvironment = (): boolean =>
  [
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "BUILDKITE",
    "JENKINS_URL",
    "TF_BUILD",
    "CODEBUILD_BUILD_ID",
    "TEAMCITY_VERSION",
    "BITBUCKET_BUILD_NUMBER",
    "CIRCLECI",
    "TRAVIS",
    "DRONE",
    "GIT_DIR",
  ].some((name) => Boolean(process.env[name])) || isCodingAgentEnvironment();

export const shouldSkipPrompts = (input: { yes?: boolean; json?: boolean } = {}): boolean =>
  Boolean(input.yes) ||
  Boolean(input.json) ||
  isNonInteractiveEnvironment() ||
  !process.stdin.isTTY;
```

Do not treat API keys or config-path env vars as agent execution markers. This
repo intentionally ignores variables such as `OPENAI_API_KEY` because a stored
key does not mean the process is running inside an agent.

## Prompt Adapter

Wrap the prompt library instead of importing it at call sites.

Responsibilities:

- Provide one cancel behavior.
- Patch or adapt library behavior once.
- Re-unref stdin after every prompt.
- Allow tests to pass a replacement prompt function.

Pattern:

```ts
export interface CliPromptOptions {
  readonly onCancel?: () => void;
}

const onCancel = () => {
  logger.break();
  logger.log("Cancelled.");
  logger.break();
  process.exit(0);
};

export const prompts = <T extends string = string>(
  questions: PromptObject<T> | PromptObject<T>[],
  options: CliPromptOptions = {},
): Promise<Answers<T>> => {
  patchPromptLibraryOnce();
  return basePrompts(questions, {
    onCancel: options.onCancel ?? onCancel,
  }).finally(unrefStdin);
};
```

This repo patches multiselect so:

- Toggle-all only toggles enabled choices.
- Submit auto-selects the current choice when that is the obvious user intent.
- Prompt cancellation exits cleanly by default.

In new CLIs, keep library monkey patches isolated in this adapter. Do not let
feature modules reach into prompt internals.

## Machine-Readable Output Mode

JSON mode is a process-wide one-shot mode. It must be enabled before any code
path can print incidental output.

Contract:

- JSON report goes to stdout.
- Human output is silenced or redirected to stderr.
- Error output is also a valid JSON report.
- There is a hardcoded valid JSON fallback if error serialization itself fails.
- Context tracks directory, mode, compact formatting, and start time.

Template:

```ts
interface JsonModeContext {
  compact: boolean;
  startTime: number;
  directory: string;
  mode: JsonReportMode;
}

let context: JsonModeContext | null = null;

export const enableJsonMode = ({ compact, directory }: EnableJsonModeInput): void => {
  context = { compact, directory, startTime: performance.now(), mode: "full" };
  installSilentConsole();
};

export const writeJsonReport = (report: JsonReport): void => {
  const serialized = context?.compact ? JSON.stringify(report) : JSON.stringify(report, null, 2);
  process.stdout.write(`${serialized}\n`);
};

export const writeJsonErrorReport = (error: unknown, eventId?: string | null): void => {
  if (!context) return;
  try {
    writeJsonReport(buildJsonReportError({ ...context, error, eventId }));
  } catch {
    process.stdout.write(
      '{"schemaVersion":1,"ok":false,"error":{"message":"Internal error","name":"Error","chain":[]}}\n',
    );
  }
};
```

This repo currently patches `globalThis.console` for JSON mode because parts of
the command body are still imperative. Effect-typed paths use
`Effect.provideService(Console.Console, makeNoopConsole())`. Prefer migrating
toward the Effect Console route, but keep JSON mode robust while imperative
call sites exist.

## Console And Logger

Use Effect's `Console` as the canonical output sink inside Effect programs.
Provide a thin synchronous bridge for imperative helpers.

Pattern:

```ts
export const cliLogger = {
  log: (message: string): void => Effect.runSync(Console.log(message)),
  warn: (message: string): void => Effect.runSync(Console.warn(highlighter.warn(message))),
  error: (message: string): void => Effect.runSync(Console.error(highlighter.error(message))),
  info: (message: string): void => Effect.runSync(Console.info(highlighter.info(message))),
  dim: (message: string): void => Effect.runSync(Console.log(highlighter.gray(message))),
  success: (message: string): void => Effect.runSync(Console.log(highlighter.success(message))),
  break: (): void => Effect.runSync(Console.log("")),
} as const;
```

Do not create a parallel logger service when the only need is terminal output.
Use a no-op `Console.Console` for silent mode and tests:

```ts
export const makeNoopConsole = (): Console.Console => ({
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  // include every method Effect's Console shape requires
});
```

Use raw `process.stdout.write` only for in-place terminal animation or cursor
movement that `Console.log` cannot express.

## Loading UI And Progress

The reusable loading model has two layers:

1. CLI adapter: `spinner(text).start()` wraps `ora`.
2. Domain service: `Progress` exposes `start`, `update`, `succeed`, `fail`, and
   `stop` without depending on `ora`.

Spinner adapter rules:

- Render to stderr.
- Disable animation unless stderr is a real interactive TTY with a positive
  column count.
- Disable animation in CI, coding agents, git hooks, and `TERM=dumb`.
- Set `discardStdin: false` so Ctrl-C still reaches signal handlers.
- Make finalization idempotent.
- Support global silent mode by returning a no-op handle.

Template:

```ts
export const spinner = (text: string) => ({
  start() {
    if (isSilent) return noopHandle;

    const stream = process.stderr;
    const isEnabled = isSpinnerInteractive(stream);
    const instance = ora({
      text,
      indent: SPINNER_INDENT_CHARS,
      isEnabled,
      stream,
      discardStdin: false,
    });

    if (isEnabled) instance.start();

    let didFinalize = false;
    return {
      update(displayText: string) {
        if (!didFinalize) instance.text = displayText;
      },
      succeed(displayText: string) {
        if (didFinalize) return;
        didFinalize = true;
        instance.succeed(displayText);
      },
      fail(displayText: string) {
        if (didFinalize) return;
        didFinalize = true;
        instance.fail(displayText);
      },
      stop() {
        if (didFinalize) return;
        didFinalize = true;
        instance.stop();
      },
    };
  },
});
```

Domain progress service:

```ts
export interface ProgressHandle {
  readonly update: (text: string) => Effect.Effect<void>;
  readonly succeed: (text: string) => Effect.Effect<void>;
  readonly fail: (text: string) => Effect.Effect<void>;
  readonly stop: () => Effect.Effect<void>;
}

export class Progress extends Context.Service<Progress, {
  readonly start: (text: string) => Effect.Effect<ProgressHandle>;
}>()("my-cli/Progress") {
  static readonly layerOra = (factory: (text: string) => ProgressHandle) =>
    Layer.succeed(Progress, Progress.of({ start: (text) => Effect.sync(() => factory(text)) }));

  static readonly layerNoop = Layer.succeed(
    Progress,
    Progress.of({
      start: () =>
        Effect.succeed({
          update: () => Effect.void,
          succeed: () => Effect.void,
          fail: () => Effect.void,
          stop: () => Effect.void,
        }),
    }),
  );
}
```

For multi-project or concurrent runs, suppress per-project spinners and render
one aggregate spinner around the bounded pool. Per-project spinner output will
interleave and corrupt the terminal.

## Runtime Dependency Injection

The domain operation is an Effect program with services for IO, config, project
discovery, external engines, progress, reporting, scoring, and other side
effects.

The CLI builds production layers based on flags and environment:

```ts
export const buildRuntimeLayers = (input: BuildRuntimeLayersInput) => {
  const linterLayer = input.shouldSkipLint ? Linter.layerOf([]) : Linter.layerNode;
  const analysisLayer = input.shouldRunAnalysis ? Analysis.layerNode : Analysis.layerOf([]);
  const scoreLayer = input.shouldComputeScore ? Score.layerHttp : Score.layerOf(null);
  const progressLayer = input.shouldShowProgressSpinners
    ? Progress.layerOra(buildSpinnerProgressHandle)
    : Progress.layerNoop;
  const configLayer = input.hasConfigOverride
    ? Config.layerOf({
        config: input.userConfig,
        resolvedDirectory: input.directory,
        configSourceDirectory: input.configSourceDirectory,
      })
    : Config.layerNode;

  return Layer.mergeAll(
    Project.layerNode,
    configLayer,
    Files.layerNode,
    Git.layerNode,
    linterLayer,
    analysisLayer,
    progressLayer,
    Reporter.layerNoop,
    scoreLayer,
  );
};
```

This gives each CLI mode a clear runtime shape:

- Full interactive run: real engines, real progress, real scoring.
- JSON mode: real engines, no human console, no spinner.
- Score-only mode: minimal output, no spinner.
- Baseline/comparison run: synthetic files, no progress, no telemetry side
  effects, temp cleanup.
- Tests: in-memory or capture layers.

## Domain Orchestration

The core operation should be a single composable Effect that returns a structured
result and records non-fatal phase failures in fields rather than throwing when
partial output is still useful.

Reusable phase structure:

1. Resolve config.
2. Discover target/project metadata.
3. Fail early with a typed expected error if the target is not applicable.
4. Fetch cheap metadata concurrently.
5. Start optional background fibers for slow metadata.
6. Compute include paths or work units.
7. Run a `beforeWork` hook for CLI rendering/telemetry.
8. Run environment or preflight checks.
9. Run primary analysis as a stream.
10. Apply per-item transformation/filtering.
11. Emit items to a reporter service.
12. Capture primary analysis failure as non-fatal state when possible.
13. Run secondary analysis only when useful.
14. Finalize progress.
15. Finalize reporter.
16. Join background metadata fibers.
17. Compute score/summary from the filtered output.
18. Return a typed output object.

Skeleton:

```ts
export const runOperation = <HooksR = never>(
  input: OperationInput,
  hooks: OperationHooks<HooksR> = {},
): Effect.Effect<OperationOutput, AppError, Services | HooksR> =>
  Effect.gen(function* () {
    const configService = yield* Config;
    const projectService = yield* Project;
    const analyzerService = yield* Analyzer;
    const progressService = yield* Progress;
    const reporterService = yield* Reporter;

    const resolvedConfig = yield* configService.resolve(input.directory);
    const project = yield* projectService.discover(resolvedConfig.resolvedDirectory);

    if (!isSupportedProject(project)) {
      return yield* new AppError({ reason: new UnsupportedProject({ directory: input.directory }) });
    }

    yield* (hooks.beforeWork ?? (() => Effect.void))(project);

    const progress = yield* progressService.start("Scanning...");
    const failure = yield* Ref.make<{ didFail: boolean; reason: string | null }>({
      didFail: false,
      reason: null,
    });

    const rawStream = analyzerService.run({ project }).pipe(
      Stream.catchTag("AppError", (error) =>
        Stream.unwrap(
          Effect.gen(function* () {
            yield* Ref.set(failure, { didFail: true, reason: error.message });
            return Stream.empty;
          }),
        ),
      ),
    );

    const collected = yield* Stream.runCollect(
      rawStream.pipe(
        Stream.filterMap(filterMapNullable(transformItem)),
        Stream.tap((item) => reporterService.emit(item)),
      ),
    );

    const failureState = yield* Ref.get(failure);
    if (failureState.didFail) {
      yield* progress.fail("Scanning failed (non-fatal).");
    } else {
      yield* progress.succeed(`Scanned ${collected.length} items`);
    }

    yield* reporterService.finalize;

    return {
      project,
      items: [...collected],
      didFail: failureState.didFail,
      failureReason: failureState.reason,
    };
  }).pipe(Effect.withSpan("runOperation", { attributes: { "operation.directory": input.directory } }));
```

## Public API Facade

Expose a programmatic API that reuses the same domain operation but does not
initialize CLI-only telemetry, prompts, or spinners.

Pattern:

- `src/cli/index.ts` is side-effectful and only for the binary.
- `src/index.ts` exports types, pure helpers, and programmatic functions.
- Provide cache-clear hooks for long-running consumers when the domain caches
  project/config/file metadata at module scope.
- Provide helpers to convert programmatic results into the same JSON report
  schema used by the CLI.

Template:

```ts
export type {
  Diagnostic,
  JsonReport,
  ProjectInfo,
  OperationOptions,
  OperationResult,
};

export { defineConfig, summarizeDiagnostics };
export { runProgrammaticOperation } from "@my-cli/api";

export const clearCaches = (): void => {
  clearProjectCache();
  clearConfigCache();
  clearPackageJsonCache();
};

export const toJsonReport = (result: OperationResult, options: ToJsonReportOptions): JsonReport =>
  buildJsonReport({
    version: options.version,
    directory: options.directory ?? result.project.rootDirectory,
    mode: options.mode ?? "full",
    results: [result],
    elapsedMilliseconds: result.elapsedMilliseconds,
  });
```

## Result Finalization And Exit Codes

Finalization should be centralized and shared by all branches that produce
results.

Responsibilities:

- Apply final filters used only by the selected output mode.
- Write a JSON report if JSON mode is active.
- Aggregate multi-project metadata.
- Detect degraded comparison modes.
- Set `process.exitCode` instead of calling `process.exit` after successful
  command completion.
- Skip gates when attribution is uncertain.

Template:

```ts
const finalizeResults = (input: FinalizeInput): void => {
  const comparisonComputed =
    input.results.length > 0 &&
    input.results.every((result) => result.comparisonDelta !== undefined);
  const comparisonDegraded = input.comparisonIntended && !comparisonComputed;
  const mode = comparisonDegraded ? "diff" : input.mode;

  if (input.isJsonMode) {
    writeJsonReport(
      buildJsonReport({
        version: VERSION,
        directory: input.directory,
        mode,
        results: input.results,
        elapsedMilliseconds: performance.now() - input.startTime,
      }),
    );
  }

  if (input.isScoreOnly || comparisonDegraded) return;

  const failureItems = filterForSurface(input.results, "ciFailure");
  if (shouldBlockCi(failureItems, resolveBlockingLevel(input.flags, input.config))) {
    process.exitCode = 1;
  }
};
```

Prefer `process.exitCode = 1` when the command completed and produced output.
Use `process.exit(1)` for unrecoverable top-level failures after rendering.

## Comparison, Diff, And Scoped Runs

The reusable pattern for partial runs:

- Resolve the user-requested scope without doing git or filesystem work.
- Compute runtime diff metadata only if needed by flags or possible prompts.
- If requested scope needs diff metadata but none exists, warn and fall back to
  full.
- For "changed/new-only" modes, run a second silent baseline operation against
  materialized base files.
- If the baseline operation fails or produces unreliable attribution, degrade to
  a plain changed-files mode and skip failure gating.
- For line-level modes, filter final diagnostics after primary analysis using
  changed line ranges.
- Always clean up temp directories in `finally`.

This structure is useful for any CLI that compares current output with a base
state, not only code scanners.

## Temporary Snapshots And Cleanup

When scanning staged files or baseline content, materialize a synthetic tree and
cleanup reliably:

```ts
const tempDirectory = fs.mkdtempSync(path.join(tmpdir(), TEMP_PREFIX));
const snapshot = await materializeSnapshot({ tempDirectory }).catch((error: unknown) => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  throw error;
});

try {
  const result = await runOperation(snapshot.tempDirectory, options);
  return remapResultPaths(result, snapshot.tempDirectory, realDirectory);
} finally {
  snapshot.cleanup();
}
```

Rules:

- Remove the temp directory if snapshot creation fails before a cleanup handle
  exists.
- Use `finally` once a cleanup handle exists.
- Remap absolute paths in returned diagnostics/results to the real project root.
- Copy enough config files into the snapshot for tools to resolve settings the
  same way they would in the real tree.

## Multi-Project Runs

For workspace CLIs, separate project selection from project execution.

Pattern:

- Resolve the root target once.
- Select project directories from flags/config/prompts.
- For each project, resolve its own target/config.
- Merge root and project config deliberately.
- Run single-project mode serially.
- Run multi-project mode with bounded concurrency.
- Suppress per-project rendering during concurrent scans.
- Render one aggregate summary at the end.

Template:

```ts
const isMultiProject = projectDirectories.length > 1;
const batchSpinner = isMultiProject && !isQuiet
  ? spinner(`Processing ${projectDirectories.length} projects...`).start()
  : null;

let finishedProjectCount = 0;
let outcomes: ReadonlyArray<ProjectOutcome | null>;

try {
  outcomes = await mapWithConcurrency(
    projectDirectories,
    isMultiProject ? DEFAULT_PROJECT_CONCURRENCY : 1,
    async (projectDirectory) => {
      const outcome = await runProject(projectDirectory, {
        suppressRendering: isMultiProject,
        concurrentRun: isMultiProject,
      });
      finishedProjectCount += 1;
      batchSpinner?.update(
        `Processing ${projectDirectories.length} projects (${finishedProjectCount}/${projectDirectories.length})`,
      );
      return outcome;
    },
  );
} finally {
  batchSpinner?.stop();
}
```

Do not let concurrent workers mutate process-global run state, spinner-silent
state, or telemetry project context. Either suppress those side effects in
workers or have the pool owner manage them.

## Output Rendering

Human rendering in this repo follows these reusable rules:

- Render intro/header only for non-quiet modes.
- Prefer an animated welcome only for interactive terminals; skip for verbose
  power-user modes.
- Use a static header when animation is unavailable.
- Render detailed findings before summary/footer.
- Use terminal-width-aware wrapping and visual regression tests.
- Use `Console` effects so output can be captured or silenced in tests.
- Write dump paths to stderr when stdout is reserved for JSON.
- Keep verbose output behind an explicit flag.

For terminal visuals, test bytes through a real terminal emulator rather than
only snapshotting raw strings. Raw strings do not reveal soft wraps, cursor
movement, box drawing, or double-width glyph issues.

## Handoff And Follow-Up Flows

The general post-result follow-up pattern:

1. Finish rendering the main result first.
2. Gate follow-up prompts on interactive human mode.
3. Ask one decision at a time.
4. Build a compact payload from top result groups.
5. Write full results to disk for follow-up.
6. Let the user choose a launch target, clipboard, or skip.
7. Best-effort install supporting assets before launch.
8. Spawn the selected tool with `stdio: "inherit"` and project cwd.
9. Fall back to printing the payload if launch/copy fails.

Generic launch template:

```ts
const TOOL_BINARIES = {
  assistantA: "assistant-a",
  assistantB: "assistant-b",
} as const;

const TOOL_AUTO_FLAGS = {
  assistantA: ["--auto"],
  assistantB: ["--yolo"],
} as const;

export const launchTool = async (
  toolId: keyof typeof TOOL_BINARIES,
  prompt: string,
  cwd: string,
): Promise<number> => {
  const binary = TOOL_BINARIES[toolId];
  const args = [...TOOL_AUTO_FLAGS[toolId], prompt];
  return spawnInherited(binary, args, cwd);
};
```

On Windows, avoid passing multiline prompts through `.cmd` wrappers with
`shell: true`. This repo parses the `.cmd` wrapper to find the underlying JS
entry script and spawns `process.execPath` directly.

## Payload Construction

The reusable payload builder groups findings, keeps the prompt small, and
writes complete results to disk.

Algorithm:

1. Group result items by stable key.
2. Sort groups by priority if available, otherwise preserve stable scan order.
3. Keep the top N groups inline.
4. Write complete results to an output directory.
5. Include the output directory path in the prompt.
6. Include verification instructions.
7. Include "do not suppress/ignore" guidance when applicable.

Template:

```ts
export const buildHandoffPayload = (input: HandoffPayloadInput): string => {
  const topGroups = buildSortedGroups(input.items).slice(0, TOP_GROUP_COUNT);
  const outputDirectory = writeResultsDirectory([...input.items], input.outputDirectory);

  const lines: string[] = [
    `Fix the top ${topGroups.length} issues in ${input.projectName} on this pass.`,
    "",
  ];

  topGroups.forEach(([groupKey, groupItems], index) => {
    const representative = groupItems[0]!;
    lines.push(
      `${index + 1}. ${representative.severity.toUpperCase()} ${representative.category}: ${representative.title ?? groupKey} (x${groupItems.length})`,
      `   ${representative.message}`,
    );

    for (const filePath of uniqueFiles(groupItems).slice(0, MAX_FILES_PER_GROUP)) {
      lines.push(`   - ${filePath}`);
    }
  });

  lines.push(
    "",
    `Full results: ${outputDirectory}`,
    "",
    "Read each file and fix the root cause. Do not suppress or silence the finding.",
    "Verify against the real tool before moving on.",
  );

  return lines.join("\n");
};
```

Keep payload generation pure except for the explicit full-results write, and
catch output-directory failures if handoff should still proceed with inline
content.

## Install And Onboarding Commands

An install/setup command is a separate workflow from the main analysis command.
It can still reuse the same prompt, spinner, command-runner, and telemetry
adapters.

Reusable install flow:

1. Resolve project root, usually nearest package directory.
2. Locate bundled assets in `dist`.
3. Detect installed tools/integrations.
4. Exit cleanly if no supported targets exist.
5. Determine whether prompts are skipped.
6. Offer high-leverage setup first.
7. Ask target selection.
8. Perform core install writes.
9. Perform optional setup writes.
10. Print dry-run plans without writing.
11. Record install metrics.

Dependency install pattern:

- Read `packageManager` from nearest `package.json`.
- Fall back to nearest lockfile.
- Fall back to npm.
- Use an injectable runner in tests.
- Treat known package-manager trust policy failures as soft skips when the CLI
  can still work through an on-demand runner.

Command mapping:

```text
npm  -> npm install --save-dev <package>@latest
yarn -> yarn add --dev <package>@latest
bun  -> bun add --dev <package>@latest
pnpm -> pnpm add --save-dev [-w] <package>@latest
```

## Native Hook Installation

For CLIs that integrate with coding-agent hooks or git hooks:

- Preserve existing user config.
- Add only one hook entry; repeated installs must be idempotent.
- Write generated hook scripts with executable mode.
- Resolve project root from environment when the host provides it; otherwise
  derive it from the hook script location.
- Filter hook events so expensive work only runs after relevant tools/actions.
- Prefer local project binary, then global binary, then package-runner fallback.
- Emit host-specific JSON context only when there is useful output.
- Exit quietly when the CLI runner is unavailable.

Shell script shape:

```sh
#!/bin/sh
set -u

input_file=$(mktemp "${TMPDIR:-/tmp}/my-cli-hook.XXXXXX")
output_file=$(mktemp "${TMPDIR:-/tmp}/my-cli-hook-output.XXXXXX")
trap 'rm -f "$input_file" "$output_file"' EXIT
cat > "$input_file"

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
project_root=${HOST_PROJECT_DIR:-}
if [ -z "$project_root" ]; then
  project_root=$(CDPATH= cd "$script_dir/../.." && pwd)
fi

if ! cd "$project_root"; then
  exit 0
fi

if ./node_modules/.bin/my-cli --changed --no-telemetry > "$output_file" 2>&1; then
  exit 0
fi

node - "$input_file" "$output_file" <<'NODE'
const fs = require("node:fs");
const output = fs.readFileSync(process.argv[3], "utf8").trim();
if (!output) process.exit(0);
console.log(JSON.stringify({ additional_context: output }));
NODE
```

## Command Execution

Use `execFile`, not shell strings, for normal subprocesses.

Contract:

- Return `{ success, stdout, stderr }`.
- Capture output so it does not interleave with spinners.
- Trim captured output.
- Report missing binaries and non-zero exits as `success: false`.
- Support optional timeout.
- Inject the runner into helpers that call git, gh, package managers, or other
  external commands.

Template:

```ts
export interface RunCommandResult {
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  (
    command: string,
    args: ReadonlyArray<string>,
    cwd: string,
    timeoutMs?: number,
  ): Promise<RunCommandResult>;
}

export const runCommand: CommandRunner = async (command, args, cwd, timeoutMs) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
    });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return {
      success: false,
      stdout: (failure.stdout ?? "").trim(),
      stderr: (failure.stderr ?? "").trim(),
    };
  }
};
```

Use `spawn(..., { stdio: "inherit" })` only when intentionally handing the TTY
to another interactive process.

## Binary Detection

Use a shared PATH resolver for "is this command available?"

Rules:

- Split `PATH` on `path.delimiter`.
- On Windows, try `PATHEXT` extensions.
- On non-Windows, require executable bit.
- Treat a command that already has an extension as exact.

This keeps launch menus, install flows, clipboard support, and fallback logic
consistent.

## Error Taxonomy

Use three error classes conceptually:

1. Expected user/input errors.
2. Typed domain errors.
3. Unexpected defects.

Expected user errors render as a direct message with no crash-report framing.
Examples in this repo include bad command input, missing project shape, and
unavailable diff bases.

Unexpected errors render:

- generic "something went wrong" text
- prefilled issue URL
- support URL
- telemetry event reference when available
- formatted error chain

Effect domain errors should be tagged so renderers dispatch on structured
reason tags, not message substring checks.

Top-level policy:

```ts
const isUserError = isExpectedUserError(error);
const eventId = isUserError ? undefined : await reportError(error);

if (isJsonModeActive()) {
  writeJsonErrorReport(error, eventId);
  process.exit(1);
}

if (isUserError) {
  handleUserError(error);
  return;
}

handleError(error, { eventId });
```

## Telemetry And Observability

Telemetry is CLI-only. Programmatic API imports must not initialize the SDK.

Initialization rules:

- Initialize from `src/cli/index.ts`, not from API exports.
- Disable when telemetry opt-out flags are present in raw argv.
- Disable in tests.
- Read environment overrides for DSN, environment, release, sample rate, and
  debug.
- Set `sendDefaultPii: false`.
- Scrub every outgoing event, transaction, and metric.
- Flush on success and error paths.
- Swallow telemetry transport failures.

Run context:

- Build lazily from process state.
- Include version, run id, origin, command, scrubbed argv, scrubbed cwd, Node,
  platform, CI provider, coding-agent provider, interactivity, JSON mode, and
  package manager used to invoke the CLI.
- Keep unique run ids out of tags to avoid cardinality explosion.
- Add project context only after discovery.

Metrics:

- No-op unless SDK is initialized.
- Merge run/project attributes per emit, not once at init.
- Drop null/undefined attributes.
- Keep high-cardinality values as attributes only when the backend can handle
  them; never encode them into metric names.

Effect spans:

- Wrap top-level operations in `Effect.withSpan`.
- Add per-service spans with `Effect.fn("Service.method")` where useful.
- Apply a CLI observability layer around the Effect program so OTLP, Sentry, or
  no-op tracing are swappable.

## Privacy And Scrubbing

Reusable scrubbing requirements:

- Remove hostnames, IPs, device names, and stack-frame locals.
- Scrub home-directory paths and usernames from strings.
- Redact secrets and emails.
- Apply scrubbing to messages, frames, contexts, extras, tags, breadcrumbs,
  span attributes, and metric attributes.
- Return `null` from SDK hooks if scrubbing fails so raw data is not sent.
- Do not tag per-run unique ids.
- Prefer project shape metadata over repository identity.

## Caching

This repo caches scan results and project/config metadata for performance.
Reusable cache rules:

- Build a cache key from tool version, target directory, runtime binary path,
  resolved options, config source, and config content.
- Do not cache partial or unreliable payloads.
- Store bounded entries.
- Clear cache/state between programmatic runs when long-running callers ask.
- Never let concurrent workers clear or overwrite process-global run state.

## State Management

Process-global state exists in several edge adapters:

- JSON mode context.
- Spinner silent flag.
- Onboarding completion.
- Sentry run/project context.
- Active run trace.
- Scan result cache.

Rules:

- Keep each global behind a small module.
- Provide reset or restore functions when tests or repeated programmatic calls
  need them.
- In concurrent runs, have only the pool owner mutate global UI state.
- Clear telemetry project/run state after successful non-concurrent operations.
- Leave error state available until error reporting has attached it.

## Configuration Migration

If the CLI migrates old config files:

- Only mutate in interactive human runs.
- Never mutate in JSON, score-only, CI, coding-agent, pre-commit, or non-TTY
  modes.
- Migrate before config is loaded by the main operation, so the run uses the new
  file.
- Print a concise success message and ask the user to review and commit.
- Keep legacy config loading as a deprecated fallback for unattended runs.

Guard:

```ts
const isInteractiveHumanRun =
  !isQuiet &&
  !isStaged &&
  process.stdout.isTTY === true &&
  !isCiOrCodingAgentEnvironment();

if (isInteractiveHumanRun) {
  maybeMigrateLegacyConfig(requestedDirectory);
}
```

## Color And Terminal Width

Reusable terminal rules:

- Honor `--color`, `--no-color`, and `NO_COLOR`.
- Resolve color preference before help text renders.
- Use highlighter helpers rather than inline ANSI codes.
- Keep animations behind `canAnimate` checks.
- Measure terminal width before rendering boxes, code frames, or wrapped prose.
- Keep one-column right-edge safety for in-place redraws.
- Test across common terminal widths with a headless terminal emulator.

## Stdin, Signals, And Process Exit

Stdin handling:

- Call `unrefStdin()` during bootstrap.
- Prompt wrappers should call it again after every prompt.
- Register `guardStdin()` before any prompt can read raw mode.
- On `read EIO` or `read ENXIO`, exit with terminal-hangup code.
- Re-throw other stdin errors so they reach crash reporting.

Signal handling:

- `SIGINT` and `SIGTERM` route through a graceful exit helper.
- JSON mode cancellation should still produce valid JSON if possible.
- Spinners should not swallow Ctrl-C; set `discardStdin: false`.

Exit code policy:

- Use POSIX-style `130` for Ctrl-C.
- Use a hangup-specific code for terminal disappearance.
- Use `process.exitCode` for completed runs that should fail CI.
- Use `process.exit(1)` after rendering unrecoverable top-level errors.

## File And Path Handling

Reusable rules:

- Resolve user-provided root directories immediately.
- Use project-relative paths for display when possible.
- Normalize forward slashes when matching diagnostics to git diff paths.
- Keep config source directory separate from resolved scan directory.
- When plugins/config entries are relative, resolve against the config file
  directory, not necessarily the post-root-redirect target.
- In synthetic temp trees, remap absolute result paths back to real roots before
  final output.

## Testing Matrix

Port this test matrix to new CLIs on the same stack.

Entrypoint and argv:

- Help normalization.
- Unknown flag stripping.
- Removed flags throw typed input errors.
- `-V` alias if used.
- Hidden deprecated aliases still parse values correctly.
- Root/subcommand global option collisions use merged opts.

JSON mode:

- Starts inactive.
- Emits compact and indented JSON.
- Error report uses updated directory and mode.
- Serialization failure still emits valid fallback JSON.
- Human output does not corrupt stdout.

Prompts and non-interactive mode:

- Prompts allowed in TTY with no env signals.
- `--yes`, `--json`, non-TTY stdin, CI, coding agent, and `GIT_DIR` skip prompts.
- Prompt cancel exits cleanly or returns to caller when custom `onCancel` is used.

Spinner and terminal:

- Spinner no-ops when silent.
- Spinner disables animation for non-TTY, zero-width TTY, `TERM=dumb`, CI, git
  hooks, and agent shells.
- Spinner finalization is idempotent.
- Ctrl-C is not swallowed while spinner runs.
- Terminal visual output does not soft-wrap across supported widths.

Command execution:

- Successful command captures stdout/stderr.
- Non-zero exit returns `success: false`.
- Missing binary returns `success: false`.
- Timeout kills hung command quickly.

Environment detection:

- CI providers detected.
- Coding-agent markers detected.
- Tool config/API key env vars do not count as active agents.
- Official action or hosted integration marker detected if applicable.

Domain operation:

- Service layers can be swapped for no-op/capture/in-memory layers.
- Non-fatal analyzer failures surface in output state.
- Progress events are captured in tests without mocking ora.
- Baseline/comparison temp directories clean up on success and failure.
- Concurrent runs do not corrupt global state.

Install/handoff:

- Install preserves existing config.
- Repeated installs are idempotent.
- Dry run writes nothing.
- Agent hooks run from project root.
- Agent hooks filter irrelevant events.
- Missing runner exits quietly.
- Clipboard fallback prints payload.
- Interactive launch uses `stdio: "inherit"` and cwd at project root.

Telemetry:

- Disabled in tests and opt-out flags.
- Expected user errors are not reported.
- Unexpected errors return event ids when SDK is live.
- Metrics no-op when SDK is not initialized.
- Scrubbers remove paths/secrets and drop on failure.

## Porting Checklist

Use this order when creating a new CLI from these patterns:

1. Create ESM package surface, bin shim, and fast-path stdio protocols.
2. Add CLI entrypoint bootstrap with telemetry, signals, stdin guard, argv
   preprocessing, color, parse, flush, and error funnel.
3. Define command flags as interfaces and register Commander actions.
4. Add non-interactive detection and prompt wrapper.
5. Add logger, no-op console, JSON mode, and output discipline.
6. Add spinner adapter and Effect `Progress` service.
7. Build domain services and runtime layer composition.
8. Implement the main command action as a workflow orchestrator.
9. Implement the core domain operation as a typed Effect.
10. Add result finalization and exit-code policy.
11. Add optional comparison/diff/staged/temp-tree support if needed.
12. Add telemetry context, metrics, spans, and scrubbing.
13. Add install/onboarding/handoff flows only after the main command is stable.
14. Add the test matrix above before treating the CLI as production-ready.

## Minimal Reference Skeleton

```ts
// src/cli/index.ts
initializeTelemetry();
process.on("SIGINT", exitGracefully);
process.on("SIGTERM", exitGracefully);
unrefStdin();
guardStdin();

const program = buildProgram();
const argv = normalizeHelpInvocation(stripUnknownCliFlags(process.argv), knownCommands(program));
applyColorPreference(argv);

Promise.resolve()
  .then(() => assertNoRemovedFlags(process.argv))
  .then(() => program.parseAsync(argv))
  .then(() => flushTelemetry())
  .catch(handleTopLevelCliError);
```

```ts
// src/cli/commands/main.ts
export const mainAction = async (directory: string, flags: MainFlags): Promise<void> => {
  const context = initializeCommandContext(directory, flags);
  try {
    const target = await resolveTarget(context.requestedDirectory);
    const options = resolveCliOptions(flags, target.config);
    const results = await runOperationForSelectedProjects(target, options, context);
    finalizeResults({ results, context, flags, config: target.config });
    await maybeOfferFollowUp(results, context);
  } catch (error) {
    await handleCommandError(error, context);
  }
};
```

```ts
// src/domain/run-operation.ts
export const runOperation = (
  input: OperationInput,
  hooks: OperationHooks = {},
): Effect.Effect<OperationOutput, AppError, Services> =>
  Effect.gen(function* () {
    const config = yield* Config;
    const progress = yield* Progress;
    const analyzer = yield* Analyzer;

    const resolved = yield* config.resolve(input.directory);
    yield* (hooks.beforeWork?.(resolved) ?? Effect.void);

    const handle = yield* progress.start("Working...");
    const output = yield* analyzer.run(resolved).pipe(collectWithNonFatalFailures);
    yield* handle.succeed("Done");
    return output;
  });
```

This skeleton is intentionally product-neutral. The product-specific parts are
the domain services, result schema, renderers, config schema, and optional
follow-up/install workflows.
