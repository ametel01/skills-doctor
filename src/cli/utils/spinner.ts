import type { SkillUsageProgressEvent } from "../../domain/analyze-skill-usage.js";
import type { DiscoverUsageSourcesProgressEvent } from "../../domain/discover-usage-sources.js";

export type SpinnerFactory = {
  readonly run: <T>(message: string, operation: () => Promise<T>) => Promise<T>;
};

export const createSpinner = (input: {
  readonly enabled: boolean;
  readonly write?: (message: string) => void;
}): SpinnerFactory => {
  const write =
    input.write ??
    ((message: string) => {
      process.stderr.write(`${message}\n`);
    });

  return {
    run: async (message, operation) => {
      if (input.enabled) write(message);
      return await operation();
    },
  };
};

export type UsageProgressReporter = {
  readonly onDiscoveryProgress: (event: DiscoverUsageSourcesProgressEvent) => void;
  readonly onProgress: (event: SkillUsageProgressEvent) => void;
  readonly finish: () => void;
};

export const createUsageProgressReporter = (input: {
  readonly enabled: boolean;
  readonly write?: (message: string) => void;
  readonly isTty?: boolean | undefined;
}): UsageProgressReporter => {
  const write =
    input.write ??
    ((message: string) => {
      process.stderr.write(message);
    });
  let lastMessage = "";
  let finished = false;

  const render = (event: SkillUsageProgressEvent): string => {
    const percent =
      event.totalBytes > 0
        ? `${Math.min(100, Math.floor((event.processedBytes / event.totalBytes) * 100))}%`
        : "counting";
    const sourceLabel =
      event.totalSources === 1
        ? `${event.completedSources}/1 source`
        : `${event.completedSources}/${event.totalSources} sources`;
    return [
      `Analyzing local Codex usage... ${percent}`,
      sourceLabel,
      `${formatInteger(event.recordCount)} records`,
      `${formatInteger(event.eventCount)} matches`,
    ].join(" | ");
  };

  const writeMessage = (message: string) => {
    if (!input.enabled || message === lastMessage) return;
    lastMessage = message;
    if (input.isTty === true) {
      write(`\r${message}`);
    } else {
      write(`${message}\n`);
    }
  };

  return {
    onDiscoveryProgress: (event) => {
      if (finished) return;
      writeMessage(renderDiscoveryProgress(event));
    },
    onProgress: (event) => {
      if (finished) return;
      writeMessage(render(event));
    },
    finish: () => {
      if (!input.enabled || finished) return;
      finished = true;
      if (input.isTty === true && lastMessage.length > 0) {
        write("\n");
      }
    },
  };
};

const formatInteger = (value: number): string => new Intl.NumberFormat("en-US").format(value);

const renderDiscoveryProgress = (event: DiscoverUsageSourcesProgressEvent): string =>
  [
    "Discovering Codex usage sources...",
    `${formatInteger(event.scannedDirectoryCount)} directories`,
    `${formatInteger(event.inspectedJsonlFileCount)} JSONL files`,
    `${formatInteger(event.candidateSourceCount)} candidates`,
  ].join(" | ");
