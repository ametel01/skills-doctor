import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildHandoffPrompt } from "../../domain/build-handoff-prompt.js";
import type { ScanReport } from "../../domain/build-report.js";
import type { Finding } from "../../domain/types.js";
import type {
  FindingsDirectoryInput,
  FindingsDirectoryResult,
} from "../../domain/write-findings-directory.js";
import { writeFindingsDirectory } from "../../domain/write-findings-directory.js";
import { CliInputError } from "./handle-error.js";
import type { PromptAdapter } from "./prompts.js";

export type RepairFindingSubset = "errors" | "errors-and-warnings" | "all" | "selected-skills";

export type PreparedRepairHandoff = {
  readonly findings: readonly Finding[];
  readonly prompt: string;
  readonly reportDirectory?: string | undefined;
  readonly promptPath?: string | undefined;
  readonly reportWriteError?: Error | undefined;
};

export type PrepareRepairHandoffInput = {
  readonly report: ScanReport;
  readonly prompts: PromptAdapter;
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly writeDirectory?: typeof writeFindingsDirectory | undefined;
};

export const prepareRepairHandoff = async (
  input: PrepareRepairHandoffInput,
): Promise<PreparedRepairHandoff> => {
  const findings = await chooseRepairFindings(input.report, input.prompts);
  if (findings.length === 0) {
    throw new CliInputError("No findings were selected for repair.");
  }

  const reportResult = await tryWriteFindingsDirectory({
    report: input.report,
    findings,
    outputRoot: input.outputRoot,
    timestamp: input.timestamp,
    writeDirectory: input.writeDirectory ?? writeFindingsDirectory,
  });
  const prompt = buildHandoffPrompt({
    report: input.report,
    findings,
    reportDirectory: reportResult.result?.directory,
  });

  let promptPath: string | undefined;
  if (reportResult.result !== undefined) {
    promptPath = path.join(reportResult.result.directory, "handoff-prompt.md");
    await writeFile(promptPath, `${prompt}\n`);
  }

  return {
    findings,
    prompt,
    reportDirectory: reportResult.result?.directory,
    promptPath,
    reportWriteError: reportResult.error,
  };
};

const chooseRepairFindings = async (
  report: ScanReport,
  prompts: PromptAdapter,
): Promise<readonly Finding[]> => {
  const choices: Array<{ name: string; value: RepairFindingSubset }> = [];
  if (report.errorCount > 0) {
    choices.push({ name: "Blocking errors only", value: "errors" });
  }
  if (report.errorCount + report.warningCount > 0) {
    choices.push({ name: "Blocking errors and warnings", value: "errors-and-warnings" });
  }
  if (report.findingCount > 0) {
    choices.push({ name: "All findings", value: "all" });
  }
  if (report.skills.some((skill) => skill.findingCount > 0)) {
    choices.push({ name: "Selected skills", value: "selected-skills" });
  }

  const subset = await prompts.select<RepairFindingSubset>("Choose findings to repair", choices);

  if (subset === "errors") {
    return report.findings.filter((finding) => finding.severity === "error");
  }
  if (subset === "errors-and-warnings") {
    return report.findings.filter((finding) => finding.severity !== "advice");
  }
  if (subset === "all") {
    return report.findings;
  }

  const skillChoices = report.skills
    .filter((skill) => skill.findingCount > 0)
    .map((skill) => ({
      name: `${skill.name} (${skill.findingCount})`,
      value: skill.skillPath,
      description: skill.skillPath,
    }));
  const selectedSkillPaths = await prompts.checkbox("Choose skills to repair", skillChoices);
  if (selectedSkillPaths.length === 0) {
    throw new CliInputError("No skills were selected for repair.");
  }
  return report.findings.filter((finding) => selectedSkillPaths.includes(finding.skillPath));
};

const tryWriteFindingsDirectory = async (input: {
  readonly report: ScanReport;
  readonly findings: readonly Finding[];
  readonly outputRoot?: string | undefined;
  readonly timestamp?: string | undefined;
  readonly writeDirectory: (input: FindingsDirectoryInput) => Promise<FindingsDirectoryResult>;
}): Promise<{ readonly result?: FindingsDirectoryResult; readonly error?: Error }> => {
  try {
    return {
      result: await input.writeDirectory({
        report: input.report,
        findings: input.findings,
        outputRoot: input.outputRoot,
        timestamp: input.timestamp,
      }),
    };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
};
