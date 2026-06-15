import { describe, expect, it } from "vitest";
import { printScoreHeader, renderScoreHeader } from "../src/cli/utils/render-score-header.js";
import type { ScoreSummary } from "../src/index.js";

describe("score header", () => {
  it("renders a four-line face header with proportional score bar", () => {
    const header = renderScoreHeader(makeScore(73, "Needs work"), {
      color: false,
      columns: 120,
    });

    expect(header).toContain("73 / 100 Needs work");
    expect(header).toContain("Skills Doctor");
    expect(header).toContain(`${"█".repeat(37)}${"░".repeat(13)}`);
    expect(header.trimEnd().split("\n")).toHaveLength(4);
  });

  it("clamps score bar width for narrow terminals", () => {
    const header = renderScoreHeader(makeScore(50, "Needs work"), {
      color: false,
      columns: 24,
    });

    expect(header).toContain(`${"█".repeat(6)}${"░".repeat(6)}`);
  });

  it("renders projected gain with the projected segment glyph", () => {
    const header = renderScoreHeader(makeScore(50, "Needs work"), {
      color: false,
      columns: 120,
      potentialScore: 75,
    });

    expect(header).toContain(`${"█".repeat(25)}${"▓".repeat(13)}${"░".repeat(12)}`);
  });

  it("colorizes score-threshold elements only when requested", () => {
    expect(renderScoreHeader(makeScore(49, "Critical"), { color: false })).not.toContain("\x1b[");
    expect(renderScoreHeader(makeScore(49, "Critical"), { color: true })).toContain("\x1b[31m");
  });

  it("can animate by rewriting the score and bar lines in place", async () => {
    const chunks: string[] = [];

    await printScoreHeader({
      score: makeScore(80, "Great"),
      write: (message) => chunks.push(message),
      animate: true,
      color: false,
      frameCount: 2,
      frameDelayMilliseconds: 0,
    });

    const output = chunks.join("");
    expect(output).toContain("\x1b[5A");
    expect(output).toContain("\x1b[2A");
    expect(output).toContain("\x1b[3B");
    expect(output).toContain("80 / 100 Great");
  });
});

const makeScore = (value: number, label: ScoreSummary["label"]): ScoreSummary => ({
  value,
  label,
  penalty: 100 - value,
  distinctErrorRuleCount: 0,
  distinctWarningRuleCount: 0,
  distinctAdviceRuleCount: 0,
});
