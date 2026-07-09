import { describe, expect, it } from "vitest";
import { isExpectedUserError } from "../src/cli/utils/handle-error.js";
import { PromptCancelledError } from "../src/cli/utils/prompts.js";
import { shouldSkipPrompts } from "../src/cli/utils/should-skip-prompts.js";
import { resolveTerminalCapabilities } from "../src/cli/utils/terminal-capabilities.js";

describe("prompt behavior", () => {
  it("treats prompt cancellation as an expected user error", () => {
    expect(isExpectedUserError(new PromptCancelledError())).toBe(true);
  });

  it("skips prompts for non-interactive defaults", () => {
    expect(shouldSkipPrompts({ yes: true, stdinIsTty: true, env: {} })).toBe(true);
    expect(shouldSkipPrompts({ json: true, stdinIsTty: true, env: {} })).toBe(true);
    expect(shouldSkipPrompts({ stdinIsTty: false, env: {} })).toBe(true);
    expect(shouldSkipPrompts({ stdinIsTty: true, env: { CI: "true" } })).toBe(true);
    expect(shouldSkipPrompts({ stdinIsTty: true, env: { CODEX_SANDBOX: "1" } })).toBe(true);
    expect(shouldSkipPrompts({ stdinIsTty: true, env: {} })).toBe(false);
  });

  it("keeps terminal capability separate from non-interactive policy", () => {
    const capabilities = resolveTerminalCapabilities({
      env: { TERM: "dumb" },
      stdinIsTty: true,
      stdoutIsTty: true,
      stdinHasRawMode: true,
    });

    expect(shouldSkipPrompts({ env: { TERM: "dumb" }, canPrompt: capabilities.canPrompt })).toBe(
      true,
    );
    expect(shouldSkipPrompts({ yes: true, env: {}, canPrompt: true })).toBe(true);
    expect(shouldSkipPrompts({ json: true, env: {}, canPrompt: true })).toBe(true);
    expect(shouldSkipPrompts({ env: { CI: "true" }, canPrompt: true })).toBe(true);
  });
});
