export type JsonModeContext = {
  readonly compact: boolean;
  readonly directory: string;
  readonly startTime: number;
};

export type JsonErrorReport = {
  readonly schemaVersion: 1;
  readonly ok: false;
  readonly directory: string;
  readonly error: {
    readonly name: string;
    readonly message: string;
  };
};

let context: JsonModeContext | null = null;

export const enableJsonMode = (input: {
  readonly compact?: boolean;
  readonly directory: string;
  readonly startTime?: number;
}): void => {
  context = {
    compact: input.compact ?? false,
    directory: input.directory,
    startTime: input.startTime ?? performance.now(),
  };
};

export const resetJsonMode = (): void => {
  context = null;
};

export const isJsonModeActive = (): boolean => context !== null;

export const writeJsonReport = (
  report: unknown,
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): void => {
  const serialized = context?.compact ? JSON.stringify(report) : JSON.stringify(report, null, 2);
  write(`${serialized}\n`);
};

export const writeJsonErrorReport = (
  error: unknown,
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): void => {
  const report = buildJsonErrorReport(error);
  try {
    writeJsonReport(report, write);
  } catch {
    write(
      '{"schemaVersion":1,"ok":false,"directory":"","error":{"name":"Error","message":"Internal error"}}\n',
    );
  }
};

export const buildJsonErrorReport = (error: unknown): JsonErrorReport => {
  const resolved = normalizeError(error);
  return {
    schemaVersion: 1,
    ok: false,
    directory: context?.directory ?? "",
    error: {
      name: resolved.name,
      message: resolved.message,
    },
  };
};

const normalizeError = (error: unknown): { readonly name: string; readonly message: string } => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "Error", message: String(error) };
};
