#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [, scriptPath, versionArg, changelogPath = "CHANGELOG.md"] = process.argv;

if (versionArg === undefined) {
  fail(
    `Usage: node ${basename(scriptPath ?? "extract-release-notes.mjs")} <version> [CHANGELOG.md]`,
  );
}

const version = versionArg.replace(/^v/, "");
const changelog = readFileSync(changelogPath, "utf8");
const headingPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+.*)?\\s*$`, "m");
const headingMatch = headingPattern.exec(changelog);

if (headingMatch === null) {
  fail(`No changelog section found for version ${version}.`);
}

const sectionStart = headingMatch.index + headingMatch[0].length;
const remaining = changelog.slice(sectionStart);
const nextSection = /^##\s+/m.exec(remaining);
const releaseNotes = remaining.slice(0, nextSection?.index).trim();

if (releaseNotes.length === 0) {
  fail(`Changelog section for version ${version} is empty.`);
}

process.stdout.write(`${releaseNotes}\n`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
