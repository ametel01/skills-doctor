import { calculateScore, type ScoreSummary } from "./calculate-score.js";
import type { Diagnostic, Finding, ScanResult, SkillRoot } from "./types.js";

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
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
  readonly score: ScoreSummary;
  readonly skills: readonly SkillSummary[];
  readonly findings: readonly Finding[];
  readonly handoffRequested: boolean;
};

export type BuildScanReportInput = {
  readonly version: string;
  readonly directory: string;
  readonly elapsedMilliseconds: number;
  readonly scan: ScanResult;
  readonly handoffRequested?: boolean;
};

export const buildScanReport = (input: BuildScanReportInput): ScanReport => {
  const errorCount = countSeverity(input.scan.findings, "error");
  const warningCount = countSeverity(input.scan.findings, "warning");
  const adviceCount = countSeverity(input.scan.findings, "advice");
  const diagnosticErrorCount = countDiagnosticSeverity(input.scan.diagnostics, "error");
  const hasErrorDiagnostics = diagnosticErrorCount > 0;

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
    errorCount,
    warningCount,
    adviceCount,
    score: calculateScore(input.scan.findings),
    skills: input.scan.skills.map((skill) => {
      const skillFindings = input.scan.findings.filter(
        (finding) => finding.skillPath === skill.skillPath,
      );
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
    handoffRequested: input.handoffRequested ?? false,
  };
};

const countSeverity = (findings: readonly Finding[], severity: Finding["severity"]): number =>
  findings.filter((finding) => finding.severity === severity).length;

const countDiagnosticSeverity = (
  diagnostics: readonly Diagnostic[],
  severity: Diagnostic["severity"],
): number => diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
