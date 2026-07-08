import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareCleanupHandoff } from "../src/cli/utils/cleanup-handoff-to-agent.js";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import {
  prepareRepairHandoff,
  type RepairFindingSubset,
} from "../src/cli/utils/handoff-to-agent.js";
import type { PromptAdapter } from "../src/cli/utils/prompts.js";
import type { ScanReport, ScanReportUsage } from "../src/domain/build-report.js";
import { defaultReportOutputRoot } from "../src/domain/default-report-output-root.js";
import type { Finding } from "../src/index.js";
import {
  buildCleanupHandoffPrompt,
  buildHandoffPrompt,
  calculateScore,
  writeCleanupDirectory,
  writeFindingsDirectory,
} from "../src/index.js";

describe("handoff prompt", () => {
  it("includes selected roots, exact paths, spec-grounded repair rules, and report path", () => {
    const report = makeReport([makeFinding({ ruleId: "frontmatter-name", line: 3 })]);

    const prompt = buildHandoffPrompt({
      report,
      findings: report.findings,
      reportDirectory: "/tmp/skills-doctor-report",
    });

    expect(prompt).toContain("Selected roots: codex: /repo/.agents/skills");
    expect(prompt).toContain("/repo/.agents/skills/review-pr/SKILL.md:3");
    expect(prompt).toContain("docs/SKILLS_SPEC.md");
    expect(prompt).toContain("static analyzer diagnostics");
    expect(prompt).toContain("false positive");
    expect(prompt).toContain("confidence, rationale, and counterevidence");
    expect(prompt).toContain("Preserve unrelated user changes");
    expect(prompt).toContain("Verify by rerunning `skills-doctor`");
    expect(prompt).toContain("Full findings report: /tmp/skills-doctor-report");
  });

  it("keeps large prompts compact and points to the full report", () => {
    const findings = Array.from({ length: 40 }, (_, index) =>
      makeFinding({
        ruleId: `rule-${index}`,
        skillPath: `/repo/.agents/skills/skill-${index}/SKILL.md`,
        skillName: `skill-${index}`,
      }),
    );
    const report = makeReport(findings);

    const prompt = buildHandoffPrompt({
      report,
      findings: report.findings,
      reportDirectory: "/tmp/full-report",
    });

    expect(prompt.length).toBeLessThan(7000);
    expect(prompt).toContain("additional findings omitted inline");
    expect(prompt).toContain("/tmp/full-report");
    expect(prompt).not.toContain("skill-39 (");
  });
});

