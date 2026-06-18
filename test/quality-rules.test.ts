import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillRecord } from "../src/index.js";
import {
  discoverSkillRoots,
  parseSkillContent,
  ruleCatalog,
  scanSkillRoots,
  validateQualityRules,
} from "../src/index.js";

describe("quality rules", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-quality-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reports weak descriptions, placeholder body text, and missing evals", async () => {
    const skill = buildRecord("pdf-helper", [
      "---",
      "name: pdf-helper",
      "description: Helps with PDFs.",
      "---",
      "",
      "## Workflow",
      "",
      "- TODO: follow best practices and help the user.",
      "- Run validation when done.",
    ]);

    const findings = await validateQualityRules([skill]);
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "weak-description-trigger",
        "vague-description",
        "placeholder-body",
        "generic-body",
        "missing-skill-evals",
      ]),
    );

    const weakDescription = findings.find(
      (finding) => finding.ruleId === "weak-description-trigger",
    );
    expect(weakDescription?.line).toBe(3);

    const evalFinding = findings.find((finding) => finding.ruleId === "missing-skill-evals");
    expect(evalFinding?.line).toBeUndefined();
  });

  it("reports progressive-disclosure and generic resource-reference issues", async () => {
    const longBody = Array.from({ length: 505 }, (_, index) => `- Step ${index + 1}`).join("\n");
    const skill = buildRecord("large-skill", [
      "---",
      "name: large-skill",
      "description: Use this skill when checking large skills.",
      "---",
      "",
      "See references/ for details.",
      longBody,
    ]);

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining(["skill-md-too-many-lines", "generic-resource-reference"]),
    );
  });

  it("reports deterministic line numbers for resource and body findings", async () => {
    const skill = buildRecord("line-number-skill", [
      "---",
      "name: line-number-skill",
      "description: Helps with the old way.",
      "---",
      "",
      "## Workflow",
      "",
      "- Run scripts/missing.py.",
      "- The script prompts the user for input.",
      "",
      "You can use npx prettier or bunx prettier.",
    ]);
    const findings = await validateQualityRules([skill]);

    const missingResource = findings.find(
      (finding) =>
        finding.ruleId === "missing-referenced-resource" &&
        finding.message.includes("scripts/missing.py"),
    );
    const interactiveGuidance = findings.find(
      (finding) => finding.ruleId === "interactive-script-guidance",
    );
    const weakDescription = findings.find(
      (finding) => finding.ruleId === "weak-description-trigger",
    );

    expect(missingResource?.line).toBe(8);
    expect(interactiveGuidance?.line).toBe(9);
    expect(weakDescription?.line).toBe(3);
  });

  it("reports missing resources and script guidance issues", async () => {
    const skill = buildRecord("script-skill", [
      "---",
      "name: script-skill",
      "description: Use this skill when checking scripts.",
      "---",
      "",
      "## Workflow",
      "",
      "- Run scripts/missing.py.",
      "- Read assets/missing-template.md.",
      "- The script prompts the user for input.",
      "- You can use npx eslint or npx prettier or another tool.",
      "- Delete generated files.",
    ]);

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "missing-referenced-resource",
        "interactive-script-guidance",
        "unpinned-package-runner",
        "tool-menu-without-default",
        "destructive-without-safety",
      ]),
    );

    const findings = await validateQualityRules([skill]);
    const missingScript = findings.find(
      (finding) =>
        finding.ruleId === "missing-referenced-resource" &&
        finding.message.includes("scripts/missing.py"),
    );
    const missingAsset = findings.find(
      (finding) =>
        finding.ruleId === "missing-referenced-resource" &&
        finding.message.includes("assets/missing-template.md"),
    );

    expect(missingScript?.category).toBe("scripts");
    expect(missingAsset?.category).toBe("assets");
  });

  it("reports help guidance issues for existing script references", async () => {
    const skillDir = path.join(directory, "existing-script-skill");
    await mkdir(path.join(skillDir, "scripts"), { recursive: true });
    await writeFile(path.join(skillDir, "scripts", "tool.py"), "print('ok')\n");
    const skill = buildRecordAt(skillDir, "existing-script-skill", [
      "---",
      "name: existing-script-skill",
      "description: Use this skill when checking existing script guidance.",
      "---",
      "",
      "## Workflow",
      "",
      "- Run scripts/tool.py against the input file.",
    ]);

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).toContain("script-without-help-guidance");
    expect(ruleIds).not.toContain("missing-referenced-resource");
  });

  it("accepts existing script references that document --help", async () => {
    const skillDir = path.join(directory, "script-help-skill");
    await mkdir(path.join(skillDir, "scripts"), { recursive: true });
    await writeFile(path.join(skillDir, "scripts", "tool.py"), "print('ok')\n");
    const skill = buildRecordAt(skillDir, "script-help-skill", [
      "---",
      "name: script-help-skill",
      "description: Use this skill when checking script help guidance.",
      "---",
      "",
      "## Workflow",
      "",
      "- Run scripts/tool.py --help to inspect options before using it.",
    ]);

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("script-without-help-guidance");
    expect(ruleIds).not.toContain("missing-referenced-resource");
  });

  it("uses injected resource checks without reading the filesystem", async () => {
    const skill = buildRecord("memory-resource-skill", [
      "---",
      "name: memory-resource-skill",
      "description: Use this skill when checking in-memory resource references.",
      "---",
      "",
      "## Workflow",
      "",
      "- Read references/spec.md when the API returns an unexpected response.",
    ]);

    const missingRuleIds = (
      await validateQualityRules([skill], {
        resourceExists: async () => false,
        evalsExist: async () => true,
      })
    ).map((finding) => finding.ruleId);
    const existingRuleIds = (
      await validateQualityRules([skill], {
        resourceExists: async () => true,
        evalsExist: async () => true,
      })
    ).map((finding) => finding.ruleId);

    expect(missingRuleIds).toContain("missing-referenced-resource");
    expect(existingRuleIds).not.toContain("missing-referenced-resource");
    expect(existingRuleIds).not.toContain("resource-reference-escapes-skill");
  });

  it("uses injected eval checks without reading the filesystem", async () => {
    const skill = buildRecord("memory-evals-skill", [
      "---",
      "name: memory-evals-skill",
      "description: Use this skill when checking in-memory eval state.",
      "---",
      "",
      "## Workflow",
      "",
      "- Follow a concrete workflow step.",
    ]);

    const missingRuleIds = (
      await validateQualityRules([skill], { evalsExist: async () => false })
    ).map((finding) => finding.ruleId);
    const existingRuleIds = (
      await validateQualityRules([skill], { evalsExist: async () => true })
    ).map((finding) => finding.ruleId);

    expect(missingRuleIds).toContain("missing-skill-evals");
    expect(existingRuleIds).not.toContain("missing-skill-evals");
  });

  it("reports divergent same-name skills across Claude and Codex roots", async () => {
    await writeSkill({
      root: path.join(directory, ".claude", "skills", "shared-skill"),
      body: "## Workflow\n\n- Use Claude-specific instructions.",
    });
    await writeSkill({
      root: path.join(directory, ".agents", "skills", "shared-skill"),
      body: "## Workflow\n\n- Use Codex-specific instructions.",
    });

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.findings.map((finding) => finding.ruleId)).toContain(
      "cross-ecosystem-skill-divergence",
    );
  });

  it("does not report divergence across local and global same-name skills", async () => {
    const homeDir = path.join(directory, "home");
    await mkdir(path.join(homeDir, ".agents", "skills", "global-shared"), { recursive: true });
    await mkdir(path.join(directory, ".agents", "skills", "global-shared"), { recursive: true });
    await writeFile(
      path.join(homeDir, ".agents", "skills", "global-shared", "SKILL.md"),
      [
        "---",
        "name: global-shared",
        "description: Use this skill when global-shared runs.",
        "---",
        "",
        "## Workflow",
        "- Use the global Codex version.",
      ].join("\n"),
    );
    await writeFile(
      path.join(directory, ".agents", "skills", "global-shared", "SKILL.md"),
      [
        "---",
        "name: global-shared",
        "description: Use this skill when global-shared runs.",
        "---",
        "",
        "## Workflow",
        "- Use the local Codex version.",
      ].join("\n"),
    );

    const discovered = await discoverSkillRoots({ cwd: directory, homeDir });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.findings.map((finding) => finding.ruleId)).not.toContain(
      "cross-ecosystem-skill-divergence",
    );
  });

  it("flags resource references that escape the skill directory", async () => {
    const skill = buildRecord("escape-skill", [
      "---",
      "name: escape-skill",
      "description: Use this skill when resolving escapes.",
      "---",
      "",
      "Read references/../../outside.md and act carefully.",
    ]);

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).toContain("resource-reference-escapes-skill");
  });

  it("flags symlinked resource references that resolve outside the skill directory", async () => {
    const skillDir = path.join(directory, "symlink-skill");
    await mkdir(path.join(skillDir, "references"), { recursive: true });
    const externalFile = path.join(directory, "outside.md");
    await writeFile(externalFile, "External reference.");
    await symlink(externalFile, path.join(skillDir, "references", "local.md"));
    const skill = buildRecordAt(skillDir, "symlink-skill", [
      "---",
      "name: symlink-skill",
      "description: Use this skill when resolving symlink resources.",
      "---",
      "",
      "## Workflow",
      "",
      "- Read references/local.md before responding.",
    ]);

    const findings = await validateQualityRules([skill]);
    const escapeFinding = findings.find(
      (finding) => finding.ruleId === "resource-reference-escapes-skill",
    );

    expect(escapeFinding).toBeDefined();
    expect(escapeFinding?.message).toContain("outside the skill directory");
  });

  it("accepts regular resource references that resolve inside the skill directory", async () => {
    const skillDir = path.join(directory, "local-resource-skill");
    await mkdir(path.join(skillDir, "references"), { recursive: true });
    await writeFile(path.join(skillDir, "references", "local.md"), "Local reference.");
    const skill = buildRecordAt(skillDir, "local-resource-skill", [
      "---",
      "name: local-resource-skill",
      "description: Use this skill when resolving local resources.",
      "---",
      "",
      "## Workflow",
      "",
      "- Read references/local.md before responding.",
    ]);

    const findings = await validateQualityRules([skill]);
    const ruleIds = findings.map((finding) => finding.ruleId);

    expect(ruleIds).not.toContain("resource-reference-escapes-skill");
    expect(ruleIds).not.toContain("missing-referenced-resource");
  });

  it("keeps emitted rule IDs, structured catalog, and docs synchronized", async () => {
    const parseSource = await readFile(
      fileURLToPath(new URL("../src/domain/parse-skill.ts", import.meta.url)),
      "utf8",
    );
    const qualitySource = await readFile(
      fileURLToPath(new URL("../src/domain/rules/quality.ts", import.meta.url)),
      "utf8",
    );
    const structuralSource = await readFile(
      fileURLToPath(new URL("../src/domain/rules/structural.ts", import.meta.url)),
      "utf8",
    );
    const ruleCatalogMarkdown = await readFile(
      fileURLToPath(new URL("../docs/RULES.md", import.meta.url)),
      "utf8",
    );

    const parseRuleIds = Array.from(parseSource.matchAll(/code:\s*"([^"]+)"/g)).map(
      (match) => match[1],
    );
    const qualityRuleIds = Array.from(qualitySource.matchAll(/ruleId:\s*"([^"]+)"/g)).map(
      (match) => match[1],
    );
    const structuralRuleIds = Array.from(structuralSource.matchAll(/ruleId:\s*"([^"]+)"/g)).map(
      (match) => match[1],
    );
    const emittedRuleIds = [...new Set([...parseRuleIds, ...qualityRuleIds, ...structuralRuleIds])]
      .filter((ruleId) => ruleId !== undefined)
      .sort();
    const catalogByRuleId = new Map<string, (typeof ruleCatalog)[number]>(
      ruleCatalog.map((entry) => [entry.ruleId, entry]),
    );
    const docsByRuleId = parseRuleCatalogMarkdown(ruleCatalogMarkdown);

    for (const ruleId of emittedRuleIds) {
      expect(catalogByRuleId.has(ruleId)).toBe(true);
    }
    for (const entry of ruleCatalog) {
      const docsEntry = docsByRuleId.get(entry.ruleId);
      expect(docsEntry).toEqual({
        severity: entry.severity,
        categories: entry.categories.join("/"),
      });
    }
  });
});

