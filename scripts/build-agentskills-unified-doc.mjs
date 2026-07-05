#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve("docs/AGENTSKILLS_IO_UNIFIED.md");
const RAW_BASE = "https://raw.githubusercontent.com/agentskills/agentskills/main/docs";
const PUBLIC_BASE = "https://agentskills.io";

const sources = [
  {
    title: "Agent Skills Overview",
    publicPath: "/home.md",
    rawPath: "home.mdx",
    description: "A standardized way to give AI agents new capabilities and expertise.",
  },
  {
    title: "Specification",
    publicPath: "/specification.md",
    rawPath: "specification.mdx",
    description: "The complete format specification for Agent Skills.",
  },
  {
    title: "Client Showcase",
    publicPath: "/clients.md",
    rawPath: "clients.mdx",
    description: "Known agent clients and tools that support Agent Skills.",
  },
  {
    title: "Quickstart",
    publicPath: "/skill-creation/quickstart.md",
    rawPath: "skill-creation/quickstart.mdx",
    description: "Create a first Agent Skill and test it in an agent client.",
  },
  {
    title: "Best practices for skill creators",
    publicPath: "/skill-creation/best-practices.md",
    rawPath: "skill-creation/best-practices.mdx",
    description: "Authoring guidance for useful, portable, maintainable skills.",
  },
  {
    title: "Optimizing skill descriptions",
    publicPath: "/skill-creation/optimizing-descriptions.md",
    rawPath: "skill-creation/optimizing-descriptions.mdx",
    description: "Guidance for trigger-oriented skill descriptions.",
  },
  {
    title: "Evaluating skill output quality",
    publicPath: "/skill-creation/evaluating-skills.md",
    rawPath: "skill-creation/evaluating-skills.mdx",
    description: "Guidance for trigger and output evals for skills.",
  },
  {
    title: "Using scripts in skills",
    publicPath: "/skill-creation/using-scripts.md",
    rawPath: "skill-creation/using-scripts.mdx",
    description: "Guidance for bundling and documenting scripts in skills.",
  },
  {
    title: "How to add skills support to your agent",
    publicPath: "/client-implementation/adding-skills-support.md",
    rawPath: "client-implementation/adding-skills-support.mdx",
    description: "Client implementation guidance for loading and activating skills.",
  },
];

const main = async () => {
  const sourceDocuments = await Promise.all(sources.map(loadSource));
  const renderedSections = sourceDocuments.map(renderSourceSection);
  const sourceHash = hashText(
    sourceDocuments.map((source) => `${source.rawUrl}\n${source.content}`).join("\n---\n"),
  );
  const previous = await readFile(OUTPUT_PATH, "utf8").catch(() => "");
  const previousHash = /^Source hash: `(sha256-[^`]+)`$/m.exec(previous)?.[1];
  const previousTimestamp = /^Generated: (.+)$/m.exec(previous)?.[1];
  const timestamp =
    previousHash === sourceHash && previousTimestamp !== undefined
      ? previousTimestamp
      : new Date().toISOString();

  const markdown = [
    "# Agent Skills Documentation Unified",
    "",
    `Generated: ${timestamp}`,
    "",
    "This document consolidates the public Agent Skills documentation pages listed by https://agentskills.io/llms.txt.",
    "Source documentation is licensed CC-BY-4.0 by the agentskills/agentskills project; repository code is Apache-2.0.",
    "",
    "Primary source index: https://agentskills.io/llms.txt",
    "Source repository: https://github.com/agentskills/agentskills",
    `Source hash: \`${sourceHash}\``,
    "",
    "## Source Files",
    "",
    ...sourceDocuments.flatMap((source) => [
      `- ${source.publicUrl}`,
      `  - Raw source: ${source.rawUrl}`,
    ]),
    "",
    "## Contents",
    "",
    ...sourceDocuments.map(
      (source, index) => `${index + 1}. [${source.title}](#${slug(source.title)})`,
    ),
    "",
    "---",
    "",
    ...renderedSections,
  ].join("\n");

  assertCleanArtifact(markdown);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${markdown.trimEnd()}\n`);
  console.log(`Wrote ${OUTPUT_PATH}`);
};

const loadSource = async (source) => {
  const rawUrl = `${RAW_BASE}/${source.rawPath}`;
  const publicUrl = `${PUBLIC_BASE}${source.publicPath}`;
  const content = await readText(rawUrl);
  const frontmatter = parseFrontmatter(content);
  return {
    ...source,
    title: frontmatter.title ?? source.title,
    description: frontmatter.description ?? source.description,
    rawUrl,
    publicUrl,
    content,
    body: frontmatter.body,
  };
};

const readText = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const parseFrontmatter = (content) => {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  if (match === null) return { body: content };
  const raw = match[1] ?? "";
  const body = content.slice(match[0].length);
  const title = /^title:\s*["']?(.+?)["']?\s*$/m.exec(raw)?.[1];
  const description = /^description:\s*["']?(.+?)["']?\s*$/m.exec(raw)?.[1];
  return { title, description, body };
};

const renderSourceSection = (source) =>
  [
    `## ${source.title}`,
    "",
    `Source: ${source.publicUrl}`,
    `Raw source: ${source.rawUrl}`,
    `Description: ${source.description}`,
    "",
    markdownFromMdx(source.body).trim(),
    "",
    "---",
    "",
  ].join("\n");

