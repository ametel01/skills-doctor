import { describe, expect, it } from "vitest";
import { isExpectedUserError } from "../src/cli/utils/handle-error.js";
import { PromptCancelledError } from "../src/cli/utils/prompts.js";
import { shouldSkipPrompts } from "../src/cli/utils/should-skip-prompts.js";

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
});
