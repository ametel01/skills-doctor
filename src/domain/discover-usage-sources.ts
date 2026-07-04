import { open, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Diagnostic } from "./types.js";

export type ContextPressureLevel = "low" | "medium" | "high" | "unknown";

export type ContextBudgetPressure = {
  readonly level: ContextPressureLevel;
  readonly recentWarningCount: number;
  readonly latestWarningTimestamp?: string | undefined;
  readonly totalActiveSkills?: number | undefined;
  readonly includedSkills?: number | undefined;
  readonly omittedSkills?: number | undefined;
  readonly truncatedDescriptionCount?: number | undefined;
  readonly budgetLimit?: string | undefined;
};

export type CodexPressureRow = {
  readonly timestamp?: string | undefined;
  readonly warningCount?: number | undefined;
  readonly totalActiveSkills?: number | undefined;
  readonly includedSkills?: number | undefined;
  readonly omittedSkills?: number | undefined;
  readonly truncatedDescriptionCount?: number | undefined;
  readonly budgetLimit?: string | number | undefined;
};

export type ReadCodexSqlitePressure = (input: {
  readonly databasePath: string;
  readonly since: Date;
}) => Promise<readonly CodexPressureRow[]>;

export type DiscoverUsageSourcesInput = {
  readonly homeDir?: string | undefined;
  readonly now?: Date | undefined;
  readonly since?: Date | undefined;
  readonly recentWindowDays?: number | undefined;
  readonly maxSessionFiles?: number | undefined;
  readonly maxFileBytes?: number | undefined;
  readonly readSqlitePressure?: ReadCodexSqlitePressure | undefined;
};

export type DiscoverUsageSourcesResult = {
  readonly usageSourcePaths: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly contextPressure: ContextBudgetPressure;
};

type CandidateFile = {
  readonly filePath: string;
  readonly modifiedAt: Date;
};

const DEFAULT_RECENT_WINDOW_DAYS = 90;
const DEFAULT_MAX_SESSION_FILES = 200;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
const CONTEXT_BUDGET_WARNING =
  "Skill descriptions were shortened to fit the 2% skills context budget";

export const discoverUsageSources = async (
  input: DiscoverUsageSourcesInput = {},
): Promise<DiscoverUsageSourcesResult> => {
  const homeDir = input.homeDir ?? os.homedir();
  const now = input.now ?? new Date();
  const since =
    input.since ?? daysBefore(now, input.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS);
  const maxSessionFiles = input.maxSessionFiles ?? DEFAULT_MAX_SESSION_FILES;
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const codexDir = path.join(homeDir, ".codex");
  const sessionsDir = path.join(codexDir, "sessions");
  const historyPath = path.join(codexDir, "history.jsonl");
  const sqlitePath = path.join(codexDir, "logs_2.sqlite");
  const diagnostics: Diagnostic[] = [];

  const sessionFiles = (await findJsonlFiles({ directory: sessionsDir, since, diagnostics })).slice(
    0,
    maxSessionFiles,
  );
  const historyFile = await fileIfExists(historyPath, since, diagnostics);
  const usageSourcePaths = [
    ...sessionFiles.map((candidate) => candidate.filePath),
    ...(historyFile === undefined ? [] : [historyFile.filePath]),
  ];

  const jsonlPressure = await detectJsonlPressure({
    files: [...sessionFiles, ...(historyFile === undefined ? [] : [historyFile])],
    maxFileBytes,
    diagnostics,
  });
  const sqlitePressure = await readSqlitePressure({
    sqlitePath,
    since,
    readSqlitePressure: input.readSqlitePressure,
    diagnostics,
  });

  return {
    usageSourcePaths,
    diagnostics,
    contextPressure: combinePressure({
      jsonlPressure,
      sqliteRows: sqlitePressure,
      inspectedJsonlSourceCount: usageSourcePaths.length,
    }),
  };
};

