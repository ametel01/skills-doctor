import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { scanAction } from "../src/cli/commands/scan.js";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import type { Choice, PromptAdapter } from "../src/cli/utils/prompts.js";

describe("scanAction", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-cli-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("scans the single detected root without prompting when --yes is used", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];

    const report = await scanAction(
      ".",
      { yes: true },
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        stdinIsTty: true,
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.skillCount).toBe(1);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(stdout.join("")).toContain("Skills: 1 scanned");
    expect(stdout.join("")).not.toContain("Top affected skills:");
    expect(process.exitCode).toBe(1);
  });

  it("includes usage in JSON only when --usage is requested", async () => {
    await writeStrongSkill(path.join(directory, ".agents", "skills", "good-skill"), "good-skill");
    const homeDir = path.join(directory, "home");
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "Using the `good-skill` skill.",
      },
    ]);
    const options = {
      cwd: directory,
      homeDir,
      stdinIsTty: false,
      writeStderr: () => {},
      spinner: {
        run: async <Value>(_message: string, operation: () => Promise<Value>) => operation(),
      },
    };
    const withoutUsageStdout: string[] = [];
    const withUsageStdout: string[] = [];

    await scanAction(
      ".",
      { json: true, jsonCompact: true },
      {
        ...options,
        writeStdout: (message) => withoutUsageStdout.push(message),
      },
    );
    await scanAction(
      ".",
      { json: true, jsonCompact: true, usage: true },
      {
        ...options,
        writeStdout: (message) => withUsageStdout.push(message),
      },
    );

    const withoutUsage = JSON.parse(withoutUsageStdout.join(""));
    const withUsage = JSON.parse(withUsageStdout.join(""));
    expect(withoutUsage).not.toHaveProperty("usage");
    expect(withUsage.usage).toMatchObject({
      totalSkillsAnalyzed: 1,
      usedSkillCount: 1,
      contextPressure: {
        level: "low",
      },
    });
  });

  it("runs usage analysis with --yes --usage without prompting", async () => {
    await writeStrongSkill(path.join(directory, ".agents", "skills", "good-skill"), "good-skill");
    const stdout: string[] = [];

    const report = await scanAction(
      ".",
      { yes: true, usage: true },
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        stdinIsTty: true,
        prompts: throwingPrompts(),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.usage).toMatchObject({
      totalSkillsAnalyzed: 1,
      unknownSkillCount: 1,
    });
    expect(stdout.join("")).toContain("Usage analysis:");
  });

  it("reports a measurable elapsed scan time with injected clock", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: bad-skill", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    let now = 1000;

    const report = await scanAction(
      ".",
      { yes: true },
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        now: () => {
          now += 34;
          return now;
        },
      },
    );

    expect(report.elapsedMilliseconds).toBe(34);
  });

  it("keeps warning-only scans successful by default and fails with a warning gate", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "warning-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: warning-skill",
        "description: Helps with PDFs.",
        "---",
        "",
        "## Workflow",
        "",
        "- Inspect the fixture.",
      ].join("\n"),
    );
    const options = {
      cwd: directory,
      homeDir: path.join(directory, "home"),
      stdinIsTty: false,
      writeStdout: () => {},
      writeStderr: () => {},
      spinner: {
        run: async <Value>(_message: string, operation: () => Promise<Value>) => operation(),
      },
    };

    const defaultReport = await scanAction(".", { yes: true }, options);
    expect(defaultReport.errorCount).toBe(0);
    expect(defaultReport.warningCount).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);

    process.exitCode = undefined;
    await scanAction(".", { yes: true, failOn: "warning" }, options);
    expect(process.exitCode).toBe(1);
  });

  it("fails advice-only scans only when the advice gate is requested", async () => {
    await writeSkill(path.join(directory, ".agents", "skills", "advice-skill"), "advice-skill");
    const options = {
      cwd: directory,
      homeDir: path.join(directory, "home"),
      stdinIsTty: false,
      writeStdout: () => {},
      writeStderr: () => {},
      spinner: {
        run: async <Value>(_message: string, operation: () => Promise<Value>) => operation(),
      },
    };

    const defaultReport = await scanAction(".", { yes: true }, options);
    expect(defaultReport.errorCount).toBe(0);
    expect(defaultReport.warningCount).toBe(0);
    expect(defaultReport.adviceCount).toBeGreaterThan(0);
    expect(process.exitCode).toBe(0);

    process.exitCode = undefined;
    await scanAction(".", { yes: true, failOn: "advice" }, options);
    expect(process.exitCode).toBe(1);
  });

  it("fails scans below the requested minimum score", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "warning-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: warning-skill",
        "description: Helps with PDFs.",
        "---",
        "",
        "## Workflow",
        "",
        "- Inspect the fixture.",
      ].join("\n"),
    );

    const report = await scanAction(
      ".",
      { yes: true, minScore: "100" },
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        stdinIsTty: false,
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.score.value).toBeLessThan(100);
    expect(process.exitCode).toBe(1);
  });

  it("throws user errors for invalid quality gate flags", async () => {
    await expect(scanAction(".", { yes: true, failOn: "bad" })).rejects.toBeInstanceOf(
      CliInputError,
    );
    await expect(scanAction(".", { yes: true, minScore: "101" })).rejects.toBeInstanceOf(
      CliInputError,
    );
  });

  it("imports the CLI module without running main", async () => {
    process.exitCode = 123;
    const cliModule = await import("../src/cli/index.js");

    expect(typeof cliModule.buildProgram).toBe("function");
    expect(typeof cliModule.main).toBe("function");
    expect(process.exitCode).toBe(123);
  });

  it("reports the package version in --version output", async () => {
    const { buildProgram } = await import("../src/cli/index.js");
    expect(buildProgram().version()).toBe(packageJson.version);
  });

  it("lets the user select only Claude when both roots exist", async () => {
    await writeSkill(path.join(directory, ".claude", "skills", "claude-skill"), "claude-skill");
    await writeSkill(path.join(directory, ".agents", "skills", "codex-skill"), "codex-skill");
    const prompts = fakePrompts(["claude", "exit"]);

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts,
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.scannedRoots.map((root) => root.ecosystem)).toEqual(["claude"]);
  });

  it("shows cleanup as an interactive next step even when no findings exist", async () => {
    const homeDir = path.join(directory, "home");
    await writeStrongSkill(path.join(homeDir, ".agents", "skills", "unused-skill"), "unused-skill");
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "No skill announcement here.",
      },
    ]);
    const stdout: string[] = [];
    const nextStepChoices: string[][] = [];
    const reportOutputRoot = path.join(directory, "cleanup-reports");
    const reportDirectory = path.join(reportOutputRoot, "2026-06-20T01-02-03-004Z");

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        prompts: recordingPrompts({
          selects: ["all", "cleanup"],
          nextStepChoices,
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async () => false,
        cleanupReportOutputRoot: reportOutputRoot,
        cleanupReportTimestamp: "2026-06-20T01:02:03.004Z",
      },
    );

    expect(report.findingCount).toBe(0);
    expect(nextStepChoices[0]).toContain("Disable unused skills to reduce context pressure");
    expect(nextStepChoices[0]).toContain("View usage ranking");
    expect(nextStepChoices[0]).toContain("View usage recommendations");
    expect(nextStepChoices[0]).not.toContain("Fix skills with Claude or Codex");
    expect(stdout.join("")).toContain("No local repair agent was found.");
    expect(stdout.join("")).toContain(`Report directory: ${reportDirectory}`);
    expect(stdout.join("")).toContain(
      `Cleanup prompt: ${path.join(reportDirectory, "cleanup-prompt.md")}`,
    );
    await expect(readFile(path.join(reportDirectory, "usage.json"), "utf8")).resolves.toContain(
      "unused-skill",
    );
  });

  it("excludes Codex-disabled skills from usage cleanup candidates", async () => {
    const homeDir = path.join(directory, "home");
    const activeSkillPath = path.join(homeDir, ".agents", "skills", "active-unused", "SKILL.md");
    const disabledSkillPath = path.join(
      homeDir,
      ".agents",
      "skills",
      "disabled-unused",
      "SKILL.md",
    );
    await writeStrongSkill(path.dirname(activeSkillPath), "active-unused");
    await writeStrongSkill(path.dirname(disabledSkillPath), "disabled-unused");
    await mkdir(path.join(homeDir, ".codex"), { recursive: true });
    await writeFile(
      path.join(homeDir, ".codex", "config.toml"),
      ["[[skills.config]]", `path = "${disabledSkillPath}"`, "enabled = false", ""].join("\n"),
    );
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "No skill announcement here.",
      },
    ]);
    const nextStepChoices: string[][] = [];

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        prompts: recordingPrompts({
          selects: ["all", "exit"],
          nextStepChoices,
        }),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.skillCount).toBe(1);
    expect(report.skills.map((skill) => skill.name)).toEqual(["active-unused"]);
    expect(report.usage?.totalSkillsAnalyzed).toBe(1);
    expect(report.usage?.topRecommendations).toEqual([
      expect.objectContaining({
        action: "disable-candidate",
        skillName: "active-unused",
      }),
    ]);
    expect(JSON.stringify(report.usage)).not.toContain("disabled-unused");
    expect(nextStepChoices[0]).toContain("Disable unused skills to reduce context pressure");
  });

  it("does not offer cleanup handoff when only used skills are present", async () => {
    await writeStrongSkill(path.join(directory, ".agents", "skills", "good-skill"), "good-skill");
    const homeDir = path.join(directory, "home");
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "Using the `good-skill` skill.",
      },
    ]);
    const nextStepChoices: string[][] = [];

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        prompts: recordingPrompts({
          selects: ["exit"],
          nextStepChoices,
        }),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.usage?.usedSkillCount).toBe(1);
    expect(report.usage?.topRecommendations).toHaveLength(0);
    expect(nextStepChoices).toHaveLength(0);
  });

  it("renders usage ranking and cleanup recommendation views", async () => {
    const homeDir = path.join(directory, "home");
    await writeStrongSkill(path.join(homeDir, ".agents", "skills", "unused-skill"), "unused-skill");
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "No skill announcement here.",
      },
    ]);
    const stdout: string[] = [];

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        stdoutIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "usage-ranking", "cleanup-recommendations", "exit"],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    const output = stdout.join("");
    expect(output).toContain("\x1b[36mUsage ranking\x1b[39m:");
    expect(output).toContain(
      "\x1b[36munused-skill\x1b[39m: \x1b[2munused\x1b[22m, \x1b[2m0\x1b[22m uses, \x1b[2mnone\x1b[22m confidence",
    );
    expect(output).toContain("\x1b[2mno timestamp\x1b[22m");
    expect(output).toContain("\x1b[36mUsage recommendations\x1b[39m:");
    expect(output).toContain("\x1b[36mContext budget pressure\x1b[39m: \x1b[32mlow\x1b[39m");
    expect(output).toContain("\x1b[33mdisable-candidate\x1b[39m \x1b[36munused-skill\x1b[39m");
    expect(output).not.toContain("No skill announcement here.");
  });

  it("lets users cancel cleanup agent launch after report writing", async () => {
    const homeDir = path.join(directory, "home");
    await writeStrongSkill(path.join(homeDir, ".agents", "skills", "unused-skill"), "unused-skill");
    await writeJsonl(path.join(homeDir, ".codex", "sessions", "session.jsonl"), [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        role: "assistant",
        content: "No skill announcement here.",
      },
    ]);
    const stdout: string[] = [];
    const launches: string[] = [];

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "cleanup"],
          confirms: [true, false],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async (command) => command === "codex",
        launchAgent: async (_agentId, prompt) => {
          launches.push(prompt);
          return 0;
        },
      },
    );

    expect(stdout.join("")).toContain("Selected Codex.");
    expect(stdout.join("")).toContain("Cleanup agent launch cancelled.");
    expect(launches).toEqual([]);
  });

  it("shows grouped findings when by-skill is selected", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: bad-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        stdoutIsTty: true,
        prompts: fakePrompts(["all", "by-skill", "exit"]),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(stdout.join("")).toContain("\x1b[36mbad-name\x1b[39m:");
    expect(stdout.join("")).toContain(
      "- \x1b[31m[error]\x1b[39m \x1b[36mname-directory-mismatch\x1b[39m",
    );
  });

  it("lets users view findings by skill and then repair", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    await writeFile(
      skillPath,
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];
    const launches: string[] = [];

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "by-skill", "repair", "errors"],
          confirms: [true, true, false],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async (command) => command === "codex",
        launchAgent: async (_agentId, prompt) => {
          launches.push(prompt);
          await writeFile(
            skillPath,
            [
              "---",
              "name: bad-skill",
              "description: Helps with PDFs.",
              "---",
              "",
              "## Workflow",
              "",
              "- Inspect PDFs.",
            ].join("\n"),
          );
          return 0;
        },
      },
    );

    expect(stdout.join("")).toContain("other-name:");
    expect(stdout.join("")).toContain("- [error] name-directory-mismatch");
    expect(stdout.join("")).toContain("Post-handoff re-scan:");
    expect(launches).toHaveLength(1);
    expect(report.errorCount).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it("throws a user error when no roots exist and prompts are skipped", async () => {
    await expect(
      scanAction(
        ".",
        { yes: true },
        {
          cwd: directory,
          homeDir: path.join(directory, "home"),
          stdinIsTty: false,
          writeStdout: () => {},
          writeStderr: () => {},
          spinner: { run: async (_message, operation) => await operation() },
        },
      ),
    ).rejects.toBeInstanceOf(CliInputError);
  });

  it("throws a user error when local and global scopes are ambiguous and prompts are skipped", async () => {
    const homeDir = path.join(directory, "home");
    await writeSkill(path.join(directory, ".agents", "skills", "local-skill"), "local-skill");
    await writeSkill(path.join(homeDir, ".agents", "skills", "global-skill"), "global-skill");

    await expect(
      scanAction(
        ".",
        { yes: true },
        {
          cwd: directory,
          homeDir,
          stdinIsTty: false,
          writeStdout: () => {},
          writeStderr: () => {},
          spinner: { run: async (_message, operation) => await operation() },
        },
      ),
    ).rejects.toThrow("Multiple local and global skills roots were found");
  });

  it("throws a user error when ecosystems are ambiguous and prompts are skipped", async () => {
    await writeSkill(path.join(directory, ".claude", "skills", "claude-skill"), "claude-skill");
    await writeSkill(path.join(directory, ".agents", "skills", "codex-skill"), "codex-skill");

    await expect(
      scanAction(
        ".",
        { yes: true },
        {
          cwd: directory,
          homeDir: path.join(directory, "home"),
          stdinIsTty: false,
          writeStdout: () => {},
          writeStderr: () => {},
          spinner: { run: async (_message, operation) => await operation() },
        },
      ),
    ).rejects.toThrow("Multiple Claude and Codex/agents skills roots were found");
  });

  it("launches an injected repair agent and reports fixed findings after re-scan", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    await writeFile(
      skillPath,
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];
    const launches: string[] = [];

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "repair", "errors"],
          confirms: [true, true, false],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async (command) => command === "codex",
        launchAgent: async (_agentId, prompt) => {
          launches.push(prompt);
          await writeSkill(skillDir, "bad-skill");
          return 0;
        },
      },
    );

    expect(launches).toHaveLength(1);
    expect(stdout.join("")).toContain("Post-handoff re-scan:");
    expect(stdout.join("")).toContain("Fixed findings:");
    expect(report.errorCount).toBe(0);
    expect(process.exitCode).toBe(0);
  });

  it("reports remaining findings when the injected repair agent makes no changes", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "repair", "errors"],
          confirms: [true, true, false],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async (command) => command === "claude",
        launchAgent: async () => 0,
      },
    );

    expect(stdout.join("")).toContain("Remaining findings:");
    expect(report.errorCount).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });

  it("prints launch failures without running a re-scan", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({
          selects: ["all", "repair", "errors"],
          confirms: [true, true],
        }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async (command) => command === "codex",
        launchAgent: async () => {
          throw new Error("spawn failed");
        },
      },
    );

    expect(stdout.join("")).toContain("Agent launch failed: spawn failed");
    expect(stdout.join("")).not.toContain("Post-handoff re-scan:");
    expect(process.exitCode).toBe(1);
  });

  it("prints a no-agent fallback during repair handoff", async () => {
    const skillDir = path.join(directory, ".agents", "skills", "bad-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      ["---", "name: other-name", "description: Helps with PDFs.", "---", "", "Body."].join("\n"),
    );
    const stdout: string[] = [];
    const launches: string[] = [];
    const reportOutputRoot = path.join(directory, "reports");
    const reportDirectory = path.join(reportOutputRoot, "2026-06-18T01-02-03-004Z");

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({ selects: ["all", "repair", "errors"] }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async () => false,
        repairReportOutputRoot: reportOutputRoot,
        repairReportTimestamp: "2026-06-18T01:02:03.004Z",
        launchAgent: async (_agentId, prompt) => {
          launches.push(prompt);
          return 0;
        },
      },
    );

    expect(stdout.join("")).toContain("No local repair agent was found.");
    expect(stdout.join("")).toContain(`Report directory: ${reportDirectory}`);
    expect(stdout.join("")).toContain(
      `Repair prompt: ${path.join(reportDirectory, "handoff-prompt.md")}`,
    );
    await expect(readFile(path.join(reportDirectory, "findings.json"), "utf8")).resolves.toContain(
      '"findingCount": 1',
    );
    await expect(
      readFile(path.join(reportDirectory, "handoff-prompt.md"), "utf8"),
    ).resolves.toContain("name-directory-mismatch");
    expect(launches).toEqual([]);
    expect(stdout.join("")).not.toContain("Post-handoff re-scan:");
    expect(process.exitCode).toBe(1);
  });

  it("lets the user choose global/root skills when local and global roots exist", async () => {
    const homeDir = path.join(directory, "home");
    await writeSkill(path.join(directory, ".agents", "skills", "local-skill"), "local-skill");
    await writeSkill(path.join(homeDir, ".agents", "skills", "global-skill"), "global-skill");

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir,
        env: {},
        stdinIsTty: true,
        prompts: fakePrompts(["global", "exit"]),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.scannedRoots).toHaveLength(1);
    expect(report.scannedRoots[0]).toMatchObject({
      ecosystem: "codex",
      source: "global",
      rootPath: path.join(homeDir, ".agents", "skills"),
    });
  });

  it("lets users add a custom skills path while standard roots exist", async () => {
    await writeSkill(path.join(directory, ".agents", "skills", "local-skill"), "local-skill");
    const customRoot = path.join(directory, "custom-skills");
    await writeSkill(path.join(customRoot, "custom-skill"), "custom-skill");

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: fakePrompts(["custom", path.join(customRoot)]),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.scannedRoots).toHaveLength(2);
    expect(report.scannedRoots).toMatchObject([
      expect.objectContaining({
        ecosystem: "codex",
        source: "local",
        rootPath: path.join(directory, ".agents", "skills"),
      }),
      expect.objectContaining({
        ecosystem: "custom",
        source: "custom",
        rootPath: customRoot,
      }),
    ]);
  });

  it("preserves missing custom root diagnostics when standard roots still scan", async () => {
    await writeSkill(path.join(directory, ".agents", "skills", "local-skill"), "local-skill");
    const missingRoot = path.join(directory, "missing-skills");

    const report = await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: fakePrompts(["custom", missingRoot]),
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.skillCount).toBe(1);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        code: "skill-root-not-found",
        severity: "warning",
        path: missingRoot,
      }),
    ]);
    expect(process.exitCode).toBe(0);
  });
});

