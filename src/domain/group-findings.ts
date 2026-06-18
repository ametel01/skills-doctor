import type { Finding } from "./types.js";

export type FindingGroup = {
  readonly key: string;
  readonly findings: readonly Finding[];
};

export const groupFindingsByKey = (
  findings: readonly Finding[],
  getKey: (finding: Finding) => string,
): readonly FindingGroup[] => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = getKey(finding);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [finding]);
    } else {
      group.push(finding);
    }
  }

  return [...groups.entries()].map(([key, groupFindings]) => ({
    key,
    findings: groupFindings,
  }));
};

export const indexFindingsBySkillPath = (
  findings: readonly Finding[],
): ReadonlyMap<string, readonly Finding[]> => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.skillPath);
    if (group === undefined) {
      groups.set(finding.skillPath, [finding]);
    } else {
      group.push(finding);
    }
  }

  return groups;
};
