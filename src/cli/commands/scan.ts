import path from "node:path";
import {
  type AnalyzeSkillUsageInput,
  analyzeSkillUsage,
  type SkillCleanupRecommendation,
} from "../../domain/analyze-skill-usage.js";
import type { ScanReport } from "../../domain/build-report.js";
import { buildScanReport } from "../../domain/build-report.js";
import { compareFindings, renderPostHandoffSummary } from "../../domain/compare-findings.js";
import { discoverSkillRoots } from "../../domain/discover-skill-roots.js";
import {
  type DiscoverUsageSourcesInput,
  type DiscoverUsageSourcesResult,
  discoverUsageSources,
} from "../../domain/discover-usage-sources.js";
import { groupFindingsByKey } from "../../domain/group-findings.js";
import { readCodexDisabledSkillConfig } from "../../domain/read-codex-disabled-skill-config.js";
import { scanSkillRoots } from "../../domain/scan-skills.js";
import {
  renderHumanSummary,
  resolveScanExitCode,
  type ScanExitCodeOptions,
  type ScanGateSeverity,
} from "../../domain/summarize-findings.js";
import type { Diagnostic, Finding, SkillRoot } from "../../domain/types.js";
import { prepareCleanupHandoff } from "../utils/cleanup-handoff-to-agent.js";
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
  readonly usage?: boolean;
  readonly logs?: boolean;
  readonly yes?: boolean;
  readonly failOn?: string | undefined;
  readonly minScore?: string | undefined;
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
  readonly cleanupReportOutputRoot?: string;
  readonly cleanupReportTimestamp?: string;
  readonly launchAgent?: RepairAgentLauncher;
  readonly discoverUsageSources?: (
    input: DiscoverUsageSourcesInput,
  ) => Promise<DiscoverUsageSourcesResult>;
  readonly analyzeSkillUsage?: (
    input: AnalyzeSkillUsageInput,
  ) => ReturnType<typeof analyzeSkillUsage>;
};

type RootSelection = "all" | "claude" | "codex" | "custom";
type RootScopeSelection = "all" | "local" | "global" | "custom";
type ReviewAction =
  | "all"
  | "errors"
  | "security"
  | "security-repair"
  | "by-skill"
  | "repair"
  | "cleanup"
  | "usage-ranking"
  | "cleanup-recommendations"
  | "exit";
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
  const gateOptions = resolveGateOptions(flags);
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
  } else if (skipPrompts) {
    assertNonInteractiveRootSelectionIsUnambiguous(roots);
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

  const disabledCodexSkills = await spinner.run("Reading Codex skill settings...", () =>
    readCodexDisabledSkillConfig({ homeDir: options.homeDir }),
  );
  diagnostics.push(...disabledCodexSkills.diagnostics);

  const startedAt = now();
  const scan = await spinner.run("Scanning skills...", () =>
    scanSkillRoots({ roots, diagnostics, disabledSkills: disabledCodexSkills }),
  );
  const elapsedMilliseconds = Math.max(0, Math.round(now() - startedAt));
  const usageInput = shouldRunUsageAnalysis({ flags, skipPrompts })
    ? await spinner.run("Analyzing local Codex usage...", () =>
        buildUsageReportInput({
          scan,
          homeDir: options.homeDir,
          discoverUsageSources: options.discoverUsageSources ?? discoverUsageSources,
          analyzeSkillUsage: options.analyzeSkillUsage ?? analyzeSkillUsage,
        }),
      )
    : undefined;
  const report = buildScanReport({
    version: options.version ?? "0.0.0",
    directory: cwd,
    elapsedMilliseconds,
    scan,
    ...(usageInput === undefined ? {} : { usage: usageInput }),
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
    writeStdout(renderHumanSummary(report, { includeScore: false, color: stdoutIsTty }));
    if (!skipPrompts && shouldShowReviewMenu(report)) {
      finalReport =
        (await reviewScan(report, {
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
          cleanupReportOutputRoot: options.cleanupReportOutputRoot,
          cleanupReportTimestamp: options.cleanupReportTimestamp,
          launchAgent: options.launchAgent ?? launchRepairAgent,
          color: stdoutIsTty,
          homeDir: options.homeDir,
          discoverUsageSources: options.discoverUsageSources ?? discoverUsageSources,
          analyzeSkillUsage: options.analyzeSkillUsage ?? analyzeSkillUsage,
        })) ?? report;
    }
  }

  process.exitCode = resolveScanExitCode(finalReport, gateOptions);
  return finalReport;
};

const resolveGateOptions = (flags: ScanFlags): ScanExitCodeOptions => ({
  failOn: parseFailOnSeverity(flags.failOn),
  minScore: parseMinScore(flags.minScore),
});

const shouldRunUsageAnalysis = (input: {
  readonly flags: ScanFlags;
  readonly skipPrompts: boolean;
}): boolean => {
  if (input.flags.usage) return true;
  if (input.skipPrompts) return false;
  return input.flags.logs !== false;
};

const buildUsageReportInput = async (input: {
  readonly scan: Awaited<ReturnType<typeof scanSkillRoots>>;
  readonly homeDir?: string | undefined;
  readonly discoverUsageSources: (
    input: DiscoverUsageSourcesInput,
  ) => Promise<DiscoverUsageSourcesResult>;
  readonly analyzeSkillUsage: (
    input: AnalyzeSkillUsageInput,
  ) => ReturnType<typeof analyzeSkillUsage>;
}): Promise<NonNullable<Parameters<typeof buildScanReport>[0]["usage"]>> => {
  const discovered = await input.discoverUsageSources({ homeDir: input.homeDir });
  const analysis = await input.analyzeSkillUsage({
    skills: input.scan.skills,
    usageSourcePaths: discovered.usageSourcePaths,
  });
  return {
    analysis: {
      ...analysis,
      diagnostics: [...discovered.diagnostics, ...analysis.diagnostics],
    },
    contextPressure: discovered.contextPressure,
  };
};

const shouldShowReviewMenu = (report: ScanReport): boolean =>
  report.findingCount > 0 || (report.usage?.topRecommendations.length ?? 0) > 0;

const parseFailOnSeverity = (value: string | undefined): ScanGateSeverity | undefined => {
  if (value === undefined) return undefined;
  if (value === "error" || value === "warning" || value === "advice") return value;
  throw new CliInputError("Invalid --fail-on value. Use one of: error, warning, advice.");
};

const parseMinScore = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new CliInputError("Invalid --min-score value. Use a number from 0 to 100.");
  }
  return score;
};

