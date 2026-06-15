import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import type { PromptAdapter } from "../src/cli/utils/prompts.js";
import { scanAction } from "../src/index.js";

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
        stdinIsTty: true,
        writeStdout: (message) => stdout.push(message),
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.skillCount).toBe(1);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(stdout.join("")).toContain("Skills scanned: 1");
    expect(process.exitCode).toBe(1);
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
        stdinIsTty: true,
        prompts,
        writeStdout: () => {},
        writeStderr: () => {},
        spinner: { run: async (_message, operation) => await operation() },
      },
    );

    expect(report.scannedRoots.map((root) => root.ecosystem)).toEqual(["claude"]);
  });

  it("throws a user error when no roots exist and prompts are skipped", async () => {
    await expect(
      scanAction(
        ".",
        { yes: true },
        {
          cwd: directory,
          stdinIsTty: false,
          writeStdout: () => {},
          writeStderr: () => {},
          spinner: { run: async (_message, operation) => await operation() },
        },
      ),
    ).rejects.toBeInstanceOf(CliInputError);
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
    input: async () => queue.shift() ?? "",
    select: async <Value extends string>() => (queue.shift() ?? "exit") as Value,
  };
};
