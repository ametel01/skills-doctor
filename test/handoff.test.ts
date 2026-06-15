import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import {
  type RepairFindingSubset,
  prepareRepairHandoff,
} from "../src/cli/utils/handoff-to-agent.js";
import type { PromptAdapter } from "../src/cli/utils/prompts.js";
import type { ScanReport } from "../src/domain/build-report.js";
import type { Finding } from "../src/index.js";
import { buildHandoffPrompt, calculateScore, writeFindingsDirectory } from "../src/index.js";

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
    expect(seenChoices.map((choice) => choice.value)).not.toContain("errors-and-warnings");
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
  select: async <Value extends string>(choices: readonly { name: string; value: Value }[]) => {
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

const makeReport = (findings: readonly Finding[]): ScanReport => {
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
