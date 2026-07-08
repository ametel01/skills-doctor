import type { Dirent, Stats } from "node:fs";
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

type UsageSourceFileSystem = {
  readonly readdir?: (
    directory: string,
  ) => Promise<readonly Pick<Dirent, "name" | "isDirectory" | "isFile">[]>;
  readonly stat?: (filePath: string) => Promise<Pick<Stats, "isFile" | "mtime">>;
};

export type DiscoverUsageSourcesInput = {
  readonly homeDir?: string | undefined;
  readonly now?: Date | undefined;
  readonly since?: Date | undefined;
  readonly recentWindowDays?: number | undefined;
  readonly maxSessionFiles?: number | undefined;
  readonly maxFileBytes?: number | undefined;
  readonly readSqlitePressure?: ReadCodexSqlitePressure | undefined;
  /** @internal Test-only filesystem adapter; production callers should use the real local Codex paths. */
  readonly fileSystem?: UsageSourceFileSystem | undefined;
};

export type DiscoverUsageSourcesResult = {
  readonly usageSourcePaths: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly contextPressure: ContextBudgetPressure;
};

type CandidateFile = {
  readonly filePath: string;
  readonly modifiedAt: Date;
  readonly latestEventTimestamp?: string | undefined;
};

const DEFAULT_RECENT_WINDOW_DAYS = 30;
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
  const maxSessionFiles = normalizeNonNegativeInteger(
    input.maxSessionFiles ?? DEFAULT_MAX_SESSION_FILES,
    DEFAULT_MAX_SESSION_FILES,
  );
  const maxFileBytes = normalizePositiveInteger(
    input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    DEFAULT_MAX_FILE_BYTES,
  );
  const codexDir = path.join(homeDir, ".codex");
  const sessionsDir = path.join(codexDir, "sessions");
  const historyPath = path.join(codexDir, "history.jsonl");
  const sqlitePath = path.join(codexDir, "logs_2.sqlite");
  const diagnostics: Diagnostic[] = [];

  const sessionFiles = await findJsonlFiles({
    directory: sessionsDir,
    since,
    maxFiles: maxSessionFiles,
    diagnostics,
    fileSystem: input.fileSystem,
  });
  const historyFile = await fileIfRecentUsageEventExists(
    historyPath,
    since,
    diagnostics,
    input.fileSystem,
  );
  const usageSourcePaths = [
    ...sessionFiles.map((candidate) => candidate.filePath),
    ...(historyFile === undefined ? [] : [historyFile.filePath]),
  ];

  const jsonlDiagnostics: Diagnostic[] = [];
  const sqliteDiagnostics: Diagnostic[] = [];
  const [jsonlPressure, sqlitePressure] = await Promise.all([
    detectJsonlPressure({
      files: [...sessionFiles, ...(historyFile === undefined ? [] : [historyFile])],
      maxFileBytes,
      diagnostics: jsonlDiagnostics,
    }),
    readSqlitePressure({
      sqlitePath,
      since,
      readSqlitePressure: input.readSqlitePressure,
      diagnostics: sqliteDiagnostics,
      fileSystem: input.fileSystem,
    }),
  ]);
  diagnostics.push(...jsonlDiagnostics, ...sqliteDiagnostics);

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
  readonly maxFiles: number;
  readonly diagnostics: Diagnostic[];
  readonly fileSystem: UsageSourceFileSystem | undefined;
}): Promise<readonly CandidateFile[]> => {
  if (input.maxFiles <= 0) {
    input.diagnostics.push({
      code: "usage-source-discovery-truncated",
      severity: "warning",
      message:
        "Codex session source discovery is capped at 0 files, so session coverage is incomplete.",
      path: input.directory,
    });
    return [];
  }

  const state: DiscoveryState = {
    candidates: [],
  };
  await collectJsonlFiles({
    ...input,
    state,
  });
  const sortedCandidates = state.candidates.sort(compareCandidateFiles);
  if (sortedCandidates.length > input.maxFiles) {
    const omittedCount = sortedCandidates.length - input.maxFiles;
    input.diagnostics.push({
      code: "usage-source-discovery-truncated",
      severity: "warning",
      message: `Discovered ${sortedCandidates.length} recent Codex session sources but included ${input.maxFiles}; ${omittedCount} recent sources were omitted, so usage coverage is incomplete.`,
      path: input.directory,
    });
  }
  return sortedCandidates.slice(0, input.maxFiles);
};

type DiscoveryState = {
  candidates: CandidateFile[];
};

