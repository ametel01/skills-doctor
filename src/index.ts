export const CLI_NAME = "skills-doctor";

export const getCliBanner = (): string => `${CLI_NAME}: scaffold ready`;

export type { ScanActionOptions, ScanFlags } from "./cli/commands/scan.js";
export { scanAction } from "./cli/commands/scan.js";
export {
  type CommandAvailabilityOptions,
  isCommandAvailable,
  resolveCommand,
} from "./cli/utils/is-command-available.js";
export {
  type AgentAvailabilityProbe,
  buildRepairAgentInvocation,
  buildRepairAgentSpawnInvocation,
  type CommandInvocation,
  chooseRepairAgent,
  type DetectRepairAgentsOptions,
  detectRepairAgents,
  formatRepairAgentPreview,
  launchRepairAgent,
  REPAIR_AGENT_IDS,
  type RepairAgent,
  type RepairAgentId,
} from "./cli/utils/launch-agent.js";
export { type CommandRunner, type RunCommandResult, runCommand } from "./cli/utils/run-command.js";
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
