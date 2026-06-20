import type { ScanReport } from "./build-report.js";
import type { Finding } from "./types.js";

export type FindingsComparison = {
  readonly fixed: readonly Finding[];
  readonly remaining: readonly Finding[];
  readonly newFindings: readonly Finding[];
};

export type RenderPostHandoffSummaryOptions = {
  readonly color?: boolean | undefined;
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
  options: RenderPostHandoffSummaryOptions = {},
): string => {
  const shouldColor = Boolean(options.color);
  return `${[
    `${label("Post-handoff re-scan", shouldColor)}:`,
    `${label("Fixed findings", shouldColor)}: ${success(String(comparison.fixed.length), shouldColor)}`,
    `${label("Remaining findings", shouldColor)}: ${warning(String(comparison.remaining.length), shouldColor)}`,
    `${label("New findings", shouldColor)}: ${warning(String(comparison.newFindings.length), shouldColor)}`,
    `${label("Current blocking errors", shouldColor)}: ${danger(String(report.errorCount), shouldColor)}`,
    `${label("Current score", shouldColor)}: ${colorizeScore(String(report.score.value), report.score.value, shouldColor)} (${colorizeScore(report.score.label, report.score.value, shouldColor)})`,
  ].join("\n")}\n`;
};

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

const findingKey = (finding: Finding): string =>
  [finding.ruleId, finding.skillPath, finding.line ?? "", finding.message, finding.suggestion].join(
    "\u0000",
  );

const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;

const label = (text: string, shouldColor: boolean): string => color(text, 36, shouldColor);

const colorizeScore = (text: string, score: number, shouldColor: boolean): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return success(text, shouldColor);
  if (score >= SCORE_OK_THRESHOLD) return warning(text, shouldColor);
  return danger(text, shouldColor);
};

const success = (text: string, shouldColor: boolean): string => color(text, 32, shouldColor);

const warning = (text: string, shouldColor: boolean): string => color(text, 33, shouldColor);

const danger = (text: string, shouldColor: boolean): string => color(text, 31, shouldColor);

const color = (text: string, code: number, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[${code}m${text}\x1b[39m` : text;