const findJsonlFiles = async (input: {
  readonly directory: string;
  readonly since: Date;
  readonly diagnostics: Diagnostic[];
}): Promise<readonly CandidateFile[]> => {
  const entries = await readdir(input.directory, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (getErrorCode(error) !== "ENOENT") {
        input.diagnostics.push({
          code: "usage-source-unreadable",
          severity: "warning",
          message: error instanceof Error ? error.message : `Unable to read ${input.directory}`,
          path: input.directory,
        });
      }
      return undefined;
    },
  );
  if (entries === undefined) return [];

  const filesByEntry = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(input.directory, entry.name);
      if (entry.isDirectory()) return findJsonlFiles({ ...input, directory: entryPath });
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return [];
      const candidate = await fileIfExists(entryPath, input.since, input.diagnostics);
      return candidate === undefined ? [] : [candidate];
    }),
  );

  return filesByEntry.flat().sort(compareCandidateFiles);
};

const fileIfExists = async (
  filePath: string,
  since: Date,
  diagnostics: Diagnostic[],
): Promise<CandidateFile | undefined> => {
  const stats = await stat(filePath).catch((error: unknown) => {
    if (getErrorCode(error) !== "ENOENT") {
      diagnostics.push({
        code: "usage-source-unreadable",
        severity: "warning",
        message: error instanceof Error ? error.message : `Unable to inspect ${filePath}`,
        path: filePath,
      });
    }
    return undefined;
  });
  if (stats === undefined) return undefined;
  if (!stats.isFile()) {
    diagnostics.push({
      code: "usage-source-unreadable",
      severity: "warning",
      message: `Usage source is not a file: ${filePath}`,
      path: filePath,
    });
    return undefined;
  }
  if (stats.mtime < since) return undefined;
  return { filePath, modifiedAt: stats.mtime };
};

type JsonlPressure = {
  readonly warningCount: number;
  readonly latestWarningTimestamp?: string | undefined;
};

const detectJsonlPressure = async (input: {
  readonly files: readonly CandidateFile[];
  readonly maxFileBytes: number;
  readonly diagnostics: Diagnostic[];
}): Promise<JsonlPressure> => {
  const pressureByFile = await Promise.all(
    input.files.map(async (file) => {
      const content = await readTail(file.filePath, input.maxFileBytes).catch((error: unknown) => {
        input.diagnostics.push({
          code: "usage-source-unreadable",
          severity: "warning",
          message: error instanceof Error ? error.message : `Unable to read ${file.filePath}`,
          path: file.filePath,
        });
        return undefined;
      });
      if (content === undefined) return { warningCount: 0, warningTimestamps: [] };

      let warningCount = 0;
      const warningTimestamps: string[] = [];
      for (const line of content.split(/\r?\n/)) {
        if (!line.includes(CONTEXT_BUDGET_WARNING)) continue;
        warningCount += 1;
        const timestamp = extractTimestampFromJsonLine(line);
        if (timestamp !== undefined) warningTimestamps.push(timestamp);
      }
      return { warningCount, warningTimestamps };
    }),
  );

  let warningCount = 0;
  const warningTimestamps: string[] = [];
  for (const pressure of pressureByFile) {
    warningCount += pressure.warningCount;
    warningTimestamps.push(...pressure.warningTimestamps);
  }

  return {
    warningCount,
    ...(latestTimestamp(warningTimestamps) === undefined
      ? {}
      : { latestWarningTimestamp: latestTimestamp(warningTimestamps) }),
  };
};

const readSqlitePressure = async (input: {
  readonly sqlitePath: string;
  readonly since: Date;
  readonly readSqlitePressure: ReadCodexSqlitePressure | undefined;
  readonly diagnostics: Diagnostic[];
}): Promise<readonly CodexPressureRow[]> => {
  const stats = await stat(input.sqlitePath).catch(() => undefined);
  if (stats === undefined || !stats.isFile()) return [];
  if (input.readSqlitePressure === undefined) return [];

  return input
    .readSqlitePressure({ databasePath: input.sqlitePath, since: input.since })
    .catch((error: unknown) => {
      input.diagnostics.push({
        code: "usage-sqlite-pressure-unreadable",
        severity: "warning",
        message:
          error instanceof Error
            ? error.message
            : `Unable to read Codex pressure database: ${input.sqlitePath}`,
        path: input.sqlitePath,
      });
      return [];
    });
};

