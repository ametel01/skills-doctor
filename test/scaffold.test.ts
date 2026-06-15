import { describe, expect, it } from "vitest";

describe("CLI scaffold", () => {
  it("does not expose scaffold-only CLI symbols", async () => {
    const api = await import("../src/index.js");
    expect(api).not.toHaveProperty("CLI_NAME");
    expect(api).not.toHaveProperty("getCliBanner");
  });
});