describe("findings directory", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-handoff-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes JSON, Markdown, and per-skill finding files", async () => {
    const report = makeReport([makeFinding({}), makeFinding({ ruleId: "description-specific" })]);

    const result = await writeFindingsDirectory({
      report,
      outputRoot: directory,
      timestamp: "2026-06-15T01:02:03.004Z",
    });

    expect(result.directory).toBe(path.join(directory, "2026-06-15T01-02-03-004Z"));
    await expect(readFile(result.findingsJsonPath, "utf8")).resolves.toContain('"findingCount": 2');
    await expect(readFile(result.findingsJsonPath, "utf8")).resolves.toContain('"score"');
    await expect(readFile(result.findingsMarkdownPath, "utf8")).resolves.toContain(
      "# Skills Doctor Findings",
    );
    await expect(readFile(result.findingsMarkdownPath, "utf8")).resolves.toContain("Score:");
    expect(result.skillReportPaths).toHaveLength(1);
    const skillReportPath = result.skillReportPaths[0];
    if (skillReportPath === undefined) throw new Error("Expected one skill report path.");
    await expect(readFile(skillReportPath, "utf8")).resolves.toContain("description-specific");
  });

  it("writes findings to the user-scoped OS temp directory by default", async () => {
    const report = makeReport([makeFinding({})]);
    const expectedDirectory = path.join(defaultReportOutputRoot(), "2099-01-01T00-00-00-000Z");
    await rm(expectedDirectory, { recursive: true, force: true });

    const result = await writeFindingsDirectory({
      report,
      timestamp: "2099-01-01T00:00:00.000Z",
    });

    expect(result.directory).toBe(expectedDirectory);
    expect(result.directory.startsWith(tmpdir())).toBe(true);
    await expect(readFile(result.findingsJsonPath, "utf8")).resolves.toContain('"findingCount": 1');
    await rm(expectedDirectory, { recursive: true, force: true });
  });

  it("keeps per-skill files distinct for same-name skills in different roots", async () => {
    const findings = [
      makeFinding({
        ruleId: "name-directory-mismatch",
        skillName: "shared-review",
        skillPath: "/repo/.agents/skills/shared-review/SKILL.md",
      }),
      makeFinding({
        ruleId: "missing-description",
        skillName: "shared-review",
        skillPath: "/repo/.claude/skills/shared-review/SKILL.md",
      }),
    ];
    const report = makeReport(findings);

    const result = await writeFindingsDirectory({
      report,
      outputRoot: directory,
      timestamp: "2026-06-16T01:02:03.004Z",
    });

    expect(result.skillReportPaths).toHaveLength(2);
    expect(result.skillReportPaths[0]).not.toBe(result.skillReportPaths[1]);
    await expect(readFile(result.skillReportPaths[0] ?? "", "utf8")).resolves.toContain(
      "name-directory-mismatch",
    );
    await expect(readFile(result.skillReportPaths[1] ?? "", "utf8")).resolves.toContain(
      "missing-description",
    );
  });

  it("keeps per-skill files distinct when long paths share a truncated prefix", async () => {
    const sharedPrefix = "shared-prefix-".repeat(10);
    const findings = [
      makeFinding({
        ruleId: "first-long-path-rule",
        skillName: "long-prefix-skill",
        skillPath: `/repo/.agents/skills/${sharedPrefix}first/SKILL.md`,
      }),
      makeFinding({
        ruleId: "second-long-path-rule",
        skillName: "long-prefix-skill",
        skillPath: `/repo/.agents/skills/${sharedPrefix}second/SKILL.md`,
      }),
    ];
    const report = makeReport(findings);

    const result = await writeFindingsDirectory({
      report,
      outputRoot: directory,
      timestamp: "2026-06-17T01:02:03.004Z",
    });

    expect(result.skillReportPaths).toHaveLength(2);
    expect(result.skillReportPaths[0]).not.toBe(result.skillReportPaths[1]);
    await expect(readFile(result.skillReportPaths[0] ?? "", "utf8")).resolves.toContain(
      "first-long-path-rule",
    );
    await expect(readFile(result.skillReportPaths[1] ?? "", "utf8")).resolves.toContain(
      "second-long-path-rule",
    );
  });
});

