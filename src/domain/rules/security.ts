import type { Finding, SkillRecord } from "../types.js";

export type SecurityRuleOptions = {
  readonly enabledRuleIds?: readonly string[] | undefined;
};

export const validateSecurityRules = (
  skills: readonly SkillRecord[],
  options: SecurityRuleOptions = {},
): Finding[] => {
  const enabledRuleIds = options.enabledRuleIds;
  if (enabledRuleIds !== undefined && enabledRuleIds.length === 0) return [];

  return skills.flatMap(validateSkillSecurity);
};

const validateSkillSecurity = (skill: SkillRecord): Finding[] => {
  if (!skill.parseResult.ok) return [];
  return [];
};
