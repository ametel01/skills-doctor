import { describe, expect, it } from "vitest";
import { resolveTerminalCapabilities } from "../src/cli/utils/terminal-capabilities.js";

describe("resolveTerminalCapabilities", () => {
  it.each([
    ["TERM=dumb", { TERM: "DuMb" }, true, true, true, false, false, false],
    ["normal TTY", {}, true, true, true, true, true, true],
    ["non-TTY stdin", {}, false, true, true, false, false, true],
    ["non-TTY stdout", {}, true, false, true, true, false, false],
    ["no raw mode", {}, true, true, false, true, false, true],
  ])("%s resolves each capability independently", (_label, env, stdinIsTty, stdoutIsTty, stdinHasRawMode, canPrompt, canUseTui, canUseAnsi) => {
    expect(resolveTerminalCapabilities({ env, stdinIsTty, stdoutIsTty, stdinHasRawMode })).toEqual({
      canPrompt,
      canUseTui,
      canUseAnsi,
    });
  });
});
