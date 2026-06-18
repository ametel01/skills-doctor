import path from "node:path";
import type {
  Finding,
  FindingCategory,
  FindingSeverity,
  SkillRecord,
  SkillRoot,
} from "../types.js";

const VALID_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

export const buildMissingSkillFinding = (input: {
  readonly root: SkillRoot;
  readonly skillDir: string;
}): Finding => {
  const skillPath = path.join(input.skillDir, "SKILL.md");
  return {
    ruleId: "missing-skill",
    severity: "error",
    category: "frontmatter",
    title: "Missing SKILL.md",
    message: `Skill candidate ${input.skillDir} is missing ${skillPath}.`,
    suggestion:
      "Create SKILL.md with YAML frontmatter and Markdown instructions, or remove this directory from the skills root.",
    ecosystem: input.root.ecosystem,
    rootPath: input.root.rootPath,
    skillDir: input.skillDir,
    skillPath,
    skillName: path.basename(input.skillDir),
    agentRepairable: true,
  };
};

export const validateStructuralRules = (skill: SkillRecord): Finding[] => {
  if (!skill.parseResult.ok) {
    return [
      createFinding(skill, {
        ruleId: skill.parseResult.error.code,
        severity: "error",
        category: "frontmatter",
        title: "Invalid frontmatter",
        message: skill.parseResult.error.message,
        suggestion: "Rewrite SKILL.md so it starts with valid YAML frontmatter delimited by ---.",
      }),
    ];
  }

  const findings: Finding[] = [];
  const frontmatter = skill.parseResult.frontmatter;
  const data = frontmatter.data;

  for (const key of Object.keys(data)) {
    if (!VALID_FRONTMATTER_FIELDS.has(key)) {
      findings.push(
        createFinding(skill, {
          ruleId: "unknown-frontmatter-field",
          severity: "warning",
          category: "frontmatter",
          title: "Unknown frontmatter field",
          message: `Frontmatter field "${key}" is not defined by the Agent Skills specification.`,
          suggestion: "Remove unsupported fields or move client-specific data under metadata.",
          line: findFrontmatterKeyLine(frontmatter.raw, key),
        }),
      );
    }
  }

  const name = readString(data.name);
  if (name === undefined || name.trim().length === 0) {
    findings.push(
      createFinding(skill, {
        ruleId: "missing-name",
        severity: "error",
        category: "frontmatter",
        title: "Missing skill name",
        message: "The required name field is missing or empty.",
        suggestion: "Add a lowercase hyphen-case name that matches the parent directory.",
        line: findFrontmatterKeyLine(frontmatter.raw, "name"),
      }),
    );
  } else {
    findings.push(...validateName(skill, name, frontmatter.raw));
  }

  const description = readString(data.description);
  if (description === undefined || description.trim().length === 0) {
    findings.push(
      createFinding(skill, {
        ruleId: "missing-description",
        severity: "error",
        category: "description",
        title: "Missing skill description",
        message: "The required description field is missing or empty.",
        suggestion:
          "Add a trigger-rich description that explains what the skill does and when to use it.",
        line: findFrontmatterKeyLine(frontmatter.raw, "description"),
      }),
    );
  } else if (description.length > 1024) {
    findings.push(
      createFinding(skill, {
        ruleId: "description-too-long",
        severity: "error",
        category: "description",
        title: "Description is too long",
        message: "The description field must be at most 1024 characters.",
        suggestion: "Shorten the description while preserving the task and trigger contexts.",
        line: findFrontmatterKeyLine(frontmatter.raw, "description"),
      }),
    );
  }

  findings.push(...validateOptionalFields(skill, frontmatter.raw, data));

  return findings;
};

const validateName = (skill: SkillRecord, name: string, rawFrontmatter: string): Finding[] => {
  const line = findFrontmatterKeyLine(rawFrontmatter, "name");
  const findings: Finding[] = [];

  if (name.length > 64) {
    findings.push(
      createFinding(skill, {
        ruleId: "name-too-long",
        severity: "error",
        category: "frontmatter",
        title: "Skill name is too long",
        message: "The name field must be at most 64 characters.",
        suggestion:
          "Rename the skill to a shorter lowercase hyphen-case name and update the directory name to match.",
        line,
      }),
    );
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    findings.push(
      createFinding(skill, {
        ruleId: "invalid-name-characters",
        severity: "error",
        category: "frontmatter",
        title: "Skill name has invalid characters",
        message: "The name field may contain only lowercase letters, numbers, and hyphens.",
        suggestion: "Use lowercase hyphen-case, such as code-review or pdf-processing.",
        line,
      }),
    );
  }

  if (name.startsWith("-") || name.endsWith("-")) {
    findings.push(
      createFinding(skill, {
        ruleId: "invalid-name-hyphen-edge",
        severity: "error",
        category: "frontmatter",
        title: "Skill name starts or ends with a hyphen",
        message: "The name field must not start or end with a hyphen.",
        suggestion: "Remove leading or trailing hyphens from the skill name and directory.",
        line,
      }),
    );
  }

  if (name.includes("--")) {
    findings.push(
      createFinding(skill, {
        ruleId: "invalid-name-consecutive-hyphens",
        severity: "error",
        category: "frontmatter",
        title: "Skill name contains consecutive hyphens",
        message: "The name field must not contain consecutive hyphens.",
        suggestion: "Collapse repeated hyphens in the skill name and directory.",
        line,
      }),
    );
  }

  if (name !== skill.directoryName) {
    findings.push(
      createFinding(skill, {
        ruleId: "name-directory-mismatch",
        severity: "error",
        category: "frontmatter",
        title: "Skill name does not match directory",
        message: `The name field "${name}" must match the parent directory "${skill.directoryName}".`,
        suggestion: "Rename either the directory or the frontmatter name so they match exactly.",
        line,
      }),
    );
  }

  return findings;
};

