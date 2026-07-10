import { describe, expect, it } from "vitest";
import {
  stripTerminalAnsi,
  terminalCellWidth,
  truncateTerminalCells,
} from "../src/cli/utils/terminal-width.js";

describe("terminal width", () => {
  it("counts emoji and CJK as two cells while keeping combining marks in one grapheme", () => {
    expect(terminalCellWidth("🧪中e\u0301")).toBe(5);
  });

  it("counts emoji-presentation, regional-indicator flags, and keycaps as two cells", () => {
    expect(terminalCellWidth("❤️🇵🇭#️⃣")).toBe(6);
  });

  it("truncates colored graphemes by terminal cells and restores ANSI state", () => {
    const output = truncateTerminalCells("\x1b[31m🧪中e\u0301", 3);

    expect(stripTerminalAnsi(output)).toBe("🧪");
    expect(output).toBe("\x1b[31m🧪\x1b[0m");
  });

  it("truncates colored emoji-presentation graphemes without exceeding the cell budget", () => {
    const output = truncateTerminalCells("\x1b[31m❤️🇵🇭#️⃣", 5);

    expect(stripTerminalAnsi(output)).toBe("❤️🇵🇭");
    expect(terminalCellWidth(output)).toBe(4);
    expect(output).toBe("\x1b[31m❤️🇵🇭\x1b[0m");
  });

  it("does not split a combining grapheme when a suffix consumes the remaining width", () => {
    const output = truncateTerminalCells("e\u0301中A", 2, { suffix: "." });

    expect(output).toBe("e\u0301.");
    expect(terminalCellWidth(output)).toBe(2);
  });
});
