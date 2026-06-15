import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("extract-release-notes", () => {
  it("prints the requested changelog section", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-release-notes-"));
    const changelogPath = path.join(directory, "CHANGELOG.md");
    await writeFile(
      changelogPath,
      [
        "# Changelog",
        "",
        "## [Unreleased]",
        "",
        "## [0.1.0] - 2026-06-15",
        "",
        "### Added",
        "",
        "- Initial release.",
        "",
        "## [0.0.1] - 2026-06-14",
        "",
        "### Added",
        "",
        "- Earlier release.",
        "",
      ].join("\n"),
    );

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        path.join(process.cwd(), "scripts", "extract-release-notes.mjs"),
        "0.1.0",
        changelogPath,
      ]);

      expect(stdout.trim()).toBe(["### Added", "", "- Initial release."].join("\n"));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
