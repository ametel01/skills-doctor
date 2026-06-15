import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSkillContent } from "./parse-skill.js";
import { buildMissingSkillFinding, validateStructuralRules } from "./rules/structural.js";
import type { Diagnostic, Finding, ScanResult, SkillRecord, SkillRoot } from "./types.js";

export type ScanSkillRootsInput = {
  readonly roots: readonly SkillRoot[];
};

export const scanSkillRoots = async (input: ScanSkillRootsInput): Promise<ScanResult> => {
  const skills: SkillRecord[] = [];
  const diagnostics: Diagnostic[] = [];
  const findings: Finding[] = [];

  for (const root of input.roots) {
    const entries = await readdir(root.rootPath, { withFileTypes: true }).catch(
      (error: unknown) => {
        diagnostics.push({
          code: "skill-root-unreadable",
          severity: "error",
          message: error instanceof Error ? error.message : `Unable to read ${root.rootPath}`,
          path: root.rootPath,
        });
        return [];
      },
    );

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(root.rootPath, entry.name);
      const skillPath = path.join(skillDir, "SKILL.md");
      const content = await readFile(skillPath, "utf8").catch(() => null);
      if (content === null) {
        findings.push(buildMissingSkillFinding({ root, skillDir }));
        continue;
      }

      skills.push({
        ecosystem: root.ecosystem,
        rootPath: root.rootPath,
        skillDir,
        skillPath,
        directoryName: entry.name,
        content,
        parseResult: parseSkillContent(content),
      });
    }
  }

  findings.push(...skills.flatMap(validateStructuralRules));

  return {
    roots: input.roots,
    skills,
    diagnostics,
    findings,
  };
};
