import type { ScanReport } from "./build-report.js";
import type { Finding } from "./types.js";

export type FindingsComparison = {
  readonly fixed: readonly Finding[];
  readonly remaining: readonly Finding[];
  readonly newFindings: readonly Finding[];
};

export const compareFindings = (
  previous: readonly Finding[],
  current: readonly Finding[],
): FindingsComparison => ({
  fixed: subtractFindings(previous, current),
  remaining: intersectFindings(previous, current),
  newFindings: subtractFindings(current, previous),
});

export const renderPostHandoffSummary = (
  comparison: FindingsComparison,
  report: ScanReport,
): string =>
  `${[
    "Post-handoff re-scan:",
    `Fixed findings: ${comparison.fixed.length}`,
    `Remaining findings: ${comparison.remaining.length}`,
    `New findings: ${comparison.newFindings.length}`,
    `Current blocking errors: ${report.errorCount}`,
  ].join("\n")}\n`;

const subtractFindings = (
  left: readonly Finding[],
  right: readonly Finding[],
): readonly Finding[] => {
  const rightCounts = countFindingKeys(right);
  const result: Finding[] = [];
  for (const finding of left) {
    const key = findingKey(finding);
    const count = rightCounts.get(key) ?? 0;
    if (count > 0) {
      rightCounts.set(key, count - 1);
    } else {
      result.push(finding);
    }
  }
  return result;
};

const intersectFindings = (
  previous: readonly Finding[],
  current: readonly Finding[],
): readonly Finding[] => {
  const currentCounts = countFindingKeys(current);
  const result: Finding[] = [];
  for (const finding of previous) {
    const key = findingKey(finding);
    const count = currentCounts.get(key) ?? 0;
    if (count <= 0) continue;
    currentCounts.set(key, count - 1);
    result.push(finding);
  }
  return result;
};

const countFindingKeys = (findings: readonly Finding[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const key = findingKey(finding);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const findingKey = (finding: Finding): string => `${finding.ruleId}\u0000${finding.skillPath}`;