const assertNonInteractiveRootSelectionIsUnambiguous = (roots: readonly SkillRoot[]): void => {
  const standardRoots = roots.filter((root) => root.source !== "custom");
  const standardSources = new Set(standardRoots.map((root) => root.source));
  if (standardSources.has("local") && standardSources.has("global")) {
    throw new CliInputError(
      "Multiple local and global skills roots were found. Re-run interactively to choose which scope to scan.",
    );
  }

  const standardEcosystems = new Set(standardRoots.map((root) => root.ecosystem));
  if (standardEcosystems.has("claude") && standardEcosystems.has("codex")) {
    throw new CliInputError(
      "Multiple Claude and Codex/agents skills roots were found. Re-run interactively to choose which ecosystem to scan.",
    );
  }
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
  readonly cleanupReportOutputRoot?: string | undefined;
  readonly cleanupReportTimestamp?: string | undefined;
  readonly launchAgent: RepairAgentLauncher;
  readonly color?: boolean | undefined;
  readonly homeDir?: string | undefined;
  readonly discoverUsageSources: (
    input: DiscoverUsageSourcesInput,
  ) => Promise<DiscoverUsageSourcesResult>;
  readonly analyzeSkillUsage: (
    input: AnalyzeSkillUsageInput,
  ) => ReturnType<typeof analyzeSkillUsage>;
};

