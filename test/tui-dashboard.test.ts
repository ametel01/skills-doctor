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
      { color: false, columns: 150, selectedIndex: 0 },
    );

    expect(output).toContain("skills-doctor@latest");
    expect(output).toContain("skills-doctor");
    expect(output).toContain("v1.0.0");
    expect(output).toContain("Scan score");
    expect(output).toContain("100 / 100 Great");
    expect(output).toContain("scan passed");
    expect(output).toContain("0 score penalty");
    expect(output).toContain("0 error rules · 0 warning rules · 0 advice rules");
    expect(output).not.toContain("Progress");
    expect(output).not.toContain("66 / 66");
    expect(output).toContain("Skills");
    expect(output).toContain("Issues");
    expect(output).toContain("Security findings");
    expect(output).toContain("Usage analysis");
    expect(output).toContain("23 used");
    expect(output).toContain("43 unused");
    expect(output).toContain("complete coverage");
    expect(output).toContain("Context budget");
    expect(output).toContain("Cleanup candidates");
    expect(output).toContain("0 review items");
    expect(output).toContain("Disable unused skills");
    expect(output).toContain("Clean up your skills configuration");
    expect(output).toContain("[0]  Exit");
    expect(output).toContain("[↑] [↓]  navigate");
  });

  it("uses the requested terminal width instead of capping the dashboard", () => {
    const output = renderTuiDashboard(makeReport(), [], {
      color: false,
      columns: 180,
      selectedIndex: 0,
    });

    const renderedLines = output.trimEnd().split("\n");
    expect(renderedLines[0]?.length).toBe(180);
    expect(renderedLines.some((line) => line.includes("Security findings"))).toBe(true);
    expect(renderedLines.some((line) => line.includes("v1.0.0"))).toBe(true);
  });

  it("does not overrun adaptive breakpoint widths", () => {
    for (const columns of [100, 111, 112, 120, 132, 149, 150, 169, 170, 180]) {
      const output = renderTuiDashboard(makeReport({ securityFindingCount: 100 }), [], {
        color: false,
        columns,
        selectedIndex: 0,
      });

      const maxLineLength = Math.max(
        ...output
          .trimEnd()
          .split("\n")
          .map((line) => line.length),
      );
      expect(maxLineLength, `max line length at ${columns} columns`).toBe(columns);
    }
  });

  it("keeps the version brand card visible on medium-width terminals", () => {
    expect(renderTuiDashboard(makeReport(), [], { color: false, columns: 111 })).not.toContain(
      "v1.0.0",
    );
    expect(renderTuiDashboard(makeReport(), [], { color: false, columns: 112 })).toContain(
      "v1.0.0",
    );
    expect(renderTuiDashboard(makeReport(), [], { color: false, columns: 120 })).toContain(
      "v1.0.0",
    );
  });
});

const makeReport = (
  overrides: Partial<Pick<ScanReport, "securityFindingCount" | "securityPriorityCounts">> = {},
): ScanReport => ({
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
  securityFindingCount: overrides.securityFindingCount ?? 0,
  securityPriorityCounts: overrides.securityPriorityCounts ?? { P0: 0, P1: 0, P2: 0 },
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
    coverageStatus: "complete",
    sourceCoverage: [],
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
    events: [],
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
