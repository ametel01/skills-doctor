import path from "node:path";
import type { ScanReport } from "../../domain/build-report.js";
import { buildScanReport } from "../../domain/build-report.js";
import { compareFindings, renderPostHandoffSummary } from "../../domain/compare-findings.js";
import { discoverSkillRoots } from "../../domain/discover-skill-roots.js";
import { scanSkillRoots } from "../../domain/scan-skills.js";
import { renderHumanSummary, resolveScanExitCode } from "../../domain/summarize-findings.js";
import type { Finding, SkillRoot } from "../../domain/types.js";
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
import { shouldSkipPrompts } from "../utils/should-skip-prompts.js";
import { createSpinner, type SpinnerFactory } from "../utils/spinner.js";

export type ScanFlags = {
  readonly json?: boolean;
  readonly jsonCompact?: boolean;
  readonly yes?: boolean;
};

export type ScanActionOptions = {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdinIsTty?: boolean;
  readonly prompts?: PromptAdapter;
  readonly writeStdout?: (message: string) => void;
  readonly writeStderr?: (message: string) => void;
  readonly spinner?: SpinnerFactory;
  readonly version?: string;
  readonly isRepairAgentAvailable?: AgentAvailabilityProbe;
  readonly repairReportOutputRoot?: string;
  readonly repairReportTimestamp?: string;
  readonly launchAgent?: RepairAgentLauncher;
};

type RootSelection = "all" | "claude" | "codex" | "custom";
type ReviewAction = "all" | "errors" | "by-skill" | "repair" | "exit";

export const scanAction = async (
  directory: string,
  flags: ScanFlags,
  options: ScanActionOptions = {},
): Promise<ScanReport> => {
  const cwd = path.resolve(options.cwd ?? process.cwd(), directory);
  const prompts = options.prompts ?? inquirerPromptAdapter;
  const writeStdout = options.writeStdout ?? ((message) => process.stdout.write(message));
  const writeStderr = options.writeStderr ?? ((message) => process.stderr.write(message));
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
    discoverSkillRoots({ cwd }),
  );
  let roots = discovered.roots;

  if (roots.length === 0) {
    if (skipPrompts) {
      throw new CliInputError(
        "No .claude/skills or .agents/skills root was found. Re-run interactively or add a supported skills root.",
      );
    }
    const customRoot = await prompts.input("Skills directory path", ".");
    const custom = await discoverSkillRoots({
      cwd,
      customRoots: [{ rootPath: customRoot, ecosystem: "custom" }],
    });
    roots = custom.roots;
  } else if (!skipPrompts) {
    roots = await selectRoots(roots, prompts);
  }

  if (roots.length === 0) {
    throw new CliInputError("No readable skills root was selected.");
  }

  const scan = await spinner.run("Scanning skills...", () => scanSkillRoots({ roots }));
  const report = buildScanReport({
    version: options.version ?? "0.0.0",
    directory: cwd,
    elapsedMilliseconds: 0,
    scan,
  });
  let finalReport = report;

  if (flags.json) {
    writeJsonReport(report, writeStdout);
  } else {
    writeStdout(renderHumanSummary(report));
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
          repairReportOutputRoot: options.repairReportOutputRoot,
          repairReportTimestamp: options.repairReportTimestamp,
          launchAgent: options.launchAgent ?? launchRepairAgent,
        })) ?? report;
    }
  }

  process.exitCode = resolveScanExitCode(finalReport);
  return finalReport;
};

const selectRoots = async (
  roots: readonly SkillRoot[],
  prompts: PromptAdapter,
): Promise<readonly SkillRoot[]> => {
  const hasClaude = roots.some((root) => root.ecosystem === "claude");
  const hasCodex = roots.some((root) => root.ecosystem === "codex");
  if (!hasClaude || !hasCodex) return roots;

  const selection = await prompts.select<RootSelection>("Choose skills folder to scan", [
    { name: "Both", value: "all" },
    { name: "Claude (.claude/skills)", value: "claude" },
    { name: "Codex/agents (.agents/skills)", value: "codex" },
  ]);

  if (selection === "all") return roots;
  return roots.filter((root) => root.ecosystem === selection);
};

type ReviewFindingsInput = {
  readonly cwd: string;
  readonly roots: readonly SkillRoot[];
  readonly version: string;
  readonly spinner: SpinnerFactory;
  readonly prompts: PromptAdapter;
  readonly write: (message: string) => void;
  readonly isRepairAgentAvailable?: AgentAvailabilityProbe | undefined;
  readonly repairReportOutputRoot?: string | undefined;
  readonly repairReportTimestamp?: string | undefined;
  readonly launchAgent: RepairAgentLauncher;
};

const reviewFindings = async (
  report: ScanReport,
  input: ReviewFindingsInput,
): Promise<ScanReport | undefined> => {
  const { prompts, write } = input;
  const action = await prompts.select<ReviewAction>("Review findings", [
    { name: "View blocking errors", value: "errors" },
    { name: "View all findings", value: "all" },
    { name: "View findings by skill", value: "by-skill" },
    { name: "Continue to repair handoff", value: "repair" },
    { name: "Exit without repair", value: "exit" },
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
    return;
  }
  write(renderFindings(selectedFindings));
  return undefined;
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

    const nextScan = await input.spinner.run("Re-scanning skills...", () =>
      scanSkillRoots({ roots: input.roots }),
    );
    const nextReport = buildScanReport({
      version: input.version,
      directory: input.cwd,
      elapsedMilliseconds: 0,
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
