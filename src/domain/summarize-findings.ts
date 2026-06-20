import type { ScanReport } from "./build-report.js";
import type { Finding } from "./types.js";

export type ScanGateSeverity = Finding["severity"];

export type ScanExitCodeOptions = {
  readonly failOn?: ScanGateSeverity | undefined;
  readonly minScore?: number | undefined;
};

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

export type RenderHumanSummaryOptions = {
  readonly includeScore?: boolean | undefined;
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

export const resolveScanExitCode = (
  report: ScanReport,
  options: ScanExitCodeOptions = {},
): 0 | 1 => {
  if (report.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return 1;
  const failOn = options.failOn ?? "error";
  if (report.findings.some((finding) => severityRank(finding.severity) >= severityRank(failOn))) {
    return 1;
  }
  if (options.minScore !== undefined && report.score.value < options.minScore) return 1;
  return 0;
};

export const renderHumanSummary = (
  report: ScanReport,
  options: RenderHumanSummaryOptions = {},
): string => {
  const summary = summarizeFindings(report.findings);
  const lines = [
    `Skills: ${report.skillCount} scanned`,
    report.findingCount === 0
      ? "Issues: none"
      : `Issues: ${report.findingCount} (${summary.errorCount} errors, ${summary.warningCount} warnings, ${summary.adviceCount} tips)`,
  ];
  if (options.includeScore ?? true) {
    lines.splice(1, 0, `Score: ${report.score.value} (${report.score.label})`);
  }
  if (report.usage !== undefined) {
    lines.push(
      `Usage analysis: ${report.usage.usedSkillCount} used, ${report.usage.unusedSkillCount} unused, ${report.usage.unknownSkillCount} unknown`,
    );
    lines.push(`Context budget pressure: ${report.usage.contextPressure.level}`);
    if (report.usage.contextPressure.recentWarningCount > 0) {
      lines.push("Recent Codex logs show skill descriptions were shortened.");
    }
    if (report.usage.topRecommendations.length > 0) {
      lines.push(`Cleanup candidates: ${report.usage.topRecommendations.length}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

const countSeverity = (findings: readonly Finding[], severity: Finding["severity"]): number =>
  findings.filter((finding) => finding.severity === severity).length;

const severityRank = (severity: ScanGateSeverity): number => {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
};

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
