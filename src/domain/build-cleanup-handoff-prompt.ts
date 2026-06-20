import type { ScanReport, ScanReportUsage } from "./build-report.js";

export type BuildCleanupHandoffPromptInput = {
  readonly report: ScanReport;
  readonly reportDirectory?: string | undefined;
};

export const buildCleanupHandoffPrompt = (input: BuildCleanupHandoffPromptInput): string => {
  const usage = requireUsage(input.report);
  const lines = [
    "Clean up Agent Skills context pressure using the Skills Doctor usage report.",
    "",
    `Project root: ${input.report.directory}`,
    `Scanned roots: ${input.report.scannedRoots.map((root) => `${root.ecosystem}: ${root.rootPath}`).join("; ")}`,
    `Skills analyzed: ${usage.totalSkillsAnalyzed}`,
    `Usage: ${usage.usedSkillCount} used, ${usage.unusedSkillCount} unused, ${usage.unknownSkillCount} unknown`,
    `Context budget pressure: ${usage.contextPressure.level}`,
  ];

  if (input.reportDirectory !== undefined) {
    lines.push(`Usage report directory: ${input.reportDirectory}`);
  } else {
    lines.push("Usage report directory: unavailable; use the inline summary below.");
  }

  lines.push(
    "",
    "Cleanup rules:",
    "- Inspect the usage report first.",
    "- Preserve frequently used and recently used skills.",
    "- Preserve project-local skills unless there is strong evidence and clear user intent.",
    "- Do not delete skills.",
    "- Only disable skills with a `disable-candidate` recommendation.",
    "- Do not modify skills recommended as keep, review, shorten-description, or merge-candidate.",
    "- Do not move skill directories.",
    "- For unused global/plugin skills, disable them the same way Codex `/skills` does: add or update `[[skills.config]]` entries in `~/.codex/config.toml` with the skill `path` and `enabled = false`.",
    "- Re-enable skills by using Codex `/skills` or removing the matching disabled config entry.",
    "- Restart Codex or start a fresh session after config changes so the disabled skill list is reloaded.",
    "- Do not delete skills solely because usage is unknown.",
    "- Do not expose raw Codex logs or transcript text.",
    "- Verify by rerunning `npx skills-doctor@latest` after changes.",
    "",
    "Unused skills to disable:",
  );

  for (const recommendation of usage.topRecommendations.slice(0, 20)) {
    lines.push(
      `- ${recommendation.action} ${recommendation.skillName}`,
      `  Path: ${recommendation.skillPath}`,
      `  Reason: ${recommendation.reason}`,
    );
  }
  if (usage.topRecommendations.length === 0) {
    lines.push("- No unused disable candidates were produced.");
  }

  lines.push(
    "",
    "Make only reversible Codex skills-config disable changes, then stop and report what changed.",
  );

  return lines.join("\n");
};

const requireUsage = (report: ScanReport): ScanReportUsage => {
  if (report.usage === undefined) {
    throw new Error("Cleanup handoff requires usage analysis.");
  }
  return report.usage;
};
