import type { Finding } from "./types.js";

export type ScoreLabel = "Great" | "Needs work" | "Critical";

export type ScoreSummary = {
  readonly value: number;
  readonly label: ScoreLabel;
  readonly penalty: number;
  readonly distinctErrorRuleCount: number;
  readonly distinctWarningRuleCount: number;
  readonly distinctAdviceRuleCount: number;
};

const ERROR_RULE_PENALTY = 1.5;
const WARNING_RULE_PENALTY = 0.75;
const RULE_PLUGIN = "skills-doctor";

export const calculateScore = (findings: readonly Finding[]): ScoreSummary => {
  const errorRules = new Set<string>();
  const warningRules = new Set<string>();
  const adviceRules = new Set<string>();

  for (const finding of findings) {
    const ruleKey = scoreRuleKey(finding);
    if (finding.severity === "error") {
      errorRules.add(ruleKey);
    } else if (finding.severity === "warning") {
      warningRules.add(ruleKey);
    } else {
      adviceRules.add(ruleKey);
    }
  }

  const penalty = errorRules.size * ERROR_RULE_PENALTY + warningRules.size * WARNING_RULE_PENALTY;
  const value = Math.max(0, Math.round(100 - penalty));

  return {
    value,
    label: getScoreLabel(value),
    penalty,
    distinctErrorRuleCount: errorRules.size,
    distinctWarningRuleCount: warningRules.size,
    distinctAdviceRuleCount: adviceRules.size,
  };
};

export const getScoreLabel = (value: number): ScoreLabel => {
  if (value >= 75) return "Great";
  if (value >= 50) return "Needs work";
  return "Critical";
};

const scoreRuleKey = (finding: Finding): string => `${RULE_PLUGIN}/${finding.ruleId}`;
