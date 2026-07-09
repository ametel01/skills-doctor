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
  readonly now?: () => number;
}): UsageProgressReporter => {
  const write =
    input.write ??
    ((message: string) => {
      process.stderr.write(message);
    });
  const now = input.now ?? performance.now.bind(performance);
  let lastMessage = "";
  let lastRenderedMessage = "";
  let lastRenderedAt = Number.NEGATIVE_INFINITY;
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

  const writeTtyMessage = (message: string) => {
    if (message === lastRenderedMessage) return;
    write(`\r${message}`);
    lastRenderedMessage = message;
    lastRenderedAt = now();
  };

  const update = (message: string, completed: boolean) => {
    if (!input.enabled || finished) return;
    lastMessage = message;
    if (input.isTty !== true) return;
    if (completed || now() - lastRenderedAt >= 100) writeTtyMessage(message);
  };

  return {
    onDiscoveryProgress: (event) => {
      update(renderDiscoveryProgress(event), event.phase === "completed");
    },
    onProgress: (event) => {
      update(render(event), event.phase === "completed");
    },
    finish: () => {
      if (finished) return;
      finished = true;
      if (!input.enabled || lastMessage.length === 0) return;
      if (input.isTty === true) {
        if (lastMessage !== lastRenderedMessage) writeTtyMessage(lastMessage);
        write("\n");
        return;
      }
      write(`${lastMessage}\n`);
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
