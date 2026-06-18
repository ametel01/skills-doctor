import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const execFileAsync = promisify(execFile);

describe("CLI bin", () => {
  it("runs the development entrypoint", async () => {
    await execFileAsync("bun", ["run", "build"], { cwd: process.cwd() });

    const { stdout } = await execFileAsync("bun", ["run", "dev", "--", "--version"], {
      cwd: process.cwd(),
    });

    expect(stdout.trim().split(/\r?\n/).at(-1)).toBe(packageJson.version);
  });
});
