import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanReport, ScanReportUsage } from "./build-report.js";
import { defaultReportOutputRoot } from "./default-report-output-root.js";

export type CleanupDirectoryInput = {
  readonly report: ScanReport;
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
};

export type CleanupDirectoryResult = {
  readonly directory: string;
  readonly usageJsonPath: string;
  readonly usageMarkdownPath: string;
};

export const writeCleanupDirectory = async (
  input: CleanupDirectoryInput,
): Promise<CleanupDirectoryResult> => {
  const usage = requireUsage(input.report);
  const outputRoot = input.outputRoot ?? defaultReportOutputRoot();
  const directory = path.join(
    outputRoot,
    sanitizeTimestamp(input.timestamp ?? new Date().toISOString()),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });

  const usageJsonPath = path.join(directory, "usage.json");
  const usageMarkdownPath = path.join(directory, "usage.md");
  await writeFile(
    usageJsonPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        directory: input.report.directory,
        scannedRoots: input.report.scannedRoots,
        usage,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(usageMarkdownPath, renderUsageMarkdown(input.report, usage));

  return {
    directory,
    usageJsonPath,
    usageMarkdownPath,
  };
};

const renderUsageMarkdown = (report: ScanReport, usage: ScanReportUsage): string => {
  const lines = [
    "# Skills Doctor Usage Cleanup",
    "",
    `Project root: ${report.directory}`,
    `Scanned roots: ${report.scannedRoots.map((root) => `${root.ecosystem}: ${root.rootPath}`).join("; ")}`,
    `Context budget pressure: ${usage.contextPressure.level}`,
    `Skills analyzed: ${usage.totalSkillsAnalyzed}`,
    `Used: ${usage.usedSkillCount}`,
    `Unused: ${usage.unusedSkillCount}`,
    `Unknown: ${usage.unknownSkillCount}`,
    `Duplicate same-name skills: ${usage.duplicateSkillCount}`,
    `Plugin-contributed skills: ${usage.pluginContributedSkillCount}`,
    "",
    "## Recommendations",
    "",
  ];

  for (const recommendation of usage.recommendations) {
    lines.push(
      `- ${recommendation.action}: ${recommendation.skillName}`,
      `  - Path: ${recommendation.skillPath}`,
      `  - Reason: ${recommendation.reason}`,
      `  - Confidence: ${recommendation.confidence}`,
    );
  }
  if (usage.recommendations.length === 0) {
    lines.push("- No cleanup recommendations.");
  }

  lines.push("", "## Skills By Usage", "");
  for (const skill of usage.skillsByUsage) {
    lines.push(
      `- ${skill.skillName}: ${skill.tier}, ${skill.usageCount} detected use${skill.usageCount === 1 ? "" : "s"}, ${skill.confidence} confidence`,
      `  - Path: ${skill.skillPath}`,
    );
  }

  return `${lines.join("\n")}\n`;
};

const sanitizeTimestamp = (timestamp: string): string => timestamp.replace(/[:.]/g, "-");

const requireUsage = (report: ScanReport): ScanReportUsage => {
  if (report.usage === undefined) {
    throw new Error("Cleanup directory requires usage analysis.");
  }
  return report.usage;
};
