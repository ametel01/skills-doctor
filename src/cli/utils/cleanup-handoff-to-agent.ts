import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCleanupHandoffPrompt } from "../../domain/build-cleanup-handoff-prompt.js";
import type { ScanReport } from "../../domain/build-report.js";
import type {
  CleanupDirectoryInput,
  CleanupDirectoryResult,
} from "../../domain/write-cleanup-directory.js";
import { writeCleanupDirectory } from "../../domain/write-cleanup-directory.js";
import { CliInputError } from "./handle-error.js";

export type PreparedCleanupHandoff = {
  readonly prompt: string;
  readonly reportDirectory?: string | undefined;
  readonly usageJsonPath?: string | undefined;
  readonly usageMarkdownPath?: string | undefined;
  readonly promptPath?: string | undefined;
  readonly reportWriteError?: Error | undefined;
};

export type PrepareCleanupHandoffInput = {
  readonly report: ScanReport;
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly writeDirectory?: typeof writeCleanupDirectory | undefined;
};

export const prepareCleanupHandoff = async (
  input: PrepareCleanupHandoffInput,
): Promise<PreparedCleanupHandoff> => {
  if (input.report.usage === undefined) {
    throw new CliInputError("Usage analysis is required before cleanup handoff.");
  }
  if (input.report.usage.topRecommendations.length === 0) {
    throw new CliInputError("No cleanup recommendations are available.");
  }

  const reportResult = await tryWriteCleanupDirectory({
    report: input.report,
    outputRoot: input.outputRoot,
    timestamp: input.timestamp,
    writeDirectory: input.writeDirectory ?? writeCleanupDirectory,
  });
  const prompt = buildCleanupHandoffPrompt({
    report: input.report,
    reportDirectory: reportResult.result?.directory,
  });

  let promptPath: string | undefined;
  let promptWriteError: Error | undefined;
  if (reportResult.result !== undefined) {
    const targetPromptPath = path.join(reportResult.result.directory, "cleanup-prompt.md");
    try {
      await writeFile(targetPromptPath, `${prompt}\n`);
      promptPath = targetPromptPath;
    } catch (error) {
      promptWriteError = normalizeError(error);
    }
  }

  return {
    prompt,
    reportDirectory: reportResult.result?.directory,
    usageJsonPath: reportResult.result?.usageJsonPath,
    usageMarkdownPath: reportResult.result?.usageMarkdownPath,
    promptPath,
    reportWriteError: reportResult.error ?? promptWriteError,
  };
};

const tryWriteCleanupDirectory = async (input: {
  readonly report: ScanReport;
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly writeDirectory: (input: CleanupDirectoryInput) => Promise<CleanupDirectoryResult>;
}): Promise<{ readonly result?: CleanupDirectoryResult; readonly error?: Error }> => {
  try {
    return {
      result: await input.writeDirectory({
        report: input.report,
        outputRoot: input.outputRoot,
        timestamp: input.timestamp,
      }),
    };
  } catch (error) {
    return { error: normalizeError(error) };
  }
};

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
