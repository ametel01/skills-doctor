import path from "node:path";
import type { ScanReport } from "../../domain/build-report.js";
import { buildScanReport } from "../../domain/build-report.js";
import { discoverSkillRoots } from "../../domain/discover-skill-roots.js";
import { scanSkillRoots } from "../../domain/scan-skills.js";
import { renderHumanSummary, resolveScanExitCode } from "../../domain/summarize-findings.js";
import type { Finding, SkillRoot } from "../../domain/types.js";
import { CliInputError } from "../utils/handle-error.js";
import { enableJsonMode, writeJsonReport } from "../utils/json-mode.js";
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

  if (flags.json) {
    writeJsonReport(report, writeStdout);
  } else {
    writeStdout(renderHumanSummary(report));
    if (!skipPrompts && report.findingCount > 0) {
      await reviewFindings(report.findings, prompts, writeStdout);
    }
  }

  process.exitCode = resolveScanExitCode(report);
  return report;
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

const reviewFindings = async (
  findings: readonly Finding[],
  prompts: PromptAdapter,
  write: (message: string) => void,
): Promise<void> => {
  const action = await prompts.select<ReviewAction>("Review findings", [
    { name: "View blocking errors", value: "errors" },
    { name: "View all findings", value: "all" },
    { name: "View findings by skill", value: "by-skill" },
    { name: "Continue to repair handoff", value: "repair" },
    { name: "Exit without repair", value: "exit" },
  ]);

  if (action === "exit") return;
  if (action === "repair") {
    write("Repair handoff will be available in the next implementation step.\n");
    return;
  }

  const selectedFindings =
    action === "errors" ? findings.filter((finding) => finding.severity === "error") : findings;
  if (action === "by-skill") {
    write(renderFindingsBySkill(selectedFindings));
    return;
  }
  write(renderFindings(selectedFindings));
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
