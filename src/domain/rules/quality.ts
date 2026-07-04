import { access, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Finding, FindingCategory, SkillRecord } from "../types.js";

const GENERIC_BODY_PATTERN = /\b(be helpful|do the task|help the user|follow best practices)\b/i;
const PLACEHOLDER_PATTERN = /\b(todo|tbd|placeholder|lorem ipsum|fill this in)\b/i;
const TRIGGER_PATTERN =
  /\b(use this skill when|use when|whenever|when asked|for tasks?|for workflows?)\b/i;
const VAGUE_DESCRIPTION_PATTERN = /^(helps? with|useful for|handles?)\s+\w+\.?$/i;
const IMPLEMENTATION_DESCRIPTION_PATTERN = /\b(script|function|class|module|implementation)\b/i;
const WORKFLOW_STEP_PATTERN = /(^|\n)(\s*[-*]\s+|\s*\d+\.\s+|##\s+)/;
const TOOL_MENU_PATTERN = /\byou can use\b.+\b(or|,)\b.+\b(or|,)\b/i;
const DESTRUCTIVE_PATTERN = /\b(delete|remove|rm -rf|destroy|drop table|migrate|publish|deploy)\b/i;
const SAFETY_PATTERN =
  /--dry-run|\bdry run\b|--confirm|\bconfirm\b|\bvalidate\b|\bbackup\b|\bpreview\b/i;
const UNPINNED_RUNNER_PATTERN = /\b(npx|bunx|uvx|pipx run|go run)\s+([@\w./-]+)(?!@[\w.^~-])/i;
const INTERACTIVE_SCRIPT_PATTERN =
  /\b(read -p|select menu|interactive prompt|asks? for input|prompts? the user)\b/i;
const INTERACTIVE_SCRIPT_IMPLEMENTATION_PATTERN =
  /\b(read\s+-p|select\s+\w+|input\s*\(|raw_input\s*\(|prompt\s*\(|confirm\s*\(|inquirer\.prompt|readline\.question|scanf\s*\()\b/i;
const GENERIC_REFERENCE_PATTERN =
  /\b(see|read|check)\s+(the\s+)?(references\/?|scripts\/?|assets\/?)\b/i;
const RESOURCE_REFERENCE_PATTERN = /\b(scripts|references|assets)\/[A-Za-z0-9._/-]+/g;
const SCRIPT_RISKY_OPERATION_PATTERN =
  /\b(rm\s+-rf|find\b.{0,80}-delete|drop\s+database|terraform\s+(?:apply|destroy)|kubectl\s+(?:apply|delete)|gh\s+(?:repo\s+delete|issue|pr)|git\s+push\s+--force|deploy|publish|send\s+email|payments?)\b/i;
const SCRIPT_SAFETY_FLAG_PATTERN = /--dry-run|--confirm|--force|--yes|--preview/i;

export type ResourceStatus = "inside" | "missing" | "escapes";

export type QualityRuleOptions = {
  readonly resourceExists?:
    | ((skill: SkillRecord, referencePath: string) => Promise<boolean>)
    | undefined;
  readonly resourceStatus?:
    | ((skill: SkillRecord, referencePath: string) => Promise<ResourceStatus>)
    | undefined;
  readonly evalsExist?: ((skill: SkillRecord) => Promise<boolean>) | undefined;
};

export const validateQualityRules = async (
  skills: readonly SkillRecord[],
  options: QualityRuleOptions = {},
): Promise<Finding[]> => {
  const perSkillFindings = await Promise.all(
    skills.map((skill) => validateSkillQuality(skill, options)),
  );
  return [...perSkillFindings.flat(), ...validateCrossEcosystem(skills)];
};

const validateSkillQuality = async (
  skill: SkillRecord,
  options: QualityRuleOptions,
): Promise<Finding[]> => {
  if (!skill.parseResult.ok) return [];

  const findings: Finding[] = [];
  const frontmatter = skill.parseResult.frontmatter;
  const description = readString(frontmatter.data.description) ?? "";
  const body = frontmatter.body;
  const frontMatterLineCount = frontmatter.raw.split(/\r?\n/).length;

  findings.push(...validateDescription(skill, description));
  findings.push(...validateBody(skill, body, frontMatterLineCount));
  findings.push(...validateProgressiveDisclosure(skill, body, frontMatterLineCount));
  findings.push(...(await validateResources(skill, body, frontMatterLineCount, options)));
  findings.push(...(await validateEvals(skill, body, options)));

  return findings;
};

const validateDescription = (skill: SkillRecord, description: string): Finding[] => {
  const findings: Finding[] = [];
  const normalized = description.trim();
  const line = findContentLine(skill.content, /^\s*description\s*:/i);

  if (normalized.length > 0 && !TRIGGER_PATTERN.test(normalized)) {
    findings.push(
      createFinding(skill, {
        ruleId: "weak-description-trigger",
        severity: "warning",
        category: "description",
        title: "Description lacks a clear activation trigger",
        message: "The description should explain when an agent should use this skill.",
        suggestion:
          'Use imperative phrasing such as "Use this skill when..." and include concrete task contexts.',
        line,
      }),
    );
  }

  if (VAGUE_DESCRIPTION_PATTERN.test(normalized)) {
    findings.push(
      createFinding(skill, {
        ruleId: "vague-description",
        severity: "warning",
        category: "description",
        title: "Description is too vague",
        message:
          "A short generic description is unlikely to trigger reliably or explain the skill's scope.",
        suggestion: "Describe what the skill does, when to use it, and important adjacent cases.",
        line,
      }),
    );
  }

  if (
    IMPLEMENTATION_DESCRIPTION_PATTERN.test(normalized) &&
    !/\buser|task|workflow|when\b/i.test(normalized)
  ) {
    findings.push(
      createFinding(skill, {
        ruleId: "implementation-focused-description",
        severity: "advice",
        category: "description",
        title: "Description focuses on implementation",
        message:
          "Descriptions should match user intent rather than the skill's internal mechanics.",
        suggestion: "Rewrite the description around the task the user is trying to accomplish.",
        line,
      }),
    );
  }

  return findings;
};

const validateBody = (
  skill: SkillRecord,
  body: string,
  frontMatterLineCount: number,
): Finding[] => {
  const findings: Finding[] = [];

  if (PLACEHOLDER_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "placeholder-body",
        severity: "warning",
        category: "body-quality",
        title: "Body contains placeholder text",
        message: "A skill body should contain complete reusable instructions, not placeholders.",
        suggestion:
          "Replace placeholders with concrete workflow steps, gotchas, examples, or validation guidance.",
        line: findBodyLine(frontMatterLineCount, body, PLACEHOLDER_PATTERN),
      }),
    );
  }

  if (GENERIC_BODY_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "generic-body",
        severity: "warning",
        category: "body-quality",
        title: "Body appears generic",
        message: "The body uses generic advice that does not add skill-specific expertise.",
        suggestion:
          "Replace generic phrasing with concrete project or domain procedures the agent would not already know.",
        line: findBodyLine(frontMatterLineCount, body, GENERIC_BODY_PATTERN),
      }),
    );
  }

  if (!WORKFLOW_STEP_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "missing-workflow-steps",
        severity: "warning",
        category: "body-quality",
        title: "Body lacks concrete workflow structure",
        message: "The body does not appear to include headings, ordered steps, or checklist items.",
        suggestion: "Add a concise workflow, gotchas section, examples, or validation loop.",
        line: findFirstBodyLine(body, frontMatterLineCount),
      }),
    );
  }

  if (TOOL_MENU_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "tool-menu-without-default",
        severity: "advice",
        category: "body-quality",
        title: "Body presents a tool menu without a default",
        message: "Skills should provide defaults rather than long menus of equal options.",
        suggestion: "Pick a default tool and explain when to use a fallback.",
        line: findBodyLine(frontMatterLineCount, body, TOOL_MENU_PATTERN),
      }),
    );
  }

  if (DESTRUCTIVE_PATTERN.test(body) && !SAFETY_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "destructive-without-safety",
        severity: "warning",
        category: "body-quality",
        title: "Destructive operation lacks safety guidance",
        message:
          "Destructive, release, migration, or deploy guidance should include validation, preview, backup, or confirmation steps.",
        suggestion:
          "Add a dry-run, validation, backup, or explicit confirmation requirement before the destructive action.",
        line: findBodyLine(frontMatterLineCount, body, DESTRUCTIVE_PATTERN),
      }),
    );
  }

  return findings;
};

