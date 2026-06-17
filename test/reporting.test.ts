import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildJsonErrorReport,
  enableJsonMode,
  resetJsonMode,
  writeJsonReport,
} from "../src/cli/utils/json-mode.js";
import {
  buildScanReport,
  discoverSkillRoots,
  renderHumanSummary,
  resolveScanExitCode,
  type ScanResult,
  scanSkillRoots,
} from "../src/index.js";

describe("scan reports", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-report-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("builds counts, summaries, and exit code decisions", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "mismatch");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });
    const report = buildScanReport({
      version: "0.0.0-test",
      directory,
      elapsedMilliseconds: 12,
      scan,
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.ok).toBe(false);
    expect(report.skillCount).toBe(1);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.score.value).toBeLessThan(100);
    expect(resolveScanExitCode(report)).toBe(1);
    expect(renderHumanSummary(report)).toContain("Skills: 1 scanned");
    expect(renderHumanSummary(report)).toContain("Issues:");
    expect(renderHumanSummary(report)).toContain(`Score: ${report.score.value}`);
    expect(renderHumanSummary(report, { includeScore: false })).not.toContain("Score:");
    expect(renderHumanSummary(report)).not.toContain("Top affected skills:");
  });

  it("fails when diagnostics include blocking errors", async () => {
    const scan = {
      roots: [],
      skills: [],
      findings: [],
      diagnostics: [
        {
          code: "skill-root-unreadable",
          severity: "error",
          message: "Unable to read root",
        },
      ],
    } satisfies ScanResult;

    const report = buildScanReport({
      version: "0.0.0-test",
      directory,
      elapsedMilliseconds: 12,
      scan,
    });

    expect(report.ok).toBe(false);
    expect(report.findingCount).toBe(0);
    expect(report.score.value).toBeLessThan(100);
    expect(report.score.penalty).toBeGreaterThan(0);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: "skill-root-unreadable", severity: "error" }),
    ]);
    expect(resolveScanExitCode(report)).toBe(1);
  });

  it("does not fail or reduce score for warning diagnostics alone", async () => {
    const scan = {
      roots: [],
      skills: [],
      findings: [],
      diagnostics: [
        {
          code: "skill-root-not-found",
          severity: "warning",
          message: "Custom skills root does not exist",
        },
      ],
    } satisfies ScanResult;

    const report = buildScanReport({
      version: "0.0.0-test",
      directory,
      elapsedMilliseconds: 12,
      scan,
    });

    expect(report.ok).toBe(true);
    expect(report.findingCount).toBe(0);
    expect(report.score).toMatchObject({ value: 100, penalty: 0 });
    expect(resolveScanExitCode(report)).toBe(0);
  });
});

describe("json mode", () => {
  afterEach(() => {
    resetJsonMode();
  });

  it("writes compact JSON when requested", () => {
    const chunks: string[] = [];
    enableJsonMode({ compact: true, directory: "/tmp/project", startTime: 0 });

    writeJsonReport({ ok: true }, (text) => chunks.push(text));

    expect(chunks.join("")).toBe('{"ok":true}\n');
  });

  it("builds valid JSON error reports", () => {
    enableJsonMode({ directory: "/tmp/project", startTime: 0 });

    const report = buildJsonErrorReport(new Error("No skills found"));

    expect(report).toEqual({
      schemaVersion: 1,
      ok: false,
      directory: "/tmp/project",
      error: {
        name: "Error",
        message: "No skills found",
      },
    });
  });
});
