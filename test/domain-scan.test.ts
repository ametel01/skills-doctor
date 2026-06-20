import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverSkillRoots,
  parseCodexDisabledSkillConfig,
  parseSkillContent,
  readCodexDisabledSkillConfig,
  scanSkillRoots,
} from "../src/index.js";

describe("skill discovery and parsing", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-scan-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("discovers Claude and Codex project-local skill roots", async () => {
    await mkdir(path.join(directory, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(directory, ".agents", "skills"), { recursive: true });

    const result = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.roots.map((root) => root.ecosystem)).toEqual(["claude", "codex"]);
    expect(result.roots.map((root) => root.source)).toEqual(["local", "local"]);
  });

  it("discovers Claude and Codex global skill roots", async () => {
    const homeDir = path.join(directory, "home");
    await mkdir(path.join(homeDir, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(homeDir, ".agents", "skills"), { recursive: true });

    const result = await discoverSkillRoots({ cwd: directory, homeDir });

    expect(result.roots.map((root) => root.ecosystem)).toEqual(["claude", "codex"]);
    expect(result.roots.map((root) => root.source)).toEqual(["global", "global"]);
  });

  it("reports missing custom roots without failing detected roots", async () => {
    await mkdir(path.join(directory, ".agents", "skills"), { recursive: true });

    const result = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
      customRoots: [{ rootPath: "missing-skills" }],
    });

    expect(result.roots.map((root) => root.ecosystem)).toEqual(["codex"]);
    expect(result.diagnostics).toMatchObject([
      {
        code: "skill-root-not-found",
        severity: "warning",
      },
    ]);
  });

  it("expands tilde custom roots against the configured home directory", async () => {
    const homeDir = path.join(directory, "home");
    await mkdir(path.join(homeDir, ".agents", "skills"), { recursive: true });

    const result = await discoverSkillRoots({
      cwd: directory,
      homeDir,
      customRoots: [{ rootPath: "~/.agents/skills" }],
    });

    expect(result.roots).toContainEqual({
      ecosystem: "codex",
      rootPath: path.join(homeDir, ".agents", "skills"),
      source: "global",
    });
    expect(result.roots).toContainEqual({
      ecosystem: "custom",
      rootPath: path.join(homeDir, ".agents", "skills"),
      source: "custom",
    });
  });

  it("reports direct child skill directories that are missing SKILL.md", async () => {
    const skillsRoot = path.join(directory, ".agents", "skills");
    await mkdir(path.join(skillsRoot, "valid-skill"), { recursive: true });
    await mkdir(path.join(skillsRoot, "missing-file-skill"), { recursive: true });
    await mkdir(path.join(skillsRoot, ".git"), { recursive: true });
    await writeFile(
      path.join(skillsRoot, "valid-skill", "SKILL.md"),
      [
        "---",
        "name: valid-skill",
        "description: Use this skill when validating scanner fixtures.",
        "---",
        "",
        "Follow the fixture workflow.",
        "",
      ].join("\n"),
    );

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills).toHaveLength(1);
    expect(scan.skills[0]?.directoryName).toBe("valid-skill");
    expect(scan.skills[0]?.parseResult.ok).toBe(true);
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "missing-skill",
        severity: "error",
        skillName: "missing-file-skill",
        skillDir: path.join(skillsRoot, "missing-file-skill"),
        skillPath: path.join(skillsRoot, "missing-file-skill", "SKILL.md"),
        message: `Skill candidate ${path.join(skillsRoot, "missing-file-skill")} is missing ${path.join(skillsRoot, "missing-file-skill", "SKILL.md")}.`,
      }),
    );
    expect(scan.findings).not.toContainEqual(
      expect.objectContaining({
        ruleId: "missing-skill",
        skillName: ".git",
      }),
    );
  });

  it("keeps skill order deterministic across roots and child directories", async () => {
    const firstRoot = path.join(directory, "first-root");
    const secondRoot = path.join(directory, "second-root");
    for (const [root, skillNames] of [
      [firstRoot, ["zeta-skill", "alpha-skill"]],
      [secondRoot, ["delta-skill", "beta-skill"]],
    ] as const) {
      for (const skillName of skillNames) {
        const skillDir = path.join(root, skillName);
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, "SKILL.md"),
          [
            "---",
            `name: ${skillName}`,
            "description: Use this skill when validating deterministic scan order.",
            "---",
            "",
            "Follow the fixture workflow.",
            "",
          ].join("\n"),
        );
      }
    }

    const roots = [
      { ecosystem: "custom" as const, rootPath: firstRoot, source: "custom" as const },
      { ecosystem: "custom" as const, rootPath: secondRoot, source: "custom" as const },
    ];
    const expected = [
      path.join(firstRoot, "alpha-skill", "SKILL.md"),
      path.join(firstRoot, "zeta-skill", "SKILL.md"),
      path.join(secondRoot, "beta-skill", "SKILL.md"),
      path.join(secondRoot, "delta-skill", "SKILL.md"),
    ];

    const firstScan = await scanSkillRoots({ roots });
    const secondScan = await scanSkillRoots({ roots });

    expect(firstScan.skills.map((skill) => skill.skillPath)).toEqual(expected);
    expect(secondScan.skills.map((skill) => skill.skillPath)).toEqual(expected);
  });

  it("ignores disabled Codex skills by path and name", async () => {
    const skillsRoot = path.join(directory, ".agents", "skills");
    await writeFixtureSkill(path.join(skillsRoot, "active-skill"), "active-skill");
    await writeFixtureSkill(path.join(skillsRoot, "disabled-by-path"), "disabled-by-path");
    await writeFixtureSkill(path.join(skillsRoot, "disabled-by-name"), "disabled-by-name");
    await mkdir(path.join(skillsRoot, "missing-disabled"), { recursive: true });

    const scan = await scanSkillRoots({
      roots: [{ ecosystem: "codex", rootPath: skillsRoot, source: "global" }],
      disabledSkills: {
        paths: [
          path.join(skillsRoot, "disabled-by-path", "SKILL.md"),
          path.join(skillsRoot, "missing-disabled", "SKILL.md"),
        ],
        names: ["disabled-by-name"],
      },
    });

    expect(scan.skills.map((skill) => skill.directoryName)).toEqual(["active-skill"]);
    expect(scan.findings).not.toContainEqual(
      expect.objectContaining({
        skillName: "missing-disabled",
      }),
    );
  });

  it("reads disabled Codex skill selectors from config.toml", async () => {
    const homeDir = path.join(directory, "home");
    const disabledPath = path.join(homeDir, ".agents", "skills", "disabled", "SKILL.md");
    const enabledPath = path.join(homeDir, ".agents", "skills", "enabled", "SKILL.md");
    await mkdir(path.join(homeDir, ".codex"), { recursive: true });
    await writeFile(
      path.join(homeDir, ".codex", "config.toml"),
      [
        "[profile.default]",
        'model = "gpt-5"',
        "",
        "[[skills.config]]",
        `path = "${disabledPath}"`,
        "enabled = false",
        "",
        "[[skills.config]]",
        'name = "github:yeet"',
        "enabled = false",
        "",
        "[[skills.config]]",
        `path = "${enabledPath}"`,
        "enabled = true",
      ].join("\n"),
    );

    const result = await readCodexDisabledSkillConfig({ homeDir });

    expect(result.diagnostics).toEqual([]);
    expect(result.paths).toEqual([disabledPath]);
    expect(result.names).toEqual(["github:yeet"]);
  });

  it("lets later enabled Codex skill config entries override disabled entries", () => {
    const selectors = parseCodexDisabledSkillConfig(
      [
        "[[skills.config]]",
        'path = "/tmp/skills/demo/SKILL.md"',
        "enabled = false",
        "",
        "[[skills.config]]",
        'path = "/tmp/skills/demo/SKILL.md"',
        "enabled = true",
      ].join("\n"),
    );

    expect(selectors.paths).toEqual([]);
  });

  it("reports unreadable SKILL.md entries while scanning other skills", async () => {
    const skillsRoot = path.join(directory, ".agents", "skills");
    const validSkillDir = path.join(skillsRoot, "valid-skill");
    const unreadableSkillPath = path.join(skillsRoot, "unreadable-skill", "SKILL.md");
    await mkdir(validSkillDir, { recursive: true });
    await mkdir(unreadableSkillPath, { recursive: true });
    await writeFile(
      path.join(validSkillDir, "SKILL.md"),
      [
        "---",
        "name: valid-skill",
        "description: Use this skill when validating scanner fixtures.",
        "---",
        "",
        "Follow the fixture workflow.",
        "",
      ].join("\n"),
    );

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills.map((skill) => skill.directoryName)).toEqual(["valid-skill"]);
    expect(scan.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill-file-unreadable",
        severity: "error",
        path: unreadableSkillPath,
      }),
    ]);
  });

  it("records parse failures on malformed skill frontmatter", async () => {
    const skillsRoot = path.join(directory, ".claude", "skills", "broken-skill");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(path.join(skillsRoot, "SKILL.md"), "name: broken-skill\n");

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills).toHaveLength(1);
    expect(scan.skills[0]?.parseResult).toMatchObject({
      ok: false,
      error: { code: "missing-frontmatter" },
    });
  });

  it("records unreadable frontmatter when a closing delimiter is missing", async () => {
    const skillsRoot = path.join(directory, ".claude", "skills", "unclosed-skill");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(path.join(skillsRoot, "SKILL.md"), "---\nname: unclosed-skill\n");

    const discovered = await discoverSkillRoots({
      cwd: directory,
      homeDir: path.join(directory, "home"),
    });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills).toHaveLength(1);
    expect(scan.skills[0]?.parseResult).toMatchObject({
      ok: false,
      error: { code: "invalid-frontmatter" },
    });
    expect(scan.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "invalid-frontmatter",
        severity: "error",
      }),
    );
  });

  it("parses YAML frontmatter and body content", () => {
    const result = parseSkillContent(
      [
        "---",
        "name: example-skill",
        "description: Use this skill when parsing frontmatter.",
        "metadata:",
        "  owner: docs",
        "---",
        "",
        "Body content.",
      ].join("\n"),
    );

    expect(result).toMatchObject({
      ok: true,
      frontmatter: {
        data: {
          name: "example-skill",
          description: "Use this skill when parsing frontmatter.",
          metadata: { owner: "docs" },
        },
        body: "\nBody content.",
      },
    });
  });
});

const writeFixtureSkill = async (skillDir: string, name: string): Promise<void> => {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Use this skill when validating scanner fixtures.",
      "---",
      "",
      "Follow the fixture workflow.",
      "",
    ].join("\n"),
  );
};
