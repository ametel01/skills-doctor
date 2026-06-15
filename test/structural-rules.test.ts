import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SkillRecord } from "../src/index.js";
import {
  discoverSkillRoots,
  parseSkillContent,
  scanSkillRoots,
  validateStructuralRules,
} from "../src/index.js";

describe("structural rules", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-structural-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reports missing SKILL.md in child skill directories", async () => {
    await mkdir(path.join(directory, ".agents", "skills", "empty-skill"), { recursive: true });

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.findings).toMatchObject([
      {
        ruleId: "missing-skill",
        severity: "error",
        category: "frontmatter",
        skillName: "empty-skill",
      },
    ]);
  });

  it("reports required frontmatter name and description problems", async () => {
    const skill = buildRecord("bad-directory", [
      "---",
      "name: Bad--Name-",
      "description: ",
      "---",
      "",
      "Body.",
    ]);

    const findings = validateStructuralRules(skill).map((finding) => finding.ruleId);

    expect(findings).toEqual(
      expect.arrayContaining([
        "invalid-name-characters",
        "invalid-name-hyphen-edge",
        "invalid-name-consecutive-hyphens",
        "name-directory-mismatch",
        "missing-description",
      ]),
    );
  });

  it("reports length and optional field violations", async () => {
    const compatibility = "x".repeat(501);
    const skill = buildRecord("long-description", [
      "---",
      "name: long-description",
      `description: ${"d".repeat(1025)}`,
      `compatibility: ${compatibility}`,
      "metadata: not-a-map",
      "allowed-tools:",
      "  - Bash(git:*)",
      "unexpected: value",
      "---",
      "",
      "Body.",
    ]);

    const findings = validateStructuralRules(skill).map((finding) => finding.ruleId);

    expect(findings).toEqual(
      expect.arrayContaining([
        "description-too-long",
        "compatibility-too-long",
        "invalid-metadata-field",
        "invalid-allowed-tools-field",
        "unknown-frontmatter-field",
      ]),
    );
  });

  it("warns when allowed-tools is present because support is experimental", async () => {
    const skill = buildRecord("tool-skill", [
      "---",
      "name: tool-skill",
      "description: Use this skill when validating allowed tools.",
      "allowed-tools: Bash(git:*) Read",
      "---",
      "",
      "Body.",
    ]);

    expect(validateStructuralRules(skill)).toContainEqual(
      expect.objectContaining({
        ruleId: "allowed-tools-experimental",
        severity: "warning",
      }),
    );
  });

  it("includes structural findings in scan results", async () => {
    const skillDir = path.join(directory, ".claude", "skills", "mismatch");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: other-name",
        "description: Use this skill when testing.",
        "---",
        "",
        "Body.",
      ].join("\n"),
    );

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.findings.map((finding) => finding.ruleId)).toContain("name-directory-mismatch");
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
    skillDir,
    skillPath,
    directoryName,
    content,
    parseResult: parseSkillContent(content),
  };
};