describe("cleanup handoff", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-cleanup-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("builds a conservative cleanup prompt with npx verification", () => {
    const report = makeReport([], makeUsage());

    const prompt = buildCleanupHandoffPrompt({
      report,
      reportDirectory: "/tmp/usage-report",
    });

    expect(prompt).toContain("Inspect the usage report first");
    expect(prompt).toContain("Preserve project-local skills");
    expect(prompt).toContain("Do not delete skills");
    expect(prompt).toContain(
      "Only disable selected high-confidence enabled skills with a `disable-candidate` recommendation",
    );
    expect(prompt).toContain("Disable only the selected skills listed below");
    expect(prompt).toContain(
      "Do not modify skills recommended as keep, review, shorten-description, or merge-candidate",
    );
    expect(prompt).toContain(
      "Preserve review items, unknown-coverage items, incomplete-coverage items, disabled-but-used recovery warnings, and disabled-used items",
    );
    expect(prompt).toContain("Do not move skill directories");
    expect(prompt).toContain("`[[skills.config]]` entries in `~/.codex/config.toml`");
    expect(prompt).toContain("`enabled = false`");
    expect(prompt).toContain("Restart Codex or start a fresh session after config changes");
    expect(prompt).toContain("Do not delete skills solely because usage is unknown");
    expect(prompt).toContain("Do not expose raw Codex logs");
    expect(prompt).toContain("`npx skills-doctor@latest`");
    expect(prompt).toContain("/tmp/usage-report");
    expect(prompt).toContain("disable-candidate unused-skill");
    expect(prompt).toContain("Enabled: true");
    expect(prompt).toContain("Coverage: complete");
    expect(prompt).toContain("Evidence kind: none");
    expect(prompt).toContain("Make only reversible Codex skills-config disable changes");
    expect(prompt).not.toContain("RAW PRIVATE TRANSCRIPT");
  });

  it("limits cleanup prompts to selected recommendations", () => {
    const baseUsage = makeUsage();
    const skippedRecommendation = {
      action: "disable-candidate" as const,
      skillName: "skipped-unused",
      skillPath: "/repo/.agents/skills/skipped-unused/SKILL.md",
      reason: "No local usage was detected for this non-project skill.",
      confidence: "none" as const,
    };
    const usage = {
      ...baseUsage,
      recommendations: [...baseUsage.recommendations, skippedRecommendation],
      topRecommendations: [...baseUsage.topRecommendations, skippedRecommendation],
    };
    const report = makeReport([], usage);
    const selectedRecommendation = usage.topRecommendations[0];
    if (selectedRecommendation === undefined) {
      throw new Error("Expected selected cleanup recommendation.");
    }

    const prompt = buildCleanupHandoffPrompt({
      report,
      recommendations: [selectedRecommendation],
      reportDirectory: "/tmp/usage-report",
    });

    expect(prompt).toContain("unused-skill");
    expect(prompt).not.toContain("skipped-unused");
  });

  it("builds a tailored prompt for selected non-disable usage recommendations", () => {
    const baseUsage = makeUsage();
    const shortenRecommendation = {
      action: "shorten-description" as const,
      skillName: "used-skill",
      skillPath: "/repo/.agents/skills/used-skill/SKILL.md",
      reason: "Skill appears useful but has high description context cost.",
      confidence: "high" as const,
    };
    const report = makeReport([], {
      ...baseUsage,
      recommendations: [...baseUsage.recommendations, shortenRecommendation],
    });

    const prompt = buildCleanupHandoffPrompt({
      report,
      recommendations: [shortenRecommendation],
      reportDirectory: "/tmp/usage-report",
    });

    expect(prompt).toContain("Fix selected Agent Skills usage recommendations");
    expect(prompt).toContain("Usage repair rules:");
    expect(prompt).toContain("`shorten-description`: reduce context-heavy skill descriptions");
    expect(prompt).toContain("shorten-description used-skill");
    expect(prompt).not.toContain("Only disable selected high-confidence enabled skills");
    expect(prompt).not.toContain("Selected unused skills to disable");
  });

  it("writes usage JSON and Markdown cleanup reports", async () => {
    const report = makeReport([], makeUsage());

    const result = await writeCleanupDirectory({
      report,
      outputRoot: directory,
      timestamp: "2026-06-20T01:02:03.004Z",
    });

    expect(result.directory).toBe(path.join(directory, "2026-06-20T01-02-03-004Z"));
    await expect(readFile(result.usageJsonPath, "utf8")).resolves.toContain('"usage"');
    await expect(readFile(result.usageMarkdownPath, "utf8")).resolves.toContain(
      "# Skills Doctor Usage Cleanup",
    );
    await expect(readFile(result.usageMarkdownPath, "utf8")).resolves.toContain(
      "disable-candidate",
    );
    await expect(readFile(result.usageMarkdownPath, "utf8")).resolves.toContain(
      "Last evidence kind: explicit-user-invocation",
    );
    await expect(readFile(result.usageMarkdownPath, "utf8")).resolves.toContain(
      "Coverage: complete",
    );
  });

  it("writes cleanup reports to the user-scoped OS temp directory by default", async () => {
    const report = makeReport([], makeUsage());
    const expectedDirectory = path.join(defaultReportOutputRoot(), "2099-01-02T00-00-00-000Z");
    await rm(expectedDirectory, { recursive: true, force: true });

    const result = await writeCleanupDirectory({
      report,
      timestamp: "2099-01-02T00:00:00.000Z",
    });

    expect(result.directory).toBe(expectedDirectory);
    expect(result.directory.startsWith(tmpdir())).toBe(true);
    await expect(readFile(result.usageJsonPath, "utf8")).resolves.toContain('"usage"');
    await rm(expectedDirectory, { recursive: true, force: true });
  });

  it("prepares cleanup reports and writes cleanup-prompt.md", async () => {
    const report = makeReport([], makeUsage());

    const handoff = await prepareCleanupHandoff({
      report,
      outputRoot: directory,
      timestamp: "2026-06-20T01:02:03.004Z",
    });

    const reportDirectory = handoff.reportDirectory;
    const promptPath = handoff.promptPath;
    if (reportDirectory === undefined || promptPath === undefined) {
      throw new Error("Expected cleanup report directory and prompt path.");
    }
    expect(promptPath).toBe(path.join(reportDirectory, "cleanup-prompt.md"));
    await expect(readFile(promptPath, "utf8")).resolves.toContain("npx skills-doctor@latest");
    await expect(readFile(path.join(reportDirectory, "usage.json"), "utf8")).resolves.toContain(
      "unused-skill",
    );
  });

  it("prepares cleanup reports for selected non-disable recommendations", async () => {
    const baseUsage = makeUsage();
    const shortenRecommendation = {
      action: "shorten-description" as const,
      skillName: "used-skill",
      skillPath: "/repo/.agents/skills/used-skill/SKILL.md",
      reason: "Skill appears useful but has high description context cost.",
      confidence: "high" as const,
    };
    const report = makeReport([], {
      ...baseUsage,
      recommendations: [...baseUsage.recommendations, shortenRecommendation],
    });

    const handoff = await prepareCleanupHandoff({
      report,
      recommendations: [shortenRecommendation],
      outputRoot: directory,
      timestamp: "2026-06-20T01:02:03.004Z",
    });

    expect(handoff.prompt).toContain("shorten-description used-skill");
    const promptPath = handoff.promptPath;
    if (promptPath === undefined) throw new Error("Expected cleanup prompt path.");
    await expect(readFile(promptPath, "utf8")).resolves.toContain(
      "`shorten-description`: reduce context-heavy skill descriptions",
    );
  });

  it("keeps an inline cleanup prompt when report writing fails", async () => {
    const report = makeReport([], makeUsage());

    const handoff = await prepareCleanupHandoff({
      report,
      writeDirectory: async () => {
        throw new Error("disk full");
      },
    });

    expect(handoff.reportDirectory).toBeUndefined();
    expect(handoff.promptPath).toBeUndefined();
    expect(handoff.reportWriteError?.message).toBe("disk full");
    expect(handoff.prompt).toContain("Usage report directory: unavailable");
  });
});

