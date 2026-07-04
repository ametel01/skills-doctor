import type { ScanReport } from "./build-report.js";
import type { CapabilityKind, Finding, FindingConfidence, SecurityPriority } from "./types.js";

export type ScanGateSeverity = Finding["severity"];

export type ScanExitCodeOptions = {
  readonly failOn?: ScanGateSeverity | undefined;
  readonly failOnSecurity?: SecurityPriority | undefined;
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

export type SecurityReviewIncident = {
  readonly primaryFinding: Finding;
  readonly findings: readonly Finding[];
  readonly priority: SecurityPriority | undefined;
  readonly skillName: string | undefined;
  readonly skillPath: string;
  readonly artifactPath: string;
  readonly relatedRuleIds: readonly string[];
  readonly capabilities: readonly CapabilityKind[];
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
  const failOnSecurity = options.failOnSecurity ?? "P0";
  if (
    report.findings.some(
      (finding) =>
        finding.category === "security" &&
        finding.priority !== undefined &&
        securityPriorityRank(finding.priority) >= securityPriorityRank(failOnSecurity),
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
    const incidents = buildSecurityReviewIncidents(report.findings);
    const confidence = formatSecurityConfidence(summary.securityConfidenceCounts);
    const priorities = formatSecurityPriorities(report.securityPriorityCounts);
    const capabilities = formatSecurityCapabilities(report.securityCapabilityCounts);
    lines.push(
      `${label("Security review", shouldColor)}: ${warning(String(incidents.length), shouldColor)} incident${incidents.length === 1 ? "" : "s"} from ${warning(String(summary.securityCount), shouldColor)} suspicious pattern${summary.securityCount === 1 ? "" : "s"}${confidence === "" ? "" : ` (${confidence})`}${priorities === "" ? "" : `; ${priorities}`}${capabilities === "" ? "" : `; ${capabilities}`}`,
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

export const buildSecurityReviewIncidents = (
  findings: readonly Finding[],
): readonly SecurityReviewIncident[] => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings.filter((candidate) => candidate.category === "security")) {
    const key = securityIncidentKey(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }

  return [...groups.values()]
    .map((groupFindings) => {
      const sortedFindings = [...groupFindings].sort(compareSecurityFindingsForReview);
      const primaryFinding = sortedFindings[0] ?? groupFindings[0];
      if (primaryFinding === undefined) {
        throw new Error("Security incident group must contain at least one finding.");
      }
      return {
        primaryFinding,
        findings: sortedFindings,
        priority: primaryFinding.priority,
        skillName: primaryFinding.skillName,
        skillPath: primaryFinding.skillPath,
        artifactPath: findingArtifactPath(primaryFinding),
        relatedRuleIds: [...new Set(sortedFindings.map((finding) => finding.ruleId))],
        capabilities: [
          ...new Set(sortedFindings.flatMap((finding) => finding.capabilities ?? [])),
        ].sort(),
      };
    })
    .sort(compareSecurityIncidentsForReview);
};

const securityIncidentKey = (finding: Finding): string =>
  [finding.skillPath, findingArtifactPath(finding), classifySecurityIncident(finding)].join("\0");

const findingArtifactPath = (finding: Finding): string =>
  finding.evidenceChain?.items[0]?.path ?? finding.evidence?.path ?? finding.skillPath;

const classifySecurityIncident = (finding: Finding): string => {
  const capabilities = new Set(finding.capabilities ?? []);
  if (
    finding.ruleId === "SKILL004_EXFIL_CHAIN" ||
    ((finding.ruleId === "SKILL003_SECRET_ACCESS" ||
      finding.ruleId === "SKILL102_MISSING_DENYLIST" ||
      finding.ruleId === "SKILL105_CROSS_MODAL_MISMATCH") &&
      (capabilities.has("reads_secrets") || capabilities.has("network_egress")))
  ) {
    return "data-exfiltration";
  }
  if (
    finding.ruleId === "SKILL002_PERMISSION_BYPASS" ||
    finding.ruleId === "SKILL101_BROAD_ALLOWED_TOOLS" ||
    finding.ruleId === "SKILL107_UNTRUSTED_MCP" ||
    finding.ruleId === "SKILL108_MCP_SCOPE_EXCESS" ||
    capabilities.has("broad_tool_access") ||
    capabilities.has("mcp_access") ||
    capabilities.has("bypasses_approval")
  ) {
    return "permissions";
  }
  if (finding.priority === "P2") return "hygiene";
  return finding.ruleId;
};

const compareSecurityIncidentsForReview = (
  left: SecurityReviewIncident,
  right: SecurityReviewIncident,
): number =>
  securityPriorityRank(right.priority ?? "P2") - securityPriorityRank(left.priority ?? "P2") ||
  compareSecurityFindingsForReview(left.primaryFinding, right.primaryFinding) ||
  left.artifactPath.localeCompare(right.artifactPath);

const compareSecurityFindingsForReview = (left: Finding, right: Finding): number =>
  securityPriorityRank(right.priority ?? "P2") - securityPriorityRank(left.priority ?? "P2") ||
  securityRuleRank(left.ruleId) - securityRuleRank(right.ruleId) ||
  left.ruleId.localeCompare(right.ruleId);

const SECURITY_RULE_REVIEW_ORDER = [
  "SKILL004_EXFIL_CHAIN",
  "SKILL007_REMOTE_CODE_EXEC",
  "SKILL003_SECRET_ACCESS",
  "SKILL006_PERSISTENCE",
  "SKILL005_DESTRUCTIVE_COMMANDS",
  "SKILL002_PERMISSION_BYPASS",
  "SKILL008_OBFUSCATION",
  "SKILL107_UNTRUSTED_MCP",
  "SKILL108_MCP_SCOPE_EXCESS",
  "SKILL101_BROAD_ALLOWED_TOOLS",
  "SKILL102_MISSING_DENYLIST",
  "SKILL105_CROSS_MODAL_MISMATCH",
  "SKILL104_EXTERNAL_DEPENDENCY",
  "SKILL106_SELF_MODIFYING_SKILL",
] as const;

const securityRuleRank = (ruleId: string): number => {
  const index = (SECURITY_RULE_REVIEW_ORDER as readonly string[]).indexOf(ruleId);
  return index === -1 ? SECURITY_RULE_REVIEW_ORDER.length : index;
};

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

const formatSecurityConfidence = (counts: Readonly<Record<FindingConfidence, number>>): string => {
  const parts: string[] = [];
  for (const confidence of ["high", "medium", "low"] as const) {
    if (counts[confidence] > 0) parts.push(`${confidence}: ${counts[confidence]}`);
  }
  return parts.join(", ");
};

const formatSecurityPriorities = (counts: Readonly<Record<SecurityPriority, number>>): string => {
  const parts: string[] = [];
  for (const priority of ["P0", "P1", "P2"] as const) {
    if (counts[priority] > 0)
      parts.push(`${formatSecuritySeverity(priority)}: ${counts[priority]}`);
  }
  return parts.length === 0 ? "" : `severity ${parts.join(", ")}`;
};

const formatSecuritySeverity = (priority: SecurityPriority): string => {
  if (priority === "P0") return "Critical";
  if (priority === "P1") return "High";
  return "Medium";
};

const formatSecurityCapabilities = (counts: Partial<Record<CapabilityKind, number>>): string => {
  const parts = Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 4)
    .map(([capability, count]) => `${capability}: ${count}`);
  return parts.length === 0 ? "" : `capabilities ${parts.join(", ")}`;
};

const severityRank = (severity: ScanGateSeverity): number => {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
};

const securityPriorityRank = (priority: SecurityPriority): number => {
  if (priority === "P0") return 3;
  if (priority === "P1") return 2;
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
