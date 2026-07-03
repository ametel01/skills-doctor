import type { ScanReport } from "./build-report.js";
import type { Finding, FindingConfidence } from "./types.js";

export type ScanGateSeverity = Finding["severity"];

export type ScanExitCodeOptions = {
  readonly failOn?: ScanGateSeverity | undefined;
  readonly minScore?: number | undefined;
};

export type FindingSummary = {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
  readonly securityCount: number;
  readonly securityConfidenceCounts: Readonly<Record<FindingConfidence, number>>;
  readonly topSkills: readonly SummaryGroup[];
  readonly topCategories: readonly SummaryGroup[];
};

export type SummaryGroup = {
  readonly key: string;
  readonly count: number;
};

export type RenderHumanSummaryOptions = {
  readonly includeScore?: boolean | undefined;
  readonly color?: boolean | undefined;
};

export const summarizeFindings = (findings: readonly Finding[]): FindingSummary => ({
  errorCount: countSeverity(qualityFindings(findings), "error"),
  warningCount: countSeverity(qualityFindings(findings), "warning"),
  adviceCount: countSeverity(qualityFindings(findings), "advice"),
  securityCount: findings.filter((finding) => finding.category === "security").length,
  securityConfidenceCounts: countSecurityConfidence(findings),
  topSkills: topGroups(
    qualityFindings(findings).map((finding) => finding.skillName ?? finding.skillPath),
    5,
  ),
  topCategories: topGroups(
    qualityFindings(findings).map((finding) => finding.category),
    5,
  ),
});

export const resolveScanExitCode = (
  report: ScanReport,
  options: ScanExitCodeOptions = {},
): 0 | 1 => {
  if (report.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return 1;
  const failOn = options.failOn ?? "error";
  if (
    qualityFindings(report.findings).some(
      (finding) => severityRank(finding.severity) >= severityRank(failOn),
    )
  ) {
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
  const shouldColor = Boolean(options.color);
  const lines = [
    `${label("Skills", shouldColor)}: ${accent(String(report.skillCount), shouldColor)} scanned`,
    report.qualityFindingCount === 0
      ? `${label("Issues", shouldColor)}: ${success("none", shouldColor)}`
      : `${label("Issues", shouldColor)}: ${danger(String(report.qualityFindingCount), shouldColor)} (${danger(String(summary.errorCount), shouldColor)} errors, ${warning(String(summary.warningCount), shouldColor)} warnings, ${dim(String(summary.adviceCount), shouldColor)} tips)`,
  ];
  if (options.includeScore ?? true) {
    lines.splice(
      1,
      0,
      `${label("Score", shouldColor)}: ${colorizeScore(String(report.score.value), report.score.value, shouldColor)} (${colorizeScore(report.score.label, report.score.value, shouldColor)})`,
    );
  }
  if (summary.securityCount > 0) {
    const confidence = formatSecurityConfidence(summary.securityConfidenceCounts);
    lines.push(
      `${label("Security findings", shouldColor)}: ${warning(String(summary.securityCount), shouldColor)} suspicious skill patterns${confidence === "" ? "" : ` (${confidence})`}`,
    );
  }
  if (report.usage !== undefined) {
    lines.push(
      `${label("Usage analysis", shouldColor)}: ${success(String(report.usage.usedSkillCount), shouldColor)} used, ${warning(String(report.usage.unusedSkillCount), shouldColor)} unused, ${dim(String(report.usage.unknownSkillCount), shouldColor)} unknown`,
    );
    lines.push(
      `${label("Context budget pressure", shouldColor)}: ${colorizePressure(report.usage.contextPressure.level, shouldColor)}`,
    );
    if (report.usage.contextPressure.recentWarningCount > 0) {
      lines.push(warning("Recent Codex logs show skill descriptions were shortened.", shouldColor));
    }
    const cleanupCandidateCount = countCleanupCandidates(report);
    if (cleanupCandidateCount > 0) {
      lines.push(
        `${label("Cleanup candidates", shouldColor)}: ${warning(String(cleanupCandidateCount), shouldColor)} enabled unused skills`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
};

const countCleanupCandidates = (report: ScanReport): number =>
  report.usage?.recommendations.filter(
    (recommendation) => recommendation.action === "disable-candidate",
  ).length ?? 0;

const countSeverity = (findings: readonly Finding[], severity: Finding["severity"]): number =>
  findings.filter((finding) => finding.severity === severity).length;

const qualityFindings = (findings: readonly Finding[]): readonly Finding[] =>
  findings.filter((finding) => finding.category !== "security");

const countSecurityConfidence = (
  findings: readonly Finding[],
): Readonly<Record<FindingConfidence, number>> => ({
  high: countConfidence(findings, "high"),
  medium: countConfidence(findings, "medium"),
  low: countConfidence(findings, "low"),
});

const countConfidence = (findings: readonly Finding[], confidence: FindingConfidence): number =>
  findings.filter((finding) => finding.category === "security" && finding.confidence === confidence)
    .length;

const formatSecurityConfidence = (counts: Readonly<Record<FindingConfidence, number>>): string =>
  (["high", "medium", "low"] as const)
    .filter((confidence) => counts[confidence] > 0)
    .map((confidence) => `${confidence}: ${counts[confidence]}`)
    .join(", ");

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

const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;

const label = (text: string, shouldColor: boolean): string => cyan(text, shouldColor);

const accent = (text: string, shouldColor: boolean): string => cyan(text, shouldColor);

const colorizeScore = (text: string, score: number, shouldColor: boolean): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return success(text, shouldColor);
  if (score >= SCORE_OK_THRESHOLD) return warning(text, shouldColor);
  return danger(text, shouldColor);
};

const colorizePressure = (level: string, shouldColor: boolean): string => {
  if (level === "high") return danger(level, shouldColor);
  if (level === "medium") return warning(level, shouldColor);
  if (level === "low") return success(level, shouldColor);
  return dim(level, shouldColor);
};

const success = (text: string, shouldColor: boolean): string => color(text, 32, shouldColor);

const warning = (text: string, shouldColor: boolean): string => color(text, 33, shouldColor);

const danger = (text: string, shouldColor: boolean): string => color(text, 31, shouldColor);

const cyan = (text: string, shouldColor: boolean): string => color(text, 36, shouldColor);

const dim = (text: string, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[2m${text}\x1b[22m` : text;

const color = (text: string, code: number, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[${code}m${text}\x1b[39m` : text;
