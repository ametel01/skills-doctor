import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeSkillUsage,
  parseSkillContent,
  type SkillRecord,
  type SkillUsageAnalysis,
  type SkillUsageSummary,
} from "../src/index.js";

describe("skill usage analysis", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "skills-doctor-usage-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("returns deterministic usage counts, tiers, confidence, and recommendations", async () => {
    const usageSource = path.join(directory, "sessions", "session.jsonl");
    await mkdir(path.dirname(usageSource), { recursive: true });
    await writeJsonl(usageSource, [
      assistant("2026-06-15T00:00:00.000Z", "Using the `gh-fix-ci` skill."),
      assistant("2026-06-15T00:00:00.000Z", "Using the `gh-fix-ci` skill again."),
      assistant("2026-06-16T00:00:00.000Z", "I'll use the `create-plan-from-doc` skill."),
      assistant("2026-06-17T00:00:00.000Z", "I'm using the `teach` skill."),
      assistant("2026-06-18T00:00:00.000Z", "Using the `teach` skill."),
      assistant("2026-06-19T00:00:00.000Z", "Using the `teach` skill."),
      assistant("2026-06-20T00:00:00.000Z", "Using the `teach` skill."),
      assistant("2026-06-20T01:00:00.000Z", "Using the `teach` skill."),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [
        buildRecord({ name: "gh-fix-ci", source: "global" }),
        buildRecord({ name: "create-plan-from-doc", source: "local" }),
        buildRecord({
          name: "teach",
          source: "global",
          description: `Use this skill when teaching. ${"Long context. ".repeat(40)}`,
        }),
        buildRecord({ name: "unused-global", source: "global" }),
      ],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.readableSourceCount).toBe(1);
    expect(analysis.events).toHaveLength(7);
    expect(summary(analysis, "gh-fix-ci")).toMatchObject({
      usageCount: 1,
      recentUsageCount: 1,
      tier: "recent",
      confidence: "medium",
      lastUsedAt: "2026-06-15T00:00:00.000Z",
    });
    expect(summary(analysis, "teach")).toMatchObject({
      usageCount: 5,
      recentUsageCount: 5,
      tier: "frequent",
      confidence: "medium",
    });
    expect(summary(analysis, "unused-global")).toMatchObject({
      usageCount: 0,
      recentUsageCount: 0,
      tier: "unused",
      confidence: "none",
    });
    expect(actions(analysis, "teach")).toEqual(["keep", "shorten-description"]);
    expect(actions(analysis, "unused-global")).toEqual(["disable-candidate"]);
    expect(analysis.skillsByUsage.map((skill) => skill.skillName)).toEqual([
      "teach",
      "create-plan-from-doc",
      "gh-fix-ci",
      "unused-global",
    ]);
  });

  it("counts only timestamped detected usage inside the recent window", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      assistant("2026-05-10T00:00:00.000Z", "Using the `agent-coding-workflow` skill."),
      assistant("2026-06-15T00:00:00.000Z", "Using the `agent-coding-workflow` skill."),
      {
        role: "assistant",
        content: "Using the `agent-coding-workflow` skill without a timestamp.",
      },
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "agent-coding-workflow", source: "global" })],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(summary(analysis, "agent-coding-workflow")).toMatchObject({
      usageCount: 3,
      recentUsageCount: 1,
      tier: "recent",
    });
  });

  it("returns unknown tiers and diagnostics when JSONL sources are missing", async () => {
    const missingSource = path.join(directory, "missing.jsonl");

    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "agent-coding-workflow", source: "global" })],
      usageSourcePaths: [missingSource],
    });

    expect(analysis.readableSourceCount).toBe(0);
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-source-unreadable",
        severity: "warning",
        path: missingSource,
      }),
    ]);
    expect(summary(analysis, "agent-coding-workflow")).toMatchObject({
      tier: "unknown",
      usageCount: 0,
    });
    expect(actions(analysis, "agent-coding-workflow")).toEqual(["review"]);
  });

  it("matches medium-confidence phrases only when they map to one known skill", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      assistant("2026-06-15T00:00:00.000Z", "I will use the agent coding workflow skill."),
      assistant("2026-06-15T00:01:00.000Z", "I will use the shared review skill."),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [
        buildRecord({ name: "agent-coding-workflow", source: "global" }),
        buildRecord({ name: "shared-review", source: "global", rootPath: "first-root" }),
        buildRecord({ name: "shared-review", source: "local", rootPath: "second-root" }),
      ],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(summary(analysis, "agent-coding-workflow")).toMatchObject({
      usageCount: 1,
      confidence: "medium",
      tier: "recent",
    });
    expect(analysis.skillsByUsage.filter((skill) => skill.skillName === "shared-review")).toEqual([
      expect.objectContaining({ usageCount: 0, tier: "unused" }),
      expect.objectContaining({ usageCount: 0, tier: "unused" }),
    ]);
  });

  it("matches current Codex response_item payload assistant messages", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "I'm using the agent coding workflow skill.",
            },
          ],
        },
      },
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "agent-coding-workflow", source: "global" })],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(summary(analysis, "agent-coding-workflow")).toMatchObject({
      usageCount: 1,
      confidence: "medium",
      tier: "recent",
      lastUsedAt: "2026-06-20T00:00:00.000Z",
    });
  });

  it("records explicit user invocations and plugin-qualified aliases as high-confidence events", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    const pluginRoot = path.join(
      directory,
      ".codex",
      "plugins",
      "cache",
      "openai-curated",
      "github",
      "202e9242",
      "skills",
    );
    await writeJsonl(usageSource, [
      user("2026-06-20T00:00:00.000Z", "Use $agent-coding-workflow and $github:gh-fix-ci."),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [
        buildRecord({ name: "agent-coding-workflow", source: "global" }),
        buildRecord({ name: "gh-fix-ci", source: "global", rootPath: pluginRoot }),
      ],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.events).toEqual([
      expect.objectContaining({
        skillName: "agent-coding-workflow",
        confidence: "high",
        evidenceKind: "explicit-user-invocation",
      }),
      expect.objectContaining({
        skillName: "gh-fix-ci",
        confidence: "high",
        evidenceKind: "explicit-user-invocation",
      }),
    ]);
    expect(summary(analysis, "agent-coding-workflow")).toMatchObject({
      usageCount: 1,
      confidence: "high",
      tier: "recent",
    });
    expect(summary(analysis, "gh-fix-ci")).toMatchObject({
      pluginName: "github",
      usageCount: 1,
      confidence: "high",
      tier: "recent",
    });
  });

  it("records user markdown links to known SKILL.md files", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    const linkedSkill = buildRecord({ name: "linked-skill", source: "global" });
    await writeJsonl(usageSource, [
      user(
        "2026-06-20T00:00:00.000Z",
        `Please use [linked skill](${linkedSkill.skillPath}) for this task.`,
      ),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [linkedSkill],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.events).toEqual([
      expect.objectContaining({
        skillName: "linked-skill",
        confidence: "high",
        evidenceKind: "codex-skill-markdown-link",
      }),
    ]);
  });

  it("records tool and function calls that read known SKILL.md files", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    const readSkill = buildRecord({ name: "tool-read-skill", source: "global" });
    await writeJsonl(usageSource, [
      {
        timestamp: "2026-06-20T00:00:00.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "functions.exec_command",
          arguments: JSON.stringify({ cmd: `sed -n '1,120p' ${readSkill.skillPath}` }),
        },
      },
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [readSkill],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.events).toEqual([
      expect.objectContaining({
        skillName: "tool-read-skill",
        confidence: "high",
        evidenceKind: "tool-skill-md-read",
      }),
    ]);
  });

  it("keeps duplicate-name evidence ambiguous instead of assigning it to the wrong skill", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      user("2026-06-20T00:00:00.000Z", "Use $shared-review for this."),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [
        buildRecord({ name: "shared-review", source: "global", rootPath: "/tmp/first" }),
        buildRecord({ name: "shared-review", source: "local", rootPath: "/tmp/second" }),
      ],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.events).toEqual([]);
    expect(analysis.sourceCoverage).toEqual([
      expect.objectContaining({
        status: "incomplete",
        diagnosticCodes: ["usage-evidence-ambiguous"],
      }),
    ]);
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: "usage-evidence-ambiguous",
        path: usageSource,
      }),
    ]);
    expect(analysis.skillsByUsage).toEqual([
      expect.objectContaining({ skillName: "shared-review", usageCount: 0, tier: "unused" }),
      expect.objectContaining({ skillName: "shared-review", usageCount: 0, tier: "unused" }),
    ]);
  });

  it("marks invalid JSONL sources as incomplete coverage without storing transcript text", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await mkdir(path.dirname(usageSource), { recursive: true });
    await writeFile(
      usageSource,
      [
        JSON.stringify(user("2026-06-20T00:00:00.000Z", "Use $valid-skill with private context.")),
        "{not-json",
        "",
      ].join("\n"),
    );

    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "valid-skill", source: "global" })],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(analysis.coverageStatus).toBe("incomplete");
    expect(analysis.sourceCoverage).toEqual([
      expect.objectContaining({
        status: "incomplete",
        recordCount: 2,
        parsedRecordCount: 1,
        invalidRecordCount: 1,
        eventCount: 1,
        diagnosticCodes: ["usage-source-invalid-json"],
      }),
    ]);
    expect(JSON.stringify(analysis)).not.toContain("private context");
  });

  it("streams full usage sources beyond the old tail limit without reporting transcript text", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await mkdir(path.dirname(usageSource), { recursive: true });
    const privateFrontText = "private front transcript";
    const privateTailText = "private tail transcript";
    const records = [
      JSON.stringify(
        assistant(
          "2026-06-01T00:00:00.000Z",
          `Using the \`front-only\` skill. ${privateFrontText}`,
        ),
      ),
      ...Array.from({ length: 12_000 }, (_, index) =>
        JSON.stringify({
          timestamp: `2026-06-10T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
          role: "assistant",
          content: `padding record ${index} ${"x".repeat(100)}`,
        }),
      ),
      JSON.stringify(
        assistant("2026-06-20T00:00:00.000Z", `Using the \`tail-used\` skill. ${privateTailText}`),
      ),
    ];
    await writeFile(usageSource, `${records.join("\n")}\n`);

    const analysis = await analyzeSkillUsage({
      skills: [
        buildRecord({ name: "front-only", source: "global" }),
        buildRecord({ name: "tail-used", source: "global" }),
      ],
      usageSourcePaths: [usageSource],
      maxFileBytes: 512,
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    const serialized = JSON.stringify(analysis);

    expect(summary(analysis, "front-only")).toMatchObject({ usageCount: 1, tier: "recent" });
    expect(summary(analysis, "tail-used")).toMatchObject({
      usageCount: 1,
      tier: "recent",
      lastUsedAt: "2026-06-20T00:00:00.000Z",
    });
    expect(serialized).not.toContain(privateFrontText);
    expect(serialized).not.toContain(privateTailText);
  });

  it("infers plugin-prefixed names from plugin cache paths", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      assistant("2026-06-15T00:00:00.000Z", "Using the `github:gh-fix-ci` skill."),
    ]);

    const pluginRoot = path.join(
      directory,
      ".codex",
      "plugins",
      "cache",
      "openai-curated",
      "github",
      "202e9242",
      "skills",
    );
    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "gh-fix-ci", source: "global", rootPath: pluginRoot })],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    expect(summary(analysis, "gh-fix-ci")).toMatchObject({
      pluginName: "github",
      usageCount: 1,
      tier: "recent",
    });
    expect(analysis.pluginContributedSkillCount).toBe(1);
  });

  it("does not include raw prompts or assistant transcript text in reports", async () => {
    const usageSource = path.join(directory, "session.jsonl");
    await writeJsonl(usageSource, [
      { role: "user", content: "secret user prompt about gh-fix-ci" },
      assistant("2026-06-15T00:00:00.000Z", "Using the `gh-fix-ci` skill with secret details."),
    ]);

    const analysis = await analyzeSkillUsage({
      skills: [buildRecord({ name: "gh-fix-ci", source: "global" })],
      usageSourcePaths: [usageSource],
      now: new Date("2026-06-20T12:00:00.000Z"),
    });

    const serialized = JSON.stringify(analysis);

    expect(serialized).not.toContain("secret user prompt");
    expect(serialized).not.toContain("secret details");
    expect(summary(analysis, "gh-fix-ci").usageCount).toBe(1);
  });
});