const combinePressure = (input: {
  readonly jsonlPressure: JsonlPressure;
  readonly sqliteRows: readonly CodexPressureRow[];
  readonly inspectedJsonlSourceCount: number;
}): ContextBudgetPressure => {
  const sqliteWarningCount = sumNumbers(input.sqliteRows.map((row) => row.warningCount));
  const recentWarningCount = input.jsonlPressure.warningCount + sqliteWarningCount;
  const omittedSkills = maxNumber(input.sqliteRows.map((row) => row.omittedSkills));
  const truncatedDescriptionCount = maxNumber(
    input.sqliteRows.map((row) => row.truncatedDescriptionCount),
  );
  const totalActiveSkills = maxNumber(input.sqliteRows.map((row) => row.totalActiveSkills));
  const includedSkills = maxNumber(input.sqliteRows.map((row) => row.includedSkills));
  const budgetLimit = latestDefined(input.sqliteRows.map((row) => row.budgetLimit));
  const latestWarningTimestamp = latestTimestamp([
    input.jsonlPressure.latestWarningTimestamp,
    ...input.sqliteRows.map((row) => row.timestamp),
  ]);
  const hasStructuredPressure =
    (omittedSkills ?? 0) > 0 || (truncatedDescriptionCount ?? 0) > 0 || recentWarningCount > 0;
  const level = pressureLevel({
    hasStructuredPressure,
    inspectedJsonlSourceCount: input.inspectedJsonlSourceCount,
    sqliteRowCount: input.sqliteRows.length,
  });

  return {
    level,
    recentWarningCount,
    ...(latestWarningTimestamp === undefined ? {} : { latestWarningTimestamp }),
    ...(totalActiveSkills === undefined ? {} : { totalActiveSkills }),
    ...(includedSkills === undefined ? {} : { includedSkills }),
    ...(omittedSkills === undefined ? {} : { omittedSkills }),
    ...(truncatedDescriptionCount === undefined ? {} : { truncatedDescriptionCount }),
    ...(budgetLimit === undefined ? {} : { budgetLimit: String(budgetLimit) }),
  };
};

const pressureLevel = (input: {
  readonly hasStructuredPressure: boolean;
  readonly inspectedJsonlSourceCount: number;
  readonly sqliteRowCount: number;
}): ContextPressureLevel => {
  if (input.hasStructuredPressure) return "high";
  if (input.inspectedJsonlSourceCount > 0 || input.sqliteRowCount > 0) return "low";
  return "unknown";
};

const readTail = async (filePath: string, maxBytes: number): Promise<string> => {
  const handle = await open(filePath, "r");
  try {
    const stats = await handle.stat();
    const byteLength = Math.min(stats.size, Math.max(1, maxBytes));
    const buffer = Buffer.alloc(byteLength);
    await handle.read(buffer, 0, byteLength, stats.size - byteLength);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
};

const extractTimestampFromJsonLine = (line: string): string | undefined => {
  try {
    const parsed = JSON.parse(line) as unknown;
    return extractTimestamp(parsed);
  } catch {
    return undefined;
  }
};

const extractTimestamp = (record: unknown): string | undefined => {
  if (!isRecord(record)) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  const message = isRecord(record.message) ? record.message : undefined;
  if (message === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = message[key];
    if (typeof value === "string") return value;
  }
  return undefined;
};

const daysBefore = (now: Date, days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const compareCandidateFiles = (left: CandidateFile, right: CandidateFile): number => {
  const modifiedDifference = right.modifiedAt.getTime() - left.modifiedAt.getTime();
  if (modifiedDifference !== 0) return modifiedDifference;
  return left.filePath.localeCompare(right.filePath);
};

const latestTimestamp = (timestamps: readonly (string | undefined)[]): string | undefined => {
  const sorted = timestamps
    .filter((timestamp): timestamp is string => timestamp !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return sorted[0];
};

const sumNumbers = (values: readonly (number | undefined)[]): number =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const maxNumber = (values: readonly (number | undefined)[]): number | undefined => {
  const numbers = values.filter((value): value is number => value !== undefined);
  if (numbers.length === 0) return undefined;
  return Math.max(...numbers);
};

const latestDefined = (
  values: readonly (string | number | undefined)[],
): string | number | undefined => values.findLast((value) => value !== undefined);

const getErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
