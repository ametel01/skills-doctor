import type { CapabilityIndicator, ContentLine } from "./detector-types.js";
import { firstMatchingIndicator } from "./detector-types.js";

const NETWORK_EGRESS_PATTERN =
  /\b(curl|wget|fetch|requests\.(?:get|post|put)|axios\.(?:get|post|put)|httpx\.|urllib|nc|netcat|scp|rsync|webhooks?|slack\.com\/api|discord(?:app)?\.com\/api|api\.telegram\.org|pastebin\.com|gist\.github\.com|ngrok|cloudflared)\b|https?:\/\/[^\s`"')]+/i;
const EXTERNAL_DEPENDENCY_PATTERN =
  /\b(npm install|pnpm add|yarn add|bun add|pip install|pipx run|uvx|brew install|docker pull|git clone|go install)\b.{0,160}\b(latest|main|master|HEAD|https?:\/\/|github\.com|gitlab\.com)\b|\b(fetch|download|load|read|trust)\b.{0,120}\b(remote markdown|remote prompt|remote docs?|https?:\/\/)/i;

export const findNetworkIndicators = (
  lines: readonly ContentLine[],
): readonly CapabilityIndicator[] => {
  const indicators = [
    firstMatchingIndicator(
      lines,
      "network_egress",
      "medium",
      "Uses network egress, external URLs, webhooks, sockets, or tunneling tools.",
      NETWORK_EGRESS_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "external_dependency",
      "medium",
      "Uses an external dependency, unpinned package fetch, arbitrary clone, or remote content.",
      EXTERNAL_DEPENDENCY_PATTERN,
    ),
  ];
  return indicators.filter(
    (indicator): indicator is CapabilityIndicator => indicator !== undefined,
  );
};