describe("repair handoff preparation", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-prepare-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("selects blocking errors plus warnings and writes a prompt file", async () => {
    const findings = [
      makeFinding({ severity: "error", ruleId: "error-rule" }),
      makeFinding({ severity: "warning", ruleId: "warning-rule" }),
      makeFinding({ severity: "advice", ruleId: "advice-rule" }),
    ];
    const report = makeReport(findings);

    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({ selected: "errors-and-warnings" }),
      outputRoot: directory,
      timestamp: "2026-06-15T00:00:00.000Z",
    });

    expect(handoff.findings.map((finding) => finding.ruleId)).toEqual([
      "error-rule",
      "warning-rule",
    ]);
    const reportDirectory = handoff.reportDirectory;
    const promptPath = handoff.promptPath;
    if (reportDirectory === undefined || promptPath === undefined) {
      throw new Error("Expected report directory and prompt path.");
    }
    expect(promptPath).toBe(path.join(reportDirectory, "handoff-prompt.md"));
    await expect(readFile(promptPath, "utf8")).resolves.toContain("error-rule");
  });

  it("filters to selected skills", async () => {
    const first = makeFinding({
      skillPath: "/repo/.agents/skills/first/SKILL.md",
      skillName: "first",
    });
    const second = makeFinding({
      skillPath: "/repo/.agents/skills/second/SKILL.md",
      skillName: "second",
      ruleId: "second-rule",
    });
    const report = makeReport([first, second]);

    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({
        selected: "selected-skills",
        checked: [second.skillPath],
      }),
      outputRoot: directory,
      timestamp: "2026-06-15T00:00:00.000Z",
    });

    expect(handoff.findings).toEqual([second]);
  });

  it("keeps an inline fallback prompt when report writing fails", async () => {
    const report = makeReport([makeFinding({})]);

    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({ selected: "errors" }),
      writeDirectory: async () => {
        throw new Error("disk full");
      },
    });

    expect(handoff.reportDirectory).toBeUndefined();
    expect(handoff.promptPath).toBeUndefined();
    expect(handoff.reportWriteError?.message).toBe("disk full");
    expect(handoff.prompt).toContain("Full findings report: unavailable");
  });

  it("keeps an inline fallback prompt when prompt file writing fails", async () => {
    const report = makeReport([makeFinding({})]);
    const reportDirectory = path.join(directory, "report");

    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({ selected: "errors" }),
      writeDirectory: async () => {
        await mkdir(path.join(reportDirectory, "handoff-prompt.md"), { recursive: true });
        return {
          directory: reportDirectory,
          findingsJsonPath: path.join(reportDirectory, "findings.json"),
          findingsMarkdownPath: path.join(reportDirectory, "findings.md"),
          skillReportPaths: [],
        };
      },
    });

    expect(handoff.reportDirectory).toBe(reportDirectory);
    expect(handoff.promptPath).toBeUndefined();
    expect(handoff.reportWriteError).toBeDefined();
    expect(handoff.prompt).toContain("Fix the selected Agent Skills findings");
    expect(handoff.prompt).toContain(`Full findings report: ${reportDirectory}`);
  });

  it("omits the errors subset for warning-only reports", async () => {
    const report = makeReport([makeFinding({ severity: "warning", ruleId: "warning-rule" })]);
    let seenChoices: readonly {
      readonly name: string;
      readonly value: RepairFindingSubset;
    }[] = [];
    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({
        selected: "all",
        onSelectChoices: (choices) => {
          seenChoices = choices;
        },
      }),
      outputRoot: directory,
      timestamp: "2026-06-15T00:00:00.000Z",
    });

    expect(handoff.findings.map((finding) => finding.ruleId)).toEqual(["warning-rule"]);
    expect(seenChoices.map((choice) => choice.value)).not.toContain("errors");
  });

  it("omits the warning-only subset for advice-only reports", async () => {
    const report = makeReport([makeFinding({ severity: "advice", ruleId: "advice-rule" })]);
    let seenChoices: readonly {
      readonly name: string;
      readonly value: RepairFindingSubset;
    }[] = [];
    const handoff = await prepareRepairHandoff({
      report,
      prompts: fakePrompts({
        selected: "all",
        onSelectChoices: (choices) => {
          seenChoices = choices;
        },
      }),
      outputRoot: directory,
      timestamp: "2026-06-15T00:00:00.000Z",
    });

    expect(handoff.findings.map((finding) => finding.ruleId)).toEqual(["advice-rule"]);
    expect(seenChoices.map((choice) => choice.value)).not.toContain("errors");
    expect(seenChoices.map((choice) => choice.value)).not.toContain("errors-and-warnings");
  });

  it("raises a user error when selected skills are empty", async () => {
    const report = makeReport([makeFinding({})]);

    await expect(
      prepareRepairHandoff({
        report,
        prompts: fakePrompts({ selected: "selected-skills", checked: [] }),
      }),
    ).rejects.toBeInstanceOf(CliInputError);
  });
});

