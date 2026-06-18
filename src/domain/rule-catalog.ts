import type { FindingCategory, FindingSeverity } from "./types.js";

export type RuleCatalogEntry = {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly categories: readonly FindingCategory[];
  readonly description: string;
};

export const ruleCatalog = [
  {
    ruleId: "missing-skill",
    severity: "error",
    categories: ["frontmatter"],
    description: "A manually validated skill directory is missing SKILL.md.",
  },
  {
    ruleId: "missing-frontmatter",
    severity: "error",
    categories: ["frontmatter"],
    description: "SKILL.md does not start with YAML frontmatter delimited by ---.",
  },
  {
    ruleId: "invalid-frontmatter",
    severity: "error",
    categories: ["frontmatter"],
    description: "SKILL.md frontmatter could not be read.",
  },
  {
    ruleId: "invalid-yaml",
    severity: "error",
    categories: ["frontmatter"],
    description: "SKILL.md frontmatter YAML is invalid.",
  },
  {
    ruleId: "frontmatter-not-map",
    severity: "error",
    categories: ["frontmatter"],
    description: "SKILL.md frontmatter is not a mapping.",
  },
  {
    ruleId: "unknown-frontmatter-field",
    severity: "warning",
    categories: ["frontmatter"],
    description: "Frontmatter contains unsupported fields.",
  },
  {
    ruleId: "missing-name",
    severity: "error",
    categories: ["frontmatter"],
    description: "Required name field is missing or empty.",
  },
  {
    ruleId: "missing-description",
    severity: "error",
    categories: ["description"],
    description: "Required description field is missing or empty.",
  },
  {
    ruleId: "description-too-long",
    severity: "error",
    categories: ["description"],
    description: "Description exceeds maximum length.",
  },
  {
    ruleId: "name-too-long",
    severity: "error",
    categories: ["frontmatter"],
    description: "Skill name exceeds maximum length.",
  },
  {
    ruleId: "invalid-name-characters",
    severity: "error",
    categories: ["frontmatter"],
    description: "Skill name has disallowed characters.",
  },
  {
    ruleId: "invalid-name-hyphen-edge",
    severity: "error",
    categories: ["frontmatter"],
    description: "Skill name starts or ends with a hyphen.",
  },
  {
    ruleId: "invalid-name-consecutive-hyphens",
    severity: "error",
    categories: ["frontmatter"],
    description: "Skill name contains consecutive hyphens.",
  },
  {
    ruleId: "name-directory-mismatch",
    severity: "error",
    categories: ["frontmatter"],
    description: "name does not match parent directory.",
  },
  {
    ruleId: "invalid-license-field",
    severity: "warning",
    categories: ["frontmatter"],
    description: "Optional license field is not a string.",
  },
  {
    ruleId: "invalid-compatibility-field",
    severity: "error",
    categories: ["frontmatter"],
    description: "Optional compatibility field is invalid or too long.",
  },
  {
    ruleId: "compatibility-too-long",
    severity: "error",
    categories: ["frontmatter"],
    description: "Optional compatibility value exceeds limit.",
  },
  {
    ruleId: "invalid-metadata-field",
    severity: "error",
    categories: ["frontmatter"],
    description: "Optional metadata field is not a map.",
  },
  {
    ruleId: "invalid-allowed-tools-field",
    severity: "error",
    categories: ["frontmatter"],
    description: "allowed-tools is malformed.",
  },
  {
    ruleId: "allowed-tools-experimental",
    severity: "warning",
    categories: ["frontmatter"],
    description: "allowed-tools support is experimental.",
  },
  {
    ruleId: "weak-description-trigger",
    severity: "warning",
    categories: ["description"],
    description: "Description lacks an activation trigger.",
  },
  {
    ruleId: "vague-description",
    severity: "warning",
    categories: ["description"],
    description: "Description is too generic.",
  },
  {
    ruleId: "implementation-focused-description",
    severity: "advice",
    categories: ["description"],
    description: "Description describes implementation details over user intent.",
  },
  {
    ruleId: "placeholder-body",
    severity: "warning",
    categories: ["body-quality"],
    description: "Placeholder text exists in body.",
  },
  {
    ruleId: "generic-body",
    severity: "warning",
    categories: ["body-quality"],
    description: "Body is overly generic.",
  },
  {
    ruleId: "missing-workflow-steps",
    severity: "warning",
    categories: ["body-quality"],
    description: "No concrete workflow structure is present.",
  },
  {
    ruleId: "tool-menu-without-default",
    severity: "advice",
    categories: ["body-quality"],
    description: "Tool lists without a default path.",
  },
  {
    ruleId: "destructive-without-safety",
    severity: "warning",
    categories: ["body-quality"],
    description: "Destructive actions lack safety constraints.",
  },
  {
    ruleId: "skill-md-too-many-lines",
    severity: "warning",
    categories: ["progressive-disclosure"],
    description: "Very long markdown body for single skill.",
  },
  {
    ruleId: "skill-md-too-many-tokens",
    severity: "warning",
    categories: ["progressive-disclosure"],
    description: "Body token estimate exceeds recommended budget.",
  },
  {
    ruleId: "generic-resource-reference",
    severity: "warning",
    categories: ["progressive-disclosure"],
    description: "Resource directory is referenced without a specific trigger.",
  },
  {
    ruleId: "script-without-help-guidance",
    severity: "warning",
    categories: ["scripts"],
    description: "Script reference lacks usage/help documentation.",
  },
  {
    ruleId: "interactive-script-guidance",
    severity: "warning",
    categories: ["scripts"],
    description: "Script guidance appears interactive.",
  },
  {
    ruleId: "unpinned-package-runner",
    severity: "advice",
    categories: ["scripts"],
    description: "Unpinned package-runner command is used.",
  },
  {
    ruleId: "missing-referenced-resource",
    severity: "warning",
    categories: ["references", "scripts", "assets"],
    description: "Referenced scripts/, references/, or assets/ file does not exist in-skill.",
  },
  {
    ruleId: "resource-reference-escapes-skill",
    severity: "warning",
    categories: ["references", "scripts", "assets"],
    description: "Resource references attempt directory traversal outside the skill directory.",
  },
  {
    ruleId: "missing-skill-evals",
    severity: "advice",
    categories: ["evals"],
    description: "Non-trivial skill lacks evals/evals.json.",
  },
  {
    ruleId: "cross-ecosystem-skill-divergence",
    severity: "warning",
    categories: ["cross-ecosystem"],
    description: "Same-name skills diverge across Claude/Codex within the same scope.",
  },
] as const satisfies readonly RuleCatalogEntry[];
