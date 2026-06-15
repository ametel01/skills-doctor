import { describe, expect, it } from "vitest";
import { calculateScore, type Finding, getScoreLabel } from "../src/index.js";

describe("skill quality scoring", () => {
  it("starts at 100 when no findings exist", () => {
    expect(calculateScore([])).toEqual({
      value: 100,
      label: "Great",
      penalty: 0,
      distinctErrorRuleCount: 0,
      distinctWarningRuleCount: 0,
      distinctAdviceRuleCount: 0,
    });
  });

  it("penalizes distinct error and warning rules, not repeated findings", () => {
    const score = calculateScore([
      makeFinding({ ruleId: "missing-frontmatter", severity: "error" }),
      makeFinding({ ruleId: "missing-frontmatter", severity: "error", skillName: "other" }),
      makeFinding({ ruleId: "invalid-name", severity: "error" }),
      makeFinding({ ruleId: "weak-description", severity: "warning" }),
      makeFinding({ ruleId: "weak-description", severity: "warning", skillName: "other" }),
      makeFinding({ ruleId: "missing-evals", severity: "advice" }),
    ]);

    expect(score).toMatchObject({
      value: 96,
      label: "Great",
      penalty: 3.75,
      distinctErrorRuleCount: 2,
      distinctWarningRuleCount: 1,
      distinctAdviceRuleCount: 1,
    });
  });

  it("uses React Doctor score labels", () => {
    expect(getScoreLabel(75)).toBe("Great");
    expect(getScoreLabel(50)).toBe("Needs work");
    expect(getScoreLabel(49)).toBe("Critical");
  });
});

const makeFinding = (overrides: Partial<Finding>): Finding => ({
  ruleId: "missing-frontmatter",
  severity: "error",
  category: "frontmatter",
  title: "Finding",
  message: "Message",
  suggestion: "Suggestion",
  ecosystem: "codex",
  rootPath: "/repo/.agents/skills",
  skillDir: "/repo/.agents/skills/review-pr",
  skillPath: "/repo/.agents/skills/review-pr/SKILL.md",
  skillName: "review-pr",
  agentRepairable: true,
  ...overrides,
});