const fakePrompts = (input: {
  readonly selected: "errors" | "errors-and-warnings" | "all" | "selected-skills";
  readonly checked?: readonly string[];
  readonly onSelectChoices?: (
    choices: readonly {
      readonly name: string;
      readonly value: RepairFindingSubset;
    }[],
  ) => void;
}): PromptAdapter => ({
  checkbox: async <Value extends string>() => [...(input.checked ?? [])] as Value[],
  confirm: async () => true,
  input: async () => "",
  select: async <Value extends string>(
    _message: string,
    choices: readonly { name: string; value: Value }[],
  ) => {
    if (input.onSelectChoices !== undefined) {
      input.onSelectChoices(
        choices.map((choice) => ({
          name: choice.name,
          value: choice.value as RepairFindingSubset,
        })),
      );
    }
    return input.selected as Value;
  },
});

const makeReport = (findings: readonly Finding[], usage?: ScanReportUsage): ScanReport => {
  const uniqueSkills = [...new Set(findings.map((finding) => finding.skillPath))];
  return {
    schemaVersion: 1,
    ok: findings.every((finding) => finding.severity !== "error"),
    version: "0.0.0-test",
    directory: "/repo",
    elapsedMilliseconds: 12,
    scannedRoots: [{ ecosystem: "codex", rootPath: "/repo/.agents/skills", source: "local" }],
    skillCount: uniqueSkills.length,
    findingCount: findings.length,
    qualityFindingCount: findings.filter((finding) => finding.category !== "security").length,
    securityFindingCount: findings.filter((finding) => finding.category === "security").length,
    securityPriorityCounts: {
      P0: findings.filter((finding) => finding.category === "security" && finding.priority === "P0")
        .length,
      P1: findings.filter((finding) => finding.category === "security" && finding.priority === "P1")
        .length,
      P2: findings.filter((finding) => finding.category === "security" && finding.priority === "P2")
        .length,
    },
    securityCapabilityCounts: {},
    errorCount: findings.filter((finding) => finding.severity === "error").length,
    warningCount: findings.filter((finding) => finding.severity === "warning").length,
    adviceCount: findings.filter((finding) => finding.severity === "advice").length,
    score: calculateScore(findings),
    skills: uniqueSkills.map((skillPath) => {
      const skillFindings = findings.filter((finding) => finding.skillPath === skillPath);
      return {
        ecosystem: skillFindings[0]?.ecosystem ?? "codex",
        name: skillFindings[0]?.skillName ?? path.basename(path.dirname(skillPath)),
        directoryName: path.basename(path.dirname(skillPath)),
        skillPath,
        findingCount: skillFindings.length,
        errorCount: skillFindings.filter((finding) => finding.severity === "error").length,
        warningCount: skillFindings.filter((finding) => finding.severity === "warning").length,
        adviceCount: skillFindings.filter((finding) => finding.severity === "advice").length,
      };
    }),
    findings,
    ...(usage === undefined ? {} : { usage }),
    diagnostics: [],
    handoffRequested: true,
  };
};

