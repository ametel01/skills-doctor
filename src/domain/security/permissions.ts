import type { CapabilityIndicator, ContentLine } from "./detector-types.js";
import { firstMatchingIndicator } from "./detector-types.js";

const BYPASS_APPROVAL_PATTERN =
  /(?:^|[\s`"'])(--yolo|--dangerously-skip-permissions|dangerously-skip-permissions|bypassPermissions|dontAsk|auto approve|auto-approve|skipDangerousModePermissionPrompt|skip permissions|disable sandbox|without confirmation|avoid approval|bypass approval)\b/i;
const BROAD_TOOL_PATTERN =
  /\ballowed-tools\s*:\s*.*\b(Bash|Write|Edit|WebFetch|Agent|mcp__\*)\b|\bmcp__\*\b|\b(Bash|Write|Edit|WebFetch|Agent)\b.{0,80}\bwithout narrowing|broad file\/network tools?\b/i;
const MCP_PATTERN =
  /\b(mcp__\*|mcpServers|\.mcp\.json|oauth scopes?|redirect_uris?|client_secret|authorization_endpoint|token_endpoint)\b/i;
const SELF_MODIFYING_PATTERN =
  /\b(edit|modify|rewrite|update|patch|append|replace)\b.{0,120}\b(this skill|SKILL\.md|scripts\/|references\/|assets\/|\.agents\/skills|registry metadata|skill registry)\b|\b(this skill|SKILL\.md|scripts\/|references\/|assets\/|\.agents\/skills|registry metadata|skill registry)\b.{0,120}\b(edit|modify|rewrite|update|patch|append|replace)\b/i;

export const findPermissionIndicators = (
  lines: readonly ContentLine[],
): readonly CapabilityIndicator[] => {
  const indicators = [
    firstMatchingIndicator(
      lines,
      "bypasses_approval",
      "high",
      "Disables sandboxing, permissions, confirmations, or approval prompts.",
      BYPASS_APPROVAL_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "broad_tool_access",
      "medium",
      "Grants or requests broad tool access without clear narrowing.",
      BROAD_TOOL_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "mcp_access",
      "medium",
      "References MCP tool access, MCP server configuration, or OAuth scope metadata.",
      MCP_PATTERN,
    ),
    firstMatchingIndicator(
      lines,
      "self_modifies",
      "medium",
      "Instructs the agent to modify the skill package or skill registry.",
      SELF_MODIFYING_PATTERN,
    ),
  ];
  return indicators.filter(
    (indicator): indicator is CapabilityIndicator => indicator !== undefined,
  );
};
