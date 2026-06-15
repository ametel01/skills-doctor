import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverSkillRoots, parseSkillContent, scanSkillRoots } from "../src/index.js";

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

    const result = await discoverSkillRoots({ cwd: directory });

    expect(result.diagnostics).toEqual([]);
    expect(result.roots.map((root) => root.ecosystem)).toEqual(["claude", "codex"]);
  });

  it("reports missing custom roots without failing detected roots", async () => {
    await mkdir(path.join(directory, ".agents", "skills"), { recursive: true });

    const result = await discoverSkillRoots({
      cwd: directory,
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

  it("scans direct child skill directories that contain SKILL.md", async () => {
    const skillsRoot = path.join(directory, ".agents", "skills");
    await mkdir(path.join(skillsRoot, "valid-skill"), { recursive: true });
    await mkdir(path.join(skillsRoot, "not-a-skill"), { recursive: true });
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

    const discovered = await discoverSkillRoots({ cwd: directory });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills).toHaveLength(1);
    expect(scan.skills[0]?.directoryName).toBe("valid-skill");
    expect(scan.skills[0]?.parseResult.ok).toBe(true);
  });

  it("records parse failures on malformed skill frontmatter", async () => {
    const skillsRoot = path.join(directory, ".claude", "skills", "broken-skill");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(path.join(skillsRoot, "SKILL.md"), "name: broken-skill\n");

    const discovered = await discoverSkillRoots({ cwd: directory });
    const scan = await scanSkillRoots({ roots: discovered.roots });

    expect(scan.skills).toHaveLength(1);
    expect(scan.skills[0]?.parseResult).toMatchObject({
      ok: false,
      error: { code: "missing-frontmatter" },
    });
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
