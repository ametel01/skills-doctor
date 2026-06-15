import type { ScanReport } from "./build-report.js";
import type { Finding } from "./types.js";

export type FindingSummary = {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
  readonly topSkills: readonly SummaryGroup[];
  readonly topCategories: readonly SummaryGroup[];
};

export type SummaryGroup = {
  readonly key: string;
  readonly count: number;
};

export const summarizeFindings = (findings: readonly Finding[]): FindingSummary => ({
  errorCount: countSeverity(findings, "error"),
  warningCount: countSeverity(findings, "warning"),
  adviceCount: countSeverity(findings, "advice"),
  topSkills: topGroups(
    findings.map((finding) => finding.skillName ?? finding.skillPath),
    5,
  ),
  topCategories: topGroups(
    findings.map((finding) => finding.category),
    5,
  ),
});

export const resolveScanExitCode = (report: ScanReport): 0 | 1 => (report.errorCount > 0 ? 1 : 0);

export const renderHumanSummary = (report: ScanReport): string => {
  const summary = summarizeFindings(report.findings);
  const lines = [
    `Scanned roots: ${report.scannedRoots.length}`,
    `Skills scanned: ${report.skillCount}`,
    `Score: ${report.score.value} (${report.score.label})`,
    `Findings: ${report.findingCount} (${summary.errorCount} errors, ${summary.warningCount} warnings, ${summary.adviceCount} advice)`,
  ];

  if (summary.topSkills.length > 0) {
    lines.push(
      "Top affected skills:",
      ...summary.topSkills.map((group) => `- ${group.key}: ${group.count}`),
    );
  }

  if (summary.topCategories.length > 0) {
    lines.push(
      "Top rule categories:",
      ...summary.topCategories.map((group) => `- ${group.key}: ${group.count}`),
    );
  }

  return `${lines.join("\n")}\n`;
};

const countSeverity = (findings: readonly Finding[], severity: Finding["severity"]): number =>
  findings.filter((finding) => finding.severity === severity).length;

const topGroups = (values: readonly string[], limit: number): SummaryGroup[] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
};
