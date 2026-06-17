import path from "node:path";
import type { ScanReport } from "../../domain/build-report.js";
import { buildScanReport } from "../../domain/build-report.js";
import { compareFindings, renderPostHandoffSummary } from "../../domain/compare-findings.js";
import { discoverSkillRoots } from "../../domain/discover-skill-roots.js";
import { scanSkillRoots } from "../../domain/scan-skills.js";
import { renderHumanSummary, resolveScanExitCode } from "../../domain/summarize-findings.js";
import type { Diagnostic, Finding, SkillRoot } from "../../domain/types.js";
import { CliInputError } from "../utils/handle-error.js";
import { prepareRepairHandoff } from "../utils/handoff-to-agent.js";
import { enableJsonMode, writeJsonReport } from "../utils/json-mode.js";
import type { AgentAvailabilityProbe, RepairAgentLauncher } from "../utils/launch-agent.js";
import {
  chooseRepairAgent,
  formatRepairAgentPreview,
  launchRepairAgent,
} from "../utils/launch-agent.js";
import { inquirerPromptAdapter, type PromptAdapter } from "../utils/prompts.js";
import { printScoreHeader } from "../utils/render-score-header.js";
import { shouldSkipPrompts } from "../utils/should-skip-prompts.js";
import { createSpinner, type SpinnerFactory } from "../utils/spinner.js";

export type ScanFlags = {
  readonly json?: boolean;
  readonly jsonCompact?: boolean;
  readonly yes?: boolean;
};

export type ScanActionOptions = {
  readonly cwd?: string;
  readonly homeDir?: string | undefined;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdinIsTty?: boolean;
  readonly prompts?: PromptAdapter;
  readonly writeStdout?: (message: string) => void;
  readonly writeStderr?: (message: string) => void;
  readonly stdoutIsTty?: boolean;
  readonly terminalColumns?: number | undefined;
  readonly animateScoreHeader?: boolean;
  readonly spinner?: SpinnerFactory;
  readonly version?: string;
  readonly now?: () => number;
  readonly isRepairAgentAvailable?: AgentAvailabilityProbe;
  readonly repairReportOutputRoot?: string;
  readonly repairReportTimestamp?: string;
  readonly launchAgent?: RepairAgentLauncher;
};

type RootSelection = "all" | "claude" | "codex" | "custom";
type RootScopeSelection = "all" | "local" | "global" | "custom";
type ReviewAction = "all" | "errors" | "by-skill" | "repair" | "exit";
type RootSelectionResult = {
  readonly roots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
};