const writeSkill = async (skillDir: string, name: string): Promise<void> => {
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Use this skill when testing CLI scans.",
      "---",
      "",
      "## Workflow",
      "",
      "- Inspect the fixture.",
    ].join("\n"),
  );
};

const writeStrongSkill = async (skillDir: string, name: string): Promise<void> => {
  await mkdir(path.join(skillDir, "evals"), { recursive: true });
  await writeFile(path.join(skillDir, "evals", "evals.json"), "{}\n");
  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: Use this skill when testing usage-aware CLI scans.",
      "---",
      "",
      "## Workflow",
      "",
      "- Inspect the fixture inputs.",
      "- Compare results with expected output.",
      "",
    ].join("\n"),
  );
};

const writeJsonl = async (filePath: string, records: readonly unknown[]): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
};

const fakePrompts = (answers: readonly string[]): PromptAdapter => {
  const queue = [...answers];
  return {
    checkbox: async () => [],
    confirm: async () => true,
    input: async () => queue.shift() ?? "",
    select: async <Value extends string>() => (queue.shift() ?? "exit") as Value,
  };
};

const queuedPrompts = (input: {
  readonly selects: readonly string[];
  readonly confirms?: readonly boolean[];
  readonly checked?: readonly string[];
}): PromptAdapter => {
  const selects = [...input.selects];
  const confirms = [...(input.confirms ?? [])];
  return {
    checkbox: async <Value extends string>() => [...(input.checked ?? [])] as Value[],
    confirm: async () => confirms.shift() ?? true,
    input: async () => "",
    select: async <Value extends string>() => (selects.shift() ?? "exit") as Value,
  };
};

const recordingPrompts = (input: {
  readonly selects: readonly string[];
  readonly nextStepChoices: string[][];
}): PromptAdapter => {
  const selects = [...input.selects];
  return {
    checkbox: async () => [],
    confirm: async () => true,
    input: async () => "",
    select: async <Value extends string>(message: string, choices: readonly Choice<Value>[]) => {
      if (message === "Next step") input.nextStepChoices.push(choices.map((choice) => choice.name));
      return (selects.shift() ?? "exit") as Value;
    },
  };
};

const throwingPrompts = (): PromptAdapter => ({
  checkbox: async () => {
    throw new Error("unexpected prompt");
  },
  confirm: async () => {
    throw new Error("unexpected prompt");
  },
  input: async () => {
    throw new Error("unexpected prompt");
  },
  select: async () => {
    throw new Error("unexpected prompt");
  },
});
