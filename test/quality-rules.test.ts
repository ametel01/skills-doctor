import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillRecord } from "../src/index.js";
import {
  discoverSkillRoots,
  parseSkillContent,
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

    const ruleIds = (await validateQualityRules([skill])).map((finding) => finding.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "weak-description-trigger",
        "vague-description",
        "placeholder-body",
        "generic-body",
        "missing-skill-evals",
      ]),
    );
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

  it("documents all emitted rule IDs", async () => {
    const qualitySource = await readFile(
      fileURLToPath(new URL("../src/domain/rules/quality.ts", import.meta.url)),
      "utf8",
    );
    const structuralSource = await readFile(
      fileURLToPath(new URL("../src/domain/rules/structural.ts", import.meta.url)),
      "utf8",
    );
    const ruleCatalog = await readFile(fileURLToPath(new URL("../docs/RULES.md", import.meta.url)), "utf8");

    const qualityRuleIds = Array.from(qualitySource.matchAll(/ruleId:\s*\"([^\"]+)\"/g)).map(
      (match) => match[1],
    );
    const structuralRuleIds = Array.from(
      structuralSource.matchAll(/ruleId:\s*\"([^\"]+)\"/g),
    ).map((match) => match[1]);
    const emittedRuleIds = [...new Set([...qualityRuleIds, ...structuralRuleIds])].sort();

    for (const ruleId of emittedRuleIds) {
      expect(ruleCatalog).toContain(`\`${ruleId}\``);
    }
  });
});

const buildRecord = (directoryName: string, lines: readonly string[]): SkillRecord => {
  const content = lines.join("\n");
  const rootPath = "/tmp/skills";
  const skillDir = path.join(rootPath, directoryName);
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