const collectJsonlFiles = async (input: {
  readonly directory: string;
  readonly since: Date;
  readonly maxFiles: number;
  readonly diagnostics: Diagnostic[];
  readonly fileSystem: UsageSourceFileSystem | undefined;
  readonly state: DiscoveryState;
}): Promise<void> => {
  const entries = await readDirectory(input.directory, input.fileSystem, input.diagnostics);
  if (entries === undefined) return;

  const sortedEntries = [...entries].sort(compareDiscoveryEntries);
  for (const entry of sortedEntries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(input.directory, entry.name);
    await collectJsonlFiles({ ...input, directory: entryPath });
  }

  const candidateFiles = sortedEntries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".jsonl"),
  );
  for (const entry of candidateFiles) {
    const entryPath = path.join(input.directory, entry.name);
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const candidate = await fileIfRecentUsageEventExists(
      entryPath,
      input.since,
      input.diagnostics,
      input.fileSystem,
    );
    if (candidate !== undefined) input.state.candidates.push(candidate);
  }
};

const readDirectory = async (
  directory: string,
  fileSystem: UsageSourceFileSystem | undefined,
  diagnostics: Diagnostic[],
): Promise<readonly Pick<Dirent, "name" | "isDirectory" | "isFile">[] | undefined> => {
  const read =
    fileSystem?.readdir ?? ((target: string) => readdir(target, { withFileTypes: true }));
  return read(directory).catch((error: unknown) => {
    if (getErrorCode(error) !== "ENOENT") {
      diagnostics.push({
        code: "usage-source-unreadable",
        severity: "warning",
        message: error instanceof Error ? error.message : `Unable to read ${directory}`,
        path: directory,
      });
    }
    return undefined;
  });
};

const fileIfRecentUsageEventExists = async (
  filePath: string,
  since: Date,
  diagnostics: Diagnostic[],
  fileSystem: UsageSourceFileSystem | undefined,
): Promise<CandidateFile | undefined> => {
  const readStats = fileSystem?.stat ?? stat;
  const stats = await readStats(filePath).catch((error: unknown) => {
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
  const latestEventTimestamp = await latestRecentEventTimestamp(filePath, since, diagnostics);
  if (latestEventTimestamp === undefined) return undefined;
  return { filePath, modifiedAt: stats.mtime, latestEventTimestamp };
};

const latestRecentEventTimestamp = async (
  filePath: string,
  since: Date,
  diagnostics: Diagnostic[],
): Promise<string | undefined> => {
  const timestamps: string[] = [];
  const handle = await open(filePath, "r").catch((error: unknown) => {
    diagnostics.push({
      code: "usage-source-unreadable",
      severity: "warning",
      message: error instanceof Error ? error.message : `Unable to read ${filePath}`,
      path: filePath,
    });
    return undefined;
  });
  if (handle === undefined) return undefined;
  try {
    for await (const line of handle.readLines()) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const timestamp = extractTimestampFromJsonLine(trimmed);
      if (timestamp === undefined) continue;
      if (Date.parse(timestamp) >= since.getTime()) timestamps.push(timestamp);
    }
  } catch (error: unknown) {
    diagnostics.push({
      code: "usage-source-unreadable",
      severity: "warning",
      message: error instanceof Error ? error.message : `Unable to read ${filePath}`,
      path: filePath,
    });
  } finally {
    await handle.close();
  }
  return latestTimestamp(timestamps);
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
  readonly fileSystem: UsageSourceFileSystem | undefined;
}): Promise<readonly CodexPressureRow[]> => {
  const readStats = input.fileSystem?.stat ?? stat;
  const stats = await readStats(input.sqlitePath).catch(() => undefined);
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
  const eventDifference =
    timestampValue(right.latestEventTimestamp) - timestampValue(left.latestEventTimestamp);
  if (eventDifference !== 0) return eventDifference;
  const modifiedDifference = right.modifiedAt.getTime() - left.modifiedAt.getTime();
  if (modifiedDifference !== 0) return modifiedDifference;
  return left.filePath.localeCompare(right.filePath);
};

const compareDiscoveryEntries = (
  left: Pick<Dirent, "name" | "isDirectory" | "isFile">,
  right: Pick<Dirent, "name" | "isDirectory" | "isFile">,
): number => right.name.localeCompare(left.name);

const latestTimestamp = (timestamps: readonly (string | undefined)[]): string | undefined => {
  const sorted = timestamps
    .filter((timestamp): timestamp is string => timestamp !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return sorted[0];
};

const timestampValue = (timestamp: string | undefined): number => {
  if (timestamp === undefined) return 0;
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
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

const normalizeNonNegativeInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const normalizePositiveInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
};

const getErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