export const scanAction = async (
  directory: string,
  flags: ScanFlags,
  options: ScanActionOptions = {},
): Promise<ScanReport> => {
  const cwd = path.resolve(options.cwd ?? process.cwd(), directory);
  const prompts = options.prompts ?? inquirerPromptAdapter;
  const writeStdout = options.writeStdout ?? ((message) => process.stdout.write(message));
  const writeStderr = options.writeStderr ?? ((message) => process.stderr.write(message));
  const stdoutIsTty = options.stdoutIsTty ?? process.stdout.isTTY === true;
  const now = options.now ?? performance.now.bind(performance);
  const skipPrompts = shouldSkipPrompts({
    yes: Boolean(flags.yes),
    json: Boolean(flags.json),
    env: options.env,
    stdinIsTty: options.stdinIsTty ?? process.stdin.isTTY,
  });
  const spinner =
    options.spinner ??
    createSpinner({
      enabled: !skipPrompts && !flags.json,
      write: (message) => writeStderr(`${message}\n`),
    });

  if (flags.json) {
    enableJsonMode({ compact: Boolean(flags.jsonCompact), directory: cwd });
  }

  const discovered = await spinner.run("Finding local skill roots...", () =>
    discoverSkillRoots({ cwd, homeDir: options.homeDir }),
  );
  let roots = discovered.roots;
  const diagnostics: Diagnostic[] = [...discovered.diagnostics];

  if (roots.length === 0) {
    if (skipPrompts) {
      throw new CliInputError(
        "No .claude/skills or .agents/skills root was found. Re-run interactively or add a supported skills root.",
      );
    }
    const selection = await selectCustomRoot({
      cwd,
      homeDir: options.homeDir,
      prompts,
      roots,
    });
    roots = selection.roots;
    diagnostics.push(...selection.diagnostics);
  } else if (!skipPrompts) {
    const scopeSelection = await selectRootScopes({
      roots,
      prompts,
      cwd,
      homeDir: options.homeDir,
    });
    roots = scopeSelection.roots;
    diagnostics.push(...scopeSelection.diagnostics);
    const rootSelection = await selectRoots({
      roots,
      prompts,
      cwd,
      homeDir: options.homeDir,
    });
    roots = rootSelection.roots;
    diagnostics.push(...rootSelection.diagnostics);
  }

  if (roots.length === 0) {
    throw new CliInputError("No readable skills root was selected.");
  }

  const startedAt = now();
  const scan = await spinner.run("Scanning skills...", () =>
    scanSkillRoots({ roots, diagnostics }),
  );
  const elapsedMilliseconds = Math.max(0, Math.round(now() - startedAt));
  const report = buildScanReport({
    version: options.version ?? "0.0.0",
    directory: cwd,
    elapsedMilliseconds,
    scan,
  });
  let finalReport = report;

  if (flags.json) {
    writeJsonReport(report, writeStdout);
  } else {
    await printScoreHeader({
      score: report.score,
      write: writeStdout,
      color: stdoutIsTty,
      columns: options.terminalColumns ?? process.stdout.columns,
      animate: options.animateScoreHeader ?? (!skipPrompts && stdoutIsTty),
    });
    writeStdout(renderHumanSummary(report, { includeScore: false }));
    if (!skipPrompts && report.findingCount > 0) {
      finalReport =
        (await reviewFindings(report, {
          cwd,
          roots,
          version: options.version ?? "0.0.0",
          spinner,
          prompts,
          write: writeStdout,
          isRepairAgentAvailable: options.isRepairAgentAvailable,
          now,
          repairReportOutputRoot: options.repairReportOutputRoot,
          repairReportTimestamp: options.repairReportTimestamp,
          launchAgent: options.launchAgent ?? launchRepairAgent,
        })) ?? report;
    }
  }

  process.exitCode = resolveScanExitCode(finalReport);
  return finalReport;
};

const selectRoots = async (input: {
  readonly roots: readonly SkillRoot[];
  readonly prompts: PromptAdapter;
  readonly cwd: string;
  readonly homeDir?: string | undefined;
}): Promise<RootSelectionResult> => {
  const { prompts, cwd, homeDir, roots } = input;
  const customRoots = roots.filter((root) => root.source === "custom");
  const standardRoots = roots.filter((root) => root.source !== "custom");
  const hasClaude = standardRoots.some((root) => root.ecosystem === "claude");
  const hasCodex = standardRoots.some((root) => root.ecosystem === "codex");
  if (!hasClaude || !hasCodex) return { roots, diagnostics: [] };

  const selection = await prompts.select<RootSelection>("Choose skills folder to scan", [
    { name: "Both", value: "all" },
    { name: "Claude (.claude/skills)", value: "claude" },
    { name: "Codex/agents (.agents/skills)", value: "codex" },
    { name: "Add custom skills path", value: "custom" },
  ]);

  if (selection === "all") return { roots, diagnostics: [] };
  if (selection === "custom") {
    return selectCustomRoot({
      cwd,
      homeDir,
      prompts,
      roots,
    });
  }
  return {
    roots: [...standardRoots.filter((root) => root.ecosystem === selection), ...customRoots],
    diagnostics: [],
  };
};