const validateOptionalFields = (
  skill: SkillRecord,
  rawFrontmatter: string,
  data: Readonly<Record<string, unknown>>,
): Finding[] => {
  const findings: Finding[] = [];

  if (data.license !== undefined && typeof data.license !== "string") {
    findings.push(
      createFinding(skill, {
        ruleId: "invalid-license-field",
        severity: "warning",
        category: "frontmatter",
        title: "License field should be text",
        message:
          "The optional license field should be a short license name or bundled license-file reference.",
        suggestion: "Replace license with a short string, such as MIT or Apache-2.0.",
        line: findFrontmatterKeyLine(rawFrontmatter, "license"),
      }),
    );
  }

  if (data.compatibility !== undefined) {
    if (typeof data.compatibility !== "string") {
      findings.push(
        createFinding(skill, {
          ruleId: "invalid-compatibility-field",
          severity: "error",
          category: "frontmatter",
          title: "Compatibility field must be text",
          message: "The optional compatibility field must be a string when present.",
          suggestion:
            "Replace compatibility with a short string describing environment requirements.",
          line: findFrontmatterKeyLine(rawFrontmatter, "compatibility"),
        }),
      );
    } else if (data.compatibility.length > 500) {
      findings.push(
        createFinding(skill, {
          ruleId: "compatibility-too-long",
          severity: "error",
          category: "frontmatter",
          title: "Compatibility field is too long",
          message: "The compatibility field must be at most 500 characters.",
          suggestion: "Shorten compatibility to the essential environment requirements.",
          line: findFrontmatterKeyLine(rawFrontmatter, "compatibility"),
        }),
      );
    }
  }

  if (data.metadata !== undefined && !isRecord(data.metadata)) {
    findings.push(
      createFinding(skill, {
        ruleId: "invalid-metadata-field",
        severity: "error",
        category: "frontmatter",
        title: "Metadata field must be a mapping",
        message: "The optional metadata field must be a key-value mapping.",
        suggestion: "Change metadata to a YAML mapping or remove it.",
        line: findFrontmatterKeyLine(rawFrontmatter, "metadata"),
      }),
    );
  }

  if (data["allowed-tools"] !== undefined) {
    if (typeof data["allowed-tools"] !== "string") {
      findings.push(
        createFinding(skill, {
          ruleId: "invalid-allowed-tools-field",
          severity: "error",
          category: "frontmatter",
          title: "allowed-tools must be text",
          message: "The experimental allowed-tools field must be a space-separated string.",
          suggestion: "Convert allowed-tools to a string or remove the field.",
          line: findFrontmatterKeyLine(rawFrontmatter, "allowed-tools"),
        }),
      );
    } else {
      findings.push(
        createFinding(skill, {
          ruleId: "allowed-tools-experimental",
          severity: "warning",
          category: "frontmatter",
          title: "allowed-tools support is experimental",
          message: "Support for allowed-tools varies between agent implementations.",
          suggestion:
            "Do not rely on allowed-tools as the only safety control; document required tools in the body or compatibility field.",
          line: findFrontmatterKeyLine(rawFrontmatter, "allowed-tools"),
        }),
      );
    }
  }

  return findings;
};

const createFinding = (
  skill: SkillRecord,
  input: {
    readonly ruleId: string;
    readonly severity: FindingSeverity;
    readonly category: FindingCategory;
    readonly title: string;
    readonly message: string;
    readonly suggestion: string;
    readonly line?: number | undefined;
  },
): Finding => ({
  ruleId: input.ruleId,
  severity: input.severity,
  category: input.category,
  title: input.title,
  message: input.message,
  suggestion: input.suggestion,
  ecosystem: skill.ecosystem,
  rootPath: skill.rootPath,
  skillDir: skill.skillDir,
  skillPath: skill.skillPath,
  skillName: skill.parseResult.ok
    ? readString(skill.parseResult.frontmatter.data.name)
    : skill.directoryName,
  line: input.line,
  agentRepairable: true,
});

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const findFrontmatterKeyLine = (rawFrontmatter: string, key: string): number | undefined => {
  const lines = rawFrontmatter.split(/\r?\n/);
  const index = lines.findIndex((line) => line.match(new RegExp(`^${escapeRegExp(key)}\\s*:`)));
  return index === -1 ? undefined : index + 2;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
