import path from "node:path";
import {
  analyzeSkillUsage,
  type AnalyzeSkillUsageInput,
} from "../../domain/analyze-skill-usage.js";
import type { ScanReport } from "../../domain/build-report.js";
import { buildScanReport } from "../../domain/build-report.js";
import { compareFindings, renderPostHandoffSummary } from "../../domain/compare-findings.js";
import { discoverSkillRoots } from "../../domain/discover-skill-roots.js";
import {
  discoverUsageSources,
  type DiscoverUsageSourcesInput,
  type DiscoverUsageSourcesResult,
} from "../../domain/discover-usage-sources.js";
import { groupFindingsByKey } from "../../domain/group-findings.js";
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
type ReviewAction = "all" | "errors" | "by-skill" | "repair" | "cleanup" | "exit";
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

  const startedAt = now();
  const scan = await spinner.run("Scanning skills...", () =>
    scanSkillRoots({ roots, diagnostics }),
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
    writeStdout(renderHumanSummary(report, { includeScore: false }));
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
              name: "Clean up unused skills and context-budget pressure",
              value: "cleanup" as const,
            },
          ]
        : []),
      ...(report.findingCount > 0
        ? [{ name: "Fix skills with Claude or Codex", value: "repair" as const }]
        : []),
      ...(report.errorCount > 0 ? [{ name: "View errors", value: "errors" as const }] : []),
      ...(report.findingCount > 0
        ? [
            { name: "View all findings", value: "all" as const },
            { name: "View findings by skill", value: "by-skill" as const },
          ]
        : []),
      { name: "Exit", value: "exit" },
    ]);

    if (action === "exit") return;
    if (action === "cleanup") {
      return runCleanupAgentFlow(report, input);
    }
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

const runCleanupAgentFlow = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  try {
    const handoff = await prepareCleanupHandoff({
      report,
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
        writeCleanupHandoffSummary(handoff, input.write);
        input.write(`${error.message}\n`);
        return undefined;
      }
      throw error;
    }
    if (agent === undefined) {
      writeCleanupHandoffSummary(handoff, input.write);
      input.write("Cleanup handoff cancelled.\n");
      return undefined;
    }
    input.write(`Selected ${agent.displayName}.\n`);
    input.write(`Launch preview: ${formatRepairAgentPreview(agent.id)}\n`);
    writeCleanupHandoffSummary(handoff, input.write);
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
    input.write(renderPostCleanupSummary(report, nextReport, handoff.reportDirectory));
    return nextReport;
  } catch (error) {
    if (error instanceof CliInputError) {
      input.write(`${error.message}\n`);
      return undefined;
    }
    throw error;
  }
};

const runRepairAgentFlow = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  try {
    const handoff = await prepareRepairHandoff({
      report,
      prompts: input.prompts,
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
        writeRepairHandoffSummary(handoff, input.write);
        input.write(`${error.message}\n`);
        return undefined;
      }
      throw error;
    }
    if (agent === undefined) {
      writeRepairHandoffSummary(handoff, input.write);
      input.write("Repair handoff cancelled.\n");
      return undefined;
    }
    input.write(`Selected ${agent.displayName}.\n`);
    input.write(`Launch preview: ${formatRepairAgentPreview(agent.id)}\n`);
    writeRepairHandoffSummary(handoff, input.write);
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
): void => {
  if (handoff.reportDirectory !== undefined) {
    write(`Report directory: ${handoff.reportDirectory}\n`);
  }
  if (handoff.promptPath !== undefined) {
    write(`Repair prompt: ${handoff.promptPath}\n`);
  } else {
    write(`Repair prompt:\n${handoff.prompt}\n`);
  }
  if (handoff.reportWriteError !== undefined) {
    write(`Report write failed: ${handoff.reportWriteError.message}\n`);
  }
};

const writeCleanupHandoffSummary = (
  handoff: Awaited<ReturnType<typeof prepareCleanupHandoff>>,
  write: (message: string) => void,
): void => {
  if (handoff.reportDirectory !== undefined) {
    write(`Report directory: ${handoff.reportDirectory}\n`);
  }
  if (handoff.usageJsonPath !== undefined) {
    write(`Usage JSON: ${handoff.usageJsonPath}\n`);
  }
  if (handoff.usageMarkdownPath !== undefined) {
    write(`Usage report: ${handoff.usageMarkdownPath}\n`);
  }
  if (handoff.promptPath !== undefined) {
    write(`Cleanup prompt: ${handoff.promptPath}\n`);
  } else {
    write(`Cleanup prompt:\n${handoff.prompt}\n`);
  }
  if (handoff.reportWriteError !== undefined) {
    write(`Report write failed: ${handoff.reportWriteError.message}\n`);
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
  return groupFindingsByKey(findings, (finding) => finding.skillName ?? finding.skillPath)
    .map((group) => {
      const lines = [`${group.key}:`];
      lines.push(...group.findings.map((finding) => `- [${finding.severity}] ${finding.ruleId}`));
      return lines.join("\n");
    })
    .join("\n\n")
    .concat("\n");
};

const renderPostCleanupSummary = (
  before: ScanReport,
  after: ScanReport,
  reportDirectory: string | undefined,
): string => {
  const lines = [
    "Post-cleanup re-scan:",
    `Skills: ${before.skillCount} -> ${after.skillCount}`,
    `Context budget pressure: ${before.usage?.contextPressure.level ?? "unknown"} -> ${after.usage?.contextPressure.level ?? "unknown"}`,
    `Findings: ${before.findingCount} -> ${after.findingCount}`,
  ];
  if (reportDirectory !== undefined) {
    lines.push(`Report directory: ${reportDirectory}`);
  }
  return `${lines.join("\n")}\n`;
};