const parseRuleCatalogMarkdown = (
  markdown: string,
): Map<string, { readonly severity: string; readonly categories: string }> => {
  const rows = new Map<string, { readonly severity: string; readonly categories: string }>();
  for (const match of markdown.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| .* \|$/gm)) {
    const [, ruleId, severity, categories] = match;
    if (ruleId !== undefined && severity !== undefined && categories !== undefined) {
      rows.set(ruleId, { severity: severity.trim(), categories: categories.trim() });
    }
  }
  return rows;
};

const buildRecord = (directoryName: string, lines: readonly string[]): SkillRecord => {
  return buildRecordAt(path.join("/tmp/skills", directoryName), directoryName, lines);
};

const buildRecordAt = (
  skillDir: string,
  directoryName: string,
  lines: readonly string[],
): SkillRecord => {
  const content = lines.join("\n");
  const rootPath = path.dirname(skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");

  return {
    ecosystem: "custom",
    rootPath,
    source: "local",
    skillDir,
    skillPath,
    directoryName,
    content,
    parseResult: parseSkillContent(content),
  };
};

const writeSkill = async (input: {
  readonly root: string;
  readonly body: string;
}): Promise<void> => {
  await mkdir(input.root, { recursive: true });
  await writeFile(
    path.join(input.root, "SKILL.md"),
    [
      "---",
      "name: shared-skill",
      "description: Use this skill when sharing skills.",
      "---",
      "",
      input.body,
    ].join("\n"),
  );
};
