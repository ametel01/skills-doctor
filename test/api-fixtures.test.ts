import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildScanReport,
  discoverSkillRoots,
  type ScanReport,
  scanSkillRoots,
} from "../src/index.js";

describe("public API facade", () => {
  it("exports scanner domain helpers without CLI actions", async () => {
    const api = await import("../src/index.js");

    expect(api).toHaveProperty("discoverSkillRoots");
    expect(api).toHaveProperty("discoverUsageSources");
    expect(api).toHaveProperty("scanSkillRoots");
    expect(api).toHaveProperty("analyzeSkillUsage");
    expect(api).toHaveProperty("buildScanReport");
    expect(api).toHaveProperty("buildCleanupHandoffPrompt");
    expect(api).toHaveProperty("writeCleanupDirectory");
    expect(api).toHaveProperty("calculateScore");
    expect(api).toHaveProperty("getScoreLabel");
    expect(api).toHaveProperty("ruleCatalog");
    expect(api).toHaveProperty("buildMissingSkillFinding");
    expect(api).toHaveProperty("validateSecurityRules");
    expect(api).not.toHaveProperty("scanAction");
    expect(api).not.toHaveProperty("prepareRepairHandoff");
    expect(api).not.toHaveProperty("launchRepairAgent");
  });
});

describe("fixture scanner coverage", () => {
  it("accepts a valid strong skill fixture", async () => {
    const report = await scanFixture("valid-strong");

    expect(report.ok).toBe(true);
    expect(report.skillCount).toBe(1);
    expect(report.findingCount).toBe(0);
  });

  it("reports malformed skills", async () => {
    const report = await scanFixture("malformed");

    expect(ruleIds(report)).toContain("missing-frontmatter");
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it("reports weak descriptions", async () => {
    const report = await scanFixture("weak-descriptions");

    expect(ruleIds(report)).toEqual(
      expect.arrayContaining(["vague-description", "weak-description-trigger"]),
    );
  });

  it("reports missing referenced resources", async () => {
    const report = await scanFixture("missing-resources");

    expect(ruleIds(report)).toContain("missing-referenced-resource");
  });

  it("reports script guidance warnings", async () => {
    const report = await scanFixture("script-warnings");

    expect(ruleIds(report)).toEqual(
      expect.arrayContaining(["script-without-help-guidance", "unpinned-package-runner"]),
    );
  });

  it("reports duplicate cross-ecosystem divergence", async () => {
    const report = await scanFixture("duplicate-cross");

    expect(report.scannedRoots.map((root) => root.ecosystem)).toEqual(["claude", "codex"]);
    expect(
      ruleIds(report).filter((ruleId) => ruleId === "cross-ecosystem-skill-divergence"),
    ).toHaveLength(2);
  });

  it("keeps JSON report shape stable", async () => {
    const report = await scanFixture("weak-descriptions");
    const json = JSON.parse(JSON.stringify(report)) as ScanReport;

    expect(Object.keys(json)).toEqual([
      "schemaVersion",
      "ok",
      "version",
      "directory",
      "elapsedMilliseconds",
      "scannedRoots",
      "diagnostics",
      "skillCount",
      "findingCount",
      "errorCount",
      "warningCount",
      "adviceCount",
      "score",
      "skills",
      "findings",
      "handoffRequested",
    ]);
    expect(json.score).toMatchObject({
      value: expect.any(Number),
      label: expect.any(String),
      penalty: expect.any(Number),
    });
    expect(json.findings[0]).toMatchObject({
      ruleId: expect.any(String),
      severity: expect.any(String),
      category: expect.any(String),
      skillPath: expect.stringContaining("SKILL.md"),
      agentRepairable: true,
    });
  });
});

const scanFixture = async (name: string): Promise<ScanReport> => {
  const directory = fixturePath(name);
  const discovered = await discoverSkillRoots({ cwd: directory, homeDir: `${directory}-home` });
  const scan = await scanSkillRoots({ roots: discovered.roots });
  return buildScanReport({
    version: "0.0.0-test",
    directory,
    elapsedMilliseconds: 0,
    scan,
  });
};

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const ruleIds = (report: ScanReport): readonly string[] =>
  report.findings.map((finding) => finding.ruleId);
