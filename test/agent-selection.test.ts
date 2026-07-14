import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackToMainMenuError, CliInputError } from "../src/cli/utils/handle-error.js";
import {
  buildRepairAgentInvocation,
  buildRepairAgentSpawnInvocation,
  chooseRepairAgent,
  detectRepairAgents,
  formatRepairAgentPreview,
} from "../src/cli/utils/launch-agent.js";
import { BACK_TO_MAIN_MENU_VALUE, type PromptAdapter } from "../src/cli/utils/prompts.js";

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

  it("returns to the main menu when backing out of repair agent selection", async () => {
    const choices: string[][] = [];
    const prompts = fakePrompts({ selected: BACK_TO_MAIN_MENU_VALUE, choices });

    await expect(
      chooseRepairAgent({
        prompts,
        isAvailable: async () => true,
      }),
    ).rejects.toBeInstanceOf(BackToMainMenuError);

    expect(choices.at(-1)).toContain("Back to main menu");
  });

  it("selects the only detected repair agent from a menu", async () => {
    const choices: string[][] = [];
    const prompts = fakePrompts({ selected: "claude", choices });

    const agent = await chooseRepairAgent({
      prompts,
      isAvailable: async (command) => command === "claude",
    });

    expect(agent?.id).toBe("claude");
    expect(choices.at(-1)).toContain("Back to main menu");
  });

  it("returns to the main menu when backing out of the only detected repair agent", async () => {
    const prompts = fakePrompts({ selected: BACK_TO_MAIN_MENU_VALUE });

    await expect(
      chooseRepairAgent({
        prompts,
        isAvailable: async (command) => command === "codex",
      }),
    ).rejects.toBeInstanceOf(BackToMainMenuError);
  });

  it("raises an expected user error when no repair agents are available", async () => {
    await expect(
      chooseRepairAgent({
        prompts: fakePrompts({}),
        isAvailable: async () => false,
      }),
    ).rejects.toBeInstanceOf(CliInputError);
  });

  it("builds launch invocations without bypassing permissions", () => {
    expect(buildRepairAgentInvocation("claude", "fix skills")).toEqual({
      command: "claude",
      args: ["fix skills"],
    });
    expect(buildRepairAgentInvocation("codex", "fix skills")).toEqual({
      command: "codex",
      args: ["fix skills"],
    });
    expect(formatRepairAgentPreview("codex")).toBe("codex <prompt>");
  });

  it("builds launch invocations with prompt-file references when available", () => {
    expect(
      buildRepairAgentInvocation("claude", {
        prompt: "fix skills",
        promptPath: "/tmp/skills-doctor/reports/handoff-prompt.md",
      }),
    ).toEqual({
      command: "claude",
      args: ["Read and follow the prompt file at: /tmp/skills-doctor/reports/handoff-prompt.md"],
    });
    expect(
      buildRepairAgentInvocation("codex", {
        prompt: "fix skills",
        promptPath: "/tmp/skills-doctor/reports/handoff-prompt.md",
      }),
    ).toEqual({
      command: "codex",
      args: ["Read and follow the prompt file at: /tmp/skills-doctor/reports/handoff-prompt.md"],
    });
    expect(formatRepairAgentPreview("codex", { usesPromptFile: true })).toBe("codex <prompt-file>");
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
      args: [entryScript, "repair prompt"],
    });
  });
});

const fakePrompts = (input: {
  readonly confirmed?: boolean;
  readonly selected?: "claude" | "codex" | typeof BACK_TO_MAIN_MENU_VALUE;
  readonly choices?: string[][] | undefined;
}): PromptAdapter => ({
  checkbox: async () => [],
  confirm: async () => input.confirmed ?? true,
  input: async () => "",
  select: async <Value extends string>(
    _message: string,
    choices: readonly { readonly name: string; readonly value: Value }[],
  ) => {
    input.choices?.push(choices.map((choice) => choice.name));
    return (input.selected ?? "claude") as Value;
  },
});