const validateProgressiveDisclosure = (
  skill: SkillRecord,
  body: string,
  frontMatterLineCount: number,
): Finding[] => {
  const findings: Finding[] = [];
  const lineCount = skill.content.split(/\r?\n/).length;
  const tokenEstimate = estimateTokens(skill.content);

  if (lineCount > 500) {
    findings.push(
      createFinding(skill, {
        ruleId: "skill-md-too-many-lines",
        severity: "warning",
        category: "progressive-disclosure",
        title: "SKILL.md exceeds 500 lines",
        message:
          "The main SKILL.md should stay under 500 lines to preserve progressive disclosure.",
        suggestion:
          "Move detailed reference material to focused files under references/ or assets/ and add clear load triggers.",
      }),
    );
  }

  if (tokenEstimate > 5000) {
    findings.push(
      createFinding(skill, {
        ruleId: "skill-md-too-many-tokens",
        severity: "warning",
        category: "progressive-disclosure",
        title: "SKILL.md appears larger than the recommended token budget",
        message: "The main SKILL.md is estimated above 5,000 tokens.",
        suggestion:
          "Keep only core instructions in SKILL.md and move detailed material into on-demand references.",
      }),
    );
  }

  if (GENERIC_REFERENCE_PATTERN.test(skill.content)) {
    findings.push(
      createFinding(skill, {
        ruleId: "generic-resource-reference",
        severity: "warning",
        category: "progressive-disclosure",
        title: "Resource reference lacks a load trigger",
        message:
          "The skill references a resource directory generically instead of naming the file and when to load it.",
        suggestion:
          'Use specific guidance such as "Read references/api-errors.md if the API returns a non-200 status."',
        line: findBodyLine(frontMatterLineCount, body, GENERIC_REFERENCE_PATTERN),
      }),
    );
  }

  return findings;
};