const markdownFromMdx = (mdx) => {
  const parts = splitFencedMarkdown(mdx);
  return parts
    .map((part) => (part.kind === "code" ? part.text : stripMdxOutsideCode(part.text)))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const splitFencedMarkdown = (markdown) => {
  const parts = [];
  const fencePattern = /(^|\n)(`{3,})[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g;
  let lastIndex = 0;
  for (const match of markdown.matchAll(fencePattern)) {
    const leadingNewline = match[1] === "\n" ? 1 : 0;
    const start = (match.index ?? 0) + leadingNewline;
    const end = (match.index ?? 0) + match[0].length;
    if (start > lastIndex) {
      parts.push({ kind: "markdown", text: markdown.slice(lastIndex, start) });
    }
    parts.push({ kind: "code", text: markdown.slice(start, end) });
    lastIndex = end;
  }
  if (lastIndex < markdown.length) {
    parts.push({ kind: "markdown", text: markdown.slice(lastIndex) });
  }
  return parts;
};

const stripMdxOutsideCode = (markdown) => {
  const output = [];
  let skippingMultilineTag = false;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (skippingMultilineTag) {
      if (trimmed.includes(">")) skippingMultilineTag = false;
      continue;
    }
    if (/^import\s/.test(trimmed) || /^export\s/.test(trimmed)) continue;
    if (/^<\/?[A-Z][A-Za-z0-9.:_-]*(?:\s+[^>]*)?>$/.test(trimmed)) continue;
    if (/^<[A-Z][A-Za-z0-9.:_-]*(?:\s+[^>]*)?\/>$/.test(trimmed)) continue;
    if (/^<[A-Z][A-Za-z0-9.:_-]*(?:\s+.*)?$/.test(trimmed) && !trimmed.includes(">")) {
      skippingMultilineTag = true;
      continue;
    }
    output.push(
      line
        .replace(/<([A-Z][A-Za-z0-9.:_-]*)(?:\s+[^>]*)?>/g, "")
        .replace(/<\/([A-Z][A-Za-z0-9.:_-]*)>/g, ""),
    );
  }

  return output.join("\n");
};

const assertCleanArtifact = (markdown) => {
  const outsideCode = splitFencedMarkdown(markdown)
    .filter((part) => part.kind === "markdown")
    .map((part) => part.text)
    .join("\n");
  const errors = [];
  if (/(^|\n)#{1,6}\s+\[Link\]\(#\)\s*(\n|$)/.test(outsideCode)) {
    errors.push("standalone [Link](#) heading");
  }
  if (/(^|\n)<[A-Z][A-Za-z0-9.:_-]*(?:\s+[^>]*)?>/m.test(outsideCode)) {
    errors.push("unconverted MDX component tag outside code fences");
  }
  if (containsEmptyCodeFence(markdown)) {
    errors.push("empty fenced code block");
  }
  if (errors.length > 0) {
    throw new Error(`Generated doc contains conversion artifacts: ${errors.join(", ")}`);
  }
};

const containsEmptyCodeFence = (markdown) => {
  for (const part of splitFencedMarkdown(markdown)) {
    if (part.kind !== "code") continue;
    const lines = part.text.split(/\r?\n/);
    const body = lines.slice(1, -1).join("\n");
    if (body.trim().length === 0) return true;
  }
  return false;
};

const hashText = (text) => `sha256-${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

await main();
