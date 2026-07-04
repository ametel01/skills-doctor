import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
  Diagnostic,
  SkillArtifact,
  SkillArtifactSymlinkStatus,
  SkillArtifactType,
  SkillRecord,
} from "./types.js";

const IGNORED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "coverage"]);
const PACKAGE_MANIFEST_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "pyproject.toml",
  "requirements.txt",
  "uv.lock",
  "Cargo.toml",
  "go.mod",
]);
const SHELL_SCRIPT_EXTENSIONS = new Set([".sh", ".bash", ".zsh", ".fish", ".ps1"]);

export const discoverSkillArtifacts = async (
  skill: SkillRecord,
): Promise<readonly SkillArtifact[]> => {
  const rootRealPath = await realpath(skill.skillDir).catch(() => undefined);
  const artifacts: SkillArtifact[] = [];
  const rootSymlinkArtifact = await readRootSymlinkArtifact(skill, rootRealPath);
  if (rootSymlinkArtifact !== undefined) artifacts.push(rootSymlinkArtifact);
  artifacts.push(...(await walkSkillArtifacts(skill.skillDir, rootRealPath)));
  return artifacts.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

const readRootSymlinkArtifact = async (
  skill: SkillRecord,
  rootRealPath: string | undefined,
): Promise<SkillArtifact | undefined> => {
  const rootStats = await lstat(skill.skillDir).catch(() => undefined);
  if (rootStats === undefined || !rootStats.isSymbolicLink()) return undefined;
  const symlinkStatus = classifySymlinkStatus(skill.rootPath, rootRealPath);
  return {
    type: "other",
    path: skill.skillDir,
    relativePath: ".",
    readable: rootRealPath !== undefined,
    hidden: isHiddenPath(skill.directoryName),
    symlinkStatus,
    realPath: rootRealPath,
    diagnostic:
      rootRealPath === undefined
        ? buildArtifactDiagnostic(skill.skillDir, "skill-artifact-symlink-broken", "broken symlink")
        : undefined,
  };
};

const walkSkillArtifacts = async (
  skillDir: string,
  rootRealPath: string | undefined,
): Promise<readonly SkillArtifact[]> => {
  const visitedDirectories = new Set<string>();

  const walk = async (directoryPath: string): Promise<readonly SkillArtifact[]> => {
    const directoryRealPath = await realpath(directoryPath).catch(() => undefined);
    if (directoryRealPath !== undefined) {
      if (visitedDirectories.has(directoryRealPath)) return [];
      visitedDirectories.add(directoryRealPath);
    }

    const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
    const sortedEntries = entries.toSorted((left, right) => left.name.localeCompare(right.name));
    const artifactsByEntry = await Promise.all(
      sortedEntries.map(async (entry) => {
        if (IGNORED_DIRECTORY_NAMES.has(entry.name)) return [];
        const entryArtifacts: SkillArtifact[] = [];
        const artifactPath = path.join(directoryPath, entry.name);
        const relativePath = normalizeRelativePath(path.relative(skillDir, artifactPath));
        const artifact = await readArtifact(skillDir, rootRealPath, artifactPath, relativePath);
        if (artifact !== undefined) entryArtifacts.push(artifact);

        const entryStats = await lstat(artifactPath).catch(() => undefined);
        if (entryStats === undefined) return entryArtifacts;
        if (entryStats.isDirectory()) {
          entryArtifacts.push(...(await walk(artifactPath)));
          return entryArtifacts;
        }
        if (!entryStats.isSymbolicLink()) return entryArtifacts;
        const targetRealPath = await realpath(artifactPath).catch(() => undefined);
        if (
          targetRealPath !== undefined &&
          rootRealPath !== undefined &&
          isPathInside(rootRealPath, targetRealPath)
        ) {
          const targetStats = await stat(artifactPath).catch(() => undefined);
          if (targetStats?.isDirectory() === true)
            entryArtifacts.push(...(await walk(artifactPath)));
        }
        return entryArtifacts;
      }),
    );
    return artifactsByEntry.flat();
  };

  return walk(skillDir);
};

const readArtifact = async (
  skillDir: string,
  rootRealPath: string | undefined,
  artifactPath: string,
  relativePath: string,
): Promise<SkillArtifact | undefined> => {
  const stats = await lstat(artifactPath).catch(() => undefined);
  if (stats === undefined) {
    return buildUnreadableArtifact(
      skillDir,
      artifactPath,
      relativePath,
      "Unable to read artifact metadata.",
    );
  }

  const targetRealPath = await realpath(artifactPath).catch(() => undefined);
  const symlinkStatus = stats.isSymbolicLink()
    ? classifySymlinkStatus(rootRealPath, targetRealPath)
    : "none";
  const artifactType = classifyArtifact(relativePath, stats.isDirectory(), symlinkStatus);
  if (artifactType === undefined) return undefined;

  if (stats.isDirectory()) {
    return {
      type: artifactType,
      path: artifactPath,
      relativePath,
      readable: targetRealPath !== undefined,
      hidden: isHiddenPath(relativePath),
      symlinkStatus,
      realPath: targetRealPath,
      diagnostic:
        stats.isSymbolicLink() && targetRealPath === undefined
          ? buildArtifactDiagnostic(artifactPath, "skill-artifact-symlink-broken", "broken symlink")
          : undefined,
    };
  }

  if (symlinkStatus === "escapes" || symlinkStatus === "broken") {
    return {
      type: artifactType,
      path: artifactPath,
      relativePath,
      readable: false,
      hidden: isHiddenPath(relativePath),
      executable: isExecutable(stats.mode),
      symlinkStatus,
      realPath: targetRealPath,
      diagnostic:
        symlinkStatus === "broken"
          ? buildArtifactDiagnostic(artifactPath, "skill-artifact-symlink-broken", "broken symlink")
          : undefined,
    };
  }

  const content = await readFile(artifactPath).catch(() => undefined);
  if (content === undefined) {
    return buildUnreadableArtifact(
      skillDir,
      artifactPath,
      relativePath,
      "Unable to read artifact.",
    );
  }
  const targetStats = stats.isSymbolicLink() ? await stat(artifactPath).catch(() => stats) : stats;
  return {
    type: artifactType,
    path: artifactPath,
    relativePath,
    readable: true,
    hidden: isHiddenPath(relativePath),
    executable: isExecutable(targetStats.mode),
    symlinkStatus,
    realPath: targetRealPath,
    content: content.toString("utf8"),
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
};

const buildUnreadableArtifact = (
  skillDir: string,
  artifactPath: string,
  relativePath: string,
  reason: string,
): SkillArtifact => ({
  type: classifyArtifact(relativePath, false, "none") ?? "other",
  path: artifactPath,
  relativePath: normalizeRelativePath(path.relative(skillDir, artifactPath)),
  readable: false,
  hidden: isHiddenPath(relativePath),
  symlinkStatus: "none",
  diagnostic: buildArtifactDiagnostic(artifactPath, "skill-artifact-unreadable", reason),
});

const buildArtifactDiagnostic = (
  artifactPath: string,
  code: string,
  reason: string,
): Diagnostic => ({
  code,
  severity: "warning",
  message: `Unable to fully inspect ${artifactPath}: ${reason}.`,
  path: artifactPath,
});

const classifyArtifact = (
  relativePath: string,
  isDirectory: boolean,
  symlinkStatus: SkillArtifactSymlinkStatus,
): SkillArtifactType | undefined => {
  const basename = path.posix.basename(relativePath);
  const lowerRelativePath = relativePath.toLowerCase();
  const lowerBasename = basename.toLowerCase();

  if (relativePath === ".") return "other";
  if (relativePath === "SKILL.md") return "skill-md";
  if (relativePath === "agents/openai.yaml") return "openai-agent-config";
  if (relativePath === "AGENTS.md" || relativePath === "CLAUDE.md") return "agent-instructions";
  if (relativePath === ".mcp.json") return "mcp-config";
  if (relativePath.startsWith("scripts/")) return "script";
  if (relativePath.startsWith("references/")) return "reference";
  if (relativePath.startsWith("assets/")) return "asset";
  if (/^\.claude\/settings.*\.json$/i.test(relativePath)) return "claude-settings";
  if (relativePath.startsWith(".claude/agents/")) return "claude-agent";
  if (isHookConfigPath(relativePath)) return "hook-config";
  if (PACKAGE_MANIFEST_NAMES.has(basename)) return "package-manifest";
  if (SHELL_SCRIPT_EXTENSIONS.has(path.posix.extname(lowerBasename))) return "shell-script";
  if (lowerBasename === "dockerfile" || lowerBasename.startsWith("dockerfile."))
    return "dockerfile";
  if (isCiConfigPath(lowerRelativePath)) return "ci-config";
  if (relativePath.startsWith(".agents/skills/")) return "other";
  if (symlinkStatus !== "none") return "other";
  if (!isDirectory && isHiddenPath(relativePath)) return "other";
  return undefined;
};

const isHookConfigPath = (relativePath: string): boolean =>
  relativePath.startsWith(".husky/") ||
  relativePath.startsWith("hooks/") ||
  relativePath.startsWith(".githooks/");

const isCiConfigPath = (lowerRelativePath: string): boolean =>
  lowerRelativePath.startsWith(".github/workflows/") ||
  lowerRelativePath === ".gitlab-ci.yml" ||
  lowerRelativePath.startsWith(".circleci/");

const classifySymlinkStatus = (
  rootRealPath: string | undefined,
  targetRealPath: string | undefined,
): SkillArtifactSymlinkStatus => {
  if (targetRealPath === undefined) return "broken";
  if (rootRealPath === undefined) return "broken";
  return isPathInside(rootRealPath, targetRealPath) ? "inside" : "escapes";
};

const isPathInside = (parentPath: string, targetPath: string): boolean => {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const isHiddenPath = (relativePath: string): boolean =>
  relativePath.split("/").some((segment) => segment.startsWith(".") && segment !== ".");

const normalizeRelativePath = (relativePath: string): string =>
  relativePath.split(path.sep).join("/");

const isExecutable = (mode: number): boolean => (mode & 0o111) !== 0;
