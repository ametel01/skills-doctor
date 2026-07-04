import type { ScanReport } from "./build-report.js";
import { groupFindingsByKey } from "./group-findings.js";
import type { Finding, SkillRoot } from "./types.js";

const MAX_INLINE_GROUPS = 5;
const MAX_INLINE_FINDINGS_PER_GROUP = 3;

export type BuildHandoffPromptInput = {
  readonly report: ScanReport;
  readonly findings: readonly Finding[];
  readonly reportDirectory?: string | undefined;
};

export const buildHandoffPrompt = (input: BuildHandoffPromptInput): string => {
  const selectedFindings = sortFindings(input.findings);
  const groups = groupFindingsBySkill(selectedFindings).slice(0, MAX_INLINE_GROUPS);
  const selectedSkillCount = new Set(selectedFindings.map((finding) => finding.skillPath)).size;
  const inlineFindingCount = groups.reduce(
    (count, group) => count + group.findings.slice(0, MAX_INLINE_FINDINGS_PER_GROUP).length,
    0,
  );
  const omittedFindingCount = Math.max(0, selectedFindings.length - inlineFindingCount);

  const lines = [
    "Fix the selected Agent Skills findings in this repository.",
    "",
    `Project root: ${input.report.directory}`,
    `Selected roots: ${formatRoots(input.report.scannedRoots)}`,
    `Selected findings: ${selectedFindings.length} across ${selectedSkillCount} skill${selectedSkillCount === 1 ? "" : "s"}`,
  ];

  if (input.reportDirectory !== undefined) {
    lines.push(`Full findings report: ${input.reportDirectory}`);
  } else {
    lines.push("Full findings report: unavailable; use the inline findings below.");
  }

  lines.push(
    "",
    "Repair rules grounded in docs/SKILLS_SPEC.md:",
    "- Treat findings as static analyzer diagnostics, not definitive proof that the skill is broken or malicious.",
    "- Use judgment before editing: inspect the cited files, evidence, confidence, rationale, and counterevidence, then decide whether each finding is real, partially applicable, or a false positive.",
    "- Fix real issues with the smallest skill-spec-aligned change; leave likely false positives or intentionally acceptable patterns unchanged and explain that decision in your final report.",
    "- Preserve unrelated user changes and existing skill intent.",
    "- Edit skill files directly; do not invent new requirements outside the skill spec.",
    "- Keep SKILL.md concise and move large examples, scripts, and references into progressively disclosed files.",
    "- Ensure frontmatter has a valid kebab-case name and a specific trigger-oriented description.",
    "- Make referenced resources/scripts real, deterministic, non-interactive by default, and safe for agents.",
    "- Verify by rerunning `skills-doctor` or an equivalent scan after edits.",
    "",
    "Top grouped findings:",
  );

  for (const [index, group] of groups.entries()) {
    lines.push(
      "",
      `${index + 1}. ${group.skillLabel} (${group.findings.length} finding${group.findings.length === 1 ? "" : "s"})`,
      `   File: ${group.skillPath}`,
    );
    for (const finding of group.findings.slice(0, MAX_INLINE_FINDINGS_PER_GROUP)) {
      lines.push(
        `   - [${finding.severity}] ${finding.ruleId}: ${finding.title}`,
        `     ${formatFindingLocation(finding)}`,
        `     ${finding.message}`,
        ...formatFindingMetadata(finding),
        `     Repair: ${finding.suggestion}`,
      );
      if (finding.evidence !== undefined) {
        lines.push("     Evidence:");
        for (const line of finding.evidence.excerpt) {
          const marker = line.highlighted ? ">" : " ";
          lines.push(`     ${marker} ${line.line}: ${line.text}`);
        }
      }
    }
    const omittedInGroup = group.findings.length - MAX_INLINE_FINDINGS_PER_GROUP;
    if (omittedInGroup > 0) {
      lines.push(`   - ${omittedInGroup} more finding${omittedInGroup === 1 ? "" : "s"} in report`);
    }
  }

  if (omittedFindingCount > 0) {
    lines.push(
      "",
      `${omittedFindingCount} additional finding${omittedFindingCount === 1 ? "" : "s"} omitted inline; read the full report before finishing.`,
    );
  }

  lines.push("", "Work through the selected findings, then stop and report what changed.");

  return lines.join("\n");
};

const formatRoots = (roots: readonly SkillRoot[]): string =>
  roots.map((root) => `${root.ecosystem}: ${root.rootPath}`).join("; ");

type FindingGroup = {
  readonly skillLabel: string;
  readonly skillPath: string;
  readonly findings: readonly Finding[];
};

const groupFindingsBySkill = (findings: readonly Finding[]): readonly FindingGroup[] => {
  return groupFindingsByKey(findings, (finding) => finding.skillPath)
    .map((group) => ({
      skillPath: group.key,
      skillLabel: group.findings[0]?.skillName ?? group.key,
      findings: sortFindings(group.findings),
    }))
    .sort(
      (left, right) =>
        severityScore(right.findings[0]) - severityScore(left.findings[0]) ||
        right.findings.length - left.findings.length ||
        left.skillPath.localeCompare(right.skillPath),
    );
};

const sortFindings = (findings: readonly Finding[]): readonly Finding[] =>
  findings.toSorted(
    (left, right) =>
      severityScore(right) - severityScore(left) ||
      left.skillPath.localeCompare(right.skillPath) ||
      left.ruleId.localeCompare(right.ruleId),
  );

const severityScore = (finding: Finding | undefined): number => {
  if (finding?.severity === "error") return 3;
  if (finding?.severity === "warning") return 2;
  if (finding?.severity === "advice") return 1;
  return 0;
};

const formatFindingLocation = (finding: Finding): string =>
  `Location: ${finding.skillPath}${finding.line === undefined ? "" : `:${finding.line}`}`;

const formatFindingMetadata = (finding: Finding): readonly string[] => {
  const lines: string[] = [];
  if (finding.confidence !== undefined) {
    lines.push(`     Confidence: ${finding.confidence}`);
  }
  if (finding.rationale !== undefined) {
    lines.push(`     Rationale: ${finding.rationale}`);
  }
  if (finding.counterevidence !== undefined && finding.counterevidence.length > 0) {
    lines.push("     Counterevidence:");
    for (const item of finding.counterevidence) {
      lines.push(`     - ${item}`);
    }
  }
  return lines;
};
