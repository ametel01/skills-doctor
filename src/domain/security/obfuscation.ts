import type { CapabilityIndicator, ContentLine } from "./detector-types.js";
import { firstMatchingIndicator } from "./detector-types.js";

const LONG_BASE64_PATTERN = /(?:[A-Za-z0-9+/]{120,}={0,2})/;
const LONG_HEX_PATTERN = /\b(?:[0-9a-fA-F]{160,}|(?:\\x[0-9a-fA-F]{2}){40,})\b/;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/;
const HIDDEN_HTML_INSTRUCTION_PATTERN =
  /<!--.{0,240}\b(ignore previous|override instructions|do not tell|hide this|bypass safety)\b.{0,240}-->/i;
const MINIFIED_JS_PATTERN =
  /\b(function|=>|eval|atob)\b.{240,};.{80,}(?:document|fetch|XMLHttpRequest|child_process|process\.env)/;

export const findObfuscationIndicators = (
  lines: readonly ContentLine[],
): readonly CapabilityIndicator[] => {
  const indicators = [
    firstMatchingIndicator(
      lines,
      "obfuscation",
      "medium",
      "Contains a long base64-looking blob.",
      LONG_BASE64_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "obfuscation",
      "medium",
      "Contains a long hex or escaped-hex blob.",
      LONG_HEX_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "obfuscation",
      "medium",
      "Contains zero-width Unicode characters.",
      ZERO_WIDTH_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "obfuscation",
      "medium",
      "Contains hidden HTML comments with instruction-like content.",
      HIDDEN_HTML_INSTRUCTION_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "obfuscation",
      "medium",
      "Contains minified JavaScript with sensitive execution or network indicators.",
      MINIFIED_JS_PATTERN,
    ),
  ];
  return indicators.filter(
    (indicator): indicator is CapabilityIndicator => indicator !== undefined,
  );
};
