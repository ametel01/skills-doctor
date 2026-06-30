import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkillRecord } from "../src/index.js";
import { parseSkillContent, validateSecurityRules } from "../src/index.js";

describe("security rules", () => {
  it("does not report findings for a benign skill", () => {
    const skill = buildRecord("benign-skill", [
      "---",
      "name: benign-skill",
      "description: Use this skill when validating benign security fixtures.",
      "---",
      "",
      "## Workflow",
      "",
      "- Review the user request.",
      "- Explain any security-sensitive changes before editing.",
    ]);

    expect(validateSecurityRules([skill])).toEqual([]);
  });

  it("accepts enabled rule filters before security rules are implemented", () => {
    const skill = buildRecord("filtered-skill", [
      "---",
      "name: filtered-skill",
      "description: Use this skill when validating security rule filters.",
      "---",
      "",
      "## Workflow",
      "",
      "- Keep the workflow boring and deterministic.",
    ]);

    expect(validateSecurityRules([skill], { enabledRuleIds: [] })).toEqual([]);
    expect(validateSecurityRules([skill], { enabledRuleIds: ["future-rule"] })).toEqual([]);
  });
});

const buildRecord = (directoryName: string, lines: readonly string[]): SkillRecord => {
  const skillDir = path.join("/tmp/skills", directoryName);
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
