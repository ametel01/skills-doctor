import type { Finding, FindingSeverity, SkillRecord } from "../types.js";

export type SecurityRuleOptions = {
  readonly enabledRuleIds?: readonly string[] | undefined;
};

type SecurityRuleId =
  | "prompt-injection-instruction"
  | "secret-exfiltration-instruction"
  | "network-exfiltration-command"
  | "remote-code-execution-bootstrap"
  | "destructive-command-high-risk"
  | "agent-safety-disablement"
  | "external-resource-obfuscation";

type SecurityRule = {
  readonly ruleId: SecurityRuleId;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
  readonly findLine: (lines: readonly SourceLine[]) => number | undefined;
};

type SourceLine = {
  readonly number: number;
  readonly text: string;
};

const PROMPT_OVERRIDE_PATTERN =
  /\b(ignore|disregard|override|bypass|supersede)\b.{0,80}\b(previous|system|developer|user|safety|policy|instructions?)\b/i;
const PROMPT_CONCEALMENT_PATTERN =
  /\b(do not|don't|never)\b.{0,60}\b(tell|inform|show|mention|disclose|reveal)\b.{0,60}\b(user|operator|reviewer)\b/i;
const HIDE_BEHAVIOR_PATTERN =
  /\b(hide|conceal|mask)\b.{0,80}\b(actions?|behavior|instructions?|changes?|activity)\b/i;
const SECRET_SOURCE_PATTERN =
  /\b(\.env|credentials?|secrets?|tokens?|ssh keys?|private keys?|browser sessions?|session files?|npm tokens?|github tokens?|cloud credentials?|aws credentials?|gcp credentials?)\b/i;
const FILE_READ_PATTERN =
  /\b(read|collect|capture|copy|open|load)\b.{0,80}\b(files?|contents?|data)\b/i;
const TRANSFER_PATTERN =
  /\b(send|post|upload|forward|transmit|copy|paste|exfiltrate)\b.{0,100}\b(remote|external|webhook|server|endpoint|url|site|gist|paste|chat|slack|discord)\b/i;
const NETWORK_TRANSFER_PATTERN =
  /\b(curl|wget|netcat|nc|scp|rsync|http post|webhook|request to external)\b/i;
const REMOTE_EXECUTION_PATTERN =
  /\b(download|fetch|retrieve|remote|installer|curl|wget)\b.{0,100}\b(pipe|execute|run|shell|bash|sh|zsh|python|node|interpreter)\b/i;
const BROAD_DESTRUCTIVE_PATTERN =
  /\b(delete|remove|wipe|destroy|erase)\b.{0,100}\b(home directory|root directory|entire project|all files|everything|shell history|audit trail|logs?)\b/i;
const PERMISSION_WEAKENING_PATTERN =
  /\b(chmod|permission|permissions)\b.{0,80}\b(777|world-writable|everyone can write|disable ownership checks)\b/i;
const SAFETY_DISABLEMENT_PATTERN =
  /\b(--yolo|--dangerously-skip-permissions|skip permissions|disable sandbox|without sandbox|approve all prompts|auto-approve|bypass review|avoid confirmation|without confirmation)\b/i;
const OBFUSCATED_EXECUTION_PATTERN =
  /\b((base64|encoded|obfuscated|hidden remote)\b.{0,100}\b(decode|decode it|decoded|stage)|\b(decode|decode it|decoded|stage)\b.{0,100}\b(base64|encoded|obfuscated|hidden remote))\b.{0,100}\b(execute|run|shell|bash|sh|zsh|interpreter)\b/i;
const PREVENTION_PATTERN =
  /\b(do not|don't|never|avoid|refuse to|must not|should not)\b.{0,80}\b(ignore|disregard|override|bypass|send|post|upload|forward|transmit|copy|paste|exfiltrate|curl|wget|netcat|nc|scp|rsync|webhook|--yolo|--dangerously-skip-permissions|sandbox|auto-approve|confirmation|base64|encoded)\b/i;

const SECURITY_RULES: readonly SecurityRule[] = [
  {
    ruleId: "prompt-injection-instruction",
    severity: "error",
    title: "Instruction subversion appears in skill body",
    message:
      "The skill appears to instruct an agent to override higher-priority instructions, conceal behavior, or avoid telling the user about its actions.",
    suggestion:
      "Remove instruction-subversion language and make the skill respect system, developer, and user instructions.",
    findLine: (lines) =>
      findFirstLine(lines, (line) => {
        if (isPreventiveLine(line.text)) return false;
        return (
          PROMPT_OVERRIDE_PATTERN.test(line.text) ||
          PROMPT_CONCEALMENT_PATTERN.test(line.text) ||
          HIDE_BEHAVIOR_PATTERN.test(line.text)
        );
      }),
  },
  {
    ruleId: "secret-exfiltration-instruction",
    severity: "error",
    title: "Secret exfiltration instruction appears in skill body",
    message:
      "The skill appears to combine secret-reading guidance with instructions to transmit that data outside the local task context.",
    suggestion:
      "Remove any guidance that sends credentials, tokens, keys, sessions, or secret file contents to external destinations.",
    findLine: (lines) =>
      findProximityLine(lines, isSecretSourceLine, (line) => TRANSFER_PATTERN.test(line.text)),
  },
  {
    ruleId: "network-exfiltration-command",
    severity: "error",
    title: "Network transfer appears near secret-reading guidance",
    message:
      "The skill appears to combine network transfer tooling with secret or sensitive file-reading guidance.",
    suggestion:
      "Remove network-transfer guidance around secrets or sensitive files, and keep security review workflows local unless the user explicitly provides a safe destination.",
    findLine: (lines) =>
      findProximityLine(
        lines,
        (line) => isSecretSourceLine(line) || FILE_READ_PATTERN.test(line.text),
        (line) => NETWORK_TRANSFER_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "remote-code-execution-bootstrap",
    severity: "error",
    title: "Remote code execution bootstrap appears in skill body",
    message:
      "The skill appears to instruct an agent to fetch remote content and execute it through a shell or interpreter.",
    suggestion:
      "Remove execute-from-network guidance. Require pinned, inspectable local scripts or documented package commands instead.",
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) => !isPreventiveLine(line.text) && REMOTE_EXECUTION_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "destructive-command-high-risk",
    severity: "warning",
    title: "High-risk destructive instruction appears in skill body",
    message:
      "The skill appears to describe broad deletion, trace removal, or permission weakening that could damage user files or hide activity.",
    suggestion:
      "Remove broad destructive guidance, avoid trace-hiding instructions, and require scoped dry-runs or explicit user confirmation for risky changes.",
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) =>
          !isPreventiveLine(line.text) &&
          (BROAD_DESTRUCTIVE_PATTERN.test(line.text) ||
            PERMISSION_WEAKENING_PATTERN.test(line.text)),
      ),
  },
  {
    ruleId: "agent-safety-disablement",
    severity: "warning",
    title: "Agent safety disablement appears in skill body",
    message:
      "The skill appears to instruct an agent to disable sandboxing, skip permissions, auto-approve prompts, or avoid confirmation.",
    suggestion:
      "Remove safety-bypass instructions unless they are part of a documented user-approved handoff flow with explicit confirmation.",
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) =>
          !isPreventiveLine(line.text) &&
          !isDescriptiveLaunchPreview(line.text) &&
          SAFETY_DISABLEMENT_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "external-resource-obfuscation",
    severity: "warning",
    title: "Obfuscated external execution appears in skill body",
    message:
      "The skill appears to instruct an agent to decode or stage obscured content and execute it.",
    suggestion:
      "Replace obfuscated execution guidance with transparent, reviewable files and explicit validation steps.",
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) => !isPreventiveLine(line.text) && OBFUSCATED_EXECUTION_PATTERN.test(line.text),
      ),
  },
];

