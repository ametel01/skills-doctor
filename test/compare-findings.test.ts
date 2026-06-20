import { describe, expect, it } from "vitest";
import { compareFindings, renderPostHandoffSummary } from "../src/domain/compare-findings.js";
import { calculateScore, type Finding, type ScanReport } from "../src/index.js";

describe("post-handoff finding comparison", () => {
  it("compares findings by stable rule id and file path", () => {
    const fixed = makeFinding("frontmatter-name", "/repo/a/SKILL.md");
    const remaining = makeFinding("description-specific", "/repo/b/SKILL.md");
    const newFinding = makeFinding("evals-missing", "/repo/c/SKILL.md");

    const comparison = compareFindings([fixed, remaining], [remaining, newFinding]);

    expect(comparison.fixed).toEqual([fixed]);
    expect(comparison.remaining).toEqual([remaining]);
    expect(comparison.newFindings).toEqual([newFinding]);
  });

  it("treats same rule and skill with different details as different findings", () => {
    const fixed = makeFinding("frontmatter-name", "/repo/a/SKILL.md");
    const remaining = makeFinding("frontmatter-name", "/repo/a/SKILL.md", {
      line: 3,
      message: "Different detail",
    });

    const comparison = compareFindings([fixed], [remaining]);

    expect(comparison.fixed).toEqual([fixed]);
    expect(comparison.newFindings).toEqual([remaining]);
    expect(comparison.remaining).toHaveLength(0);
  });

  it("renders a concise re-scan summary", () => {
    const report = makeReport(1);
    const summary = renderPostHandoffSummary(
      {
        fixed: [makeFinding("a", "/repo/a/SKILL.md")],
        remaining: [makeFinding("b", "/repo/b/SKILL.md")],
        newFindings: [],
      },
      report,
    );

    expect(summary).toContain("Fixed findings: 1");
    expect(summary).toContain("Remaining findings: 1");
    expect(summary).toContain("Current blocking errors: 1");
    expect(summary).toContain("Current score: 99 (Great)");
  });

  it("colorizes re-scan summary when requested", () => {
    const report = makeReport(1);
    const summary = renderPostHandoffSummary(
      {
        fixed: [makeFinding("a", "/repo/a/SKILL.md")],
        remaining: [makeFinding("b", "/repo/b/SKILL.md")],
        newFindings: [],
      },
      report,
      { color: true },
    );

    expect(summary).toContain("\x1b[36mPost-handoff re-scan\x1b[39m:");
    expect(summary).toContain("\x1b[36mFixed findings\x1b[39m: \x1b[32m1\x1b[39m");
    expect(summary).toContain("\x1b[36mCurrent blocking errors\x1b[39m: \x1b[31m1\x1b[39m");
  });
});

const makeReport = (errorCount: number): ScanReport => {
  const findings = Array.from({ length: errorCount }, (_value, index) =>
    makeFinding(`error-${index}`, `/repo/${index}/SKILL.md`),
  );
  return {
    schemaVersion: 1,
    ok: errorCount === 0,
    version: "0.0.0-test",
    directory: "/repo",
    elapsedMilliseconds: 0,
    scannedRoots: [],
    skillCount: 0,
    findingCount: errorCount,
    errorCount,
    warningCount: 0,
    adviceCount: 0,
    score: calculateScore(findings),
    skills: [],
    findings,
    diagnostics: [],
    handoffRequested: true,
  };
};

const makeFinding = (
  ruleId: string,
  skillPath: string,
  overrides: Partial<Finding> = {},
): Finding => ({
  ruleId,
  severity: "error",
  category: "frontmatter",
  title: "Finding",
  message: "Message",
  suggestion: "Suggestion",
  ecosystem: "codex",
  rootPath: "/repo/.agents/skills",
  skillDir: skillPath.replace(/\/SKILL\.md$/, ""),
  skillPath,
  skillName: "skill",
  agentRepairable: true,
  ...overrides,
});
