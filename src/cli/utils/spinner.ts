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