const validateResources = async (
  skill: SkillRecord,
  body: string,
  frontMatterLineCount: number,
  options: QualityRuleOptions,
): Promise<Finding[]> => {
  const findings: Finding[] = [];
  const referencedPaths = [
    ...new Set((skill.content.match(RESOURCE_REFERENCE_PATTERN) ?? []).map(normalizeReferencePath)),
  ].filter((referencePath) => referencePath.length > 0);

  const findingsByReference = await Promise.all(
    referencedPaths.map(async (referencePath) => {
      const referenceFindings: Finding[] = [];
      if (hasParentTraversal(referencePath)) {
        referenceFindings.push(
          createFinding(skill, {
            ruleId: "resource-reference-escapes-skill",
            severity: "warning",
            category: resourceCategory(referencePath),
            title: "Resource reference escapes the skill directory",
            message:
              "The skill references a resource outside the skill directory. Resource references must remain inside scripts/, references/, or assets/ for this skill.",
            suggestion:
              "Use a path rooted inside the skill (for example references/file.md) without '..' segments.",
            line: findReferenceLine(skill.content, referencePath),
          }),
        );
        return referenceFindings;
      }

      const resourceStatus = await resolveResourceStatus(skill, referencePath, options);
      if (resourceStatus === "escapes") {
        referenceFindings.push(
          createFinding(skill, {
            ruleId: "resource-reference-escapes-skill",
            severity: "warning",
            category: resourceCategory(referencePath),
            title: "Resource reference escapes the skill directory",
            message:
              "The skill references a resource outside the skill directory. Resource references must remain inside scripts/, references/, or assets/ for this skill.",
            suggestion:
              "Use a path rooted inside the skill (for example references/file.md) without '..' segments.",
            line: findReferenceLine(skill.content, referencePath),
          }),
        );
        return referenceFindings;
      }

      if (resourceStatus === "missing") {
        referenceFindings.push(
          createFinding(skill, {
            ruleId: "missing-referenced-resource",
            severity: "warning",
            category: resourceCategory(referencePath),
            title: "Referenced resource does not exist",
            message: `The skill references ${referencePath}, but that path does not exist inside the skill directory.`,
            suggestion: "Create the referenced file or remove the stale reference.",
            line: findReferenceLine(skill.content, referencePath),
          }),
        );
        return referenceFindings;
      }

      if (referencePath.startsWith("scripts/") && !body.includes("--help")) {
        referenceFindings.push(
          createFinding(skill, {
            ruleId: "script-without-help-guidance",
            severity: "warning",
            category: "scripts",
            title: "Script reference lacks help guidance",
            message:
              "Script instructions should document usage or mention --help so agents can learn the interface.",
            suggestion: "Add a short usage example and document that the script supports --help.",
            line: findReferenceLine(skill.content, referencePath),
          }),
        );
      }

      if (referencePath.startsWith("scripts/")) {
        referenceFindings.push(...(await validateScriptInterface(skill, referencePath, body)));
      }
      return referenceFindings;
    }),
  );
  findings.push(...findingsByReference.flat());

  if (INTERACTIVE_SCRIPT_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "interactive-script-guidance",
        severity: "warning",
        category: "scripts",
        title: "Script guidance appears interactive",
        message:
          "Agents need non-interactive scripts that accept flags, stdin, files, or environment variables.",
        suggestion:
          "Replace interactive prompts with command-line flags and clear errors for missing inputs.",
        line: findBodyLine(frontMatterLineCount, body, INTERACTIVE_SCRIPT_PATTERN),
      }),
    );
  }

  if (UNPINNED_RUNNER_PATTERN.test(body)) {
    findings.push(
      createFinding(skill, {
        ruleId: "unpinned-package-runner",
        severity: "advice",
        category: "scripts",
        title: "Package-runner command is not version-pinned",
        message:
          "One-off package-runner commands should pin versions when reproducibility matters.",
        suggestion: "Use a versioned command such as npx eslint@9 or uvx ruff@0.8.0.",
        line: findBodyLine(frontMatterLineCount, body, UNPINNED_RUNNER_PATTERN),
      }),
    );
  }

  return findings;
};

