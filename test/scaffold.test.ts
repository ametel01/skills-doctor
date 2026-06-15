import { describe, expect, it } from "vitest";
import { CLI_NAME, getCliBanner } from "../src/index.js";

describe("CLI scaffold", () => {
  it("exports the package CLI name", () => {
    expect(CLI_NAME).toBe("skills-doctor");
  });

  it("builds a startup banner", () => {
    expect(getCliBanner()).toContain(CLI_NAME);
  });
});
