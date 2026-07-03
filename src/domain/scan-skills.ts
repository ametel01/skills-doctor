import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSkillContent } from "./parse-skill.js";
import {
  type DisabledSkillSelectors,
  normalizeSkillPath,
} from "./read-codex-disabled-skill-config.js";
import { validateQualityRules } from "./rules/quality.js";
import { validateSecurityRules } from "./rules/security.js";
import { buildMissingSkillFinding, validateStructuralRules } from "./rules/structural.js";
import type { Diagnostic, Finding, ScanResult, SkillRecord, SkillRoot } from "./types.js";

const SKILL_FILE_READ_CONCURRENCY = 16;

export type ScanSkillRootsInput = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics?: readonly Diagnostic[] | undefined;
  readonly disabledSkills?: DisabledSkillSelectors | undefined;
};

export const scanSkillRoots = async (input: ScanSkillRootsInput): Promise<ScanResult> => {
  const skills: SkillRecord[] = [];
  const diagnostics: Diagnostic[] = [...(input.diagnostics ?? [])];
  const findings: Finding[] = [];
  const rootPlans: RootReadPlan[] = [];
  const disabledSkillFilter = buildDisabledSkillFilter(input.disabledSkills);

  for (const [rootIndex, root] of input.roots.entries()) {
    const entries = await readdir(root.rootPath, { withFileTypes: true }).catch(
      (error: unknown) => {
        rootPlans.push({
          rootIndex,
          diagnostics: [
            {
              code: "skill-root-unreadable",
              severity: "error",
              message: error instanceof Error ? error.message : `Unable to read ${root.rootPath}`,
              path: root.rootPath,
            },
          ],
          tasks: [],
        });
        return [];
      },
    );
    if (entries.length === 0) continue;

    const tasks = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry, entryIndex) => {
        const skillDir = path.join(root.rootPath, entry.name);
        return {
          root,
          rootIndex,
          entryIndex,
          directoryName: entry.name,
          skillDir,
          skillPath: path.join(skillDir, "SKILL.md"),
        };
      })
      .filter((task) => !disabledSkillFilter.hasPath(task.skillPath));
    rootPlans.push({ rootIndex, diagnostics: [], tasks });
  }

  const readResults = await mapWithConcurrency(
    rootPlans.flatMap((plan) => plan.tasks),
    SKILL_FILE_READ_CONCURRENCY,
    readSkillTask,
  );
  const readResultsByTask = new Map(
    readResults.map((result) => [taskKey(result.rootIndex, result.entryIndex), result]),
  );

  for (const plan of rootPlans.sort((left, right) => left.rootIndex - right.rootIndex)) {
    diagnostics.push(...plan.diagnostics);
    for (const task of plan.tasks) {
      const result = readResultsByTask.get(taskKey(task.rootIndex, task.entryIndex));
      if (result?.diagnostic !== undefined) diagnostics.push(result.diagnostic);
      if (result?.finding !== undefined) findings.push(result.finding);
      if (result?.skill !== undefined && !isDisabledByName(result.skill, disabledSkillFilter)) {
        skills.push(result.skill);
      }
    }
  }

  findings.push(...skills.flatMap(validateStructuralRules));
  findings.push(...(await validateQualityRules(skills)));
  findings.push(...validateSecurityRules(skills));

  return {
    roots: input.roots,
    skills,
    diagnostics,
    findings,
  };
};

type RootReadPlan = {
  readonly rootIndex: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly tasks: readonly SkillReadTask[];
};

type SkillReadTask = {
  readonly root: SkillRoot;
  readonly rootIndex: number;
  readonly entryIndex: number;
  readonly directoryName: string;
  readonly skillDir: string;
  readonly skillPath: string;
};

type SkillReadResult = {
  readonly rootIndex: number;
  readonly entryIndex: number;
  readonly skill?: SkillRecord | undefined;
  readonly diagnostic?: Diagnostic | undefined;
  readonly finding?: Finding | undefined;
};

type DisabledSkillFilter = {
  readonly hasPath: (skillPath: string) => boolean;
  readonly names: ReadonlySet<string>;
};

const readSkillTask = async (task: SkillReadTask): Promise<SkillReadResult> => {
  let content: string;
  try {
    content = await readFile(task.skillPath, "utf8");
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return {
        rootIndex: task.rootIndex,
        entryIndex: task.entryIndex,
        finding: buildMissingSkillFinding({ root: task.root, skillDir: task.skillDir }),
      };
    }
    return {
      rootIndex: task.rootIndex,
      entryIndex: task.entryIndex,
      diagnostic: {
        code: "skill-file-unreadable",
        severity: "error",
        message: error instanceof Error ? error.message : `Unable to read ${task.skillPath}`,
        path: task.skillPath,
      },
    };
  }

  return {
    rootIndex: task.rootIndex,
    entryIndex: task.entryIndex,
    skill: {
      ecosystem: task.root.ecosystem,
      rootPath: task.root.rootPath,
      source: task.root.source,
      skillDir: task.skillDir,
      skillPath: task.skillPath,
      directoryName: task.directoryName,
      content,
      parseResult: parseSkillContent(content),
    },
  };
};

const buildDisabledSkillFilter = (
  disabledSkills: DisabledSkillSelectors | undefined,
): DisabledSkillFilter => {
  const paths = new Set(disabledSkills?.paths.map(normalizeSkillPath) ?? []);
  return {
    hasPath: (skillPath: string) => paths.has(normalizeSkillPath(skillPath)),
    names: new Set(disabledSkills?.names ?? []),
  };
};

const isDisabledByName = (skill: SkillRecord, filter: DisabledSkillFilter): boolean => {
  if (skill.ecosystem !== "codex" || filter.names.size === 0) return false;
  const skillName = readSkillName(skill);
  if (filter.names.has(skillName) || filter.names.has(skill.directoryName)) return true;
  const pluginName = inferPluginName(skill.rootPath);
  return pluginName !== undefined && filter.names.has(`${pluginName}:${skillName}`);
};

const readSkillName = (skill: SkillRecord): string => {
  if (!skill.parseResult.ok) return skill.directoryName;
  const name = skill.parseResult.frontmatter.data.name;
  return typeof name === "string" && name.trim().length > 0 ? name : skill.directoryName;
};

const inferPluginName = (rootPath: string): string | undefined => {
  const segments = rootPath.split(path.sep);
  const cacheIndex = segments.lastIndexOf("cache");
  if (cacheIndex < 0) return undefined;
  const afterCache = segments.slice(cacheIndex + 1);
  if (afterCache.length < 3 || afterCache.at(-1) !== "skills") return undefined;
  return afterCache.at(-3);
};

const mapWithConcurrency = async <Input, Output>(
  items: readonly Input[],
  limit: number,
  mapper: (item: Input) => Promise<Output>,
): Promise<Output[]> => {
  const results: Output[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const item = items[currentIndex];
        if (item !== undefined) {
          results[currentIndex] = await mapper(item);
        }
      }
    }),
  );

  return results;
};

const taskKey = (rootIndex: number, entryIndex: number): string => `${rootIndex}:${entryIndex}`;

const getErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
