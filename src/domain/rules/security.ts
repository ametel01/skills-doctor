import type {
  CapabilityFact,
  CapabilityKind,
  Finding,
  FindingConfidence,
  FindingSeverity,
  SecurityPriority,
  SkillPackage,
  SkillRecord,
} from "../types.js";

export type SecurityRuleOptions = {
  readonly enabledRuleIds?: readonly string[] | undefined;
};

type SecurityRuleId =
  | "SKILL001_PROMPT_OVERRIDE"
  | "SKILL002_PERMISSION_BYPASS"
  | "SKILL003_SECRET_ACCESS"
  | "SKILL004_EXFIL_CHAIN"
  | "SKILL005_DESTRUCTIVE_COMMANDS"
  | "SKILL006_PERSISTENCE"
  | "SKILL007_REMOTE_CODE_EXEC"
  | "SKILL008_OBFUSCATION"
  | "SKILL101_BROAD_ALLOWED_TOOLS"
  | "SKILL102_MISSING_DENYLIST"
  | "SKILL103_IMPLICIT_INVOCATION_RISK"
  | "SKILL104_EXTERNAL_DEPENDENCY"
  | "SKILL105_CROSS_MODAL_MISMATCH"
  | "SKILL106_SELF_MODIFYING_SKILL"
  | "SKILL107_UNTRUSTED_MCP"
  | "SKILL108_MCP_SCOPE_EXCESS"
  | "SKILL201_NO_BOUNDARIES"
  | "SKILL202_NO_HITL_FOR_RISKY_ACTIONS"
  | "SKILL203_AMBIGUOUS_AUTHORITY"
  | "SKILL204_UNPINNED_TOOLS"
  | "SKILL205_HIDDEN_FILES"
  | "SKILL206_LARGE_CONTEXT_BAIT";

