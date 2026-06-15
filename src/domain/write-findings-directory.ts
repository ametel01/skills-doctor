import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "./build-report.js";
import type { Finding } from "./types.js";

export type FindingsDirectoryInput = {
  readonly report: ScanReport;
  readonly findings?: readonly Finding[] | undefined;
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
};

export type FindingsDirectoryResult = {
  readonly directory: string;
  readonly findingsJsonPath: string;
  readonly findingsMarkdownPath: string;
  readonly skillReportPaths: readonly string[];
};

export const writeFindingsDirectory = async (
  input: FindingsDirectoryInput,
): Promise<FindingsDirectoryResult> => {
  const findings = input.findings ?? input.report.findings;
  const directory = path.join(
    input.outputRoot ?? path.join(input.report.directory, ".skills-doctor", "reports"),
    sanitizeTimestamp(input.timestamp ?? new Date().toISOString()),
  );
  const skillDirectory = path.join(directory, "skills");

  await mkdir(skillDirectory, { recursive: true });

  const findingsJsonPath = path.join(directory, "findings.json");
  const findingsMarkdownPath = path.join(directory, "findings.md");
  const skillReportPaths: string[] = [];

  await writeFile(
    findingsJsonPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        directory: input.report.directory,
        scannedRoots: input.report.scannedRoots,
        skills: input.report.skills,
        findingCount: findings.length,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(findingsMarkdownPath, renderFindingsMarkdown(input.report, findings));

  for (const group of groupFindingsBySkill(findings)) {
    const skillReportPath = path.join(skillDirectory, `${safeFileName(group.skillLabel)}.md`);
    await writeFile(skillReportPath, renderSkillFindingsMarkdown(group.skillLabel, group.findings));
    skillReportPaths.push(skillReportPath);
  }

  return {
    directory,
    findingsJsonPath,
    findingsMarkdownPath,
    skillReportPaths,
  };
};

const sanitizeTimestamp = (timestamp: string): string => timestamp.replace(/[:.]/g, "-");

const renderFindingsMarkdown = (report: ScanReport, findings: readonly Finding[]): string => {
  const lines = [
    "# Skills Doctor Findings",
    "",
    `Project root: ${report.directory}`,
    `Scanned roots: ${report.scannedRoots.map((root) => `${root.ecosystem}: ${root.rootPath}`).join("; ")}`,
    `Findings: ${findings.length}`,
    "",
  ];

  for (const group of groupFindingsBySkill(findings)) {
    lines.push(`## ${group.skillLabel}`, "", `File: ${group.skillPath}`, "");
    for (const finding of group.findings) {
      lines.push(
        `- [${finding.severity}] ${finding.ruleId}: ${finding.title}`,
        `  - Location: ${finding.skillPath}${finding.line === undefined ? "" : `:${finding.line}`}`,
        `  - Message: ${finding.message}`,
        `  - Repair: ${finding.suggestion}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

const renderSkillFindingsMarkdown = (skillLabel: string, findings: readonly Finding[]): string => {
  const lines = [`# ${skillLabel}`, "", `Findings: ${findings.length}`, ""];
  for (const finding of findings) {
    lines.push(
      `## ${finding.ruleId}`,
      "",
      `Severity: ${finding.severity}`,
      `Category: ${finding.category}`,
      `Location: ${finding.skillPath}${finding.line === undefined ? "" : `:${finding.line}`}`,
      "",
      finding.message,
      "",
      `Repair: ${finding.suggestion}`,
      "",
    );
  }
  return lines.join("\n");
};

type SkillFindingGroup = {
  readonly skillLabel: string;
  readonly skillPath: string;
  readonly findings: readonly Finding[];
};

const groupFindingsBySkill = (findings: readonly Finding[]): readonly SkillFindingGroup[] => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    groups.set(finding.skillPath, [...(groups.get(finding.skillPath) ?? []), finding]);
  }
  return [...groups.entries()]
    .map(([skillPath, skillFindings]) => ({
      skillPath,
      skillLabel: skillFindings[0]?.skillName ?? path.basename(path.dirname(skillPath)),
      findings: skillFindings,
    }))
    .sort((left, right) => left.skillLabel.localeCompare(right.skillLabel));
};

const safeFileName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "skill";
