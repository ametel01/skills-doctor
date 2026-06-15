export const CLI_NAME = "skills-doctor";

export const getCliBanner = (): string => `${CLI_NAME}: scaffold ready`;

export { discoverSkillRoots } from "./domain/discover-skill-roots.js";
export { parseSkillContent } from "./domain/parse-skill.js";
export { buildMissingSkillFinding, validateStructuralRules } from "./domain/rules/structural.js";
export { scanSkillRoots } from "./domain/scan-skills.js";
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