const validateScriptInterface = async (
  skill: SkillRecord,
  referencePath: string,
  body: string,
): Promise<Finding[]> => {
  const content = await readScriptContent(skill, referencePath);
  if (content === undefined) return [];
  const findings: Finding[] = [];

  if (INTERACTIVE_SCRIPT_IMPLEMENTATION_PATTERN.test(content)) {
    findings.push(
      createFinding(skill, {
        ruleId: "interactive-script-implementation",
        severity: "warning",
        category: "scripts",
        title: "Referenced script appears interactive",
        message:
          "Referenced scripts should run non-interactively with flags, files, environment variables, or stdin.",
        suggestion:
          "Replace prompts with explicit flags or stdin/file inputs and clear errors for missing values.",
        line: findReferenceLine(skill.content, referencePath),
      }),
    );
  }

  if (
    SCRIPT_RISKY_OPERATION_PATTERN.test(content) &&
    !SCRIPT_SAFETY_FLAG_PATTERN.test(content) &&
    !SCRIPT_SAFETY_FLAG_PATTERN.test(body)
  ) {
    findings.push(
      createFinding(skill, {
        ruleId: "risky-script-without-safety-flag",
        severity: "warning",
        category: "scripts",
        title: "Referenced script has risky operations without safety flags",
        message:
          "Referenced scripts that perform destructive, publishing, deploy, or external-write actions should expose dry-run, confirmation, force, or preview controls.",
        suggestion:
          "Add an explicit --dry-run, --confirm, --force, or --preview control and document when agents may use it.",
        line: findReferenceLine(skill.content, referencePath),
      }),
    );
  }

  return findings;
};

const validateEvals = async (
  skill: SkillRecord,
  body: string,
  options: QualityRuleOptions,
): Promise<Finding[]> => {
  if (!isNonTrivialSkill(body)) return [];

  if (await evalsExist(skill, options)) return [];

  return [
    createFinding(skill, {
      ruleId: "missing-skill-evals",
      severity: "advice",
      category: "evals",
      title: "Non-trivial skill has no evals",
      message: "Non-trivial skills should include evals/evals.json or an explicit evaluation plan.",
      suggestion:
        "Add evals/evals.json with realistic prompts, expected outputs, and assertions for important behavior.",
    }),
  ];
};

