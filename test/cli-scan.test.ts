import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { scanAction } from "../src/cli/commands/scan.js";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import type { PromptAdapter } from "../src/cli/utils/prompts.js";

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
        prompts: fakePrompts(["all", "by-skill", "exit"]),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(stdout.join("")).toContain("bad-name:");
    expect(stdout.join("")).toContain("- [error] name-directory-mismatch");
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

    await scanAction(
      ".",
      {},
      {
        cwd: directory,
        homeDir: path.join(directory, "home"),
        env: {},
        stdinIsTty: true,
        prompts: queuedPrompts({ selects: ["all", "repair"] }),
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
        isRepairAgentAvailable: async () => false,
      },
    );

    expect(stdout.join("")).toContain("No local repair agent was found.");
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
