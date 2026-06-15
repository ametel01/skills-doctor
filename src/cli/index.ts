import { Command } from "commander";
import { scanAction } from "./commands/scan.js";
import { handleCliError } from "./utils/handle-error.js";

export const buildProgram = (): Command => {
  const program = new Command()
    .name("skills-doctor")
    .description("Scan Agent Skills and report quality issues.")
    .version("0.0.0", "-v, --version", "display the version number")
    .argument("[directory]", "directory to scan from", ".")
    .option("--json", "output one machine-readable JSON report")
    .option("--json-compact", "with --json, omit indentation")
    .option("-y, --yes", "skip prompts and use conservative defaults")
    .action(
      async (
        directory: string,
        flags: { json?: boolean; jsonCompact?: boolean; yes?: boolean },
      ) => {
        await scanAction(directory, flags);
      },
    );

  return program;
};

export const main = async (argv: readonly string[] = process.argv): Promise<void> => {
  process.stdin.unref();
  process.on("SIGINT", () => process.exit(130));
  process.on("SIGTERM", () => process.exit(143));
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
  });

  await buildProgram().parseAsync([...argv]);
};

await main().catch(handleCliError);
