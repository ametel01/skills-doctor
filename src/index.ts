export const CLI_NAME = "skills-doctor";

export const getCliBanner = (): string => `${CLI_NAME}: scaffold ready`;

export { discoverSkillRoots } from "./domain/discover-skill-roots.js";
export { parseSkillContent } from "./domain/parse-skill.js";
export { scanSkillRoots } from "./domain/scan-skills.js";
export type {
  Diagnostic,
  ParsedFrontmatter,
  ParseFailure,
  ParseResult,
  ScanResult,
  SkillEcosystem,
  SkillRecord,
  SkillRoot,
} from "./domain/types.js";