const reviewScan = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  const { prompts, write } = input;
  while (true) {
    const action = await prompts.select<ReviewAction>("Next step", [
      ...(report.usage !== undefined && report.usage.topRecommendations.length > 0
        ? [
            {
              name: "Choose unused skills to disable",
              value: "cleanup" as const,
            },
            { name: "View usage ranking", value: "usage-ranking" as const },
            {
              name: "View usage recommendations",
              value: "cleanup-recommendations" as const,
            },
          ]
        : []),
      ...(report.qualityFindingCount > 0
        ? [{ name: "Fix skills with Claude or Codex", value: "repair" as const }]
        : []),
      ...(report.errorCount > 0 ? [{ name: "View errors", value: "errors" as const }] : []),
      ...(hasSecurityFindings(report)
        ? [
            { name: "Review security findings", value: "security" as const },
            {
              name: "Fix selected security findings with Claude or Codex",
              value: "security-repair" as const,
            },
          ]
        : []),
      ...(report.qualityFindingCount > 0
        ? [
            { name: "View quality findings", value: "all" as const },
            { name: "View quality findings by skill", value: "by-skill" as const },
          ]
        : []),
      { name: "Exit", value: "exit" },
    ]);

    if (action === "exit") return;
    if (action === "cleanup") {
      return runCleanupAgentFlow(report, input);
    }
    if (action === "usage-ranking") {
      write(renderUsageRanking(report, { color: input.color }));
      continue;
    }
    if (action === "cleanup-recommendations") {
      write(renderCleanupRecommendations(report, { color: input.color }));
      continue;
    }
    if (action === "repair") {
      return runRepairAgentFlow(report, input);
    }
    if (action === "security-repair") {
      const selectedSecurityFindings = await selectSecurityFindings(report, input);
      if (selectedSecurityFindings.length === 0) {
        write("Security repair handoff cancelled.\n");
        continue;
      }
      return runRepairAgentFlow(report, input, selectedSecurityFindings);
    }

    const selectedFindings =
      action === "errors"
        ? report.findings.filter((finding) => finding.severity === "error")
        : action === "security"
          ? report.findings.filter((finding) => finding.category === "security")
          : report.findings.filter((finding) => finding.category !== "security");
    if (action === "by-skill") {
      write(renderFindingsBySkill(selectedFindings, { color: input.color }));
      continue;
    }
    if (action === "security") {
      write(renderSecurityFindings(selectedFindings, { color: input.color }));
      continue;
    }
    write(renderFindings(selectedFindings, { color: input.color }));
  }
};

const hasSecurityFindings = (report: ScanReport): boolean => report.securityFindingCount > 0;

const selectSecurityFindings = async (
  report: ScanReport,
  input: Pick<ReviewFindingsInput, "prompts">,
): Promise<readonly Finding[]> => {
  const securityFindings = report.findings.filter((finding) => finding.category === "security");
  const selectedIndexes = new Set(
    await input.prompts.checkbox(
      "Select security findings to send for repair",
      securityFindings.map((finding, index) => ({
        name: `${finding.skillName ?? path.basename(path.dirname(finding.skillPath))}: ${finding.ruleId}`,
        value: String(index),
        description: formatFindingLocation(finding),
        checked: true,
      })),
    ),
  );
  return securityFindings.filter((_finding, index) => selectedIndexes.has(String(index)));
};

