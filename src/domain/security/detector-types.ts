import type { CapabilityKind, FindingConfidence } from "../types.js";

export type CapabilityIndicator = {
  readonly kind: CapabilityKind;
  readonly confidence: FindingConfidence;
  readonly line: number;
  readonly description: string;
};

export type ContentLine = {
  readonly number: number;
  readonly text: string;
};

export const readContentLines = (content: string): readonly ContentLine[] =>
  content.split(/\r?\n/).map((text, index) => ({ number: index + 1, text }));

export const firstMatchingIndicator = (
  lines: readonly ContentLine[],
  kind: CapabilityKind,
  confidence: FindingConfidence,
  description: string,
  pattern: RegExp,
): CapabilityIndicator | undefined => {
  const line = lines.find((candidate) => pattern.test(candidate.text));
  if (line === undefined) return undefined;
  return {
    kind,
    confidence,
    line: line.number,
    description,
  };
};