const makeFinding = (overrides: Partial<Finding>): Finding => ({
  ruleId: "frontmatter-required",
  severity: "error",
  category: "frontmatter",
  title: "Invalid frontmatter",
  message: "The skill frontmatter is missing required fields.",
  suggestion: "Add a valid name and a specific trigger-oriented description.",
  ecosystem: "codex",
  rootPath: "/repo/.agents/skills",
  skillDir: "/repo/.agents/skills/review-pr",
  skillPath: "/repo/.agents/skills/review-pr/SKILL.md",
  skillName: "review-pr",
  agentRepairable: true,
  ...overrides,
});

const makeUsage = (): ScanReportUsage => ({
  sourcePaths: ["/repo/.codex/sessions/session.jsonl"],
  readableSourceCount: 1,
  coverageStatus: "complete",
  sourceCoverage: [
    {
      sourcePath: "/repo/.codex/sessions/session.jsonl",
      status: "complete",
      recordCount: 1,
      parsedRecordCount: 1,
      invalidRecordCount: 0,
      eventCount: 1,
      diagnosticCodes: [],
    },
  ],
  diagnostics: [],
  contextPressure: {
    level: "high",
    recentWarningCount: 1,
    truncatedDescriptionCount: 4,
    budgetLimit: "2%",
  },
  totalSkillsAnalyzed: 2,
  usedSkillCount: 1,
  unusedSkillCount: 1,
  unknownSkillCount: 0,
  duplicateSkillCount: 0,
  pluginContributedSkillCount: 1,
  events: [
    {
      skillName: "used-skill",
      skillPath: "/repo/.agents/skills/used-skill/SKILL.md",
      sourcePath: "/repo/.codex/sessions/session.jsonl",
      confidence: "high",
      evidenceKind: "explicit-user-invocation",
      timestamp: "2026-06-20T00:00:00.000Z",
    },
  ],
  skillsByUsage: [
    {
      skillName: "used-skill",
      directoryName: "used-skill",
      ecosystem: "codex",
      source: "global",
      enabled: true,
      rootPath: "/repo/.agents/skills",
      skillPath: "/repo/.agents/skills/used-skill/SKILL.md",
      usageCount: 2,
      recentUsageCount: 2,
      tier: "recent",
      confidence: "high",
      coverageStatus: "complete",
      lastUsedAt: "2026-06-20T00:00:00.000Z",
      lastEvidenceKind: "explicit-user-invocation",
      descriptionLength: 120,
      recommendations: [
        {
          action: "keep",
          skillName: "used-skill",
          skillPath: "/repo/.agents/skills/used-skill/SKILL.md",
          reason: "Detected recent or frequent local usage.",
          confidence: "high",
        },
      ],
    },
    {
      skillName: "unused-skill",
      directoryName: "unused-skill",
      ecosystem: "codex",
      source: "global",
      enabled: true,
      rootPath: "/repo/.agents/skills",
      skillPath: "/repo/.agents/skills/unused-skill/SKILL.md",
      usageCount: 0,
      recentUsageCount: 0,
      tier: "unused",
      confidence: "none",
      coverageStatus: "complete",
      pluginName: "github",
      descriptionLength: 80,
      recommendations: [
        {
          action: "disable-candidate",
          skillName: "unused-skill",
          skillPath: "/repo/.agents/skills/unused-skill/SKILL.md",
          reason: "No local usage was detected for this non-project skill.",
          confidence: "none",
        },
      ],
    },
  ],
  recommendations: [
    {
      action: "disable-candidate",
      skillName: "unused-skill",
      skillPath: "/repo/.agents/skills/unused-skill/SKILL.md",
      reason: "No local usage was detected for this non-project skill.",
      confidence: "none",
    },
  ],
  topRecommendations: [
    {
      action: "disable-candidate",
      skillName: "unused-skill",
      skillPath: "/repo/.agents/skills/unused-skill/SKILL.md",
      reason: "No local usage was detected for this non-project skill.",
      confidence: "none",
    },
  ],
});