export const validateSecurityRules = (
  skills: readonly SkillRecord[],
  options: SecurityRuleOptions = {},
): Finding[] => {
  const rules = filterRules(options.enabledRuleIds);
  if (rules.length === 0) return [];
  return skills.flatMap((skill) => validateSkillSecurity(skill, rules));
};

const validateSkillSecurity = (skill: SkillRecord, rules: readonly SecurityRule[]): Finding[] => {
  if (!skill.parseResult.ok) return [];
  const lines = readSourceLines(skill.content);
  return rules.flatMap((rule) => {
    const line = rule.findLine(lines);
    if (line === undefined) return [];
    return [
      {
        ruleId: rule.ruleId,
        severity: rule.severity,
        category: "security",
        title: rule.title,
        message: rule.message,
        suggestion: rule.suggestion,
        ecosystem: skill.ecosystem,
        rootPath: skill.rootPath,
        skillDir: skill.skillDir,
        skillPath: skill.skillPath,
        skillName: readSkillName(skill),
        line,
        agentRepairable: true,
      },
    ];
  });
};

const filterRules = (enabledRuleIds: readonly string[] | undefined): readonly SecurityRule[] => {
  if (enabledRuleIds === undefined) return SECURITY_RULES;
  const enabled = new Set(enabledRuleIds);
  return SECURITY_RULES.filter((rule) => enabled.has(rule.ruleId));
};

const readSourceLines = (content: string): readonly SourceLine[] =>
  content.split(/\r?\n/).map((text, index) => ({ number: index + 1, text }));

const findFirstLine = (
  lines: readonly SourceLine[],
  predicate: (line: SourceLine) => boolean,
): number | undefined => lines.find(predicate)?.number;

const findProximityLine = (
  lines: readonly SourceLine[],
  leftPredicate: (line: SourceLine) => boolean,
  rightPredicate: (line: SourceLine) => boolean,
): number | undefined => {
  for (const [index, line] of lines.entries()) {
    if (!leftPredicate(line) || isPreventiveLine(line.text)) continue;
    const nearby = lines.slice(index, index + 3);
    const transferLine = nearby.find(
      (candidate) => !isPreventiveLine(candidate.text) && rightPredicate(candidate),
    );
    if (transferLine !== undefined) return transferLine.number;
  }

  return undefined;
};

const isSecretSourceLine = (line: SourceLine): boolean => SECRET_SOURCE_PATTERN.test(line.text);

const isPreventiveLine = (text: string): boolean => PREVENTION_PATTERN.test(text);

const isDescriptiveLaunchPreview = (text: string): boolean =>
  /\b(launch preview|example|documentation|documented)\b/i.test(text) &&
  /\b(--yolo|--dangerously-skip-permissions)\b/i.test(text);

const readSkillName = (skill: SkillRecord): string => {
  if (!skill.parseResult.ok) return skill.directoryName;
  const name = skill.parseResult.frontmatter.data.name;
  return typeof name === "string" && name.trim().length > 0 ? name : skill.directoryName;
};
