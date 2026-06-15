import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliInputError } from "../src/cli/utils/handle-error.js";
import {
  buildRepairAgentInvocation,
  buildRepairAgentSpawnInvocation,
  chooseRepairAgent,
  detectRepairAgents,
  formatRepairAgentPreview,
} from "../src/cli/utils/launch-agent.js";
import type { PromptAdapter } from "../src/cli/utils/prompts.js";

describe("repair agent utilities", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-agent-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("detects available repair agents in stable menu order", async () => {
    const agents = await detectRepairAgents({
      isAvailable: async (command) => command === "codex" || command === "claude",
    });

    expect(agents.map((agent) => agent.id)).toEqual(["claude", "codex"]);
  });

  it("prompts when both repair agents are available", async () => {
    const prompts = fakePrompts({ selected: "codex" });

    const agent = await chooseRepairAgent({
      prompts,
      isAvailable: async () => true,
    });

    expect(agent?.id).toBe("codex");
  });

  it("defaults to the only detected repair agent after confirmation", async () => {
    const prompts = fakePrompts({ confirmed: true });

    const agent = await chooseRepairAgent({
      prompts,
      isAvailable: async (command) => command === "claude",
    });

    expect(agent?.id).toBe("claude");
  });

  it("returns undefined when the only detected agent is declined", async () => {
    const prompts = fakePrompts({ confirmed: false });

    const agent = await chooseRepairAgent({
      prompts,
      isAvailable: async (command) => command === "codex",
    });

    expect(agent).toBeUndefined();
  });

  it("raises an expected user error when no repair agents are available", async () => {
    await expect(
      chooseRepairAgent({
        prompts: fakePrompts({}),
        isAvailable: async () => false,
      }),
    ).rejects.toBeInstanceOf(CliInputError);
  });

  it("builds launch invocations with prompt as the final argument", () => {
    expect(buildRepairAgentInvocation("claude", "fix skills")).toEqual({
      command: "claude",
      args: ["--dangerously-skip-permissions", "fix skills"],
    });
    expect(buildRepairAgentInvocation("codex", "fix skills")).toEqual({
      command: "codex",
      args: ["--yolo", "fix skills"],
    });
    expect(formatRepairAgentPreview("codex")).toBe("codex --yolo <prompt>");
  });

  it("uses a Windows entry script when a cmd wrapper points to one", async () => {
    const entryScript = path.join(directory, "node_modules", "codex", "cli.js");
    await mkdir(path.dirname(entryScript), { recursive: true });
    await writeFile(entryScript, "console.log('codex');\n");
    await writeFile(
      path.join(directory, "codex.cmd"),
      '@IF EXIST "%~dp0\\node_modules\\codex\\cli.js" node "%~dp0\\node_modules\\codex\\cli.js" %*\n',
    );

    const invocation = buildRepairAgentSpawnInvocation("codex", "repair prompt", {
      env: { PATH: directory },
      platform: "win32",
    });

    expect(invocation).toEqual({
      command: process.execPath,
      args: [entryScript, "--yolo", "repair prompt"],
    });
  });
});

const fakePrompts = (input: {
  readonly confirmed?: boolean;
  readonly selected?: "claude" | "codex";
}): PromptAdapter => ({
  confirm: async () => input.confirmed ?? true,
  input: async () => "",
  select: async <Value extends string>() => (input.selected ?? "claude") as Value,
});
