import path from "node:path";
import { Command } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import { scanAction } from "./commands/scan.js";
import { handleCliError } from "./utils/handle-error.js";
import { enableJsonMode } from "./utils/json-mode.js";

export type BuildProgramOptions = {
  readonly jsonMode?: boolean;
};

export const buildProgram = (options: BuildProgramOptions = {}): Command => {
  const program = new Command()
    .name("skills-doctor")
    .description("Scan Agent Skills and report quality issues.")
    .version(packageJson.version, "-v, --version", "display the version number")
    .argument("[directory]", "directory to scan from", ".")
    .option("--json", "output one machine-readable JSON report")
    .option("--json-compact", "with --json, omit indentation")
    .option("--usage", "include local Codex skill usage analysis")
    .option("--no-logs", "skip local Codex log discovery in interactive usage analysis")
    .option("--fail-on <severity>", "fail on findings at or above severity: error, warning, advice")
    .option(
      "--fail-on-security <priority>",
      "fail on security findings at or above priority: P0, P1, P2",
    )
    .option("--min-score <number>", "fail when the scan score is below this threshold")
    .option("-y, --yes", "skip prompts and use conservative defaults")
    .action(
      async (
        directory: string,
        flags: {
          json?: boolean;
          jsonCompact?: boolean;
          usage?: boolean;
          logs?: boolean;
          yes?: boolean;
          failOn?: string;
          failOnSecurity?: string;
          minScore?: string;
        },
      ) => {
        await scanAction(directory, flags, { version: packageJson.version });
      },
    );

  if (options.jsonMode) {
    program.exitOverride();
    program.configureOutput({
      writeErr: () => {},
    });
  }

  return program;
};

export const main = async (argv: readonly string[] = process.argv): Promise<void> => {
  const preParseJsonMode = resolvePreParseJsonMode(argv);
  if (preParseJsonMode !== undefined) {
    enableJsonMode(preParseJsonMode);
  }

  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
  });

  try {
    await buildProgram({ jsonMode: preParseJsonMode !== undefined }).parseAsync([...argv]);
  } finally {
    process.stdin.unref?.();
  }
};

export const runCli = async (argv: readonly string[] = process.argv): Promise<void> => {
  await main(argv).catch(handleCliError);
};

const resolvePreParseJsonMode = (
  argv: readonly string[],
): { readonly compact: boolean; readonly directory: string } | undefined => {
  const userArgs = argv.slice(2);
  if (!userArgs.includes("--json")) return undefined;

  return {
    compact: userArgs.includes("--json-compact"),
    directory: path.resolve(process.cwd(), findDirectoryArg(userArgs) ?? "."),
  };
};

const findDirectoryArg = (args: readonly string[]): string | undefined =>
  args.find((arg, index) => isDirectoryArg(args, arg, index));

const VALUE_FLAGS = new Set(["--fail-on", "--fail-on-security", "--min-score"]);

const isDirectoryArg = (args: readonly string[], arg: string, index: number): boolean => {
  if (arg === "--") return false;
  if (arg.startsWith("-")) return false;
  const previous = args[index - 1];
  return previous === undefined || !VALUE_FLAGS.has(previous);
};
