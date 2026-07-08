import type { SkillCleanupAction, SkillCleanupRecommendation } from "./analyze-skill-usage.js";
import type { ScanReport, ScanReportUsage } from "./build-report.js";

export type BuildCleanupHandoffPromptInput = {
  readonly report: ScanReport;
  readonly recommendations?: readonly SkillCleanupRecommendation[] | undefined;
  readonly reportDirectory?: string | undefined;
};

export const buildCleanupHandoffPrompt = (input: BuildCleanupHandoffPromptInput): string => {
  const usage = requireUsage(input.report);
  const recommendations = input.recommendations ?? usage.topRecommendations;
  const selectedActions = new Set(recommendations.map((recommendation) => recommendation.action));
  const disableOnly = selectedActions.size === 1 && selectedActions.has("disable-candidate");
  const lines = [
    disableOnly
      ? "Clean up Agent Skills context pressure using the Skills Doctor usage report."
      : "Fix selected Agent Skills usage recommendations using the Skills Doctor usage report.",
    "",
    `Project root: ${input.report.directory}`,
    `Scanned roots: ${input.report.scannedRoots.map((root) => `${root.ecosystem}: ${root.rootPath}`).join("; ")}`,
    `Skills analyzed: ${usage.totalSkillsAnalyzed}`,
    `Usage: ${usage.usedSkillCount} used, ${usage.unusedSkillCount} unused, ${usage.unknownSkillCount} unknown`,
    `Coverage: ${usage.coverageStatus}`,
    `Context budget pressure: ${usage.contextPressure.level}`,
  ];

  if (input.reportDirectory !== undefined) {
    lines.push(`Usage report directory: ${input.reportDirectory}`);
  } else {
    lines.push("Usage report directory: unavailable; use the inline summary below.");
  }

  if (disableOnly) {
    lines.push(
      "",
      "Cleanup rules:",
      "- Inspect the usage report first.",
      "- Preserve frequently used and recently used skills.",
      "- Preserve project-local skills unless there is strong evidence and clear user intent.",
      "- Do not delete skills.",
      "- Only disable selected high-confidence enabled skills with a `disable-candidate` recommendation.",
      "- Disable only the selected skills listed below; leave other cleanup candidates unchanged.",
      "- Do not modify skills recommended as keep, review, shorten-description, or merge-candidate.",
      "- Preserve review items, unknown-coverage items, incomplete-coverage items, disabled-but-used recovery warnings, and disabled-used items.",
      "- Do not move skill directories.",
      "- For unused global/plugin skills, disable them the same way Codex `/skills` does: add or update `[[skills.config]]` entries in `~/.codex/config.toml` with the skill `path` and `enabled = false`.",
      "- Re-enable skills by using Codex `/skills` or removing the matching disabled config entry.",
      "- Restart Codex or start a fresh session after config changes so the disabled skill list is reloaded.",
      "- Do not delete skills solely because usage is unknown.",
      "- Do not expose raw Codex logs or transcript text.",
      "- Verify by rerunning `npx skills-doctor@latest` after changes.",
      "",
      "Selected unused skills to disable:",
    );
  } else {
    lines.push(
      "",
      "Usage repair rules:",
      "- Inspect the usage report first.",
      "- Work only on the selected usage recommendations listed below.",
      "- Preserve unrelated user changes and existing skill intent.",
      "- Preserve frequently used and recently used skills unless the selected recommendation explicitly targets context reduction.",
      "- Preserve review items, unknown-coverage items, incomplete-coverage items, disabled-but-used recovery warnings, and disabled-used items unless one is explicitly selected for review-only work.",
      "- Do not delete skill directories.",
      "- Do not disable skills unless the selected recommendation action is `disable-candidate`.",
      "- Do not expose raw Codex logs or transcript text.",
      "- Verify by rerunning `npx skills-doctor@latest --usage` after changes.",
      "",
      "Action-specific instructions:",
      ...formatActionInstructions(selectedActions),
      "",
      "Selected usage recommendations to fix:",
    );
  }

  for (const recommendation of recommendations) {
    lines.push(
      `- ${recommendation.action} ${recommendation.skillName}`,
      `  Path: ${recommendation.skillPath}`,
      `  Reason: ${recommendation.reason}`,
      ...formatSelectedUsageEvidence(usage, recommendation.skillPath),
    );
  }
  if (recommendations.length === 0) {
    lines.push("- No unused disable candidates were selected.");
  }

  lines.push(
    "",
    disableOnly
      ? "Make only reversible Codex skills-config disable changes, then stop and report what changed."
      : "Work through the selected usage recommendations in bulk, then stop and report what changed.",
  );

  return lines.join("\n");
};

const formatSelectedUsageEvidence = (
  usage: ScanReportUsage,
  skillPath: string,
): readonly string[] => {
  const skill = usage.skillsByUsage.find((candidate) => candidate.skillPath === skillPath);
  if (skill === undefined) return [];
  return [
    `  Enabled: ${skill.enabled ? "true" : "false"}`,
    `  Coverage: ${skill.coverageStatus}`,
    `  Recent uses: ${skill.recentUsageCount}`,
    `  Last used: ${skill.lastUsedAt ?? "never"}`,
    `  Evidence kind: ${skill.lastEvidenceKind ?? "none"}`,
  ];
};

const formatActionInstructions = (actions: ReadonlySet<SkillCleanupAction>): readonly string[] => {
  const lines: string[] = [];
  if (actions.has("disable-candidate")) {
    lines.push(
      "- `disable-candidate`: make only reversible Codex skills-config disable changes in `~/.codex/config.toml`; do not delete or move skill directories.",
    );
  }
  if (actions.has("shorten-description")) {
    lines.push(
      "- `shorten-description`: reduce context-heavy skill descriptions or inline guidance while preserving trigger specificity and required workflow details; move large examples or reference material into progressively disclosed files when needed.",
    );
  }
  if (actions.has("merge-candidate")) {
    lines.push(
      "- `merge-candidate`: inspect same-name skills for overlap and propose or perform only conservative consolidation that preserves distinct ecosystems, plugin ownership, and user intent.",
    );
  }
  if (actions.has("review")) {
    lines.push(
      "- `review`: inspect older or low-confidence usage before changing anything; prefer leaving the skill enabled and documenting the reason when evidence is inconclusive.",
    );
  }
  return lines;
};

const requireUsage = (report: ScanReport): ScanReportUsage => {
  if (report.usage === undefined) {
    throw new Error("Cleanup handoff requires usage analysis.");
  }
  return report.usage;
};