const validateCrossEcosystem = (skills: readonly SkillRecord[]): Finding[] => {
  const findings: Finding[] = [];
  const byNameAndSource = new Map<string, SkillRecord[]>();

  for (const skill of skills) {
    if (skill.source === "custom") continue;
    if (!skill.parseResult.ok) continue;
    const name = readString(skill.parseResult.frontmatter.data.name);
    if (name === undefined) continue;
    byNameAndSource.set(`${name}\u0000${skill.source}`, [
      ...(byNameAndSource.get(`${name}\u0000${skill.source}`) ?? []),
      skill,
    ]);
  }

  for (const [nameAndSource, namedSkills] of byNameAndSource) {
    const [name] = nameAndSource.split("\u0000");
    const ecosystems = new Set(namedSkills.map((skill) => skill.ecosystem));
    if (!ecosystems.has("claude") || !ecosystems.has("codex")) continue;
    const uniqueContents = new Set(namedSkills.map((skill) => normalizeContent(skill.content)));
    if (uniqueContents.size <= 1) continue;

    for (const skill of namedSkills) {
      findings.push(
        createFinding(skill, {
          ruleId: "cross-ecosystem-skill-divergence",
          severity: "warning",
          category: "cross-ecosystem",
          title: "Same-name skills diverge across ecosystems",
          message: `The skill "${name}" exists in both Claude and Codex/agents roots but has different SKILL.md content.`,
          suggestion:
            "Review whether the divergence is intentional. If the skill is shared, align the contents across ecosystems.",
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
    readonly severity: Finding["severity"];
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

const findContentLine = (content: string, pattern: string | RegExp): number | undefined => {
  const linePattern =
    typeof pattern === "string"
      ? new RegExp(escapeRegExp(pattern))
      : new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));

  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (linePattern.test(line)) {
      return index + 1;
    }
  }
  return undefined;
};

const findBodyLine = (
  frontMatterLineCount: number,
  body: string,
  pattern: string | RegExp,
): number | undefined => {
  const bodyLine = findContentLine(body, pattern);
  if (bodyLine === undefined) return undefined;
  return frontMatterLineCount + 2 + bodyLine;
};

const findReferenceLine = (content: string, referencePath: string): number | undefined =>
  findContentLine(content, referencePath);

const findFirstBodyLine = (body: string, frontMatterLineCount: number): number | undefined => {
  const lines = body.split(/\r?\n/);
  if (lines.length === 0) return undefined;
  return frontMatterLineCount + 2 + 1;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const estimateTokens = (content: string): number =>
  Math.ceil(content.split(/\s+/).filter(Boolean).length * 1.35);

const exists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const readScriptContent = async (
  skill: SkillRecord,
  referencePath: string,
): Promise<string | undefined> => {
  const targetPath = path.resolve(skill.skillDir, referencePath);
  let resolvedTarget: string;
  let resolvedSkillDir: string;
  try {
    resolvedTarget = await realpath(targetPath);
    resolvedSkillDir = await realpath(skill.skillDir);
  } catch {
    return undefined;
  }
  if (!isPathInside(resolvedSkillDir, resolvedTarget)) return undefined;
  return await readFile(resolvedTarget, "utf8").catch(() => undefined);
};

const resolveResourceStatus = async (
  skill: SkillRecord,
  referencePath: string,
  options: QualityRuleOptions,
): Promise<ResourceStatus> => {
  if (options.resourceStatus !== undefined) {
    return options.resourceStatus(skill, referencePath);
  }
  if (options.resourceExists !== undefined) {
    return (await options.resourceExists(skill, referencePath)) ? "inside" : "missing";
  }

  const targetPath = path.resolve(skill.skillDir, referencePath);
  let resolvedTarget: string;
  try {
    resolvedTarget = await realpath(targetPath);
  } catch {
    return "missing";
  }

  const resolvedSkillDir = await realpath(skill.skillDir);
  return isPathInside(resolvedSkillDir, resolvedTarget) ? "inside" : "escapes";
};

const evalsExist = async (skill: SkillRecord, options: QualityRuleOptions): Promise<boolean> => {
  if (options.evalsExist !== undefined) return options.evalsExist(skill);
  return exists(path.join(skill.skillDir, "evals", "evals.json"));
};

const isPathInside = (parentPath: string, targetPath: string): boolean => {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resourceCategory = (referencePath: string): "references" | "scripts" | "assets" => {
  if (referencePath.startsWith("references/")) return "references";
  if (referencePath.startsWith("scripts/")) return "scripts";
  return "assets";
};

const normalizeReferencePath = (referencePath: string): string =>
  referencePath.replace(/[.,;:!?)}\]]+$/g, "");

const isNonTrivialSkill = (body: string): boolean =>
  body.length > 500 || WORKFLOW_STEP_PATTERN.test(body) || RESOURCE_REFERENCE_PATTERN.test(body);

const hasParentTraversal = (referencePath: string): boolean =>
  referencePath.split(/[\\/]+/).includes("..");

const normalizeContent = (content: string): string => content.replace(/\s+/g, " ").trim();
