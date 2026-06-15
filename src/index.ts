export const CLI_NAME = "skills-doctor";

export const getCliBanner = (): string => `${CLI_NAME}: scaffold ready`;

export type {
  BuildScanReportInput,
  ScanReport,
  SkillSummary,
} from "./domain/build-report.js";
export { buildScanReport } from "./domain/build-report.js";
export { discoverSkillRoots } from "./domain/discover-skill-roots.js";
export { parseSkillContent } from "./domain/parse-skill.js";
export { validateQualityRules } from "./domain/rules/quality.js";
export { buildMissingSkillFinding, validateStructuralRules } from "./domain/rules/structural.js";
export { scanSkillRoots } from "./domain/scan-skills.js";
export {
  renderHumanSummary,
  resolveScanExitCode,
  summarizeFindings,
} from "./domain/summarize-findings.js";
export type {
  Diagnostic,
  Finding,
  FindingCategory,
  FindingSeverity,
  ParsedFrontmatter,
  ParseFailure,
  ParseResult,
  ScanResult,
  SkillEcosystem,
  SkillRecord,
  SkillRoot,
} from "./domain/types.js";
