import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RunCommandResult = {
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs?: number,
) => Promise<RunCommandResult>;

export const runCommand: CommandRunner = async (command, args, cwd, timeoutMs) => {
  try {
    const options: { cwd: string; encoding: "utf8"; timeout?: number } = {
      cwd,
      encoding: "utf8",
    };
    if (timeoutMs !== undefined) {
      options.timeout = timeoutMs;
    }
    const { stdout, stderr } = await execFileAsync(command, [...args], options);
    return {
      success: true,
      stdout: trimOutput(stdout),
      stderr: trimOutput(stderr),
    };
  } catch (error) {
    const failure = error as { stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      success: false,
      stdout: trimOutput(failure.stdout),
      stderr: trimOutput(failure.stderr),
    };
  }
};

const trimOutput = (value: string | Buffer | undefined): string => String(value ?? "").trim();
