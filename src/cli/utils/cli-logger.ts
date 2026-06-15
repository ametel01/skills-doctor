export type CliLogger = {
  readonly log: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string) => void;
  readonly break: () => void;
};

export const cliLogger: CliLogger = {
  log: (message) => {
    process.stderr.write(`${message}\n`);
  },
  warn: (message) => {
    process.stderr.write(`${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`${message}\n`);
  },
  break: () => {
    process.stderr.write("\n");
  },
};
