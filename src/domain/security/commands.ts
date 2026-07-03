import type { CapabilityIndicator, ContentLine } from "./detector-types.js";
import { firstMatchingIndicator } from "./detector-types.js";

const REMOTE_CODE_EXEC_PATTERN =
  /\b(curl|wget|irm|iwr)\b.{0,160}(?:\||;|&&).{0,80}\b(sh|bash|zsh|fish|iex|powershell|pwsh|python|node|bun)\b|\b(eval|exec)\s*\(|subprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*true|child_process\.(?:exec|spawn)\(|import\(\s*["']https?:\/\/|base64\b.{0,120}\b(decode|--decode|-d)\b.{0,120}\b(sh|bash|eval|exec|node|python)\b/i;
const DESTRUCTIVE_COMMAND_PATTERN =
  /\b(rm\s+-rf|find\b.{0,80}-delete|chmod\s+-R\s+777|chown\s+-R|dd\s+if=|mkfs\b|docker\s+system\s+prune|kubectl\s+delete|terraform\s+destroy|drop\s+database|git\s+push\s+--force|gh\s+repo\s+delete)\b/i;
const PERSISTENCE_PATTERN =
  /\b(\.bashrc|\.zshrc|\.profile|\.bash_profile|crontab|cron\.d|launch agents?|launchd|systemd|git hooks?|\.git\/hooks|npm\s+postinstall|postinstall|setup\.py|pyproject\.toml|vscode tasks?|\.vscode\/tasks\.json|auto-?start)\b/i;

export const findCommandIndicators = (
  lines: readonly ContentLine[],
): readonly CapabilityIndicator[] => {
  const indicators = [
    firstMatchingIndicator(
      lines,
      "remote_code_exec",
      "high",
      "Fetches or decodes content and reaches an execution sink.",
      REMOTE_CODE_EXEC_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "destructive_action",
      "high",
      "Contains a broad destructive command or irreversible infrastructure action.",
      DESTRUCTIVE_COMMAND_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "persistence",
      "high",
      "Touches persistence locations such as shell startup files, hooks, cron, or service managers.",
      PERSISTENCE_PATTERN,
    ),
  ];
  return indicators.filter(
    (indicator): indicator is CapabilityIndicator => indicator !== undefined,
  );
};
