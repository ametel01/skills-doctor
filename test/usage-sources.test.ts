import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DiscoverUsageSourcesProgressEvent,
  discoverUsageSources,
  type ReadCodexSqlitePressure,
} from "../src/index.js";

const WARNING = "Skill descriptions were shortened to fit the 2% skills context budget";

describe("Codex usage source discovery", () => {
  let directory: string;
  let homeDir: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-usage-sources-"));
    homeDir = path.join(directory, "home");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("discovers bounded Codex JSONL sources and detects context-budget warnings", async () => {
    const sessionPath = path.join(homeDir, ".codex", "sessions", "2026", "session.jsonl");
    const historyPath = path.join(homeDir, ".codex", "history.jsonl");
    await writeJsonl(sessionPath, [
      { timestamp: "2026-06-19T00:00:00.000Z", role: "assistant", content: WARNING },
    ]);
    await writeJsonl(historyPath, [
      { timestamp: "2026-06-20T00:00:00.000Z", message: { role: "assistant", content: WARNING } },
    ]);
    await writeJsonl(path.join(homeDir, "outside.jsonl"), [
      { timestamp: "2026-06-20T01:00:00.000Z", role: "assistant", content: WARNING },
    ]);

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(result.usageSourcePaths).toEqual([sessionPath, historyPath]);
    expect(result.diagnostics).toEqual([]);
    expect(result.contextPressure).toMatchObject({
      level: "high",
      recentWarningCount: 2,
      latestWarningTimestamp: "2026-06-20T00:00:00.000Z",
    });
  });

  it("reports discovery progress from actual directories and JSONL candidates", async () => {
    const sessionPath = path.join(homeDir, ".codex", "sessions", "2026", "session.jsonl");
    const historyPath = path.join(homeDir, ".codex", "history.jsonl");
    await writeJsonl(sessionPath, [{ timestamp: "2026-06-19T00:00:00.000Z" }]);
    await writeJsonl(historyPath, [{ timestamp: "2026-06-20T00:00:00.000Z" }]);
    const progress: DiscoverUsageSourcesProgressEvent[] = [];

    await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      onProgress: (event) => progress.push(event),
    });

    expect(progress.map((event) => event.phase)).toEqual(
      expect.arrayContaining([
        "started",
        "directory-scanned",
        "file-inspected",
        "candidate-found",
        "completed",
      ]),
    );
    expect(progress.at(-1)).toMatchObject({
      phase: "completed",
      scannedDirectoryCount: 2,
      inspectedJsonlFileCount: 2,
      candidateSourceCount: 2,
      includedSourceCount: 2,
    });
  });

  it("caps session files and filters old sessions by the selected window", async () => {
    const recentOne = path.join(homeDir, ".codex", "sessions", "recent-1.jsonl");
    const recentTwo = path.join(homeDir, ".codex", "sessions", "recent-2.jsonl");
    const older = path.join(homeDir, ".codex", "sessions", "older.jsonl");
    await writeJsonl(recentOne, [{ timestamp: "2026-06-20T00:00:00.000Z", role: "assistant" }]);
    await writeJsonl(recentTwo, [{ timestamp: "2026-06-19T00:00:00.000Z", role: "assistant" }]);
    await writeJsonl(older, [{ timestamp: "2025-01-01T00:00:00.000Z", role: "assistant" }]);
    await utimes(older, new Date("2025-01-01T00:00:00.000Z"), new Date("2025-01-01T00:00:00.000Z"));

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      recentWindowDays: 30,
      maxSessionFiles: 1,
    });

    expect(result.usageSourcePaths).toHaveLength(1);
    expect(result.usageSourcePaths[0]).toMatch(/recent-[12]\.jsonl$/u);
    expect(result.usageSourcePaths).not.toContain(older);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-discovery-truncated",
        severity: "warning",
        path: path.join(homeDir, ".codex", "sessions"),
      }),
    ]);
    expect(result.contextPressure.level).toBe("low");
  });

  it("reports skipped session files when discovery is capped at zero", async () => {
    const sessionPath = path.join(homeDir, ".codex", "sessions", "recent.jsonl");
    await writeJsonl(sessionPath, [{ timestamp: "2026-06-20T00:00:00.000Z", role: "assistant" }]);

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      maxSessionFiles: 0,
    });

    expect(result.usageSourcePaths).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-discovery-truncated",
        severity: "warning",
        path: path.join(homeDir, ".codex", "sessions"),
      }),
    ]);
    expect(result.contextPressure.level).toBe("unknown");
  });

  it("selects the newest session by event timestamp when it sorts late by path", async () => {
    const sessionDir = path.join(homeDir, ".codex", "sessions", "2026", "06", "20");
    for (const [index, name] of ["z-old", "y-old", "x-old", "w-old"].entries()) {
      const sessionPath = path.join(sessionDir, `${name}.jsonl`);
      await writeJsonl(sessionPath, [
        { timestamp: `2026-06-20T00:0${index}:00.000Z`, role: "assistant" },
      ]);
      const modifiedAt = new Date(`2026-06-20T00:0${index}:00.000Z`);
      await utimes(sessionPath, modifiedAt, modifiedAt);
    }
    const newest = path.join(sessionDir, "a-new.jsonl");
    await writeJsonl(newest, [{ timestamp: "2026-06-20T00:10:00.000Z", role: "assistant" }]);
    await utimes(
      newest,
      new Date("2026-06-20T00:10:00.000Z"),
      new Date("2026-06-20T00:10:00.000Z"),
    );

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      recentWindowDays: 30,
      maxSessionFiles: 1,
    });

    expect(result.usageSourcePaths).toEqual([newest]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-discovery-truncated",
        severity: "warning",
        path: path.join(homeDir, ".codex", "sessions"),
      }),
    ]);
    expect(result.contextPressure.level).toBe("low");
  });

  it("caps output after inspecting candidate event timestamps", async () => {
    const sessionPaths: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const day = String(index + 1).padStart(2, "0");
      const sessionPath = path.join(
        homeDir,
        ".codex",
        "sessions",
        "2026",
        "06",
        day,
        `session-${day}.jsonl`,
      );
      sessionPaths.push(sessionPath);
      await writeJsonl(sessionPath, [{ timestamp: `2026-06-${day}T00:00:00.000Z` }]);
      const modifiedAt = new Date(`2026-06-${day}T00:00:00.000Z`);
      await utimes(sessionPath, modifiedAt, modifiedAt);
    }
    const inspectedSessionFiles: string[] = [];

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      recentWindowDays: 30,
      maxSessionFiles: 2,
      fileSystem: {
        stat: async (filePath) => {
          if (filePath.includes(`${path.sep}.codex${path.sep}sessions${path.sep}`)) {
            inspectedSessionFiles.push(filePath);
          }
          return stat(filePath);
        },
      },
    });

    expect(result.usageSourcePaths).toEqual([sessionPaths[11], sessionPaths[10]]);
    expect(inspectedSessionFiles.length).toBeGreaterThan(0);
    expect(inspectedSessionFiles).toHaveLength(sessionPaths.length);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-discovery-truncated",
        severity: "warning",
        path: path.join(homeDir, ".codex", "sessions"),
      }),
    ]);
    expect(result.contextPressure.level).toBe("low");
  });

  it("uses recent JSONL events rather than modified time to select sources", async () => {
    const staleMtimeRecentEvent = path.join(homeDir, ".codex", "sessions", "stale-mtime.jsonl");
    const recentMtimeOldEvent = path.join(homeDir, ".codex", "sessions", "recent-mtime.jsonl");
    await writeJsonl(staleMtimeRecentEvent, [
      { timestamp: "2026-06-20T00:00:00.000Z", role: "assistant" },
    ]);
    await utimes(
      staleMtimeRecentEvent,
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-01-01T00:00:00.000Z"),
    );
    await writeJsonl(recentMtimeOldEvent, [
      { timestamp: "2025-01-01T00:00:00.000Z", role: "assistant" },
    ]);

    const result = await discoverUsageSources({
      homeDir,
      now: new Date("2026-06-20T12:00:00.000Z"),
      recentWindowDays: 30,
    });

    expect(result.usageSourcePaths).toEqual([staleMtimeRecentEvent]);
    expect(result.usageSourcePaths).not.toContain(recentMtimeOldEvent);
  });

  it("returns unknown pressure when no Codex usage data is available", async () => {
    const result = await discoverUsageSources({ homeDir });

    expect(result.usageSourcePaths).toEqual([]);
    expect(result.contextPressure).toEqual({
      level: "unknown",
      recentWarningCount: 0,
    });
  });

  it("reports unreadable known Codex sources without scanning arbitrary home files", async () => {
    const historyPath = path.join(homeDir, ".codex", "history.jsonl");
    await mkdir(historyPath, { recursive: true });
    await writeJsonl(path.join(homeDir, ".codex", "outside.jsonl"), [
      { timestamp: "2026-06-20T00:00:00.000Z", role: "assistant", content: WARNING },
    ]);

    const result = await discoverUsageSources({ homeDir });

    expect(result.usageSourcePaths).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-unreadable",
        severity: "warning",
        path: historyPath,
      }),
    ]);
    expect(result.contextPressure.level).toBe("unknown");
  });

  it("uses injected SQLite pressure rows when the optional database is available", async () => {
    const sqlitePath = path.join(homeDir, ".codex", "logs_2.sqlite");
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    await writeFile(sqlitePath, "");
    const readSqlitePressure: ReadCodexSqlitePressure = async ({ databasePath }) => {
      expect(databasePath).toBe(sqlitePath);
      return [
        {
          timestamp: "2026-06-20T00:00:00.000Z",
          warningCount: 1,
          totalActiveSkills: 90,
          includedSkills: 70,
          omittedSkills: 20,
          truncatedDescriptionCount: 12,
          budgetLimit: "2%",
        },
      ];
    };

    const result = await discoverUsageSources({ homeDir, readSqlitePressure });

    expect(result.usageSourcePaths).toEqual([]);
    expect(result.contextPressure).toMatchObject({
      level: "high",
      recentWarningCount: 1,
      latestWarningTimestamp: "2026-06-20T00:00:00.000Z",
      totalActiveSkills: 90,
      includedSkills: 70,
      omittedSkills: 20,
      truncatedDescriptionCount: 12,
      budgetLimit: "2%",
    });
  });

  it("treats SQLite pressure adapter failures as non-fatal diagnostics", async () => {
    const sqlitePath = path.join(homeDir, ".codex", "logs_2.sqlite");
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    await writeFile(sqlitePath, "");

    const result = await discoverUsageSources({
      homeDir,
      readSqlitePressure: async () => {
        throw new Error("sqlite unavailable");
      },
    });

    expect(result.contextPressure).toEqual({ level: "unknown", recentWarningCount: 0 });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-sqlite-pressure-unreadable",
        severity: "warning",
        path: sqlitePath,
      }),
    ]);
  });
});

const writeJsonl = async (filePath: string, records: readonly unknown[]): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
};