const writeJsonl = async (filePath: string, records: readonly unknown[]): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
};

const assistant = (timestamp: string, content: string): Record<string, unknown> => ({
  timestamp,
  role: "assistant",
  content,
});

const user = (timestamp: string, content: string): Record<string, unknown> => ({
  timestamp,
  role: "user",
  content,
});

const summary = (analysis: SkillUsageAnalysis, skillName: string): SkillUsageSummary => {
  const match = analysis.skillsByUsage.find((skill) => skill.skillName === skillName);
  if (match === undefined) throw new Error(`Missing ${skillName} usage summary`);
  return match;
};

const actions = (analysis: SkillUsageAnalysis, skillName: string) =>
  summary(analysis, skillName)?.recommendations.map((recommendation) => recommendation.action);

const buildRecord = (input: {
  readonly name: string;
  readonly source: SkillRecord["source"];
  readonly rootPath?: string | undefined;
  readonly description?: string | undefined;
}): SkillRecord => {
  const rootPath = input.rootPath ?? path.join("/tmp", "skills");
  const skillDir = path.join(rootPath, input.name);
  const content = [
    "---",
    `name: ${input.name}`,
    `description: ${input.description ?? "Use this skill when testing usage analysis."}`,
    "---",
    "",
    "Follow the fixture workflow.",
    "",
  ].join("\n");
  return {
    ecosystem: "codex",
    rootPath,
    source: input.source,
    skillDir,
    skillPath: path.join(skillDir, "SKILL.md"),
    directoryName: input.name,
    content,
    parseResult: parseSkillContent(content),
  };
};
