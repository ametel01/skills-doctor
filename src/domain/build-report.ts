import type {
  SkillCleanupRecommendation,
  SkillUsageAnalysis,
  SkillUsageSummary,
} from "./analyze-skill-usage.js";
import { calculateScore, type ScoreSummary } from "./calculate-score.js";
import type { ContextBudgetPressure } from "./discover-usage-sources.js";
import { indexFindingsBySkillPath } from "./group-findings.js";
import type {
  CapabilityKind,
  Diagnostic,
  Finding,
  ScanResult,
  SecurityPriority,
  SkillRoot,
} from "./types.js";

export type SkillSummary = {
  readonly ecosystem: string;
  readonly name: string;
  readonly directoryName: string;
  readonly skillPath: string;
  readonly findingCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
};

export type ScanReport = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly version: string;
  readonly directory: string;
  readonly elapsedMilliseconds: number;
  readonly scannedRoots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
  readonly skillCount: number;
  readonly findingCount: number;
  readonly qualityFindingCount: number;
  readonly securityFindingCount: number;
  readonly securityPriorityCounts: Readonly<Record<SecurityPriority, number>>;
  readonly securityCapabilityCounts: Partial<Record<CapabilityKind, number>>;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
  readonly score: ScoreSummary;
  readonly skills: readonly SkillSummary[];
  readonly findings: readonly Finding[];
  readonly usage?: ScanReportUsage | undefined;
  readonly handoffRequested: boolean;
};

export type ScanReportUsage = {
  readonly sourcePaths: readonly string[];
  readonly readableSourceCount: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly contextPressure: ContextBudgetPressure;
  readonly totalSkillsAnalyzed: number;
  readonly usedSkillCount: number;
  readonly unusedSkillCount: number;
  readonly unknownSkillCount: number;
  readonly duplicateSkillCount: number;
  readonly pluginContributedSkillCount: number;
  readonly skillsByUsage: readonly SkillUsageSummary[];
  readonly recommendations: readonly SkillCleanupRecommendation[];
  readonly topRecommendations: readonly SkillCleanupRecommendation[];
};

export type BuildScanReportInput = {
  readonly version: string;
  readonly directory: string;
  readonly elapsedMilliseconds: number;
  readonly scan: ScanResult;
  readonly usage?: BuildScanReportUsageInput | undefined;
  readonly handoffRequested?: boolean;
};

export type BuildScanReportUsageInput = {
  readonly analysis: SkillUsageAnalysis;
  readonly contextPressure: ContextBudgetPressure;
};

export const buildScanReport = (input: BuildScanReportInput): ScanReport => {
  const qualityFindings = input.scan.findings.filter(isQualityFinding);
  const scoreFindings = input.scan.findings.filter(isScoreFinding);
  const securityFindings = input.scan.findings.filter(isSecurityFinding);
  const securityFindingCount = securityFindings.length;
  const errorCount = countSeverity(qualityFindings, "error");
  const warningCount = countSeverity(qualityFindings, "warning");
  const adviceCount = countSeverity(qualityFindings, "advice");
  const diagnosticErrorCount = countDiagnosticSeverity(input.scan.diagnostics, "error");
  const hasErrorDiagnostics = diagnosticErrorCount > 0;
  const qualityFindingsBySkillPath = indexFindingsBySkillPath(qualityFindings);
  const diagnosticErrorCodes: string[] = [];
  for (const diagnostic of input.scan.diagnostics) {
    if (diagnostic.severity === "error") diagnosticErrorCodes.push(diagnostic.code);
  }

  return {
    schemaVersion: 1,
    ok: errorCount === 0 && !hasErrorDiagnostics,
    version: input.version,
    directory: input.directory,
    elapsedMilliseconds: input.elapsedMilliseconds,
    scannedRoots: input.scan.roots,
    diagnostics: input.scan.diagnostics,
    skillCount: input.scan.skills.length,
    findingCount: input.scan.findings.length,
    qualityFindingCount: qualityFindings.length,
    securityFindingCount,
    securityPriorityCounts: countSecurityPriorities(securityFindings),
    securityCapabilityCounts: countSecurityCapabilities(securityFindings),
    errorCount,
    warningCount,
    adviceCount,
    score: calculateScore(scoreFindings, { diagnosticErrorCodes }),
    skills: input.scan.skills.map((skill) => {
      const skillFindings = qualityFindingsBySkillPath.get(skill.skillPath) ?? [];
      return {
        ecosystem: skill.ecosystem,
        name: skill.parseResult.ok
          ? (readString(skill.parseResult.frontmatter.data.name) ?? skill.directoryName)
          : skill.directoryName,
        directoryName: skill.directoryName,
        skillPath: skill.skillPath,
        findingCount: skillFindings.length,
        errorCount: countSeverity(skillFindings, "error"),
        warningCount: countSeverity(skillFindings, "warning"),
        adviceCount: countSeverity(skillFindings, "advice"),
      };
    }),
    findings: input.scan.findings,
    ...(input.usage === undefined ? {} : { usage: buildReportUsage(input.usage) }),
    handoffRequested: input.handoffRequested ?? false,
  };
};

const buildReportUsage = (input: BuildScanReportUsageInput): ScanReportUsage => ({
  sourcePaths: input.analysis.sourcePaths,
  readableSourceCount: input.analysis.readableSourceCount,
  diagnostics: input.analysis.diagnostics,
  contextPressure: input.contextPressure,
  totalSkillsAnalyzed: input.analysis.totalSkills,
  usedSkillCount: input.analysis.usedSkillCount,
  unusedSkillCount: input.analysis.unusedSkillCount,
  unknownSkillCount: input.analysis.unknownSkillCount,
  duplicateSkillCount: input.analysis.duplicateSkillCount,
  pluginContributedSkillCount: input.analysis.pluginContributedSkillCount,
  skillsByUsage: input.analysis.skillsByUsage,
  recommendations: input.analysis.recommendations,
  topRecommendations: input.analysis.recommendations.filter(
    (recommendation) => recommendation.action === "disable-candidate",
  ),
});

const countSeverity = (findings: readonly Finding[], severity: Finding["severity"]): number =>
  findings.filter((finding) => finding.severity === severity).length;

const isQualityFinding = (finding: Finding): boolean => finding.category !== "security";
const isSecurityFinding = (finding: Finding): boolean => finding.category === "security";
const isScoreFinding = (finding: Finding): boolean =>
  finding.category !== "security" || finding.priority === "P2";

const countSecurityPriorities = (
  findings: readonly Finding[],
): Readonly<Record<SecurityPriority, number>> => ({
  P0: findings.filter((finding) => finding.priority === "P0").length,
  P1: findings.filter((finding) => finding.priority === "P1").length,
  P2: findings.filter((finding) => finding.priority === "P2").length,
});

const countSecurityCapabilities = (
  findings: readonly Finding[],
): Partial<Record<CapabilityKind, number>> => {
  const counts: Partial<Record<CapabilityKind, number>> = {};
  for (const finding of findings) {
    for (const capability of finding.capabilities ?? []) {
      counts[capability] = (counts[capability] ?? 0) + 1;
    }
  }
  return counts;
};

const countDiagnosticSeverity = (
  diagnostics: readonly Diagnostic[],
  severity: Diagnostic["severity"],
): number => diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
