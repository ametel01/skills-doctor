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

    const discovered = await discoverSkillRoots({ cwd: directory });
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
    expect(resolveScanExitCode(report)).toBe(1);
    expect(renderHumanSummary(report)).toContain("Skills scanned: 1");
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
