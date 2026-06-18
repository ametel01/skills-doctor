import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSkillContent } from "./parse-skill.js";
import { validateQualityRules } from "./rules/quality.js";
import { validateStructuralRules } from "./rules/structural.js";
import type { Diagnostic, Finding, ScanResult, SkillRecord, SkillRoot } from "./types.js";

const SKILL_FILE_READ_CONCURRENCY = 16;

export type ScanSkillRootsInput = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics?: readonly Diagnostic[] | undefined;
};

export const scanSkillRoots = async (input: ScanSkillRootsInput): Promise<ScanResult> => {
  const skills: SkillRecord[] = [];
  const diagnostics: Diagnostic[] = [...(input.diagnostics ?? [])];
  const findings: Finding[] = [];
  const rootPlans: RootReadPlan[] = [];

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
      .filter((entry) => entry.isDirectory())
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
      });
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
      if (result?.skill !== undefined) skills.push(result.skill);
    }
  }

  findings.push(...skills.flatMap(validateStructuralRules));
  findings.push(...(await validateQualityRules(skills)));

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
};

const readSkillTask = async (task: SkillReadTask): Promise<SkillReadResult> => {
  let content: string;
  try {
    content = await readFile(task.skillPath, "utf8");
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return { rootIndex: task.rootIndex, entryIndex: task.entryIndex };
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