const runCleanupAgentFlow = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  try {
    const selectedRecommendations = await selectCleanupRecommendations(report, input);
    if (selectedRecommendations.length === 0) {
      input.write("Cleanup handoff cancelled.\n");
      return undefined;
    }
    const handoff = await prepareCleanupHandoff({
      report,
      recommendations: selectedRecommendations,
      outputRoot: input.cleanupReportOutputRoot,
      timestamp: input.cleanupReportTimestamp,
    });
    let agent: Awaited<ReturnType<typeof chooseRepairAgent>>;
    try {
      agent = await chooseRepairAgent({
        prompts: input.prompts,
        isAvailable: input.isRepairAgentAvailable,
      });
    } catch (error) {
      if (error instanceof CliInputError) {
        writeCleanupHandoffSummary(handoff, input.write, { color: input.color });
        input.write(`${error.message}\n`);
        return undefined;
      }
      throw error;
    }
    if (agent === undefined) {
      writeCleanupHandoffSummary(handoff, input.write, { color: input.color });
      input.write("Cleanup handoff cancelled.\n");
      return undefined;
    }
    input.write(`${usageLabel("Selected", Boolean(input.color))} ${agent.displayName}.\n`);
    input.write(
      `${usageLabel("Launch preview", Boolean(input.color))}: ${formatRepairAgentPreview(agent.id)}\n`,
    );
    writeCleanupHandoffSummary(handoff, input.write, { color: input.color });
    const shouldLaunch = await input.prompts.confirm(`Launch ${agent.displayName} now?`, false);
    if (!shouldLaunch) {
      input.write("Cleanup agent launch cancelled.\n");
      return undefined;
    }

    let exitCode: number;
    try {
      exitCode = await input.launchAgent(agent.id, handoff.prompt, input.cwd);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.write(`Cleanup agent launch failed: ${message}\n`);
      return undefined;
    }
    if (exitCode !== 0) {
      input.write(`Cleanup agent exited with code ${exitCode}.\n`);
    }

    const reScanStartedAt = input.now?.();
    const nextScan = await input.spinner.run("Re-scanning skills...", () =>
      scanSkillRoots({ roots: input.roots }),
    );
    const nextElapsedMilliseconds =
      input.now === undefined || reScanStartedAt === undefined
        ? 0
        : Math.max(0, Math.round(input.now() - reScanStartedAt));
    const nextUsageInput = await input.spinner.run("Re-analyzing local Codex usage...", () =>
      buildUsageReportInput({
        scan: nextScan,
        homeDir: input.homeDir,
        discoverUsageSources: input.discoverUsageSources,
        analyzeSkillUsage: input.analyzeSkillUsage,
      }),
    );
    const nextReport = buildScanReport({
      version: input.version,
      directory: input.cwd,
      elapsedMilliseconds: nextElapsedMilliseconds,
      scan: nextScan,
      usage: nextUsageInput,
      handoffRequested: true,
    });
    input.write(
      renderPostCleanupSummary(report, nextReport, handoff.reportDirectory, {
        color: input.color,
      }),
    );
    return nextReport;
  } catch (error) {
    if (error instanceof CliInputError) {
      input.write(`${error.message}\n`);
      return undefined;
    }
    throw error;
  }
};

const selectCleanupRecommendations = async (
  report: ScanReport,
  input: Pick<ReviewFindingsInput, "prompts">,
): Promise<readonly SkillCleanupRecommendation[]> => {
  const usage = report.usage;
  if (usage === undefined) throw new CliInputError("Usage analysis is required before cleanup.");
  const candidates = usage.recommendations.filter(
    (recommendation) => recommendation.action === "disable-candidate",
  );
  if (candidates.length === 0) return [];

  const defaultPaths = new Set(
    usage.topRecommendations.map((recommendation) => recommendation.skillPath),
  );
  const selectedPaths = new Set(
    await input.prompts.checkbox(
      "Select unused skills to disable",
      candidates.map((recommendation) => ({
        name: recommendation.skillName,
        value: recommendation.skillPath,
        description: compactSkillPath(recommendation.skillPath),
        checked: defaultPaths.has(recommendation.skillPath),
      })),
    ),
  );
  return candidates.filter((recommendation) => selectedPaths.has(recommendation.skillPath));
};

