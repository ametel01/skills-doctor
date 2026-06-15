import { cliLogger } from "./cli-logger.js";
import { isJsonModeActive, writeJsonErrorReport } from "./json-mode.js";

export class CliInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliInputError";
  }
}

export const isExpectedUserError = (error: unknown): error is CliInputError =>
  error instanceof CliInputError;

export const handleCliError = (error: unknown): void => {
  if (isJsonModeActive()) {
    writeJsonErrorReport(error);
    process.exitCode = 1;
    return;
  }

  if (isExpectedUserError(error)) {
    cliLogger.error(error.message);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  cliLogger.error(`Unexpected error: ${message}`);
  process.exitCode = 1;
};