const selectRootScopes = async (input: {
  readonly roots: readonly SkillRoot[];
  readonly prompts: PromptAdapter;
  readonly cwd: string;
  readonly homeDir?: string | undefined;
}): Promise<RootSelectionResult> => {
  const { prompts, cwd, homeDir, roots } = input;
  const hasLocal = roots.some((root) => root.source === "local");
  const hasGlobal = roots.some((root) => root.source === "global");
  const hasBothScopes = hasLocal && hasGlobal;
  if (!hasLocal && !hasGlobal) return { roots, diagnostics: [] };
  const allLabel = hasBothScopes
    ? "Both local project and global/root skills"
    : "Detected skills root";

  const choices: { name: string; value: RootSelection | RootScopeSelection }[] = [
    { name: allLabel, value: "all" },
  ];
  if (hasBothScopes) {
    choices.push({
      name: "Local project skills (./.claude/skills, ./.agents/skills)",
      value: "local",
    });
    choices.push({
      name: "Global/root skills (~/.claude/skills, ~/.agents/skills)",
      value: "global",
    });
  }
  choices.push({ name: "Add custom skills path", value: "custom" });

  if (choices.length <= 1) {
    return { roots, diagnostics: [] };
  }

  const selection = await prompts.select<RootSelection | RootScopeSelection>(
    "Choose skills scope to scan",
    choices,
  );
  if (selection === "custom") {
    return selectCustomRoot({
      cwd,
      homeDir,
      prompts,
      roots,
    });
  }
  if (selection === "all") return { roots, diagnostics: [] };
  if (selection === "claude") {
    return { roots: roots.filter((root) => root.ecosystem === "claude"), diagnostics: [] };
  }
  if (selection === "codex") {
    return { roots: roots.filter((root) => root.ecosystem === "codex"), diagnostics: [] };
  }
  if (selection === "local" || selection === "global") {
    return { roots: roots.filter((root) => root.source === selection), diagnostics: [] };
  }
  return { roots, diagnostics: [] };
};

const selectCustomRoot = async (input: {
  readonly roots: readonly SkillRoot[];
  readonly cwd: string;
  readonly homeDir?: string | undefined;
  readonly prompts: PromptAdapter;
}): Promise<RootSelectionResult> => {
  const customRoot = await input.prompts.input("Skills directory path", ".");
  const custom = await discoverSkillRoots({
    cwd: input.cwd,
    homeDir: input.homeDir,
    customRoots: [{ rootPath: customRoot, ecosystem: "custom" }],
  });
  return {
    roots: mergeRoots(input.roots, custom.roots),
    diagnostics: custom.diagnostics,
  };
};

const mergeRoots = (
  existingRoots: readonly SkillRoot[],
  additionalRoots: readonly SkillRoot[],
): readonly SkillRoot[] => {
  const merged = new Map<string, SkillRoot>();
  for (const root of existingRoots) {
    merged.set(root.rootPath, root);
  }
  for (const root of additionalRoots) {
    if (!merged.has(root.rootPath)) {
      merged.set(root.rootPath, root);
    }
  }
  return [...merged.values()];
};

type ReviewFindingsInput = {
  readonly cwd: string;
  readonly roots: readonly SkillRoot[];
  readonly version: string;
  readonly spinner: SpinnerFactory;
  readonly prompts: PromptAdapter;
  readonly write: (message: string) => void;
  readonly isRepairAgentAvailable?: AgentAvailabilityProbe | undefined;
  readonly now?: () => number;
  readonly repairReportOutputRoot?: string | undefined;
  readonly repairReportTimestamp?: string | undefined;
  readonly launchAgent: RepairAgentLauncher;
};

