import { stat } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, SkillEcosystem, SkillRoot } from "./types.js";

export type CustomSkillRootInput = {
  readonly rootPath: string;
  readonly ecosystem?: SkillEcosystem;
};

export type DiscoverSkillRootsInput = {
  readonly cwd: string;
  readonly customRoots?: readonly CustomSkillRootInput[];
};

export type DiscoverSkillRootsResult = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
};

export const discoverSkillRoots = async (
  input: DiscoverSkillRootsInput,
): Promise<DiscoverSkillRootsResult> => {
  const candidates: readonly SkillRoot[] = [
    {
      ecosystem: "claude",
      rootPath: path.resolve(input.cwd, ".claude", "skills"),
      source: "detected",
    },
    {
      ecosystem: "codex",
      rootPath: path.resolve(input.cwd, ".agents", "skills"),
      source: "detected",
    },
    ...(input.customRoots ?? []).map((root) => ({
      ecosystem: root.ecosystem ?? "custom",
      rootPath: path.resolve(input.cwd, root.rootPath),
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

const isDirectory = async (targetPath: string): Promise<boolean> => {
  try {
    return (await stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
};
