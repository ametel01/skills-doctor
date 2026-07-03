import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "./build-report.js";
import { defaultReportOutputRoot } from "./default-report-output-root.js";
import { groupFindingsByKey } from "./group-findings.js";
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
  const outputRoot = input.outputRoot ?? defaultReportOutputRoot();
  const directory = path.join(
    outputRoot,
    sanitizeTimestamp(input.timestamp ?? new Date().toISOString()),
  );
  const skillDirectory = path.join(directory, "skills");

  await mkdir(skillDirectory, { recursive: true, mode: 0o700 });

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
        score: input.report.score,
        findingCount: findings.length,
        findings,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(findingsMarkdownPath, renderFindingsMarkdown(input.report, findings));

  for (const group of groupFindingsBySkill(findings)) {
    const skillReportPath = path.join(
      skillDirectory,
      skillReportFileName(group.skillLabel, path.relative(input.report.directory, group.skillPath)),
    );
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
    `Score: ${report.score.value} (${report.score.label})`,
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
      lines.push(...renderSecurityMetadata(finding, "  - "));
      if (finding.evidence !== undefined) {
        lines.push("  - Evidence:");
        for (const line of finding.evidence.excerpt) {
          const marker = line.highlighted ? ">" : " ";
          lines.push(`    ${marker} ${line.line}: ${line.text}`);
        }
      }
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
    lines.push(...renderSecurityMetadata(finding, ""), "");
    if (finding.evidence !== undefined) {
      lines.push("Evidence:", "", "```text");
      for (const line of finding.evidence.excerpt) {
        const marker = line.highlighted ? ">" : " ";
        lines.push(`${marker} ${line.line}: ${line.text}`);
      }
      lines.push("```", "");
    }
  }
  return lines.join("\n");
};

const renderSecurityMetadata = (finding: Finding, prefix: string): readonly string[] => {
  const lines: string[] = [];
  if (finding.confidence !== undefined) {
    lines.push(`${prefix}Confidence: ${finding.confidence}`);
  }
  if (finding.rationale !== undefined) {
    lines.push(`${prefix}Rationale: ${finding.rationale}`);
  }
  if (finding.counterevidence !== undefined && finding.counterevidence.length > 0) {
    lines.push(`${prefix}Counterevidence:`);
    for (const item of finding.counterevidence) {
      lines.push(`${prefix}- ${item}`);
    }
  }
  return lines;
};

type SkillFindingGroup = {
  readonly skillLabel: string;
  readonly skillPath: string;
  readonly findings: readonly Finding[];
};

const groupFindingsBySkill = (findings: readonly Finding[]): readonly SkillFindingGroup[] => {
  return groupFindingsByKey(findings, (finding) => finding.skillPath)
    .map((group) => ({
      skillPath: group.key,
      skillLabel: group.findings[0]?.skillName ?? path.basename(path.dirname(group.key)),
      findings: group.findings,
    }))
    .sort((left, right) => left.skillLabel.localeCompare(right.skillLabel));
};

const safeFileName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "skill";

const skillReportFileName = (skillLabel: string, relativeSkillPath: string): string => {
  const readableName = safeFileName(`${skillLabel}-${relativeSkillPath}`);
  const pathHash = createHash("sha256").update(relativeSkillPath).digest("hex").slice(0, 8);
  return `${readableName}-${pathHash}.md`;
};
