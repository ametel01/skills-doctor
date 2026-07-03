import { describe, expect, it } from "vitest";
import { renderTuiDashboard } from "../src/cli/utils/tui-dashboard.js";
import type { ScanReport } from "../src/index.js";

describe("TUI dashboard", () => {
  it("renders the scan workbench, metrics, and next-step choices", () => {
    const output = renderTuiDashboard(
      makeReport(),
      [
        {
          name: "Disable unused skills",
          value: "cleanup",
          description: "Clean up your skills configuration",
        },
        {
          name: "View usage ranking",
          value: "usage-ranking",
          description: "See which skills are used most",
        },
        {
          name: "Exit",
          value: "exit",
          description: "Quit skills-doctor",
        },
      ],
      { color: false, columns: 118, selectedIndex: 0 },
    );

    expect(output).toContain("skills-doctor@latest");
    expect(output).toContain("skills-doctor");
    expect(output).toContain("66 / 66");
    expect(output).toContain("Skills");
    expect(output).toContain("Issues");
    expect(output).toContain("Usage analysis");
    expect(output).toContain("23 used");
    expect(output).toContain("43 unused");
    expect(output).toContain("Context budget");
    expect(output).toContain("Cleanup candidates");
    expect(output).toContain("Disable unused skills");
    expect(output).toContain("Clean up your skills configuration");
    expect(output).toContain("[0]  Exit");
    expect(output).toContain("[↑] [↓]  navigate");
  });
});

const makeReport = (): ScanReport => ({
  schemaVersion: 1,
  ok: true,
  version: "1.0.0",
  directory: "/repo",
  elapsedMilliseconds: 12,
  scannedRoots: [
    {
      rootPath: "/home/user/.agents/skills",
      ecosystem: "codex",
      source: "global",
    },
  ],
  diagnostics: [],
  skillCount: 66,
  findingCount: 0,
  qualityFindingCount: 0,
  securityFindingCount: 0,
  securityPriorityCounts: { P0: 0, P1: 0, P2: 0 },
  securityCapabilityCounts: {},
  errorCount: 0,
  warningCount: 0,
  adviceCount: 0,
  score: {
    value: 100,
    label: "Great",
    penalty: 0,
    distinctErrorRuleCount: 0,
    distinctWarningRuleCount: 0,
    distinctAdviceRuleCount: 0,
  },
  skills: [],
  findings: [],
  usage: {
    sourcePaths: [],
    readableSourceCount: 0,
    diagnostics: [],
    contextPressure: {
      level: "low",
      recentWarningCount: 0,
    },
    totalSkillsAnalyzed: 66,
    usedSkillCount: 23,
    unusedSkillCount: 43,
    unknownSkillCount: 0,
    duplicateSkillCount: 0,
    pluginContributedSkillCount: 0,
    skillsByUsage: [],
    recommendations: [
      {
        action: "disable-candidate",
        skillName: "unused-skill",
        skillPath: "/home/user/.agents/skills/unused-skill/SKILL.md",
        reason: "No usage found.",
        confidence: "none",
      },
    ],
    topRecommendations: [
      {
        action: "disable-candidate",
        skillName: "unused-skill",
        skillPath: "/home/user/.agents/skills/unused-skill/SKILL.md",
        reason: "No usage found.",
        confidence: "none",
      },
    ],
  },
  handoffRequested: false,
});
