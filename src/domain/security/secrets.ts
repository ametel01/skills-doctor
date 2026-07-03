import type { CapabilityIndicator, ContentLine } from "./detector-types.js";
import { firstMatchingIndicator } from "./detector-types.js";

const SECRET_READ_PATTERN =
  /\b(cat|read|load|open|print|dump|copy|collect|grep|rg)\b.{0,120}\b(\.env(?:\b|[._-])|secrets?\/|credentials\.json|~\/\.ssh|\.aws\b|\.gcloud\b|keychains?|browser profiles?|npm tokens?|github tokens?|openai api keys?|anthropic api keys?|private keys?|session files?)\b|\b(\.env(?:\b|[._-])|secrets?\/|credentials\.json|~\/\.ssh|\.aws\b|\.gcloud\b|keychains?|browser profiles?|npm tokens?|github tokens?|openai api keys?|anthropic api keys?|private keys?|session files?)\b.{0,120}\b(cat|read|load|open|print|dump|copy|collect|grep|rg)\b/i;
const SECRET_VALUE_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|(?:secret|token|api[_-]?key|private[_-]?key|password)\s*[:=]\s*["']?[^\s"']{12,})/i;

export const findSecretIndicators = (
  lines: readonly ContentLine[],
): readonly CapabilityIndicator[] => {
  const indicators = [
    firstMatchingIndicator(
      lines,
      "reads_secrets",
      "high",
      "Reads or loads local secret-bearing files or credential stores.",
      SECRET_READ_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "reads_secrets",
      "medium",
      "Contains a secret-looking literal value.",
      SECRET_VALUE_PATTERN,
    ),
  ];
  return indicators.filter(
    (indicator): indicator is CapabilityIndicator => indicator !== undefined,
  );
};

export const redactSecretValues = (text: string): string =>
  text.replace(
    /\b((?:secret|token|api[_-]?key|private[_-]?key|password)\s*[:=]\s*["']?)([^\s"']+)/gi,
    "$1[REDACTED]",
  );
