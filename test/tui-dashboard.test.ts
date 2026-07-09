import { EventEmitter } from "node:events";
import type { Key } from "node:readline";
import { describe, expect, it } from "vitest";
import { PromptCancelledError } from "../src/cli/utils/prompts.js";
import {
  renderTuiDashboard,
  selectTuiAction,
  TUI_HIDE_CURSOR,
  TUI_REPAINT_SCREEN,
  TUI_SHOW_CURSOR,
  waitForTuiContinue,
} from "../src/cli/utils/tui-dashboard.js";
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
    expect(output).toContain("Usage (enabled)");
    expect(output).toContain("23 used");
    expect(output).toContain("43 unused");
    expect(output).toContain("0 unknown");
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

  it("shows disabled detected use as recovery outside enabled usage metrics", () => {
    const report = makeReport();
    if (report.usage === undefined) throw new Error("Expected dashboard usage fixture.");
    const output = renderTuiDashboard(
      {
        ...report,
        usage: {
          ...report.usage,
          totalSkillsAnalyzed: 67,
          disabledSkillCount: 1,
          skillsByUsage: [
            {
              skillName: "disabled-used",
              directoryName: "disabled-used",
              ecosystem: "codex",
              source: "global",
              enabled: false,
              rootPath: "/home/user/.agents/skills",
              skillPath: "/home/user/.agents/skills/disabled-used/SKILL.md",
              usageCount: 1,
              recentUsageCount: 1,
              tier: "recent",
              confidence: "high",
              coverageStatus: "complete",
              lastUsedAt: "2026-06-20T00:00:00.000Z",
              lastEvidenceKind: "explicit-user-invocation",
              descriptionLength: 100,
              recommendations: [
                {
                  action: "review",
                  skillName: "disabled-used",
                  skillPath: "/home/user/.agents/skills/disabled-used/SKILL.md",
                  reason:
                    "Skill is disabled but has detected local usage; review whether to recover or re-enable it.",
                  confidence: "high",
                },
              ],
            },
          ],
        },
      },
      [],
      { color: false, columns: 150 },
    );

    expect(output).toContain("Usage (enabled)");
    expect(output).toContain("0 unknown · 1 disabled recovery");
  });

  it("omits interactive controls when the dashboard has no choices", () => {
    const output = renderTuiDashboard(makeReport(), [], { color: false, columns: 120 });

    expect(output).not.toContain("navigate");
    expect(output).not.toContain("select");
    expect(output).not.toContain("quit");
  });

  it("renders only reachable numeric shortcuts when review actions exceed nine", () => {
    const nineActionsAndExit = reviewChoices(9);
    const tenActionsAndExit = reviewChoices(10);
    const nineOutput = renderTuiDashboard(makeReport(), nineActionsAndExit, {
      color: false,
      columns: 120,
    });
    const tenOutput = renderTuiDashboard(makeReport(), tenActionsAndExit, {
      color: false,
      columns: 120,
      selectedIndex: 9,
    });

    expect(nineOutput).toContain("[9]  Review action 9");
    expect(nineOutput).toContain("[0]  Exit");
    expect(tenOutput).not.toContain("[10]");
    expect(tenOutput).toMatch(/╭\s+Review action 10/);
    expect(tenOutput).toContain("Review action 10");
    expect(tenOutput).toContain("[0]  Exit");
  });

  it("selects numbered actions, exit, and an unnumbered tenth action", async () => {
    const choices = reviewChoices(10);

    await expect(startSelection(choices, [{ character: "1", key: {} }]).selection).resolves.toBe(
      "action-1",
    );
    await expect(startSelection(choices, [{ character: "9", key: {} }]).selection).resolves.toBe(
      "action-9",
    );
    await expect(startSelection(choices, [{ character: "0", key: {} }]).selection).resolves.toBe(
      "exit",
    );

    const tenthAction = startSelection(choices, [
      { character: undefined, key: { name: "end" } },
      { character: undefined, key: { name: "up" } },
      { character: undefined, key: { name: "return" } },
    ]);
    await expect(tenthAction.selection).resolves.toBe("action-10");
    expect(tenthAction.stdin.rawModes).toEqual([true, false]);
    expect(tenthAction.stdin.listenerCount("keypress")).toBe(0);
  });

  it("repaints without erasing scrollback and restores terminal state after selection", async () => {
    const stdin = new FakeStdin(false, true);
    const stdout = new EventEmitter();
    const writes: string[] = [];

    const selected = selectTuiAction(makeReport(), choices(), {
      color: false,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as never,
      write: (message) => writes.push(message),
    });
    stdin.emit("keypress", undefined, { name: "return" });

    await expect(selected).resolves.toBe("review");
    expect(writes.join("")).toContain(TUI_HIDE_CURSOR);
    expect(writes.join("")).toContain(TUI_REPAINT_SCREEN);
    expect(writes.join("")).not.toContain("\x1b[3J");
    expect(writes.filter((message) => message === TUI_SHOW_CURSOR)).toHaveLength(1);
    expect(stdin.rawModes).toEqual([true, false]);
    expect(stdin.pauseCalls).toBe(1);
    expect(stdin.resumeCalls).toBe(1);
    expect(stdin.listenerCount("keypress")).toBe(0);
    expect(stdout.listenerCount("resize")).toBe(0);
  });

  it("restores a previously raw terminal after Ctrl-C cancellation", async () => {
    const stdin = new FakeStdin(true, false);
    const stdout = new EventEmitter();
    const writes: string[] = [];
    const selected = selectTuiAction(makeReport(), choices(), {
      color: false,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as never,
      write: (message) => writes.push(message),
    });
    stdin.emit("keypress", undefined, { ctrl: true, name: "c" });

    await expect(selected).rejects.toBeInstanceOf(PromptCancelledError);
    expect(stdin.rawModes).toEqual([true, true]);
    expect(stdin.resumeCalls).toBe(2);
    expect(stdin.listenerCount("keypress")).toBe(0);
    expect(stdout.listenerCount("resize")).toBe(0);
    expect(writes.filter((message) => message === TUI_SHOW_CURSOR)).toHaveLength(1);
  });

  it("cleans up after an initial dashboard write fails", async () => {
    const stdin = new FakeStdin(false, true);
    const stdout = new EventEmitter();
    const writes: string[] = [];
    let shouldFail = true;

    const selected = selectTuiAction(makeReport(), choices(), {
      color: false,
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as never,
      write: (message) => {
        writes.push(message);
        if (shouldFail && message.includes(TUI_REPAINT_SCREEN)) {
          shouldFail = false;
          throw new Error("write failed");
        }
      },
    });

    await expect(selected).rejects.toThrow("write failed");
    expect(stdin.rawModes).toEqual([true, false]);
    expect(stdin.listenerCount("keypress")).toBe(0);
    expect(stdout.listenerCount("resize")).toBe(0);
    expect(writes.filter((message) => message === TUI_SHOW_CURSOR)).toHaveLength(1);
  });

  it("restores terminal state when continuing cannot register a keypress listener", async () => {
    const stdin = new FakeStdin(false, true);
    const writes: string[] = [];
    const on = stdin.on.bind(stdin);
    Object.defineProperty(stdin, "on", {
      value: (eventName: string | symbol, listener: (...args: unknown[]) => void) => {
        if (eventName === "keypress") throw new Error("keypress registration failed");
        return on(eventName, listener);
      },
    });

    await expect(
      waitForTuiContinue({
        stdin: stdin as unknown as NodeJS.ReadStream,
        write: (message) => writes.push(message),
      }),
    ).rejects.toThrow("keypress registration failed");
    expect(stdin.rawModes).toEqual([true, false]);
    expect(stdin.pauseCalls).toBe(1);
    expect(stdin.resumeCalls).toBe(1);
    expect(stdin.listenerCount("keypress")).toBe(0);
    expect(writes).toEqual(["\nPress any key to return to the dashboard.", "\n"]);
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

  it("stacks metrics and keeps every dashboard line within narrow terminal widths", () => {
    for (const columns of [60, 76]) {
      const output = renderTuiDashboard(makeReport({ securityFindingCount: 100 }), choices(), {
        color: true,
        columns,
      });

      expectPrintableLinesWithin(output, columns);
      expect(output).toContain("Security findings");
      expect(output).toContain("Usage (enabled)");
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

class FakeStdin extends EventEmitter {
  isRaw: boolean;
  rawModes: boolean[] = [];
  pauseCalls = 0;
  resumeCalls = 0;

  constructor(
    isRaw: boolean,
    private paused: boolean,
  ) {
    super();
    this.isRaw = isRaw;
  }

  setRawMode(enabled: boolean): this {
    this.rawModes.push(enabled);
    this.isRaw = enabled;
    return this;
  }

  pause(): this {
    this.pauseCalls += 1;
    this.paused = true;
    return this;
  }

  resume(): this {
    this.resumeCalls += 1;
    this.paused = false;
    return this;
  }

  isPaused(): boolean {
    return this.paused;
  }
}

const choices = () =>
  [
    { name: "Review findings", value: "review", description: "Inspect findings" },
    { name: "Exit", value: "exit", description: "Quit" },
  ] as const;

const reviewChoices = (actionCount: number) => [
  ...Array.from({ length: actionCount }, (_, index) => ({
    name: `Review action ${index + 1}`,
    value: `action-${index + 1}`,
    description: `Inspect action ${index + 1}`,
  })),
  { name: "Exit", value: "exit", description: "Quit" },
];

const startSelection = (
  choices: ReturnType<typeof reviewChoices>,
  keys: readonly { readonly character: string | undefined; readonly key: Key }[],
): { readonly selection: Promise<string>; readonly stdin: FakeStdin } => {
  const stdin = new FakeStdin(false, true);
  const selection = selectTuiAction(makeReport(), choices, {
    columns: 120,
    color: false,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: new EventEmitter() as never,
    write: () => undefined,
  });
  for (const { character, key } of keys) {
    stdin.emit("keypress", character, key);
  }
  return { selection, stdin };
};

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
    enabledSkillCount: 66,
    disabledSkillCount: 0,
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

const expectPrintableLinesWithin = (output: string, columns: number): void => {
  // biome-ignore lint/complexity/useRegexLiterals: keep the ESC character out of source regex literals.
  const ansiPattern = new RegExp("\\x1b\\[[0-9;?]*[ -/]*[@-~]", "gu");
  for (const line of output.trimEnd().split("\n")) {
    expect(Array.from(line.replace(ansiPattern, "")).length).toBeLessThanOrEqual(columns);
  }
};
