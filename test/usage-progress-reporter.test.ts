import { describe, expect, it } from "vitest";
import { createUsageProgressReporter } from "../src/cli/utils/spinner.js";

describe("createUsageProgressReporter", () => {
  it("coalesces TTY updates to ten per second while keeping completion visible", () => {
    const output: string[] = [];
    let now = 0;
    const reporter = createUsageProgressReporter({
      enabled: true,
      isTty: true,
      now: () => now,
      write: (message) => output.push(message),
    });

    reporter.onDiscoveryProgress(discoveryEvent("started", 0));
    now = 50;
    reporter.onDiscoveryProgress(discoveryEvent("file-inspected", 1));
    now = 100;
    reporter.onProgress(analysisEvent("source-progress", 20));
    now = 150;
    reporter.onProgress(analysisEvent("completed", 100));
    reporter.finish();

    expect(output).toEqual([
      "\rDiscovering Codex usage sources... | 0 directories | 0 JSONL files | 0 candidates",
      "\rAnalyzing local Codex usage... 20% | 0/1 source | 1 records | 0 matches",
      "\rAnalyzing local Codex usage... 100% | 1/1 source | 2 records | 1 matches",
      "\n",
    ]);
  });

  it("emits one final redirected summary and ignores repeated finalization", () => {
    const output: string[] = [];
    const reporter = createUsageProgressReporter({
      enabled: true,
      isTty: false,
      write: (message) => output.push(message),
    });

    reporter.onDiscoveryProgress(discoveryEvent("file-inspected", 1));
    reporter.onProgress(analysisEvent("source-progress", 20));
    reporter.onProgress(analysisEvent("completed", 100));
    reporter.finish();
    reporter.finish();

    expect(output).toEqual([
      "Analyzing local Codex usage... 100% | 1/1 source | 2 records | 1 matches\n",
    ]);
  });
});

const discoveryEvent = (phase: "started" | "file-inspected", inspectedJsonlFileCount: number) => ({
  phase,
  scannedDirectoryCount: 0,
  inspectedJsonlFileCount,
  candidateSourceCount: 0,
  includedSourceCount: 0,
});

const analysisEvent = (phase: "source-progress" | "completed", processedBytes: number) => ({
  phase,
  totalSources: 1,
  completedSources: phase === "completed" ? 1 : 0,
  totalBytes: 100,
  processedBytes,
  recordCount: phase === "completed" ? 2 : 1,
  parsedRecordCount: phase === "completed" ? 2 : 1,
  invalidRecordCount: 0,
  eventCount: phase === "completed" ? 1 : 0,
});
