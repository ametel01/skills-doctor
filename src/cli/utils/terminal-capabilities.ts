export type TerminalCapabilitiesInput = {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly stdinIsTty: boolean;
  readonly stdoutIsTty: boolean;
  readonly stdinHasRawMode: boolean;
};

export type TerminalCapabilities = {
  readonly canPrompt: boolean;
  readonly canUseTui: boolean;
  readonly canUseAnsi: boolean;
};

export const resolveTerminalCapabilities = (
  input: TerminalCapabilitiesInput,
): TerminalCapabilities => {
  const terminalIsDumb = (input.env ?? process.env).TERM?.trim().toLowerCase() === "dumb";
  const canPrompt = input.stdinIsTty && !terminalIsDumb;
  const canUseAnsi = input.stdoutIsTty && !terminalIsDumb;

  return {
    canPrompt,
    canUseTui: canPrompt && input.stdoutIsTty && input.stdinHasRawMode,
    canUseAnsi,
  };
};
