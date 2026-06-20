import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Diagnostic } from "./types.js";

export type DisabledSkillSelectors = {
  readonly paths: readonly string[];
  readonly names: readonly string[];
};

export type ReadCodexDisabledSkillConfigInput = {
  readonly homeDir?: string | undefined;
};

export type ReadCodexDisabledSkillConfigResult = DisabledSkillSelectors & {
  readonly configPath: string;
  readonly diagnostics: readonly Diagnostic[];
};

type SkillConfigEntry = {
  path?: string | undefined;
  name?: string | undefined;
  enabled?: boolean | undefined;
};

export const readCodexDisabledSkillConfig = async (
  input: ReadCodexDisabledSkillConfigInput = {},
): Promise<ReadCodexDisabledSkillConfigResult> => {
  const homeDir = input.homeDir ?? os.homedir();
  const configPath = path.join(homeDir, ".codex", "config.toml");
  const content: string | Error | undefined = await readFile(configPath, "utf8").catch(
    (error: unknown) => {
      if (getErrorCode(error) === "ENOENT") return undefined;
      return error instanceof Error ? error : new Error(`Unable to read ${configPath}`);
    },
  );

  if (content === undefined) {
    return { configPath, diagnostics: [], paths: [], names: [] };
  }
  if (content instanceof Error) {
    return {
      configPath,
      diagnostics: [
        {
          code: "codex-config-unreadable",
          severity: "warning",
          message: content.message,
          path: configPath,
        },
      ],
      paths: [],
      names: [],
    };
  }

  return {
    configPath,
    diagnostics: [],
    ...parseCodexDisabledSkillConfig(content),
  };
};

export const parseCodexDisabledSkillConfig = (content: string): DisabledSkillSelectors => {
  const disabledPaths = new Set<string>();
  const disabledNames = new Set<string>();
  let current: SkillConfigEntry | undefined;

  const flush = () => {
    if (current === undefined) return;
    if (current.path !== undefined) {
      const normalizedPath = normalizeSkillPath(current.path);
      if (current.enabled === false) disabledPaths.add(normalizedPath);
      if (current.enabled === true) disabledPaths.delete(normalizedPath);
    }
    if (current.name !== undefined) {
      const normalizedName = current.name.trim();
      if (normalizedName.length > 0 && current.enabled === false) disabledNames.add(normalizedName);
      if (normalizedName.length > 0 && current.enabled === true)
        disabledNames.delete(normalizedName);
    }
    current = undefined;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (line.length === 0) continue;

    const arrayTable = line.match(/^\[\[([^\]]+)\]\]$/u);
    if (arrayTable !== null) {
      flush();
      current = arrayTable[1]?.trim() === "skills.config" ? {} : undefined;
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      flush();
      current = undefined;
      continue;
    }

    if (current === undefined) continue;
    const assignment = line.match(/^([A-Za-z][\w-]*)\s*=\s*(.+)$/u);
    if (assignment === null) continue;
    const key = assignment[1];
    const rawValue = assignment[2]?.trim() ?? "";
    if (key === "enabled") {
      if (rawValue === "true") current.enabled = true;
      if (rawValue === "false") current.enabled = false;
      continue;
    }
    if (key === "path") {
      current.path = parseTomlString(rawValue);
      continue;
    }
    if (key === "name") {
      current.name = parseTomlString(rawValue);
    }
  }

  flush();
  return {
    paths: [...disabledPaths].sort((left, right) => left.localeCompare(right)),
    names: [...disabledNames].sort((left, right) => left.localeCompare(right)),
  };
};

export const normalizeSkillPath = (skillPath: string): string => path.resolve(skillPath);

const parseTomlString = (value: string): string | undefined => {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return undefined;
};

const stripTomlComment = (line: string): string => {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return line.slice(0, index);
  }
  return line;
};

const getErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
