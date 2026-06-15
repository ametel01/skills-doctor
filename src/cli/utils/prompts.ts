import { checkbox, confirm as confirmPrompt, input, select } from "@inquirer/prompts";

export type Choice<Value extends string> = {
  readonly name: string;
  readonly value: Value;
  readonly description?: string;
};

export type PromptAdapter = {
  readonly checkbox: <Value extends string>(
    message: string,
    choices: readonly Choice<Value>[],
  ) => Promise<Value[]>;
  readonly confirm: (message: string, defaultValue?: boolean) => Promise<boolean>;
  readonly input: (message: string, defaultValue?: string) => Promise<string>;
  readonly select: <Value extends string>(
    message: string,
    choices: readonly Choice<Value>[],
  ) => Promise<Value>;
};

export class PromptCancelledError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "PromptCancelledError";
  }
}

export const inquirerPromptAdapter: PromptAdapter = {
  checkbox: async (message, choices) =>
    runPrompt(() => checkbox({ message, choices: [...choices] })),
  confirm: async (message, defaultValue = true) =>
    runPrompt(() => confirmPrompt({ message, default: defaultValue })),
  input: async (message, defaultValue = "") =>
    runPrompt(() => input({ message, default: defaultValue })),
  select: async (message, choices) => runPrompt(() => select({ message, choices: [...choices] })),
};

const runPrompt = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") {
      throw new PromptCancelledError();
    }
    throw error;
  } finally {
    process.stdin.unref();
  }
};
