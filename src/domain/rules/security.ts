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
  readonly findLine: (candidates: readonly MarkdownSecurityCandidate[]) => number | undefined;
};

type SourceLine = {
  readonly number: number;
  readonly text: string;
};

export type MarkdownSecurityCandidate = SourceLine & {
  readonly previousLines: readonly SourceLine[];
  readonly nextLines: readonly SourceLine[];
  readonly nearbyLines: readonly SourceLine[];
  readonly sectionHeading: string | undefined;
  readonly inCodeFence: boolean;
  readonly tableRow: MarkdownTableRowContext | undefined;
  readonly commandContext: CommandLineContext;
};

export type MarkdownTableRowContext = {
  readonly rowText: string;
  readonly cells: readonly string[];
};

export type CommandLineContext = {
  readonly sourceText: string | undefined;
  readonly commands: readonly CommandSegmentContext[];
  readonly hasPipeline: boolean;
  readonly hasSensitiveSource: boolean;
  readonly hasLocalDestination: boolean;
  readonly hasOfficialServiceDestination: boolean;
  readonly hasExternalDestination: boolean;
  readonly hasExecutionSink: boolean;
  readonly hasParseOnlySink: boolean;
  readonly hasTransferAction: boolean;
};

export type CommandSegmentContext = {
  readonly text: string;
  readonly command: string | undefined;
  readonly position: number;
  readonly source: CommandSourceClassification;
  readonly destination: CommandDestinationClassification;
  readonly sink: CommandSinkClassification;
  readonly action: CommandActionClassification;
};

export type CommandSourceClassification = "sensitive" | "none";
export type CommandDestinationClassification =
  | "local"
  | "official-service-api"
  | "external"
  | "none";
export type CommandSinkClassification = "execution" | "parse-only" | "none";
export type CommandActionClassification = "transfer" | "connective-transfer" | "none";
const PROMPT_OVERRIDE_PATTERN =
  /\b(ignore|disregard|override|bypass|supersede)\b.{0,80}\b(previous|system|developer|user|safety|policy|instructions?)\b/i;