const runRepairAgentFlow = async (
  report: ScanReport,
  input: ReviewFindingsInput,
  preselectedFindings?: readonly Finding[],
): Promise<ScanReport | undefined> => {
  try {
    const handoff = await prepareRepairHandoff({
      report,
      prompts: input.prompts,
      preselectedFindings,
      outputRoot: input.repairReportOutputRoot,
      timestamp: input.repairReportTimestamp,
    });
    let agent: Awaited<ReturnType<typeof chooseRepairAgent>>;
    try {
      agent = await chooseRepairAgent({
        prompts: input.prompts,
        isAvailable: input.isRepairAgentAvailable,
      });
    } catch (error) {
      if (error instanceof CliInputError) {
        writeRepairHandoffSummary(handoff, input.write, { color: input.color });
        input.write(`${error.message}\n`);
        return undefined;
      }
      throw error;
    }
    if (agent === undefined) {
      writeRepairHandoffSummary(handoff, input.write, { color: input.color });
      input.write("Repair handoff cancelled.\n");
      return undefined;
    }
    input.write(`${usageLabel("Selected", Boolean(input.color))} ${agent.displayName}.\n`);
    input.write(
      `${usageLabel("Launch preview", Boolean(input.color))}: ${formatRepairAgentPreview(agent.id)}\n`,
    );
    writeRepairHandoffSummary(handoff, input.write, { color: input.color });
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
    input.write(renderPostHandoffSummary(comparison, nextReport, { color: input.color }));

    if (
      nextReport.findingCount > 0 &&
      (await input.prompts.confirm("Run another repair pass?", false))
    ) {
      return (await reviewScan(nextReport, input)) ?? nextReport;
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

const writeRepairHandoffSummary = (
  handoff: Awaited<ReturnType<typeof prepareRepairHandoff>>,
  write: (message: string) => void,
  options: RenderTerminalOptions = {},
): void => {
  const shouldColor = Boolean(options.color);
  if (handoff.reportDirectory !== undefined) {
    write(
      `${usageLabel("Report directory", shouldColor)}: ${dim(handoff.reportDirectory, shouldColor)}\n`,
    );
  }
  if (handoff.promptPath !== undefined) {
    write(`${usageLabel("Repair prompt", shouldColor)}: ${dim(handoff.promptPath, shouldColor)}\n`);
  } else {
    write(`${usageLabel("Repair prompt", shouldColor)}:\n${handoff.prompt}\n`);
  }
  if (handoff.reportWriteError !== undefined) {
    write(`${danger("Report write failed", shouldColor)}: ${handoff.reportWriteError.message}\n`);
  }
};

const writeCleanupHandoffSummary = (
  handoff: Awaited<ReturnType<typeof prepareCleanupHandoff>>,
  write: (message: string) => void,
  options: RenderTerminalOptions = {},
): void => {
  const shouldColor = Boolean(options.color);
  if (handoff.reportDirectory !== undefined) {
    write(
      `${usageLabel("Report directory", shouldColor)}: ${dim(handoff.reportDirectory, shouldColor)}\n`,
    );
  }
  if (handoff.usageJsonPath !== undefined) {
    write(`${usageLabel("Usage JSON", shouldColor)}: ${dim(handoff.usageJsonPath, shouldColor)}\n`);
  }
  if (handoff.usageMarkdownPath !== undefined) {
    write(
      `${usageLabel("Usage report", shouldColor)}: ${dim(handoff.usageMarkdownPath, shouldColor)}\n`,
    );
  }
  if (handoff.promptPath !== undefined) {
    write(
      `${usageLabel("Cleanup prompt", shouldColor)}: ${dim(handoff.promptPath, shouldColor)}\n`,
    );
  } else {
    write(`${usageLabel("Cleanup prompt", shouldColor)}:\n${handoff.prompt}\n`);
  }
  if (handoff.reportWriteError !== undefined) {
    write(`${danger("Report write failed", shouldColor)}: ${handoff.reportWriteError.message}\n`);
  }
};

type RenderTerminalOptions = {
  readonly color?: boolean | undefined;
};

const renderFindings = (
  findings: readonly Finding[],
  options: RenderTerminalOptions = {},
): string => {
  const shouldColor = Boolean(options.color);
  return `${findings
    .map((finding) => {
      const location = finding.skillName ?? finding.skillPath;
      return [
        `${colorizeSeverity(`[${finding.severity}]`, finding.severity, shouldColor)} ${accent(finding.ruleId, shouldColor)} ${dim(location, shouldColor)}`,
        finding.message,
        `${usageLabel("Suggestion", shouldColor)}: ${finding.suggestion}`,
      ].join("\n");
    })
    .join("\n\n")}\n`;
};

const renderSecurityFindings = (
  findings: readonly Finding[],
  options: RenderTerminalOptions = {},
): string => {
  const shouldColor = Boolean(options.color);
  const lines = [
    `${usageLabel("Security report", shouldColor)}: ${warning(String(findings.length), shouldColor)} suspicious skill pattern${findings.length === 1 ? "" : "s"}`,
    "",
  ];
  for (const finding of findings) {
    const location = finding.skillName ?? finding.skillPath;
    lines.push(
      `${colorizeSeverity(`[${finding.severity}]`, finding.severity, shouldColor)} ${accent(finding.ruleId, shouldColor)} ${dim(location, shouldColor)}`,
      formatFindingLocation(finding),
      finding.message,
      `${usageLabel("Suggestion", shouldColor)}: ${finding.suggestion}`,
    );
    if (finding.evidence !== undefined) {
      lines.push(`${usageLabel("Evidence", shouldColor)}:`);
      for (const line of finding.evidence.excerpt) {
        const marker = line.highlighted ? ">" : " ";
        const renderedLine = `${marker} ${String(line.line).padStart(4, " ")} | ${line.text}`;
        lines.push(
          line.highlighted ? warning(renderedLine, shouldColor) : dim(renderedLine, shouldColor),
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
};

const renderFindingsBySkill = (
  findings: readonly Finding[],
  options: RenderTerminalOptions = {},
): string => {
  const shouldColor = Boolean(options.color);
  return groupFindingsByKey(findings, (finding) => finding.skillName ?? finding.skillPath)
    .map((group) => {
      const lines = [`${accent(group.key, shouldColor)}:`];
      lines.push(
        ...group.findings.map(
          (finding) =>
            `- ${colorizeSeverity(`[${finding.severity}]`, finding.severity, shouldColor)} ${accent(finding.ruleId, shouldColor)}`,
        ),
      );
      return lines.join("\n");
    })
    .join("\n\n")
    .concat("\n");
};

const formatFindingLocation = (finding: Finding): string =>
  `Location: ${finding.skillPath}${finding.line === undefined ? "" : `:${finding.line}`}`;

const renderUsageRanking = (report: ScanReport, options: RenderTerminalOptions = {}): string => {
  if (report.usage === undefined) return "Usage analysis has not run.\n";
  const shouldColor = Boolean(options.color);
  const lines = [
    `${usageLabel("Usage ranking", shouldColor)}:`,
    "",
    usageLabel("Summary", shouldColor),
    ...renderTable(
      ["Metric", "Count"],
      [
        ["Used", String(report.usage.usedSkillCount)],
        ["Unused", String(report.usage.unusedSkillCount)],
        ["Unknown", String(report.usage.unknownSkillCount)],
        ["Duplicates", String(report.usage.duplicateSkillCount)],
        ["Plugins", String(report.usage.pluginContributedSkillCount)],
      ],
      {
        colorizers: [
          (text) => dim(text, shouldColor),
          (text, rowIndex) => colorizeUsageSummaryCount(rowIndex, text, shouldColor),
        ],
      },
    ),
  ];

  for (const tier of ["frequent", "recent", "rare"] as const) {
    const skills = report.usage.skillsByUsage.filter((skill) => skill.tier === tier);
    if (skills.length === 0) continue;
    lines.push(
      "",
      colorizeUsageTier(toTitleCase(tier), shouldColor),
      ...renderTable(
        ["Skill", "Uses", "Confidence", "Last used"],
        skills.map((skill) => [
          skill.skillName,
          String(skill.usageCount),
          skill.confidence,
          formatUsageTimestamp(skill.lastUsedAt),
        ]),
        {
          colorizers: [
            (text) => accent(text, shouldColor),
            (text) => success(text, shouldColor),
            (text, _rowIndex, row) =>
              colorizeUsageConfidence(row[2] ?? text.trim(), text, shouldColor),
            (text) => dim(text, shouldColor),
          ],
        },
      ),
    );
  }

  const unusedSkills = report.usage.skillsByUsage.filter((skill) => skill.tier === "unused");
  if (unusedSkills.length > 0) {
    const previewLimit = 10;
    const preview = unusedSkills.slice(0, previewLimit);
    lines.push(
      "",
      dim("Unused", shouldColor),
      `  ${warning(String(unusedSkills.length), shouldColor)} enabled skills have no detected usage.`,
      `  Showing ${warning(String(preview.length), shouldColor)}. Use "View usage recommendations" for cleanup actions.`,
      "",
      ...renderTable(
        ["Skill", "Path"],
        preview.map((skill) => [skill.skillName, compactSkillPath(skill.skillPath)]),
        {
          colorizers: [(text) => accent(text, shouldColor), (text) => dim(text, shouldColor)],
        },
      ),
    );
  }

  return `${lines.join("\n")}\n`;
};

const colorizeUsageTier = (text: string, shouldColor: boolean): string => {
  const tier = text.toLowerCase();
  if (tier === "frequent" || tier === "recent") return success(text, shouldColor);
  if (tier === "rare") return warning(text, shouldColor);
  return dim(text, shouldColor);
};

const colorizeUsageConfidence = (
  confidence: string,
  text: string,
  shouldColor: boolean,
): string => {
  if (confidence === "high") return success(text, shouldColor);
  if (confidence === "medium") return warning(text, shouldColor);
  return dim(text, shouldColor);
};

const colorizeUsageSummaryCount = (
  rowIndex: number,
  text: string,
  shouldColor: boolean,
): string => {
  if (rowIndex === 0) return success(text, shouldColor);
  if (rowIndex === 1 || rowIndex === 3) return warning(text, shouldColor);
  if (rowIndex === 4) return accent(text, shouldColor);
  return dim(text, shouldColor);
};

type TableColorizer = (
  text: string,
  rowIndex: number,
  row: readonly string[],
  columnIndex: number,
) => string;

const renderTable = (
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  options: {
    readonly colorizers?: readonly TableColorizer[] | undefined;
  } = {},
): readonly string[] => {
  if (rows.length === 0) return [];
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map((row) => row[columnIndex]?.length ?? 0)),
  );
  return [
    `  ${headers.map((header, index) => formatTableCell(header, index, headers.length, widths)).join("  ")}`,
    ...rows.map((row, rowIndex) => {
      const cells = headers.map((_, columnIndex) => {
        const plainCell = formatTableCell(
          row[columnIndex] ?? "",
          columnIndex,
          headers.length,
          widths,
        );
        const colorizer = options.colorizers?.[columnIndex];
        return colorizer === undefined
          ? plainCell
          : colorizer(plainCell, rowIndex, row, columnIndex);
      });
      return `  ${cells.join("  ")}`;
    }),
  ];
};

const padCell = (text: string, width: number): string => text.padEnd(width, " ");

const formatTableCell = (
  text: string,
  columnIndex: number,
  columnCount: number,
  widths: readonly number[],
): string => (columnIndex === columnCount - 1 ? text : padCell(text, widths[columnIndex] ?? 0));

const formatUsageTimestamp = (timestamp: string | undefined): string => {
  if (timestamp === undefined) return "never";
  return timestamp.replace("T", " ").slice(0, 16);
};

const compactSkillPath = (skillPath: string): string => {
  const normalizedPath = skillPath.split(path.sep).join("/");
  const agentsMatch = normalizedPath.match(/\/\.agents\/skills\/(.+)$/u);
  if (agentsMatch?.[1] !== undefined) return `~/.agents/skills/${agentsMatch[1]}`;
  const claudeMatch = normalizedPath.match(/\/\.claude\/skills\/(.+)$/u);
  if (claudeMatch?.[1] !== undefined) return `~/.claude/skills/${claudeMatch[1]}`;
  const pluginMatch = normalizedPath.match(
    /\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\/(.+)$/u,
  );
  if (pluginMatch?.[1] !== undefined && pluginMatch[2] !== undefined) {
    return `${pluginMatch[1]}:skills/${pluginMatch[2]}`;
  }
  return skillPath;
};

const toTitleCase = (text: string): string =>
  text.replace(/\w\S*/gu, (word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`);

const groupRecommendations = (
  recommendations: readonly SkillCleanupRecommendation[],
): readonly {
  readonly action: SkillCleanupRecommendation["action"];
  readonly recommendations: readonly SkillCleanupRecommendation[];
}[] => {
  const actionOrder: readonly SkillCleanupRecommendation["action"][] = [
    "disable-candidate",
    "shorten-description",
    "review",
    "merge-candidate",
    "keep",
  ];
  return actionOrder.flatMap((action) => {
    const matches = recommendations.filter((recommendation) => recommendation.action === action);
    return matches.length === 0 ? [] : [{ action, recommendations: matches }];
  });
};

const recommendationGroupTitle = (action: SkillCleanupRecommendation["action"]): string => {
  if (action === "disable-candidate") return "Disable candidates";
  if (action === "shorten-description") return "Shorten descriptions";
  if (action === "merge-candidate") return "Merge candidates";
  if (action === "review") return "Review";
  return "Keep";
};

const recommendationPreviewLimit = (action: SkillCleanupRecommendation["action"]): number => {
  if (action === "disable-candidate") return 10;
  if (action === "keep") return 10;
  return 8;
};

const colorizeSeverity = (
  text: string,
  severity: Finding["severity"],
  shouldColor: boolean,
): string => {
  if (severity === "error") return danger(text, shouldColor);
  if (severity === "warning") return warning(text, shouldColor);
  return dim(text, shouldColor);
};

const colorizePressure = (level: string, shouldColor: boolean): string => {
  if (level === "high") return danger(level, shouldColor);
  if (level === "medium") return warning(level, shouldColor);
  if (level === "low") return success(level, shouldColor);
  return dim(level, shouldColor);
};

const usageLabel = (text: string, shouldColor: boolean): string => accent(text, shouldColor);

const accent = (text: string, shouldColor: boolean): string => color(text, 36, shouldColor);

const success = (text: string, shouldColor: boolean): string => color(text, 32, shouldColor);

const warning = (text: string, shouldColor: boolean): string => color(text, 33, shouldColor);

const danger = (text: string, shouldColor: boolean): string => color(text, 31, shouldColor);

const dim = (text: string, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[2m${text}\x1b[22m` : text;

const color = (text: string, code: number, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[${code}m${text}\x1b[39m` : text;

const renderCleanupRecommendations = (
  report: ScanReport,
  options: RenderTerminalOptions = {},
): string => {
  if (report.usage === undefined) return "Usage analysis has not run.\n";
  const shouldColor = Boolean(options.color);
  const lines = [
    `${usageLabel("Usage recommendations", shouldColor)}:`,
    `${usageLabel("Context budget pressure", shouldColor)}: ${colorizePressure(report.usage.contextPressure.level, shouldColor)}`,
  ];
  if (report.usage.recommendations.length === 0) {
    lines.push(`- ${dim("No usage recommendations.", shouldColor)}`);
  } else {
    for (const group of groupRecommendations(report.usage.recommendations)) {
      const previewLimit = recommendationPreviewLimit(group.action);
      const shownRecommendations = group.recommendations.slice(0, previewLimit);
      lines.push(
        "",
        colorizeCleanupAction(recommendationGroupTitle(group.action), shouldColor),
        ...(shownRecommendations.length < group.recommendations.length
          ? [
              dim(
                `  Showing ${shownRecommendations.length} of ${group.recommendations.length}.`,
                shouldColor,
              ),
            ]
          : []),
        ...renderTable(
          ["Skill", "Confidence", "Path"],
          shownRecommendations.map((recommendation) => [
            recommendation.skillName,
            recommendation.confidence,
            compactSkillPath(recommendation.skillPath),
          ]),
          {
            colorizers: [
              (text) => accent(text, shouldColor),
              (text, _rowIndex, row) =>
                colorizeUsageConfidence(row[1] ?? text.trim(), text, shouldColor),
              (text) => dim(text, shouldColor),
            ],
          },
        ),
      );
    }
  }
  return `${lines.join("\n")}\n`;
};

const colorizeCleanupAction = (action: string, shouldColor: boolean): string => {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction === "keep") return success(action, shouldColor);
  if (normalizedAction === "disable-candidate" || normalizedAction === "disable candidates") {
    return warning(action, shouldColor);
  }
  if (
    normalizedAction === "review" ||
    normalizedAction === "shorten-description" ||
    normalizedAction === "shorten descriptions" ||
    normalizedAction === "merge-candidate" ||
    normalizedAction === "merge candidates"
  ) {
    return warning(action, shouldColor);
  }
  return accent(action, shouldColor);
};

const renderPostCleanupSummary = (
  before: ScanReport,
  after: ScanReport,
  reportDirectory: string | undefined,
  options: RenderTerminalOptions = {},
): string => {
  const shouldColor = Boolean(options.color);
  const lines = [
    `${usageLabel("Post-disable re-scan", shouldColor)}:`,
    `${usageLabel("Skills", shouldColor)}: ${accent(String(before.skillCount), shouldColor)} -> ${accent(String(after.skillCount), shouldColor)}`,
    `${usageLabel("Context budget pressure", shouldColor)}: ${colorizePressure(before.usage?.contextPressure.level ?? "unknown", shouldColor)} -> ${colorizePressure(after.usage?.contextPressure.level ?? "unknown", shouldColor)}`,
    `${usageLabel("Findings", shouldColor)}: ${warning(String(before.findingCount), shouldColor)} -> ${warning(String(after.findingCount), shouldColor)}`,
  ];
  if (reportDirectory !== undefined) {
    lines.push(
      `${usageLabel("Report directory", shouldColor)}: ${dim(reportDirectory, shouldColor)}`,
    );
  }
  return `${lines.join("\n")}\n`;
};
