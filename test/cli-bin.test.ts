import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const execFileAsync = promisify(execFile);

describe("CLI bin", () => {
  let directory: string;
  let homeDirectory: string;

  beforeAll(async () => {
    await execFileAsync("bun", ["run", "build"], { cwd: process.cwd() });
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-bin-"));
    homeDirectory = path.join(directory, "home");
    await mkdir(homeDirectory, { recursive: true });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("runs the development entrypoint", async () => {
    const { stdout } = await execFileAsync("bun", ["run", "dev", "--", "--version"], {
      cwd: process.cwd(),
    });

    expect(stdout.trim().split(/\r?\n/).at(-1)).toBe(packageJson.version);
  });

  it("prints one JSON report for a clean packaged scan", async () => {
    await writeSkill({
      directoryName: "good-skill",
      name: "good-skill",
      body: ["## Workflow", "", "- Inspect the fixture."].join("\n"),
      evals: true,
    });

    const result = await runPackagedCli(["--json", "--json-compact", "--yes", directory]);
    const report = parseSingleJsonReport(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Skills:");
    expect(result.stderr).not.toContain("{");
    expect(report).toMatchObject({
      ok: true,
      skillCount: 1,
      findingCount: 0,
    });
  });

  it("prints one JSON report and exits nonzero for blocking packaged scans", async () => {
    await writeSkill({
      directoryName: "bad-skill",
      name: "other-name",
      body: "Body.",
      evals: false,
    });

    const result = await runPackagedCli(["--json", "--json-compact", "--yes", directory]);
    const report = parseSingleJsonReport(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain("Skills:");
    expect(result.stderr).not.toContain("{");
    expect(report).toMatchObject({
      ok: false,
      skillCount: 1,
    });
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.findings?.map((finding) => finding.ruleId)).toContain("name-directory-mismatch");
  });

  it("prints a JSON error report for JSON-mode parse errors", async () => {
    const result = await runPackagedCli(["--json", "--json-compact", "--bad-flag", directory]);
    const report = parseSingleJsonReport(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(report).toMatchObject({
      ok: false,
      error: {
        message: expect.stringContaining("unknown option"),
      },
    });
  });

  it("keeps parse errors human-readable outside JSON mode", async () => {
    const result = await runPackagedCli(["--bad-flag", directory]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown option");
  });

  it("keeps packaged help output available", async () => {
    const result = await runPackagedCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: skills-doctor");
  });

  const writeSkill = async (input: {
    readonly directoryName: string;
    readonly name: string;
    readonly body: string;
    readonly evals: boolean;
  }): Promise<void> => {
    const skillDir = path.join(directory, ".agents", "skills", input.directoryName);
    await mkdir(skillDir, { recursive: true });
    if (input.evals) {
      await mkdir(path.join(skillDir, "evals"), { recursive: true });
      await writeFile(path.join(skillDir, "evals", "evals.json"), "{}\n");
    }
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        `name: ${input.name}`,
        "description: Use this skill when testing packaged CLI scans.",
        "---",
        "",
        input.body,
        "",
      ].join("\n"),
    );
  };

  const runPackagedCli = async (
    args: readonly string[],
  ): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> => {
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ["bin/skills-doctor.js", ...args],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            HOME: homeDirectory,
            USERPROFILE: homeDirectory,
          },
        },
      );
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      const failure = error as {
        readonly code?: unknown;
        readonly stdout?: string | Buffer;
        readonly stderr?: string | Buffer;
      };
      return {
        exitCode: typeof failure.code === "number" ? failure.code : 1,
        stdout: String(failure.stdout ?? ""),
        stderr: String(failure.stderr ?? ""),
      };
    }
  };

  const parseSingleJsonReport = (
    stdout: string,
  ): {
    readonly ok: boolean;
    readonly skillCount?: number;
    readonly findingCount?: number;
    readonly errorCount?: number;
    readonly findings?: readonly { readonly ruleId: string }[];
    readonly error?: { readonly message: string };
  } => {
    const trimmed = stdout.trim();
    expect(trimmed).not.toBe("");
    expect(trimmed.split(/\r?\n/)).toHaveLength(1);
    return JSON.parse(trimmed) as {
      readonly ok: boolean;
      readonly skillCount?: number;
      readonly findingCount?: number;
      readonly errorCount?: number;
      readonly findings?: readonly { readonly ruleId: string }[];
      readonly error?: { readonly message: string };
    };
  };
});
