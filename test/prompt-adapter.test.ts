import { afterEach, describe, expect, it, vi } from "vitest";
import { BackToMainMenuError } from "../src/cli/utils/handle-error.js";

describe("inquirer prompt adapter", () => {
  afterEach(() => {
    vi.doUnmock("@inquirer/prompts");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses b to return from select prompts that include a back choice", async () => {
    let capturedConfig:
      | {
          readonly theme?: {
            readonly style?: {
              readonly keysHelpTip?: (keys: [key: string, action: string][]) => string | undefined;
            };
          };
        }
      | undefined;

    vi.doMock("@inquirer/prompts", () => ({
      checkbox: vi.fn(),
      confirm: vi.fn(),
      input: vi.fn(),
      select: vi.fn((config, context?: { readonly signal?: AbortSignal }) => {
        capturedConfig = config;
        queueMicrotask(() => {
          process.stdin.emit("keypress", "b", { name: "b" });
        });
        return new Promise((_resolve, reject) => {
          context?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    }));

    const { BACK_TO_MAIN_MENU_VALUE, backToMainMenuChoice, inquirerPromptAdapter } = await import(
      "../src/cli/utils/prompts.js"
    );

    await expect(
      inquirerPromptAdapter.select("Choose repair agent", [
        { name: "Codex", value: "codex" },
        backToMainMenuChoice,
      ]),
    ).rejects.toBeInstanceOf(BackToMainMenuError);

    expect(
      capturedConfig?.theme?.style?.keysHelpTip?.([
        ["↑/↓", "navigate"],
        ["enter", "select"],
      ]),
    ).toBe("↑/↓ navigate • enter select • b back");
    expect(BACK_TO_MAIN_MENU_VALUE).toBe(backToMainMenuChoice.value);
  });

  it("does not bind b for select prompts without a back choice", async () => {
    vi.doMock("@inquirer/prompts", () => ({
      checkbox: vi.fn(),
      confirm: vi.fn(),
      input: vi.fn(),
      select: vi.fn(() => {
        process.stdin.emit("keypress", "b", { name: "b" });
        return Promise.resolve("codex");
      }),
    }));

    const { inquirerPromptAdapter } = await import("../src/cli/utils/prompts.js");

    await expect(
      inquirerPromptAdapter.select("Next step", [{ name: "Codex", value: "codex" }]),
    ).resolves.toBe("codex");
  });
});
