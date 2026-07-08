import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BackToMainMenuError, CliInputError } from "./handle-error.js";
import { isCommandAvailable } from "./is-command-available.js";
import type { PromptAdapter } from "./prompts.js";
import { BACK_TO_MAIN_MENU_VALUE, backToMainMenuChoice } from "./prompts.js";

const REPAIR_AGENT_IDS = ["claude", "codex"] as const;

export type RepairAgentId = (typeof REPAIR_AGENT_IDS)[number];

export type CommandInvocation = {
  readonly command: string;
  readonly args: readonly string[];
};

export type RepairAgent = {
  readonly id: RepairAgentId;
  readonly displayName: string;
  readonly binary: string;
  readonly autoApproveArgs: readonly string[];
};

export type AgentAvailabilityProbe = (command: string) => boolean | Promise<boolean>;
export type RepairAgentLauncher = (
  agentId: RepairAgentId,
  prompt: string,
  cwd: string,
  promptPath?: string | undefined,
) => Promise<number>;
export type RepairAgentPromptInput = {
  readonly prompt: string;
  readonly promptPath?: string | undefined;
};

const REPAIR_AGENT_CONFIG: Record<RepairAgentId, RepairAgent> = {
  claude: {
    id: "claude",
    displayName: "Claude Code",
    binary: "claude",
    autoApproveArgs: ["--dangerously-skip-permissions"],
  },
  codex: {
    id: "codex",
    displayName: "Codex",
    binary: "codex",
    autoApproveArgs: ["--yolo"],
  },
};

export type DetectRepairAgentsOptions = {
  readonly isAvailable?: AgentAvailabilityProbe | undefined;
};

export const detectRepairAgents = async (
  options: DetectRepairAgentsOptions = {},
): Promise<readonly RepairAgent[]> => {
  const isAvailable = options.isAvailable ?? isCommandAvailable;
  const agents: RepairAgent[] = [];
  for (const id of REPAIR_AGENT_IDS) {
    const agent = REPAIR_AGENT_CONFIG[id];
    if (await isAvailable(agent.binary)) {
      agents.push(agent);
    }
  }
  return agents;
};

export type ChooseRepairAgentInput = {
  readonly prompts: PromptAdapter;
  readonly isAvailable?: AgentAvailabilityProbe | undefined;
};

export const chooseRepairAgent = async (
  input: ChooseRepairAgentInput,
): Promise<RepairAgent | undefined> => {
  const agents = await detectRepairAgents({ isAvailable: input.isAvailable });
  if (agents.length === 0) {
    throw new CliInputError(
      "No local repair agent was found. Install `claude` or `codex` on PATH to use repair handoff.",
    );
  }

  if (agents.length === 1) {
    const agent = agents[0];
    if (agent === undefined) return undefined;
    const selected = await input.prompts.select<RepairAgentId | typeof BACK_TO_MAIN_MENU_VALUE>(
      "Choose repair agent",
      [
        {
          name: agent.displayName,
          value: agent.id,
          description: `Run ${formatRepairAgentPreview(agent.id)} locally with the repair prompt`,
        },
        backToMainMenuChoice,
      ],
    );
    if (selected === BACK_TO_MAIN_MENU_VALUE) {
      throw new BackToMainMenuError();
    }
    return REPAIR_AGENT_CONFIG[selected];
  }

  const selected = await input.prompts.select<RepairAgentId | typeof BACK_TO_MAIN_MENU_VALUE>(
    "Choose repair agent",
    [
      ...agents.map((agent) => ({
        name: agent.displayName,
        value: agent.id,
        description: `Run ${formatRepairAgentPreview(agent.id)} locally with the repair prompt`,
      })),
      backToMainMenuChoice,
    ],
  );
  if (selected === BACK_TO_MAIN_MENU_VALUE) {
    throw new BackToMainMenuError();
  }
  return REPAIR_AGENT_CONFIG[selected];
};

export const buildRepairAgentInvocation = (
  agentId: RepairAgentId,
  promptInput: string | RepairAgentPromptInput,
): CommandInvocation => {
  const agent = REPAIR_AGENT_CONFIG[agentId];
  return {
    command: agent.binary,
    args: [...agent.autoApproveArgs, buildPromptArgument(promptInput)],
  };
};

export type FormatRepairAgentPreviewOptions = {
  readonly usesPromptFile?: boolean | undefined;
};

export const formatRepairAgentPreview = (
  agentId: RepairAgentId,
  options: FormatRepairAgentPreviewOptions = {},
): string => {
  const agent = REPAIR_AGENT_CONFIG[agentId];
  const promptPlaceholder = options.usesPromptFile === true ? "<prompt-file>" : "<prompt>";
  return [agent.binary, ...agent.autoApproveArgs, promptPlaceholder].join(" ");
};

export type SpawnInvocationOptions = {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly platform?: NodeJS.Platform | undefined;
};

export const buildRepairAgentSpawnInvocation = (
  agentId: RepairAgentId,
  promptInput: string | RepairAgentPromptInput,
  options: SpawnInvocationOptions = {},
): CommandInvocation => {
  const invocation = buildRepairAgentInvocation(agentId, promptInput);
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") return invocation;

  const entryScript = resolveWindowsCmdEntryScript(invocation.command, options.env ?? process.env);
  if (entryScript === undefined) return invocation;
  return {
    command: process.execPath,
    args: [entryScript, ...invocation.args],
  };
};

export const launchRepairAgent: RepairAgentLauncher = async (agentId, prompt, cwd, promptPath) => {
  const invocation = buildRepairAgentSpawnInvocation(agentId, { prompt, promptPath });
  return new Promise<number>((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.args], { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
};

const buildPromptArgument = (promptInput: string | RepairAgentPromptInput): string => {
  if (typeof promptInput === "string") return promptInput;
  if (promptInput.promptPath === undefined) return promptInput.prompt;
  return `Read and follow the prompt file at: ${promptInput.promptPath}`;
};

const resolveWindowsCmdEntryScript = (
  command: string,
  env: NodeJS.ProcessEnv,
): string | undefined => {
  const pathDirectories = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const directory of pathDirectories) {
    const cmdFilePath = path.join(directory, `${command}.cmd`);
    try {
      if (!fs.statSync(cmdFilePath).isFile()) continue;
      const cmdContent = fs.readFileSync(cmdFilePath, "utf8");
      const entryScriptMatch = cmdContent.match(/"%(?:~dp0|dp0%)\\([^"]+\.(?:m?js|cjs))"/);
      const entryScript = entryScriptMatch?.[1];
      if (entryScript === undefined) continue;
      const normalizedEntryScript = entryScript.replaceAll("\\", path.sep);
      const scriptPath = path.resolve(directory, normalizedEntryScript);
      if (fs.statSync(scriptPath).isFile()) return scriptPath;
    } catch {}
  }
  return undefined;
};
