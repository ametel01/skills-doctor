import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Diagnostic, SkillEcosystem, SkillRoot } from "./types.js";

export type CustomSkillRootInput = {
  readonly rootPath: string;
  readonly ecosystem?: SkillEcosystem;
};

export type DiscoverSkillRootsInput = {
  readonly cwd: string;
  readonly homeDir?: string | undefined;
  readonly customRoots?: readonly CustomSkillRootInput[];
};

export type DiscoverSkillRootsResult = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
};

export const discoverSkillRoots = async (
  input: DiscoverSkillRootsInput,
): Promise<DiscoverSkillRootsResult> => {
  const homeDir = input.homeDir ?? os.homedir();
  const candidates: readonly SkillRoot[] = [
    {
      ecosystem: "claude",
      rootPath: path.resolve(input.cwd, ".claude", "skills"),
      source: "local",
    },
    {
      ecosystem: "codex",
      rootPath: path.resolve(input.cwd, ".agents", "skills"),
      source: "local",
    },
    {
      ecosystem: "claude",
      rootPath: path.join(homeDir, ".claude", "skills"),
      source: "global",
    },
    {
      ecosystem: "codex",
      rootPath: path.join(homeDir, ".agents", "skills"),
      source: "global",
    },
    ...(input.customRoots ?? []).map((root) => ({
      ecosystem: root.ecosystem ?? "custom",
      rootPath: resolveRootPath(input.cwd, homeDir, root.rootPath),
      source: "custom" as const,
    })),
  ];

  const roots: SkillRoot[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const candidate of candidates) {
    const exists = await isDirectory(candidate.rootPath);
    if (exists) {
      roots.push(candidate);
      continue;
    }

    if (candidate.source === "custom") {
      diagnostics.push({
        code: "skill-root-not-found",
        severity: "warning",
        message: `Custom skills root does not exist: ${candidate.rootPath}`,
        path: candidate.rootPath,
      });
    }
  }

  return { roots, diagnostics };
};

const resolveRootPath = (cwd: string, homeDir: string, rootPath: string): string => {
  if (rootPath === "~") return homeDir;
  if (rootPath.startsWith("~/")) return path.join(homeDir, rootPath.slice(2));
  return path.resolve(cwd, rootPath);
};

const isDirectory = async (targetPath: string): Promise<boolean> => {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
};