const reviewFindings = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  const { prompts, write } = input;
  while (true) {
    const action = await prompts.select<ReviewAction>("Next step", [
      { name: "Fix skills with Claude or Codex", value: "repair" },
      ...(report.errorCount > 0 ? [{ name: "View errors", value: "errors" as const }] : []),
      { name: "View all findings", value: "all" },
      { name: "View findings by skill", value: "by-skill" },
      { name: "Exit", value: "exit" },
    ]);

    if (action === "exit") return;
    if (action === "repair") {
      return runRepairAgentFlow(report, input);
    }

    const selectedFindings =
      action === "errors"
        ? report.findings.filter((finding) => finding.severity === "error")
        : report.findings;
    if (action === "by-skill") {
      write(renderFindingsBySkill(selectedFindings));
      continue;
    }
    write(renderFindings(selectedFindings));
  }
};

const runRepairAgentFlow = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  try {
    const agent = await chooseRepairAgent({
      prompts: input.prompts,
      isAvailable: input.isRepairAgentAvailable,
    });
    if (agent === undefined) {
      input.write("Repair handoff cancelled.\n");
      return undefined;
    }
    const handoff = await prepareRepairHandoff({
      report,
      prompts: input.prompts,
      outputRoot: input.repairReportOutputRoot,
      timestamp: input.repairReportTimestamp,
    });
    input.write(`Selected ${agent.displayName}.\n`);
    input.write(`Launch preview: ${formatRepairAgentPreview(agent.id)}\n`);
    if (handoff.reportDirectory !== undefined) {
      input.write(`Report directory: ${handoff.reportDirectory}\n`);
    }
    if (handoff.promptPath !== undefined) {
      input.write(`Repair prompt: ${handoff.promptPath}\n`);
    } else {
      input.write(`Repair prompt:\n${handoff.prompt}\n`);
    }
    if (handoff.reportWriteError !== undefined) {
      input.write(`Report write failed: ${handoff.reportWriteError.message}\n`);
    }
    const shouldLaunch = await input.prompts.confirm(`Launch ${agent.displayName} now?`, false);
    if (!shouldLaunch) {
      input.write("Agent launch cancelled.\n");
      return undefined;
    }

    let exitCode: number;
    try {
      exitCode = await input.launchAgent(agent.id, handoff.prompt, input.cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.write(`Agent launch failed: ${message}\n`);
      return undefined;
    }
    if (exitCode !== 0) {
      input.write(`Agent exited with code ${exitCode}.\n`);
    }

    const reScanStartedAt = input.now?.();
    const nextScan = await input.spinner.run("Re-scanning skills...", () =>
      scanSkillRoots({ roots: input.roots }),
    );
    const nextElapsedMilliseconds =
      input.now === undefined || reScanStartedAt === undefined
        ? 0
        : Math.max(0, Math.round(input.now() - reScanStartedAt));
    const nextReport = buildScanReport({
      version: input.version,
      directory: input.cwd,
      elapsedMilliseconds: nextElapsedMilliseconds,
      scan: nextScan,
      handoffRequested: true,
    });
    const comparison = compareFindings(report.findings, nextReport.findings);
    input.write(renderPostHandoffSummary(comparison, nextReport));

    if (
      nextReport.findingCount > 0 &&
      (await input.prompts.confirm("Run another repair pass?", false))
    ) {
      return (await reviewFindings(nextReport, input)) ?? nextReport;
    }
    return nextReport;
  } catch (error) {
    if (error instanceof CliInputError) {
      input.write(`${error.message}\n`);
      return undefined;
    }
    throw error;
  }
};

const renderFindings = (findings: readonly Finding[]): string =>
  `${findings
    .map(
      (finding) =>
        `[${finding.severity}] ${finding.ruleId} ${finding.skillName ?? finding.skillPath}\n${finding.message}\nSuggestion: ${finding.suggestion}`,
    )
    .join("\n\n")}\n`;

const renderFindingsBySkill = (findings: readonly Finding[]): string => {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.skillName ?? finding.skillPath;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.entries()]
    .map(([skillName, skillFindings]) => {
      const lines = [`${skillName}:`];
      lines.push(...skillFindings.map((finding) => `- [${finding.severity}] ${finding.ruleId}`));
      return lines.join("\n");
    })
    .join("\n\n")
    .concat("\n");
};