const PROMPT_CONCEALMENT_PATTERN =
  /\b(do not|don't|never)\b.{0,60}\b(tell|inform|show|mention|disclose|reveal)\b.{0,60}\b(user|operator|reviewer)\b/i;
const HIDE_BEHAVIOR_PATTERN =
  /\b(hide|conceal|mask)\b.{0,80}\b(actions?|behavior|instructions?|changes?|activity)\b/i;
const PROMPT_CONFIRMATION_BYPASS_PATTERN =
  /\b(bypass|skip|avoid|ignore|override)(?:\s+|\s+[\w-]+\s+)(confirmations?|approvals?|denials?|refusals?|permissions?)\b/i;
const PROMPT_CONTINUE_AFTER_DENIAL_PATTERN =
  /\b(continue|proceed|keep going|carry on)\b.{0,80}\b(after|if|when)\b.{0,80}\b(user|operator|reviewer)\b.{0,60}\b(denies|denied|says no|refuses|declines|rejects)\b/i;
const HIDE_LOGS_OUTPUT_PATTERN =
  /\b(hide|conceal|suppress|omit|remove)\b.{0,80}\b(logs?|outputs?|transcripts?|audit trails?)\b/i;
const DEFENSIVE_NEGATED_PROMPT_BYPASS_PATTERN =
  /\b(do not|don't|never|must not|should not|refuse to)\b.{0,40}\b(bypass|skip|ignore|override)\b.{0,80}\b(confirmations?|approvals?|denials?|refusals?|permissions?)\b/i;
const DEFENSIVE_NEGATED_LOG_CONCEALMENT_PATTERN =
  /\b(do not|don't|never|must not|should not|refuse to)\b.{0,40}\b(hide|conceal|suppress|omit|remove)\b.{0,80}\b(logs?|outputs?|transcripts?|audit trails?)\b/i;
const SECRET_SOURCE_PATTERN =
  /\b(\.env|credentials?|secrets?|tokens?|ssh keys?|private keys?|browser sessions?|session files?|npm tokens?|github tokens?|cloud credentials?|aws credentials?|gcp credentials?)\b/i;
const TRANSFER_PATTERN =
  /\b(send|post|upload|forward|transmit|copy|paste|exfiltrate)\b.{0,100}\b(remote|external|webhooks?(?!\s+(?:signing\s+)?secrets?\b|\s+signatures?\b)|server|endpoint|url|site|gist|paste|chat|slack|discord)\b/i;
const NETWORK_TRANSFER_PATTERN =
  /\b(curl|wget|netcat|nc|scp|rsync|http post|webhook|request to external)\b/i;
const EXFILTRATION_TRANSFER_ACTION_PATTERN =
  /\b(send|post|upload|forward|transmit|copy|paste|exfiltrate|move)\b/i;
const EXFILTRATION_SUSPICIOUS_DESTINATION_PATTERN =
  /\b(remote|external|webhooks?(?!\s+(?:signing\s+)?secrets?\b|\s+signatures?\b)|server|endpoint|url|site|gist|paste|chat|slack|discord)\b|https?:\/\/(?!api\.github\.com\b|github\.com\b|registry\.npmjs\.org\b|npmjs\.com\b|api\.stripe\.com\b|api\.openai\.com\b|api\.anthropic\.com\b|api\.clerk\.com\b|[^/\s`"']+\.googleapis\.com\b)[^\s`"')]+/i;
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
const EVIDENCE_SECRET_VALUE_PATTERN =
  /(\b[A-Za-z0-9_-]*(?:secret|token|credential|password|private[_-]?key)[A-Za-z0-9_-]*\s*[:=]\s*)(["']?)[^\s"']+(\2)/gi;
const EVIDENCE_BEARER_VALUE_PATTERN = /(\bAuthorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/-]+)/gi;
const PROMPT_UNTRUSTED_CONTENT_PATTERN =
  /\b(untrusted|attacker-controlled|malicious|external|repo|repository|pr|pull request|user|model)\b/i;
const PROMPT_INJECTION_TERM_PATTERN =
  /\b(prompt injection|instruction injection|injected instructions?)\b/i;
const DEFENSIVE_PROMPT_ACTION_PATTERN =
  /\b(refuse|reject|ignore|neutralize|treat as data|do not follow|don't follow|preserve|respect|verify|ask|require)\b/i;
const DEFENSIVE_SECRET_DISCLOSURE_PATTERN =
  /\b(never|do not|don't|must not|should not|refuse to)\b.{0,80}\b(reveal|disclose|print|show|share|expose)\b.{0,80}\b(secrets?|credentials?|tokens?|keys?)\b/i;
const DEFENSIVE_CONFIRMATION_PATTERN =
  /\b(ask for|request|require|obtain|get)\b.{0,80}\b(explicit )?(user )?(confirmation|approval|permission)\b/i;
const HIGHER_PRIORITY_INSTRUCTION_PRESERVATION_PATTERN =
  /\b(preserve|respect|follow|keep)\b.{0,80}\b(system|developer|user|higher-priority)\b.{0,80}\binstructions?\b/i;

const COMMAND_SENSITIVE_SOURCE_PATTERN =
  /(?:^|[\s"'`|])(?:\.env(?:\b|[./_-])|[~/./A-Za-z0-9_-]*(?:credentials|secrets?|tokens?|private[_-]?keys?|session[_-]?files?|npm[_-]?tokens?|github[_-]?tokens?|cloud[_-]?credentials?|aws[_-]?credentials?|gcp[_-]?credentials?)(?:\b|[./_-]))/i;
const INLINE_COMMAND_PATTERN = /`([^`\n]+)`/g;
const COMMAND_FENCE_LANGUAGE_PATTERN = /^(?:shell|sh|bash|zsh|fish|console|terminal)$/i;
const FENCE_MARKER_PATTERN = /^\s*(```|~~~)\s*([A-Za-z0-9_-]+)?/;
const COMMAND_LIKE_PATTERN =
  /^\s*(?:\$|>)?\s*(?:cat|grep|rg|awk|sed|jq|curl|wget|nc|netcat|scp|rsync|cp|mv|tee|bash|sh|zsh|python|python3|node|bun|npm|pnpm|yarn|npx|gh|git|tar|base64|openssl)\b/;
const LOCAL_DESTINATION_PATTERN =
  /(?:^|\s)(?:\.{1,2}\/|~\/|\/tmp\/|\/var\/tmp\/|\/dev\/null\b|[A-Za-z0-9_.-]+\/|[A-Za-z0-9_.-]+\.(?:json|txt|md|log|env|pem|key|csv)\b)/i;
const OFFICIAL_SERVICE_DESTINATION_PATTERN =
  /https?:\/\/(?:api\.github\.com|github\.com|registry\.npmjs\.org|npmjs\.com|api\.stripe\.com|api\.openai\.com|api\.anthropic\.com|api\.clerk\.com|[^/\s`"']+\.googleapis\.com)\b/i;
const EXTERNAL_DESTINATION_PATTERN = /https?:\/\/[^\s`"')]+/i;
const EXECUTION_SINK_COMMANDS = new Set([
  "bash",
  "sh",
  "zsh",
  "fish",
  "python",
  "python3",
  "node",
  "bun",
  "npm",
  "pnpm",
  "yarn",
  "npx",
]);
const PARSE_ONLY_SINK_COMMANDS = new Set([
  "cat",
  "grep",
  "rg",
  "awk",
  "sed",
  "jq",
  "cut",
  "sort",
  "uniq",
  "head",
  "tail",
  "wc",
  "base64",
  "openssl",
]);
const TRANSFER_COMMANDS = new Set([
  "curl",
  "wget",
  "nc",
  "netcat",
  "scp",
  "rsync",
  "gh",
  "npm",
  "pnpm",
  "yarn",
]);
const CONNECTIVE_TRANSFER_COMMANDS = new Set(["tee"]);

const SECURITY_RULES: readonly SecurityRule[] = [
  {
    ruleId: "prompt-injection-instruction",
    severity: "warning",
    title: "Instruction subversion appears in skill body",
    message:
      "The skill appears to instruct an agent to override higher-priority instructions, conceal behavior, or avoid telling the user about its actions.",
    suggestion:
      "Remove instruction-subversion language and make the skill respect system, developer, and user instructions.",
    findLine: (lines) =>
      findFirstLine(lines, (line) => {
        if (isHarmfulPromptIntentLine(line.text)) return true;
        if (isDefensivePromptIntentLine(line.text)) return false;
        return false;
      }),
  },
  {
    ruleId: "secret-exfiltration-instruction",
    severity: "warning",
    title: "Secret exfiltration instruction appears in skill body",
    message:
      "The skill appears to combine secret-reading guidance with instructions to transmit that data outside the local task context.",
    suggestion:
      "Remove any guidance that sends credentials, tokens, keys, sessions, or secret file contents to external destinations.",
    findLine: (lines) => findSecretExfiltrationInstructionLine(lines),
  },
  {
    ruleId: "network-exfiltration-command",
    severity: "warning",
    title: "Network transfer appears near secret-reading guidance",
    message:
      "The skill appears to combine network transfer tooling with secret or sensitive file-reading guidance.",
    suggestion:
      "Remove network-transfer guidance around secrets or sensitive files, and keep security review workflows local unless the user explicitly provides a safe destination.",
    findLine: (lines) => findNetworkExfiltrationCommandLine(lines),
  },
  {
    ruleId: "remote-code-execution-bootstrap",
    severity: "warning",
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
  const candidates = readMarkdownSecurityCandidates(lines);
  return rules.flatMap((rule) => {
    const line = rule.findLine(candidates);
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
        evidence: buildEvidence(skill, lines, line),
        agentRepairable: true,
      },
    ];
  });
};

const EVIDENCE_CONTEXT_LINES = 1;

const buildEvidence = (
  skill: SkillRecord,
  lines: readonly SourceLine[],
  lineNumber: number,
): Finding["evidence"] => {
  const startLine = Math.max(1, lineNumber - EVIDENCE_CONTEXT_LINES);
  const endLine = Math.min(lines.length, lineNumber + EVIDENCE_CONTEXT_LINES);
  const excerpt = lines
    .filter((line) => line.number >= startLine && line.number <= endLine)
    .map((line) => ({
      line: line.number,
      text: redactEvidenceText(line.text),
      highlighted: line.number === lineNumber,
    }));
  return {
    path: skill.skillPath,
    startLine,
    endLine,
    excerpt,
  };
};

const filterRules = (enabledRuleIds: readonly string[] | undefined): readonly SecurityRule[] => {
  if (enabledRuleIds === undefined) return SECURITY_RULES;
  const enabled = new Set(enabledRuleIds);
  return SECURITY_RULES.filter((rule) => enabled.has(rule.ruleId));
};

const readSourceLines = (content: string): readonly SourceLine[] =>
  content.split(/\r?\n/).map((text, index) => ({ number: index + 1, text }));

export const readSecurityCandidateLines = (content: string): readonly MarkdownSecurityCandidate[] =>
  readMarkdownSecurityCandidates(readSourceLines(content));

const MARKDOWN_NEARBY_LINE_RADIUS = 2;

export const readMarkdownSecurityCandidates = (
  lines: readonly SourceLine[],
): readonly MarkdownSecurityCandidate[] => {
  let sectionHeading: string | undefined;
  let activeFence: { readonly marker: string; readonly isCommandFence: boolean } | undefined;
  const candidates: MarkdownSecurityCandidate[] = [];

  for (const [index, line] of lines.entries()) {
    const heading = readMarkdownSectionHeading(line.text);
    if (heading !== undefined) sectionHeading = heading;

    const candidateInCodeFence = activeFence !== undefined;
    const candidateInCommandFence = activeFence?.isCommandFence === true;
    const previousLines = lines.slice(Math.max(0, index - MARKDOWN_NEARBY_LINE_RADIUS), index);
    const nextLines = lines.slice(index + 1, index + 1 + MARKDOWN_NEARBY_LINE_RADIUS);

    candidates.push({
      ...line,
      previousLines,
      nextLines,
      nearbyLines: [...previousLines, line, ...nextLines],
      sectionHeading,
      inCodeFence: candidateInCodeFence,
      tableRow: readMarkdownTableRow(line.text),
      commandContext: buildCommandLineContext(line.text, candidateInCommandFence),
    });

    const fence = FENCE_MARKER_PATTERN.exec(line.text);
    if (fence !== null) {
      if (activeFence?.marker === fence[1]) {
        activeFence = undefined;
      } else if (activeFence === undefined) {
        const language = fence[2] ?? "";
        activeFence = {
          marker: fence[1] ?? "",
          isCommandFence: COMMAND_FENCE_LANGUAGE_PATTERN.test(language),
        };
      }
    }
  }

  return candidates;
};

const findFirstLine = (
  candidates: readonly MarkdownSecurityCandidate[],
  predicate: (candidate: MarkdownSecurityCandidate) => boolean,
): number | undefined => candidates.find(predicate)?.number;

const findSecretExfiltrationInstructionLine = (
  candidates: readonly MarkdownSecurityCandidate[],
): number | undefined =>
  findFirstLine(candidates, (candidate) => hasBoundedExfiltrationEvidence(candidate));

const findNetworkExfiltrationCommandLine = (
  candidates: readonly MarkdownSecurityCandidate[],
): number | undefined =>
  findFirstLine(candidates, (candidate) => {
    if (isPreventiveLine(candidate.text)) return false;
    if (hasArbitrarySecretTransferCommand(candidate)) return true;
    if (!NETWORK_TRANSFER_PATTERN.test(candidate.text)) return false;
    return hasBoundedExfiltrationEvidence(candidate);
  });

const hasBoundedExfiltrationEvidence = (candidate: MarkdownSecurityCandidate): boolean => {
  if (isPreventiveLine(candidate.text)) return false;
  if (!hasExfiltrationTransferAction(candidate)) return false;
  if (!hasSuspiciousExfiltrationDestination(candidate)) return false;
  return candidate.nearbyLines.some((line) => SECRET_SOURCE_PATTERN.test(line.text));
};

const hasArbitrarySecretTransferCommand = (candidate: MarkdownSecurityCandidate): boolean => {
  const { commandContext } = candidate;
  if (!commandContext.hasTransferAction || !commandContext.hasExternalDestination) return false;
  if (commandContext.hasOfficialServiceDestination && !hasNonOfficialExternalCommand(candidate))
    return false;
  return hasCommandSensitiveSourceInBoundedContext(candidate);
};

const hasNonOfficialExternalCommand = (candidate: MarkdownSecurityCandidate): boolean =>
  candidate.commandContext.commands.some(
    (command) => command.destination === "external" && command.action !== "none",
  );

const hasCommandSensitiveSourceInBoundedContext = (
  candidate: MarkdownSecurityCandidate,
): boolean => {
  if (candidate.commandContext.hasSensitiveSource) return true;
  return candidate.nearbyLines.some((line) => SECRET_SOURCE_PATTERN.test(line.text));
};

const hasExfiltrationTransferAction = (candidate: MarkdownSecurityCandidate): boolean =>
  TRANSFER_PATTERN.test(candidate.text) ||
  EXFILTRATION_TRANSFER_ACTION_PATTERN.test(candidate.text) ||
  candidate.commandContext.hasTransferAction;

const hasSuspiciousExfiltrationDestination = (candidate: MarkdownSecurityCandidate): boolean =>
  TRANSFER_PATTERN.test(candidate.text) ||
  EXFILTRATION_SUSPICIOUS_DESTINATION_PATTERN.test(candidate.text) ||
  candidate.commandContext.hasExternalDestination;

const redactEvidenceText = (text: string): string =>
  text
    .replace(EVIDENCE_SECRET_VALUE_PATTERN, "$1[REDACTED]")
    .replace(EVIDENCE_BEARER_VALUE_PATTERN, "$1[REDACTED]");

const isPreventiveLine = (text: string): boolean => PREVENTION_PATTERN.test(text);

const isHarmfulPromptIntentLine = (text: string): boolean =>
  (PROMPT_CONFIRMATION_BYPASS_PATTERN.test(text) &&
    !DEFENSIVE_NEGATED_PROMPT_BYPASS_PATTERN.test(text)) ||
  PROMPT_CONTINUE_AFTER_DENIAL_PATTERN.test(text) ||
  (HIDE_LOGS_OUTPUT_PATTERN.test(text) && !DEFENSIVE_NEGATED_LOG_CONCEALMENT_PATTERN.test(text)) ||
  (PROMPT_OVERRIDE_PATTERN.test(text) &&
    !DEFENSIVE_NEGATED_PROMPT_BYPASS_PATTERN.test(text) &&
    !isDefensivePromptInjectionLine(text)) ||
  (PROMPT_CONCEALMENT_PATTERN.test(text) && !DEFENSIVE_SECRET_DISCLOSURE_PATTERN.test(text)) ||
  HIDE_BEHAVIOR_PATTERN.test(text);

const isDefensivePromptInjectionLine = (text: string): boolean =>
  PROMPT_UNTRUSTED_CONTENT_PATTERN.test(text) &&
  PROMPT_INJECTION_TERM_PATTERN.test(text) &&
  DEFENSIVE_PROMPT_ACTION_PATTERN.test(text);

const isDefensivePromptIntentLine = (text: string): boolean =>
  isPreventiveLine(text) ||
  isDefensivePromptInjectionLine(text) ||
  DEFENSIVE_SECRET_DISCLOSURE_PATTERN.test(text) ||
  DEFENSIVE_CONFIRMATION_PATTERN.test(text) ||
  HIGHER_PRIORITY_INSTRUCTION_PRESERVATION_PATTERN.test(text);

const readMarkdownSectionHeading = (text: string): string | undefined => {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text.trim());
  return match?.[2]?.trim();
};

const readMarkdownTableRow = (text: string): MarkdownTableRowContext | undefined => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  if (/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(trimmed)) return undefined;

  const cells = trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());

  return { rowText: text, cells };
};

const buildCommandLineContext = (
  lineText: string,
  isCommandFenceLine: boolean,
): CommandLineContext => {
  const commandTexts = readCommandTexts(lineText, isCommandFenceLine);
  const commands = commandTexts.flatMap((commandText) => readCommandSegments(commandText));

  return {
    sourceText: commandTexts[0],
    commands,
    hasPipeline: commands.length > 1,
    hasSensitiveSource: commands.some((command) => command.source === "sensitive"),
    hasLocalDestination: commands.some((command) => command.destination === "local"),
    hasOfficialServiceDestination: commands.some(
      (command) => command.destination === "official-service-api",
    ),
    hasExternalDestination: commands.some((command) => command.destination === "external"),
    hasExecutionSink: commands.some((command) => command.sink === "execution"),
    hasParseOnlySink: commands.some((command) => command.sink === "parse-only"),
    hasTransferAction: commands.some(
      (command) => command.action === "transfer" || command.action === "connective-transfer",
    ),
  };
};

const readCommandTexts = (lineText: string, isCommandFenceLine: boolean): readonly string[] => {
  const inlineCommands = [...lineText.matchAll(INLINE_COMMAND_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((command) => command.length > 0);
  if (inlineCommands.length > 0) return inlineCommands;
  if (isCommandFenceLine && COMMAND_LIKE_PATTERN.test(lineText))
    return [stripShellPrompt(lineText)];
  return [];
};

const readCommandSegments = (commandText: string): readonly CommandSegmentContext[] =>
  commandText
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment, index, segments) => classifyCommandSegment(segment, index, segments.length > 1));

const classifyCommandSegment = (
  text: string,
  position: number,
  isPipeline: boolean,
): CommandSegmentContext => {
  const command = readCommandName(text);
  return {
    text,
    command,
    position,
    source: classifyCommandSource(text),
    destination: classifyCommandDestination(text),
    sink: classifyCommandSink(command),
    action: classifyCommandAction(command, position, isPipeline),
  };
};

const stripShellPrompt = (text: string): string => text.replace(/^\s*(?:\$|>)\s*/, "").trim();

const readCommandName = (segment: string): string | undefined => {
  const cleaned = stripShellPrompt(segment);
  const firstToken = cleaned.match(/^[A-Za-z0-9_.-]+/)?.[0];
  return firstToken?.toLowerCase();
};

const classifyCommandSource = (segment: string): CommandSourceClassification =>
  SECRET_SOURCE_PATTERN.test(segment) || COMMAND_SENSITIVE_SOURCE_PATTERN.test(segment)
    ? "sensitive"
    : "none";

const classifyCommandDestination = (segment: string): CommandDestinationClassification => {
  if (OFFICIAL_SERVICE_DESTINATION_PATTERN.test(segment)) return "official-service-api";
  if (EXTERNAL_DESTINATION_PATTERN.test(segment)) return "external";
  if (LOCAL_DESTINATION_PATTERN.test(segment)) return "local";
  return "none";
};

const classifyCommandSink = (command: string | undefined): CommandSinkClassification => {
  if (command === undefined) return "none";
  if (EXECUTION_SINK_COMMANDS.has(command)) return "execution";
  if (PARSE_ONLY_SINK_COMMANDS.has(command)) return "parse-only";
  return "none";
};

const classifyCommandAction = (
  command: string | undefined,
  position: number,
  isPipeline: boolean,
): CommandActionClassification => {
  if (command !== undefined && TRANSFER_COMMANDS.has(command)) return "transfer";
  if (
    isPipeline &&
    position > 0 &&
    command !== undefined &&
    CONNECTIVE_TRANSFER_COMMANDS.has(command)
  )
    return "connective-transfer";
  return "none";
};

const isDescriptiveLaunchPreview = (text: string): boolean =>
  /\b(launch preview|example|documentation|documented)\b/i.test(text) &&
  /\b(--yolo|--dangerously-skip-permissions)\b/i.test(text);

const readSkillName = (skill: SkillRecord): string => {
  if (!skill.parseResult.ok) return skill.directoryName;
  const name = skill.parseResult.frontmatter.data.name;
  return typeof name === "string" && name.trim().length > 0 ? name : skill.directoryName;
};