type SecurityRule = {
  readonly ruleId: SecurityRuleId;
  readonly severity: FindingSeverity;
  readonly priority: SecurityPriority;
  readonly confidence: FindingConfidence;
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
  readonly rationale: string;
  readonly counterevidence: readonly string[];
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
  readonly commandGroups: readonly CommandGroupContext[];
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

export type CommandGroupContext = {
  readonly sourceText: string;
  readonly commands: readonly CommandSegmentContext[];
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
const SECRET_ACCESS_READ_PATTERN =
  /\b(cat|read|load|open|print|dump|copy|collect|grep|rg)\b.{0,120}(?:^|[^\w])(\.env(?:\b|[._-])|secrets?\/|credentials\.json|~\/\.ssh(?:\/[\w.-]+)?|\.aws\b|\.gcloud\b|keychains?|browser profiles?|npm tokens?|github tokens?|openai api keys?|anthropic api keys?|private keys?|session files?)\b|(?:^|[^\w])(\.env(?:\b|[._-])|secrets?\/|credentials\.json|~\/\.ssh(?:\/[\w.-]+)?|\.aws\b|\.gcloud\b|keychains?|browser profiles?|npm tokens?|github tokens?|openai api keys?|anthropic api keys?|private keys?|session files?)\b.{0,120}\b(cat|read|load|open|print|dump|copy|collect|grep|rg)\b/i;
const TRANSFER_PATTERN =
  /\b(send|post|upload|forward|transmit|copy|paste|exfiltrate)\b.{0,100}\b(remote|external|webhooks?(?!\s+(?:signing\s+)?secrets?\b|\s+signatures?\b)|server|endpoint|url|site|gist|paste|chat|slack|discord)\b/i;
const NETWORK_TRANSFER_PATTERN =
  /\b(curl|wget|netcat|nc|scp|rsync|http post|webhook|request to external)\b/i;
const EXFILTRATION_TRANSFER_ACTION_PATTERN =
  /\b(send|post|upload|forward|transmit|copy|paste|exfiltrate|move)\b/i;
const EXFILTRATION_SUSPICIOUS_DESTINATION_PATTERN =
  /\b(remote|external|webhooks?(?!\s+(?:signing\s+)?secrets?\b|\s+signatures?\b)|server|endpoint|url|site|gist|paste|chat|slack|discord)\b|https?:\/\/(?!api\.github\.com\b|github\.com\b|registry\.npmjs\.org\b|npmjs\.com\b|api\.stripe\.com\b|api\.openai\.com\b|api\.anthropic\.com\b|api\.clerk\.com\b|[^/\s`"']+\.googleapis\.com\b)[^\s`"')]+/i;
const REMOTE_FETCH_TEXT_PATTERN =
  /\b(download|fetch|retrieve|curl|wget)\b.{0,120}\b(remote|https?:\/\/|url|installer|script|content|file)\b|\b(remote|https?:\/\/|url|installer|script|content|file)\b.{0,120}\b(download|fetch|retrieve|curl|wget)\b/i;
const FETCHED_CONTENT_EXECUTION_TEXT_PATTERN =
  /\b(pipe|piped)\b.{0,80}\b(shell|bash|sh|zsh|python|node|eval|interpreter)\b|\b(execute|run)\b.{0,80}\b(fetched|downloaded|retrieved|content|installer|script)\b|\b(fetched|downloaded|retrieved|content|installer|script)\b.{0,80}\b(execute|run|shell|bash|sh|zsh|python|node|eval|interpreter)\b|\bremote\b.{0,40}\b(installer|script|code|content)\b.{0,80}\b(execute|run|shell|bash|sh|zsh|python|node|eval|interpreter)\b/i;
const BROAD_DESTRUCTIVE_PATTERN =
  /\b(delete|remove|wipe|destroy|erase)\b.{0,100}\b(home directory|root directory|entire project|all files|everything|shell history|audit trail|logs?)\b/i;
const PERMISSION_WEAKENING_PATTERN =
  /\b(chmod|permission|permissions)\b.{0,80}\b(777|world-writable|everyone can write|disable ownership checks)\b/i;
const SAFETY_DISABLEMENT_PATTERN =
  /\b(--yolo|--dangerously-skip-permissions|skip permissions|disable sandbox|without sandbox|approve all prompts|auto-approve|bypass review|avoid confirmation|without confirmation)\b/i;
const OBFUSCATED_EXECUTION_PATTERN =
  /\b((base64|encoded|obfuscated|hidden remote)\b.{0,100}\b(decode|decode it|decoded|stage)|\b(decode|decode it|decoded|stage)\b.{0,100}\b(base64|encoded|obfuscated|hidden remote))\b.{0,100}\b(execute|run|shell|bash|sh|zsh|interpreter)\b/i;
const PERSISTENCE_PATTERN =
  /\b(write|append|install|create|modify|add|register)\b.{0,120}(?:^|[^\w])(\.bashrc|\.zshrc|\.profile|\.bash_profile|crontab|cron\.d|launch agents?|launchd|systemd|git hooks?|\.git\/hooks|npm postinstall|postinstall|setup\.py|vscode tasks?|\.vscode\/tasks\.json|auto-?start)\b|(?:^|[^\w])(\.bashrc|\.zshrc|\.profile|\.bash_profile|crontab|cron\.d|launch agents?|launchd|systemd|git hooks?|\.git\/hooks|npm postinstall|postinstall|setup\.py|vscode tasks?|\.vscode\/tasks\.json|auto-?start)\b.{0,120}\b(write|append|install|create|modify|add|register)\b/i;
const BROAD_ALLOWED_TOOLS_PATTERN =
  /\ballowed-tools\s*:\s*.*\b(Bash|Write|Edit|WebFetch|Agent|mcp__\*)\b|\bmcp__\*\b|\b(Bash|Write|Edit|WebFetch|Agent)\b.{0,80}\b(without narrowing|broad|unrestricted|all tools?)\b/i;
const DENYLIST_PATTERN =
  /\b(permissions\.deny|denylist|deny-list|deny rules?|disallow|forbid|blocked tools?|forbidden)\b.{0,180}\b(\.env|secrets?|credentials?|tokens?|~\/|home directory|rm\s+-rf|curl|wget|Bash|Read|Write|Edit|WebFetch|mcp__\*)\b|\b(\.env|secrets?|credentials?|tokens?|~\/|home directory|rm\s+-rf|curl|wget|Bash|Read|Write|Edit|WebFetch|mcp__\*)\b.{0,180}\b(permissions\.deny|denylist|deny-list|deny rules?|disallow|forbid|blocked tools?|forbidden)\b/i;
const IMPLICIT_INVOCATION_PATTERN =
  /\b(use (?:this skill )?(?:for|on) any (?:coding )?task|always use|general assistant|best skill for everything|use for everything|all-purpose|every request|any repository|any repo)\b/i;
const EXTERNAL_DEPENDENCY_PATTERN =
  /\b(npm install|pnpm add|yarn add|bun add|pip install|pipx run|uvx|brew install|docker pull|git clone|go install)\b.{0,160}\b(latest|main|master|HEAD|https?:\/\/|github\.com|gitlab\.com)\b|\b(fetch|download|load|read|trust)\b.{0,120}\b(remote markdown|remote prompt|remote docs?|https?:\/\/)/i;
const SELF_MODIFYING_PATTERN =
  /\b(edit|modify|rewrite|update|patch|append|replace)\b.{0,120}\b(this skill|SKILL\.md|scripts\/|references\/|assets\/|\.agents\/skills|registry metadata|skill registry)\b|\b(this skill|SKILL\.md|scripts\/|references\/|assets\/|\.agents\/skills|registry metadata|skill registry)\b.{0,120}\b(edit|modify|rewrite|update|patch|append|replace)\b/i;
const UNTRUSTED_MCP_PATTERN =
  /\b(mcp__\*|mcpServers|\.mcp\.json|broad MCP|MCP dependencies?|MCP servers?)\b/i;
const MCP_ALLOWLIST_PATTERN = /\b(allowlist|allow-list|allowed mcp|trusted mcp|approved mcp)\b/i;
const MCP_SCOPE_EXCESS_PATTERN =
  /\b(scopes?|oauth)\b.{0,160}\b(repo|admin|write|offline_access|read:user|read:org|gist|workflow|\*)\b|\bredirect_uris?\b.{0,120}\b(http:\/\/|localhost|127\.0\.0\.1|\*)\b/i;
const PURPOSE_RISK_KEYWORD_PATTERN =
  /\b(security|auth|credential|secret|token|network|http|api|deploy|install|dependency|script|shell|filesystem|file system|mcp|tool|automation)\b/i;
const BOUNDARY_EVIDENCE_PATTERN =
  /\b(when not to use|do not use|not use this skill|out of scope|boundar(?:y|ies)|forbidden actions?|forbidden inputs?|allowed inputs?|allowed outputs?|must not|should not)\b/i;
const NO_BOUNDARY_RISK_PATTERN =
  /\b(deploy|publish|send emails?|email users?|payments?|delete production|delete customer|database migrations?|db migrations?|github writes?|cloud infra|terraform apply|kubectl apply)\b/i;
const RISKY_HYGIENE_PATTERN =
  /\b(deploy|send emails?|email users?|payments?|delete(?!\s+(?:generated|temporary|local|scoped)\b)|deletion|read secrets?|copy secrets?|upload secrets?|database migrations?|db migrations?|github writes?|gh (?:issue|pr|repo)|cloud infra|terraform apply|kubectl apply|publish)\b/i;
const HITL_APPROVAL_PATTERN =
  /\b(human approval|explicit approval|explicit confirmation|ask (?:the )?user|confirm|confirmation|review before|manual approval|user approval)\b/i;
const AMBIGUOUS_AUTHORITY_PATTERN =
  /\b(this skill is authoritative|must always be followed|higher priority than project rules|always obey this skill|skill takes precedence|overrides project rules)\b/i;
const UNPINNED_TOOLS_PATTERN =
  /\b(npm install|pnpm add|yarn add|bun add|pip install|pipx run|uvx|brew install|docker pull|go install|npx|bunx)\b(?![^`\n]*\b(?:sha256|@[0-9]+(?:\.[0-9]+){1,2}|@[a-f0-9]{12,}|==[0-9]+(?:\.[0-9]+){1,2})\b).{0,120}\b(latest|main|master|HEAD|https?:\/\/|github\.com|gitlab\.com|[\w@./-]+)\b/i;
const LARGE_CONTEXT_LINE_THRESHOLD = 500;
const LONG_DESCRIPTION_THRESHOLD = 300;
const LONG_LINE_THRESHOLD = 1_000;
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
  /\bask first\b|\b(ask for|request|require|obtain|get)\b.{0,80}\b(explicit )?(user )?(confirmation|approval|permission)\b/i;
const HIGHER_PRIORITY_INSTRUCTION_PRESERVATION_PATTERN =
  /\b(preserve|respect|follow|keep)\b.{0,80}\b(system|developer|user|higher-priority)\b.{0,80}\binstructions?\b/i;
const VERIFIED_CONFIRMATION_FLAG_PATTERN =
  /\b(skip|bypass|avoid|override)\b.{0,80}\b(confirmations?|approvals?|permissions?)\b.{0,80}\b(once|after|when)\b.{0,40}\b(verif(?:y|ied|ication)|preview|dry-run)\b/i;
const ASK_FIRST_OPERATIONAL_BYPASS_PATTERN =
  /\b(--admin|scope restrictions?|required write permission|current scopes?)\b.{0,120}\bbypass\b.{0,120}\b(ask first|ask the user|do not attempt|don't attempt)\b|\bbypass\b.{0,120}\b(--admin|scope restrictions?|required write permission|current scopes?)\b.{0,120}\b(ask first|ask the user|do not attempt|don't attempt)\b/i;
const DEFENSIVE_UNTRUSTED_INSTRUCTION_CONTENT_PATTERN =
  /\b(treat|all content|content read|repo instructions?|repository|pr text|pull request text|generated files?)\b.{0,180}\b(untrusted input|data,? not instructions?|not instructions?|do not follow|don't follow)\b|\b(untrusted input|data,? not instructions?|not instructions?|do not follow|don't follow)\b.{0,180}\b(override|ignore previous instructions|instructions to you|repo instructions?|repository|pr text|pull request text|generated files?)\b/i;

const COMMAND_SENSITIVE_SOURCE_PATTERN =
  /(?:^|[\s"'`|])(?:\.env(?:\b|[./_-])|[~/./A-Za-z0-9_-]*(?:credentials|secrets?|tokens?|private[_-]?keys?|session[_-]?files?|npm[_-]?tokens?|github[_-]?tokens?|cloud[_-]?credentials?|aws[_-]?credentials?|gcp[_-]?credentials?)(?:\b|[./_-]))/i;
const LOCAL_WEBHOOK_SECRET_SETUP_PATTERN =
  /\b(webhook signing secret|signing secret|CLERK_WEBHOOK_SIGNING_SECRET)\b.{0,120}\b(dashboard|local|\.env|env var|verify|verification|signature|mismatch|middleware|route)\b|\b(dashboard|local|\.env|env var|verify|verification|signature|mismatch|middleware|route)\b.{0,120}\b(webhook signing secret|signing secret|CLERK_WEBHOOK_SIGNING_SECRET)\b/i;
const DESTINATION_CREDENTIAL_PATTERN =
  /\b[A-Z0-9_]*WEBHOOK_URL\b|\bprocess\.env\.[A-Z0-9_]*WEBHOOK_URL\b/i;
const PUBLIC_ISSUE_CONFIRMATION_PATTERN =
  /\b(public|publicly visible)\b.{0,180}\b(confirm|confirmation|explicit flag|warn the user)\b|\b(confirm|confirmation|explicit flag|warn the user)\b.{0,180}\b(public|publicly visible)\b/i;
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
  "eval",
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
const LOCAL_SCRIPT_OPERAND_PATTERN =
  /^(?:\.{1,2}\/|[A-Za-z0-9_.-]+\/|[A-Za-z0-9_.-]+\.(?:js|mjs|cjs|ts|sh|bash|py))\S*/;

const SECURITY_RULES: readonly SecurityRule[] = [
  {
    ruleId: "SKILL001_PROMPT_OVERRIDE",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "Instruction subversion appears in skill body",
    message:
      "The skill appears to instruct an agent to override higher-priority instructions, conceal behavior, or avoid telling the user about its actions.",
    suggestion:
      "Remove instruction-subversion language and make the skill respect system, developer, and user instructions.",
    rationale:
      "Matched explicit instruction-subversion or concealment wording after defensive prompt-handling counterevidence was filtered out.",
    counterevidence: [
      "Defensive guidance that refuses prompt injection, preserves higher-priority instructions, protects secrets, or requires user confirmation is suppressed.",
    ],
    findLine: (lines) =>
      findFirstLine(lines, (line) => {
        if (isHarmfulPromptIntentLine(line.text)) return true;
        if (isDefensivePromptIntentLine(line.text)) return false;
        return false;
      }),
  },
  {
    ruleId: "SKILL002_PERMISSION_BYPASS",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "Agent safety disablement appears in skill body",
    message:
      "The skill appears to instruct an agent to disable sandboxing, skip permissions, auto-approve prompts, or avoid confirmation.",
    suggestion:
      "Remove safety-bypass instructions unless they are part of a documented user-approved handoff flow with explicit confirmation.",
    rationale:
      "Matched agent safety-bypass wording outside a descriptive launch preview or defensive context.",
    counterevidence: [
      "Descriptive examples and documented launch previews are suppressed when they do not instruct bypass behavior.",
    ],
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
    ruleId: "SKILL003_SECRET_ACCESS",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "Secret access instruction appears in skill body",
    message:
      "The skill appears to instruct an agent to read local secret-bearing files, credentials, sessions, or token stores.",
    suggestion:
      "Remove secret-reading guidance unless it is explicitly scoped to local verification and protected by clear user approval.",
    rationale:
      "Matched secret-reading action and sensitive source wording after local setup counterevidence was filtered out.",
    counterevidence: [
      "Local webhook signing-secret setup, local signature verification, destination-only documentation, and defensive secret-handling guidance are suppressed.",
    ],
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) =>
          !isPreventiveLine(line.text) &&
          !isLocalSecretSetupOrVerificationLine(line.text) &&
          !isDestinationCredentialOnlyLine(line.text) &&
          SECRET_ACCESS_READ_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "SKILL004_EXFIL_CHAIN",
    severity: "warning",
    priority: "P0",
    confidence: "high",
    title: "Secret exfiltration chain appears in skill body",
    message:
      "The skill appears to combine secret-reading guidance with network or external transfer behavior.",
    suggestion:
      "Remove any guidance that sends credentials, tokens, keys, sessions, or secret file contents to external destinations.",
    rationale:
      "Found sensitive-source wording, a connective transfer action, and a suspicious external destination or network-transfer command in bounded Markdown context.",
    counterevidence: [
      "Local webhook signing-secret setup, local signature verification, destination-only documentation, official service API authentication, parse-only local commands, and local destinations are counterevidence unless secret material is sent to an unrelated external sink.",
    ],
    findLine: (lines) => findExfiltrationChainLine(lines),
  },
  {
    ruleId: "SKILL005_DESTRUCTIVE_COMMANDS",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "High-risk destructive instruction appears in skill body",
    message:
      "The skill appears to describe broad deletion, trace removal, or permission weakening that could damage user files or hide activity.",
    suggestion:
      "Remove broad destructive guidance, avoid trace-hiding instructions, and require scoped dry-runs or explicit user confirmation for risky changes.",
    rationale:
      "Matched broad destructive, trace-removal, or permission-weakening language without a defensive framing.",
    counterevidence: [
      "Preventive wording and scoped confirmation guidance are filtered before reporting this rule.",
    ],
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
    ruleId: "SKILL006_PERSISTENCE",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "Persistence instruction appears in skill body",
    message:
      "The skill appears to write or register persistence through shell startup files, scheduled jobs, hooks, service managers, or autostart locations.",
    suggestion:
      "Remove persistence guidance unless it is clearly required, scoped, reversible, and approved.",
    rationale:
      "Matched persistence location wording with write, install, register, or modify actions.",
    counterevidence: ["Preventive or defensive wording is filtered before reporting this rule."],
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) => !isPreventiveLine(line.text) && PERSISTENCE_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "SKILL007_REMOTE_CODE_EXEC",
    severity: "warning",
    priority: "P0",
    confidence: "high",
    title: "Remote code execution bootstrap appears in skill body",
    message:
      "The skill appears to instruct an agent to fetch remote content and execute it through a shell or interpreter.",
    suggestion:
      "Remove execute-from-network guidance. Require pinned, inspectable local scripts or documented package commands instead.",
    rationale:
      "Found remote fetch evidence and downstream shell or interpreter execution in the same command flow or explicit fetched-content execution prose.",
    counterevidence: [
      "Remote docs/spec parsing, parse-only pipelines, local static parsers, and unrelated inline command snippets are not reportable.",
    ],
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) => !isPreventiveLine(line.text) && isRemoteExecutionBootstrapLine(line),
      ),
  },
  {
    ruleId: "SKILL008_OBFUSCATION",
    severity: "warning",
    priority: "P0",
    confidence: "medium",
    title: "Obfuscated external execution appears in skill body",
    message:
      "The skill appears to instruct an agent to decode or stage obscured content and execute it.",
    suggestion:
      "Replace obfuscated execution guidance with transparent, reviewable files and explicit validation steps.",
    rationale:
      "Matched decode-or-stage wording for obfuscated external content combined with shell or interpreter execution.",
    counterevidence: [
      "Defensive warnings and decode-only fixture handling without execution are suppressed.",
    ],
    findLine: (lines) =>
      findFirstLine(
        lines,
        (line) => !isPreventiveLine(line.text) && OBFUSCATED_EXECUTION_PATTERN.test(line.text),
      ),
  },
  {
    ruleId: "SKILL101_BROAD_ALLOWED_TOOLS",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Broad allowed tools appear in skill metadata or body",
    message:
      "The skill appears to grant broad file, shell, web, agent, or MCP tool access without clear narrowing.",
    suggestion:
      "Narrow allowed tools to the minimum required set and pair risky access with explicit deny rules for secrets, home directories, and destructive commands.",
    rationale: "Matched broad allowed-tools or broad tool grant wording without denylist evidence.",
    counterevidence: [
      "Clear deny rules for sensitive files or destructive tools suppress this rule.",
    ],
    findLine: (lines) =>
      hasDenylistEvidence(lines)
        ? undefined
        : findFirstLine(lines, (line) => BROAD_ALLOWED_TOOLS_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL102_MISSING_DENYLIST",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Risky skill access is missing denylist protection",
    message:
      "The skill appears to use scripts, network, broad tools, secrets, or destructive actions without deny rules for sensitive files or commands.",
    suggestion:
      "Add deny rules for secrets, home directories, credential paths, network transfer around secrets, and destructive commands.",
    rationale:
      "Matched risky access evidence while no denylist or permissions.deny evidence was present.",
    counterevidence: ["Explicit denylist or permissions.deny guidance suppresses this rule."],
    findLine: () => undefined,
  },
  {
    ruleId: "SKILL103_IMPLICIT_INVOCATION_RISK",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Broad implicit invocation wording appears in skill metadata or body",
    message:
      "The skill uses broad invocation wording that may cause an agent to select it for unrelated tasks.",
    suggestion:
      "Scope the description to a narrow task, inputs, and boundaries so implicit skill selection is predictable.",
    rationale:
      "Matched broad selection phrases such as always-use, any-task, or general-assistant wording.",
    counterevidence: [
      "Narrow task descriptions and explicit when-not-to-use boundaries reduce this risk.",
    ],
    findLine: (lines) =>
      findFirstLine(lines, (line) => IMPLICIT_INVOCATION_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL104_EXTERNAL_DEPENDENCY",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "External dependency or remote content trust appears in skill body",
    message:
      "The skill appears to fetch runtime dependencies, unpinned packages, arbitrary repositories, or remote markdown/prompts.",
    suggestion:
      "Pin package versions and repository revisions, vendor required scripts when possible, and treat remote docs or markdown as untrusted data.",
    rationale:
      "Matched unpinned installs, arbitrary clones, runtime URL fetches, or remote markdown trust.",
    counterevidence: [
      "Pinned versions, fixed digests, and parse-only remote documentation reduce this risk.",
    ],
    findLine: (lines) =>
      findFirstLine(lines, (line) => EXTERNAL_DEPENDENCY_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL105_CROSS_MODAL_MISMATCH",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Skill purpose appears mismatched with package behavior",
    message:
      "The package contains risky script, resource, or config behavior that does not match the skill's stated purpose.",
    suggestion:
      "Align package artifacts with the declared purpose or split unrelated auth, network, filesystem, and execution behavior into a separate reviewed skill.",
    rationale:
      "Package-level validation compares benign stated purpose with risky non-SKILL.md capability facts.",
    counterevidence: [
      "Descriptions that explicitly scope the security, network, dependency, tool, or filesystem behavior reduce this risk.",
    ],
    findLine: () => undefined,
  },
  {
    ruleId: "SKILL106_SELF_MODIFYING_SKILL",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Self-modifying skill instruction appears",
    message:
      "The skill appears to instruct the agent to modify its own instructions, scripts, references, assets, or registry metadata.",
    suggestion:
      "Avoid runtime self-modification. Require reviewed source changes outside skill execution for updates to skill package files.",
    rationale: "Matched edit or mutation verbs targeting skill package files or registry metadata.",
    counterevidence: [
      "Normal repository edits outside the skill package are not self-modification.",
    ],
    findLine: (lines) => findFirstLine(lines, (line) => SELF_MODIFYING_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL107_UNTRUSTED_MCP",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Broad or untrusted MCP access appears",
    message:
      "The skill appears to add or expose MCP servers or broad MCP tools without a clear allowlist.",
    suggestion:
      "Restrict MCP tools to trusted servers and named tools, and document human confirmation for sensitive MCP invocations.",
    rationale:
      "Matched MCP server, MCP wildcard, or MCP dependency evidence without allowlist wording.",
    counterevidence: ["Explicit trusted-server or tool allowlists suppress this rule."],
    findLine: (lines) =>
      hasMcpAllowlistEvidence(lines)
        ? undefined
        : findFirstLine(lines, (line) => UNTRUSTED_MCP_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL108_MCP_SCOPE_EXCESS",
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Excessive MCP OAuth scope or redirect metadata appears",
    message:
      "The skill or MCP config appears to request broad OAuth scopes or weak redirect metadata.",
    suggestion:
      "Minimize OAuth scopes, require PKCE where applicable, and validate exact redirect URIs and protected-resource metadata.",
    rationale:
      "Matched broad OAuth scopes or loose redirect URI metadata in MCP-related configuration.",
    counterevidence: ["Minimal scopes and exact redirect validation reduce this risk."],
    findLine: (lines) => findFirstLine(lines, (line) => MCP_SCOPE_EXCESS_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL201_NO_BOUNDARIES",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Risky skill lacks explicit boundaries",
    message:
      "The skill appears to describe risky behavior without when-not-to-use, allowed-input/output, or forbidden-action boundaries.",
    suggestion:
      "Add explicit boundaries such as when not to use the skill, forbidden actions, and allowed inputs or outputs.",
    rationale: "Matched risky behavior while no boundary evidence was present in the skill body.",
    counterevidence: [
      "Explicit boundary, out-of-scope, forbidden-action, or allowed-input/output sections suppress this rule.",
    ],
    findLine: (lines) =>
      lines.some((line) => BOUNDARY_EVIDENCE_PATTERN.test(line.text))
        ? undefined
        : findFirstLine(
            lines,
            (line) => !isPreventiveLine(line.text) && NO_BOUNDARY_RISK_PATTERN.test(line.text),
          ),
  },
  {
    ruleId: "SKILL202_NO_HITL_FOR_RISKY_ACTIONS",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Risky action lacks human approval guidance",
    message:
      "The skill describes deploys, email, payments, deletion, secrets, migrations, GitHub writes, or cloud changes without explicit human approval guidance.",
    suggestion:
      "Require explicit user confirmation or human review before performing risky external or irreversible actions.",
    rationale:
      "Matched risky action wording while no approval or confirmation guidance was present.",
    counterevidence: [
      "Explicit human approval, confirmation, or review-before-action wording suppresses this rule.",
    ],
    findLine: (lines) =>
      lines.some((line) => HITL_APPROVAL_PATTERN.test(line.text))
        ? undefined
        : findFirstLine(
            lines,
            (line) => !isPreventiveLine(line.text) && RISKY_HYGIENE_PATTERN.test(line.text),
          ),
  },
  {
    ruleId: "SKILL203_AMBIGUOUS_AUTHORITY",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Ambiguous authority wording appears",
    message:
      "The skill appears to claim broad authority or precedence over project rules without clear limits.",
    suggestion:
      "Remove authority-precedence language and state that system, developer, user, and project instructions remain authoritative.",
    rationale:
      "Matched authoritative, always-follow, or higher-priority-than-project-rules wording.",
    counterevidence: [
      "Defensive wording that preserves higher-priority instructions is handled by the P0 prompt override filters.",
    ],
    findLine: (lines) =>
      findFirstLine(lines, (line) => AMBIGUOUS_AUTHORITY_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL204_UNPINNED_TOOLS",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Unpinned tool or package install appears",
    message:
      "The skill appears to install or run packages, containers, or repository code without a pinned version, digest, or revision.",
    suggestion:
      "Pin package versions, image digests, or commit SHAs, and document how to update them safely.",
    rationale:
      "Matched package runner, install, clone, or pull guidance without pinned version evidence.",
    counterevidence: ["Pinned versions, digests, and commit SHAs suppress this rule."],
    findLine: (lines) => findFirstLine(lines, (line) => UNPINNED_TOOLS_PATTERN.test(line.text)),
  },
  {
    ruleId: "SKILL205_HIDDEN_FILES",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Hidden or unusual package artifact appears",
    message:
      "The skill package contains hidden files, executable assets, unusual extensions, or symlinks that escape the skill root.",
    suggestion:
      "Keep security-relevant files visible and reviewable, avoid executable assets unless required, and remove symlink escapes.",
    rationale:
      "Package-level validation reports hidden-file, executable-asset, and symlink hygiene evidence.",
    counterevidence: ["Normal visible package files inside the skill root are not reportable."],
    findLine: () => undefined,
  },
  {
    ruleId: "SKILL206_LARGE_CONTEXT_BAIT",
    severity: "warning",
    priority: "P2",
    confidence: "medium",
    title: "Large context bait appears in skill metadata or body",
    message:
      "The skill appears to use very long metadata, body content, or lines that can dominate agent context.",
    suggestion:
      "Shorten descriptions and move large reference material into scoped reference files with clear summaries.",
    rationale: "Matched long description, very large SKILL.md content, or unusually long lines.",
    counterevidence: ["Concise metadata and bounded references suppress this rule."],
    findLine: (lines) => findLargeContextBaitLine(lines),
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

export const validateSkillPackageSecurityRules = (
  packages: readonly SkillPackage[],
  options: SecurityRuleOptions = {},
): Finding[] => {
  const rules = filterRules(options.enabledRuleIds);
  if (rules.length === 0) return [];
  return packages.flatMap((skillPackage) => [
    ...validateSkillSecurity(skillPackage.skill, rules),
    ...validatePackageCapabilitySecurity(skillPackage, options.enabledRuleIds),
  ]);
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
        priority: rule.priority,
        title: rule.title,
        message: rule.message,
        suggestion: rule.suggestion,
        confidence: rule.confidence,
        rationale: rule.rationale,
        counterevidence: rule.counterevidence,
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

const hasDenylistEvidence = (lines: readonly MarkdownSecurityCandidate[]): boolean =>
  lines.some((line) => DENYLIST_PATTERN.test(line.text));

const hasMcpAllowlistEvidence = (lines: readonly MarkdownSecurityCandidate[]): boolean =>
  lines.some((line) => MCP_ALLOWLIST_PATTERN.test(line.text));

const findLargeContextBaitLine = (
  lines: readonly MarkdownSecurityCandidate[],
): number | undefined => {
  if (lines.length > LARGE_CONTEXT_LINE_THRESHOLD) return lines[0]?.number;
  const longDescription = lines.find(
    (line) =>
      /^\s*description\s*:/i.test(line.text) && line.text.length > LONG_DESCRIPTION_THRESHOLD,
  );
  if (longDescription !== undefined) return longDescription.number;
  return lines.find((line) => line.text.length > LONG_LINE_THRESHOLD)?.number;
};

const packageHasDenylistEvidence = (skillPackage: SkillPackage): boolean =>
  skillPackage.artifacts.some(
    (artifact) => artifact.content !== undefined && DENYLIST_PATTERN.test(artifact.content),
  );

const packageHasMcpAllowlistEvidence = (skillPackage: SkillPackage): boolean =>
  skillPackage.artifacts.some(
    (artifact) => artifact.content !== undefined && MCP_ALLOWLIST_PATTERN.test(artifact.content),
  );

const CAPABILITY_SECURITY_RULES = new Map<
  CapabilityKind,
  Pick<
    SecurityRule,
    | "ruleId"
    | "severity"
    | "priority"
    | "confidence"
    | "title"
    | "message"
    | "suggestion"
    | "rationale"
    | "counterevidence"
  >
>([
  [
    "reads_secrets",
    {
      ruleId: "SKILL003_SECRET_ACCESS",
      severity: "warning",
      priority: "P0",
      confidence: "medium",
      title: "Secret access instruction appears in skill package",
      message:
        "The skill package appears to read local secret-bearing files, credentials, sessions, or token stores.",
      suggestion:
        "Remove secret-reading behavior unless it is explicitly scoped to local verification and protected by clear user approval.",
      rationale: "A package artifact produced a secret-reading capability fact.",
      counterevidence: [
        "Local webhook signing-secret setup, local signature verification, destination-only documentation, and defensive secret-handling guidance are suppressed.",
      ],
    },
  ],
  [
    "persistence",
    {
      ruleId: "SKILL006_PERSISTENCE",
      severity: "warning",
      priority: "P0",
      confidence: "medium",
      title: "Persistence instruction appears in skill package",
      message:
        "The skill package appears to write or register persistence through shell startup files, scheduled jobs, hooks, service managers, or autostart locations.",
      suggestion:
        "Remove persistence behavior unless it is clearly required, scoped, reversible, and approved.",
      rationale: "A package artifact produced a persistence capability fact.",
      counterevidence: ["Preventive or defensive wording is filtered before reporting this rule."],
    },
  ],
  [
    "remote_code_exec",
    {
      ruleId: "SKILL007_REMOTE_CODE_EXEC",
      severity: "warning",
      priority: "P0",
      confidence: "high",
      title: "Remote code execution bootstrap appears in skill package",
      message:
        "The skill package appears to fetch or decode content and execute it through a shell or interpreter.",
      suggestion:
        "Remove execute-from-network guidance. Require pinned, inspectable local scripts or documented package commands instead.",
      rationale:
        "A package artifact produced a remote-code-execution capability fact outside the main SKILL.md file.",
      counterevidence: [
        "Remote docs/spec parsing, parse-only pipelines, local static parsers, and unrelated inline command snippets are not reportable.",
      ],
    },
  ],
  [
    "destructive_action",
    {
      ruleId: "SKILL005_DESTRUCTIVE_COMMANDS",
      severity: "warning",
      priority: "P0",
      confidence: "medium",
      title: "High-risk destructive instruction appears in skill package",
      message:
        "The skill package appears to describe broad deletion, trace removal, or permission weakening that could damage user files or hide activity.",
      suggestion:
        "Remove broad destructive guidance, avoid trace-hiding instructions, and require scoped dry-runs or explicit user confirmation for risky changes.",
      rationale: "A package artifact produced a destructive-action capability fact.",
      counterevidence: [
        "Preventive wording and scoped confirmation guidance are filtered before reporting this rule.",
      ],
    },
  ],
  [
    "bypasses_approval",
    {
      ruleId: "SKILL002_PERMISSION_BYPASS",
      severity: "warning",
      priority: "P0",
      confidence: "medium",
      title: "Agent safety disablement appears in skill package",
      message:
        "The skill package appears to instruct an agent to disable sandboxing, skip permissions, auto-approve prompts, or avoid confirmation.",
      suggestion:
        "Remove safety-bypass instructions unless they are part of a documented user-approved handoff flow with explicit confirmation.",
      rationale: "A package artifact produced an approval-bypass capability fact.",
      counterevidence: [
        "Descriptive examples and documented launch previews are suppressed when they do not instruct bypass behavior.",
      ],
    },
  ],
  [
    "obfuscation",
    {
      ruleId: "SKILL008_OBFUSCATION",
      severity: "warning",
      priority: "P0",
      confidence: "medium",
      title: "Obfuscated external execution appears in skill package",
      message:
        "The skill package appears to contain or instruct use of obscured content that may be staged for execution.",
      suggestion:
        "Replace obfuscated execution guidance with transparent, reviewable files and explicit validation steps.",
      rationale: "A package artifact produced an obfuscation capability fact.",
      counterevidence: [
        "Defensive warnings and decode-only fixture handling without execution are suppressed.",
      ],
    },
  ],
  [
    "broad_tool_access",
    {
      ruleId: "SKILL101_BROAD_ALLOWED_TOOLS",
      severity: "warning",
      priority: "P1",
      confidence: "medium",
      title: "Broad allowed tools appear in skill package",
      message:
        "The skill package appears to grant broad file, shell, web, agent, or MCP tool access without clear narrowing.",
      suggestion:
        "Narrow allowed tools to the minimum required set and pair risky access with explicit deny rules for secrets, home directories, and destructive commands.",
      rationale: "A package artifact produced a broad-tool-access capability fact.",
      counterevidence: [
        "Clear deny rules for sensitive files or destructive tools suppress this rule.",
      ],
    },
  ],
  [
    "external_dependency",
    {
      ruleId: "SKILL104_EXTERNAL_DEPENDENCY",
      severity: "warning",
      priority: "P1",
      confidence: "medium",
      title: "External dependency or remote content trust appears in skill package",
      message:
        "The skill package appears to fetch runtime dependencies, unpinned packages, arbitrary repositories, or remote markdown/prompts.",
      suggestion:
        "Pin package versions and repository revisions, vendor required scripts when possible, and treat remote docs or markdown as untrusted data.",
      rationale: "A package artifact produced an external-dependency capability fact.",
      counterevidence: [
        "Pinned versions, fixed digests, and parse-only remote documentation reduce this risk.",
      ],
    },
  ],
  [
    "self_modifies",
    {
      ruleId: "SKILL106_SELF_MODIFYING_SKILL",
      severity: "warning",
      priority: "P1",
      confidence: "medium",
      title: "Self-modifying skill instruction appears in skill package",
      message:
        "The skill package appears to instruct the agent to modify its own instructions, scripts, references, assets, or registry metadata.",
      suggestion:
        "Avoid runtime self-modification. Require reviewed source changes outside skill execution for updates to skill package files.",
      rationale: "A package artifact produced a self-modification capability fact.",
      counterevidence: [
        "Normal repository edits outside the skill package are not self-modification.",
      ],
    },
  ],
  [
    "hidden_artifact",
    {
      ruleId: "SKILL205_HIDDEN_FILES",
      severity: "warning",
      priority: "P2",
      confidence: "medium",
      title: "Hidden or unusual package artifact appears",
      message:
        "The skill package contains hidden files, executable assets, unusual extensions, or symlinks that escape the skill root.",
      suggestion:
        "Keep security-relevant files visible and reviewable, avoid executable assets unless required, and remove symlink escapes.",
      rationale: "A package artifact produced hidden-file or symlink hygiene evidence.",
      counterevidence: ["Normal visible package files inside the skill root are not reportable."],
    },
  ],
]);

const validatePackageCapabilitySecurity = (
  skillPackage: SkillPackage,
  enabledRuleIds: readonly string[] | undefined,
): Finding[] => {
  const enabled =
    enabledRuleIds === undefined ? undefined : new Set(enabledRuleIds.flatMap(resolveRuleIdAlias));
  const skillMdPath = skillPackage.skill.skillPath;
  const facts = skillPackage.capabilities ?? [];
  const hasDenylist = packageHasDenylistEvidence(skillPackage);
  const directFindings = facts.flatMap((fact) => {
    if (fact.artifactPath === skillMdPath) return [];
    const rule = CAPABILITY_SECURITY_RULES.get(fact.kind);
    if (rule === undefined) return [];
    if (enabled !== undefined && !enabled.has(rule.ruleId)) return [];
    if (rule.ruleId === "SKILL101_BROAD_ALLOWED_TOOLS" && hasDenylist) return [];
    return [buildCapabilityFinding(skillPackage, fact, rule)];
  });

  return [
    ...directFindings,
    ...[
      buildPackageExfiltrationFinding(skillPackage, facts, enabled),
      buildMissingDenylistFinding(skillPackage, facts, enabled),
      buildCrossModalMismatchFinding(skillPackage, facts, enabled),
      buildUntrustedMcpFinding(skillPackage, facts, enabled),
      buildMcpScopeExcessFinding(skillPackage, enabled),
      buildExecutableArtifactFinding(skillPackage, enabled),
    ].filter((finding): finding is Finding => finding !== undefined),
  ];
};

const buildPackageExfiltrationFinding = (
  skillPackage: SkillPackage,
  facts: readonly CapabilityFact[],
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL004_EXFIL_CHAIN";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  const secretFact = facts.find(
    (fact) => fact.artifactPath !== skillPackage.skill.skillPath && fact.kind === "reads_secrets",
  );
  const networkFact = facts.find(
    (fact) => fact.artifactPath !== skillPackage.skill.skillPath && fact.kind === "network_egress",
  );
  if (secretFact === undefined || networkFact === undefined) return undefined;
  return buildCapabilityFinding(
    skillPackage,
    networkFact,
    {
      ruleId,
      severity: "warning",
      priority: "P0",
      confidence: "high",
      title: "Network transfer appears near secret-reading package capability",
      message:
        "The skill package appears to combine network transfer capability with secret or sensitive file-reading capability.",
      suggestion:
        "Remove network-transfer guidance around secrets or sensitive files, and keep security review workflows local unless the user explicitly provides a safe destination.",
      rationale:
        "Package artifacts produced both secret-reading and network-egress capability facts outside the main SKILL.md file.",
      counterevidence: [
        "Official service API authentication, parse-only local commands, and local destinations are ignored unless secret material is also sent to an unrelated external sink.",
      ],
    },
    [secretFact, networkFact],
  );
};

const P1_RISKY_CAPABILITIES = new Set<CapabilityKind>([
  "broad_tool_access",
  "network_egress",
  "external_dependency",
  "remote_code_exec",
  "destructive_action",
  "reads_secrets",
  "mcp_access",
]);

const CROSS_MODAL_RISKY_CAPABILITIES = new Set<CapabilityKind>([
  "reads_secrets",
  "network_egress",
  "remote_code_exec",
  "persistence",
  "destructive_action",
  "external_dependency",
  "mcp_access",
]);

const buildMissingDenylistFinding = (
  skillPackage: SkillPackage,
  facts: readonly CapabilityFact[],
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL102_MISSING_DENYLIST";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  if (packageHasDenylistEvidence(skillPackage)) return undefined;
  const fact = facts.find(
    (candidate) =>
      candidate.artifactPath !== skillPackage.skill.skillPath &&
      P1_RISKY_CAPABILITIES.has(candidate.kind),
  );
  if (fact === undefined) return undefined;
  return buildCapabilityFinding(skillPackage, fact, {
    ruleId,
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Risky skill package access is missing denylist protection",
    message:
      "The skill package appears to use scripts, network, broad tools, secrets, or destructive actions without deny rules for sensitive files or commands.",
    suggestion:
      "Add deny rules for secrets, home directories, credential paths, network transfer around secrets, and destructive commands.",
    rationale:
      "Package artifacts produced risky capability facts while no denylist or permissions.deny evidence was present.",
    counterevidence: ["Explicit denylist or permissions.deny guidance suppresses this rule."],
  });
};

const buildCrossModalMismatchFinding = (
  skillPackage: SkillPackage,
  facts: readonly CapabilityFact[],
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL105_CROSS_MODAL_MISMATCH";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  const description = readSkillDescription(skillPackage.skill);
  if (description !== undefined && PURPOSE_RISK_KEYWORD_PATTERN.test(description)) return undefined;
  const fact = facts.find(
    (candidate) =>
      candidate.artifactPath !== skillPackage.skill.skillPath &&
      CROSS_MODAL_RISKY_CAPABILITIES.has(candidate.kind),
  );
  if (fact === undefined) return undefined;
  return buildCapabilityFinding(skillPackage, fact, {
    ruleId,
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Skill purpose appears mismatched with package behavior",
    message:
      "The package contains risky script, resource, or config behavior that does not match the skill's stated purpose.",
    suggestion:
      "Align package artifacts with the declared purpose or split unrelated auth, network, filesystem, and execution behavior into a separate reviewed skill.",
    rationale:
      "A non-SKILL.md artifact produced risky capability evidence while the skill description does not scope that behavior.",
    counterevidence: [
      "Descriptions that explicitly scope the security, network, dependency, tool, or filesystem behavior reduce this risk.",
    ],
  });
};

const buildUntrustedMcpFinding = (
  skillPackage: SkillPackage,
  facts: readonly CapabilityFact[],
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL107_UNTRUSTED_MCP";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  if (packageHasMcpAllowlistEvidence(skillPackage)) return undefined;
  const fact = facts.find(
    (candidate) =>
      candidate.artifactPath !== skillPackage.skill.skillPath && candidate.kind === "mcp_access",
  );
  if (fact === undefined) return undefined;
  return buildCapabilityFinding(skillPackage, fact, {
    ruleId,
    severity: "warning",
    priority: "P1",
    confidence: "medium",
    title: "Broad or untrusted MCP access appears in skill package",
    message:
      "The skill package appears to add or expose MCP servers or broad MCP tools without a clear allowlist.",
    suggestion:
      "Restrict MCP tools to trusted servers and named tools, and document human confirmation for sensitive MCP invocations.",
    rationale: "Package artifacts produced MCP access evidence without allowlist wording.",
    counterevidence: ["Explicit trusted-server or tool allowlists suppress this rule."],
  });
};

const buildMcpScopeExcessFinding = (
  skillPackage: SkillPackage,
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL108_MCP_SCOPE_EXCESS";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  for (const artifact of skillPackage.artifacts) {
    if (artifact.content === undefined || !MCP_SCOPE_EXCESS_PATTERN.test(artifact.content)) {
      continue;
    }
    const line = readSourceLines(artifact.content).find((candidate) =>
      MCP_SCOPE_EXCESS_PATTERN.test(candidate.text),
    );
    const fact: CapabilityFact = {
      kind: "mcp_access",
      artifactPath: artifact.path,
      confidence: "medium",
      line: line?.number,
      evidence:
        line === undefined
          ? undefined
          : {
              path: artifact.path,
              startLine: line.number,
              endLine: line.number,
              excerpt: [
                { line: line.number, text: redactEvidenceText(line.text), highlighted: true },
              ],
            },
      description: "MCP configuration requests broad OAuth scopes or weak redirect metadata.",
    };
    return buildCapabilityFinding(skillPackage, fact, {
      ruleId,
      severity: "warning",
      priority: "P1",
      confidence: "medium",
      title: "Excessive MCP OAuth scope or redirect metadata appears",
      message: "The skill package appears to request broad OAuth scopes or weak redirect metadata.",
      suggestion:
        "Minimize OAuth scopes, require PKCE where applicable, and validate exact redirect URIs and protected-resource metadata.",
      rationale:
        "Matched broad OAuth scopes or loose redirect URI metadata in an MCP-related artifact.",
      counterevidence: ["Minimal scopes and exact redirect validation reduce this risk."],
    });
  }
  return undefined;
};

const buildExecutableArtifactFinding = (
  skillPackage: SkillPackage,
  enabled: ReadonlySet<string> | undefined,
): Finding | undefined => {
  const ruleId: SecurityRuleId = "SKILL205_HIDDEN_FILES";
  if (enabled !== undefined && !enabled.has(ruleId)) return undefined;
  const artifact = skillPackage.artifacts.find(
    (candidate) =>
      candidate.executable === true &&
      candidate.type !== "script" &&
      candidate.type !== "shell-script",
  );
  if (artifact === undefined) return undefined;
  return buildCapabilityFinding(
    skillPackage,
    {
      kind: "hidden_artifact",
      artifactPath: artifact.path,
      confidence: "medium",
      description: "Artifact is executable outside the scripts or shell-script artifact class.",
    },
    {
      ruleId,
      severity: "warning",
      priority: "P2",
      confidence: "medium",
      title: "Executable package artifact appears outside scripts",
      message:
        "The skill package contains an executable asset or non-script artifact that should be reviewed.",
      suggestion:
        "Move executable logic into reviewed scripts, remove the executable bit, or document why the executable artifact is required.",
      rationale: "Package metadata marked a non-script artifact as executable.",
      counterevidence: [
        "Executable script artifacts are handled by command and package capability rules.",
      ],
    },
  );
};

const buildCapabilityFinding = (
  skillPackage: SkillPackage,
  fact: CapabilityFact,
  rule: Pick<
    SecurityRule,
    | "ruleId"
    | "severity"
    | "priority"
    | "confidence"
    | "title"
    | "message"
    | "suggestion"
    | "rationale"
    | "counterevidence"
  >,
  evidenceFacts: readonly CapabilityFact[] = [fact],
): Finding => ({
  ruleId: rule.ruleId,
  severity: rule.severity,
  category: "security",
  priority: rule.priority,
  title: rule.title,
  message: rule.message,
  suggestion: rule.suggestion,
  confidence: rule.confidence,
  rationale: rule.rationale,
  counterevidence: rule.counterevidence,
  ecosystem: skillPackage.skill.ecosystem,
  rootPath: skillPackage.skill.rootPath,
  skillDir: skillPackage.skill.skillDir,
  skillPath: skillPackage.skill.skillPath,
  skillName: readSkillName(skillPackage.skill),
  line: fact.line,
  evidence: fact.evidence,
  capabilities: [fact.kind],
  evidenceChain: {
    summary: fact.description ?? rule.rationale,
    items: evidenceFacts.map((evidenceFact) => ({
      path: evidenceFact.artifactPath,
      capability: evidenceFact.kind,
      startLine: evidenceFact.evidence?.startLine,
      endLine: evidenceFact.evidence?.endLine,
      excerpt: evidenceFact.evidence?.excerpt,
      note: evidenceFact.description,
    })),
  },
  agentRepairable: true,
});

const filterRules = (enabledRuleIds: readonly string[] | undefined): readonly SecurityRule[] => {
  if (enabledRuleIds === undefined) return SECURITY_RULES;
  const enabled = new Set(enabledRuleIds.flatMap(resolveRuleIdAlias));
  return SECURITY_RULES.filter((rule) => enabled.has(rule.ruleId));
};

const RULE_ID_ALIASES = new Map<string, SecurityRuleId>([
  ["prompt-injection-instruction", "SKILL001_PROMPT_OVERRIDE"],
  ["agent-safety-disablement", "SKILL002_PERMISSION_BYPASS"],
  ["secret-exfiltration-instruction", "SKILL004_EXFIL_CHAIN"],
  ["network-exfiltration-command", "SKILL004_EXFIL_CHAIN"],
  ["destructive-command-high-risk", "SKILL005_DESTRUCTIVE_COMMANDS"],
  ["remote-code-execution-bootstrap", "SKILL007_REMOTE_CODE_EXEC"],
  ["external-resource-obfuscation", "SKILL008_OBFUSCATION"],
]);

const resolveRuleIdAlias = (ruleId: string): readonly string[] => [
  RULE_ID_ALIASES.get(ruleId) ?? ruleId,
];

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

const findExfiltrationChainLine = (
  candidates: readonly MarkdownSecurityCandidate[],
): number | undefined =>
  findSecretExfiltrationInstructionLine(candidates) ??
  findNetworkExfiltrationCommandLine(candidates);

const hasBoundedExfiltrationEvidence = (candidate: MarkdownSecurityCandidate): boolean => {
  if (isPreventiveLine(candidate.text)) return false;
  if (isLocalSecretSetupOrVerificationLine(candidate.text)) return false;
  if (isPublicIssueConfirmationLine(candidate.text)) return false;
  if (!hasExfiltrationTransferAction(candidate)) return false;
  if (!hasSuspiciousExfiltrationDestination(candidate)) return false;
  return candidate.nearbyLines.some((line) => isTransferableSecretSourceLine(line.text));
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
  return candidate.nearbyLines.some((line) => isTransferableSecretSourceLine(line.text));
};

const isTransferableSecretSourceLine = (text: string): boolean =>
  SECRET_SOURCE_PATTERN.test(text) &&
  !isLocalSecretSetupOrVerificationLine(text) &&
  !isDestinationCredentialOnlyLine(text);

const isLocalSecretSetupOrVerificationLine = (text: string): boolean =>
  LOCAL_WEBHOOK_SECRET_SETUP_PATTERN.test(text);

const isDestinationCredentialOnlyLine = (text: string): boolean =>
  DESTINATION_CREDENTIAL_PATTERN.test(text) &&
  !/\b(cat|read|load|collect|print|echo|dump|upload|send|post|forward|transmit|exfiltrate)\b/i.test(
    text,
  );

const isPublicIssueConfirmationLine = (text: string): boolean =>
  PUBLIC_ISSUE_CONFIRMATION_PATTERN.test(text) && /\bissues?\b/i.test(text);

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

const isRemoteExecutionBootstrapLine = (line: MarkdownSecurityCandidate): boolean =>
  hasRemoteFetchToExecutionPipeline(line.commandContext) ||
  hasFetchedContentExecutionInstruction(line.text);

const hasRemoteFetchToExecutionPipeline = (context: CommandLineContext): boolean => {
  return context.commandGroups.some((group) => {
    const fetchSegment = group.commands.find(
      (command) =>
        command.action === "transfer" &&
        (command.destination === "external" || command.destination === "official-service-api"),
    );
    if (fetchSegment === undefined) return false;
    return group.commands.some(
      (command) =>
        command.sink === "execution" &&
        command.position > fetchSegment.position &&
        !isPipedIntoLocalScriptParser(group.sourceText, command),
    );
  });
};

const isPipedIntoLocalScriptParser = (
  sourceText: string,
  command: CommandSegmentContext,
): boolean => {
  if (command.sink !== "execution") return false;
  if (!hasLocalScriptOperand(command.text)) return false;
  return sourceText
    .split("|")
    .slice(1)
    .some((segment) => segment.trim().startsWith(command.text));
};

const hasLocalScriptOperand = (commandText: string): boolean => {
  const command = readCommandName(commandText);
  if (command === undefined) return false;
  const args = stripShellPrompt(commandText).slice(command.length).trimStart();
  return LOCAL_SCRIPT_OPERAND_PATTERN.test(args);
};

const hasFetchedContentExecutionInstruction = (text: string): boolean =>
  REMOTE_FETCH_TEXT_PATTERN.test(text) && FETCHED_CONTENT_EXECUTION_TEXT_PATTERN.test(text);

const isPreventiveLine = (text: string): boolean => PREVENTION_PATTERN.test(text);

const isHarmfulPromptIntentLine = (text: string): boolean =>
  !isOperationalConfirmationFlagLine(text) &&
  !isDefensiveUntrustedInstructionContentLine(text) &&
  ((PROMPT_CONFIRMATION_BYPASS_PATTERN.test(text) &&
    !DEFENSIVE_NEGATED_PROMPT_BYPASS_PATTERN.test(text)) ||
    PROMPT_CONTINUE_AFTER_DENIAL_PATTERN.test(text) ||
    (HIDE_LOGS_OUTPUT_PATTERN.test(text) &&
      !DEFENSIVE_NEGATED_LOG_CONCEALMENT_PATTERN.test(text)) ||
    (PROMPT_OVERRIDE_PATTERN.test(text) &&
      !DEFENSIVE_NEGATED_PROMPT_BYPASS_PATTERN.test(text) &&
      !isDefensivePromptInjectionLine(text)) ||
    (PROMPT_CONCEALMENT_PATTERN.test(text) && !DEFENSIVE_SECRET_DISCLOSURE_PATTERN.test(text)) ||
    HIDE_BEHAVIOR_PATTERN.test(text));

const isDefensivePromptInjectionLine = (text: string): boolean =>
  PROMPT_UNTRUSTED_CONTENT_PATTERN.test(text) &&
  PROMPT_INJECTION_TERM_PATTERN.test(text) &&
  DEFENSIVE_PROMPT_ACTION_PATTERN.test(text);

const isDefensivePromptIntentLine = (text: string): boolean =>
  isPreventiveLine(text) ||
  isOperationalConfirmationFlagLine(text) ||
  isDefensiveUntrustedInstructionContentLine(text) ||
  isDefensivePromptInjectionLine(text) ||
  DEFENSIVE_SECRET_DISCLOSURE_PATTERN.test(text) ||
  DEFENSIVE_CONFIRMATION_PATTERN.test(text) ||
  HIGHER_PRIORITY_INSTRUCTION_PRESERVATION_PATTERN.test(text);

const isOperationalConfirmationFlagLine = (text: string): boolean =>
  VERIFIED_CONFIRMATION_FLAG_PATTERN.test(text) || ASK_FIRST_OPERATIONAL_BYPASS_PATTERN.test(text);

const isDefensiveUntrustedInstructionContentLine = (text: string): boolean =>
  DEFENSIVE_UNTRUSTED_INSTRUCTION_CONTENT_PATTERN.test(text);

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
  const commandGroups = commandTexts.map((commandText) => ({
    sourceText: commandText,
    commands: readCommandSegments(commandText),
  }));
  const commands = commandGroups.flatMap((group) => group.commands);

  return {
    sourceText: commandTexts[0],
    commandGroups,
    commands,
    hasPipeline: commandGroups.some((group) => group.commands.length > 1),
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
    .split(/\s*(?:\||&&|;)\s*/)
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

const readSkillDescription = (skill: SkillRecord): string | undefined => {
  if (!skill.parseResult.ok) return undefined;
  const description = skill.parseResult.frontmatter.data.description;
  return typeof description === "string" && description.trim().length > 0 ? description : undefined;
};
