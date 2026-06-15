import fs from "node:fs";
import path from "node:path";

export type CommandAvailabilityOptions = {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly platform?: NodeJS.Platform | undefined;
};

export const resolveCommand = (
  command: string,
  options: CommandAvailabilityOptions = {},
): string | undefined => {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const isWindows = platform === "win32";
  const pathDirectories = (env.PATH ?? "").split(path.delimiter).filter(Boolean);

  for (const directory of pathDirectories) {
    for (const fileName of candidateFileNames(command, { env, isWindows })) {
      const binaryPath = path.join(directory, fileName);
      try {
        if (!fs.statSync(binaryPath).isFile()) continue;
        if (!isWindows) {
          fs.accessSync(binaryPath, fs.constants.X_OK);
        }
        return binaryPath;
      } catch {}
    }
  }

  return undefined;
};

export const isCommandAvailable = (
  command: string,
  options: CommandAvailabilityOptions = {},
): boolean => resolveCommand(command, options) !== undefined;

const candidateFileNames = (
  command: string,
  input: { readonly env: NodeJS.ProcessEnv; readonly isWindows: boolean },
): readonly string[] => {
  if (!input.isWindows || path.extname(command).length > 0) return [command];
  const pathExtensions = (input.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim())
    .filter(Boolean);
  return [command, ...pathExtensions.map((extension) => `${command}${extension}`)];
};
