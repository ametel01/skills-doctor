import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCommandAvailable, resolveCommand } from "../src/cli/utils/is-command-available.js";
import { runCommand } from "../src/cli/utils/run-command.js";

describe("command utilities", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-command-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("resolves executable commands from PATH on non-Windows platforms", async () => {
    const binary = path.join(directory, "claude");
    await writeFile(binary, "#!/bin/sh\nexit 0\n");
    await chmod(binary, 0o755);

    expect(
      resolveCommand("claude", {
        env: { PATH: directory },
        platform: "linux",
      }),
    ).toBe(binary);
  });

  it("requires executable permissions on non-Windows platforms", async () => {
    await writeFile(path.join(directory, "codex"), "#!/bin/sh\nexit 0\n");
    await chmod(path.join(directory, "codex"), 0o644);

    expect(
      isCommandAvailable("codex", {
        env: { PATH: directory },
        platform: "linux",
      }),
    ).toBe(false);
  });

  it("uses PATHEXT candidates on Windows", async () => {
    const binary = path.join(directory, "codex.CMD");
    await writeFile(binary, "@echo off\n");

    expect(
      resolveCommand("codex", {
        env: { PATH: directory, PATHEXT: ".CMD" },
        platform: "win32",
      }),
    ).toBe(binary);
  });

  it("captures successful command output without interleaving it", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "process.stdout.write(' ok '); process.stderr.write(' note ')"],
      directory,
    );

    expect(result).toEqual({
      success: true,
      stdout: "ok",
      stderr: "note",
    });
  });

  it("reports missing binaries as failed command results", async () => {
    const result = await runCommand("__skills_doctor_missing_binary__", [], directory);

    expect(result.success).toBe(false);
    expect(result.stdout).toBe("");
  });
});
