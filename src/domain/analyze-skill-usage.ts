import { open } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, SkillRecord } from "./types.js";

export type SkillUsageTier = "frequent" | "recent" | "rare" | "unused" | "unknown";
export type SkillUsageConfidence = "high" | "medium" | "none";
export type SkillUsageEvidenceKind =
  | "explicit-user-invocation"
  | "codex-skill-markdown-link"
  | "tool-skill-md-read"
  | "assistant-announcement"
  | "unknown-legacy";
export type UsageSourceCoverageStatus = "complete" | "incomplete";

export type UsageSourceCoverage = {
  readonly sourcePath: string;
  readonly status: UsageSourceCoverageStatus;
  readonly recordCount: number;
  readonly parsedRecordCount: number;
  readonly invalidRecordCount: number;
  readonly eventCount: number;
  readonly diagnosticCodes: readonly string[];
};

export type SkillCleanupAction =
  | "keep"
  | "review"
  | "disable-candidate"
  | "shorten-description"
  | "merge-candidate";

export type SkillUsageEvent = {
  readonly skillName: string;
  readonly skillPath: string;
  readonly sourcePath: string;
  readonly confidence: Exclude<SkillUsageConfidence, "none">;
  readonly evidenceKind: SkillUsageEvidenceKind;
  readonly timestamp?: string | undefined;
};

export type SkillCleanupRecommendation = {
  readonly action: SkillCleanupAction;
  readonly skillName: string;
  readonly skillPath: string;
  readonly reason: string;
  readonly confidence: SkillUsageConfidence;
};

export type SkillUsageSummary = {
  readonly skillName: string;
  readonly directoryName: string;
  readonly ecosystem: SkillRecord["ecosystem"];
  readonly source: SkillRecord["source"];
  readonly enabled: boolean;
  readonly rootPath: string;
  readonly skillPath: string;
  readonly usageCount: number;
  readonly recentUsageCount: number;
  readonly tier: SkillUsageTier;
  readonly confidence: SkillUsageConfidence;
  readonly coverageStatus: UsageSourceCoverageStatus;
  readonly lastUsedAt?: string | undefined;
  readonly lastEvidenceKind?: SkillUsageEvidenceKind | undefined;
  readonly pluginName?: string | undefined;
  readonly descriptionLength: number;
  readonly recommendations: readonly SkillCleanupRecommendation[];
};

export type SkillUsageAnalysis = {
  readonly sourcePaths: readonly string[];
  readonly readableSourceCount: number;
  readonly coverageStatus: UsageSourceCoverageStatus;
  readonly sourceCoverage: readonly UsageSourceCoverage[];
  readonly diagnostics: readonly Diagnostic[];
  readonly totalSkills: number;
  readonly enabledSkillCount: number;
  readonly disabledSkillCount: number;
  readonly usedSkillCount: number;
  readonly unusedSkillCount: number;
  readonly unknownSkillCount: number;
  readonly duplicateSkillCount: number;
  readonly pluginContributedSkillCount: number;
  readonly events: readonly SkillUsageEvent[];
  readonly skillsByUsage: readonly SkillUsageSummary[];
  readonly recommendations: readonly SkillCleanupRecommendation[];
};

export type AnalyzeSkillUsageInput = {
  readonly skills: readonly SkillRecord[];
  readonly usageSourcePaths?: readonly string[] | undefined;
  readonly coverageDiagnostics?: readonly Diagnostic[] | undefined;
  readonly now?: Date | undefined;
  readonly recentWindowDays?: number | undefined;
  readonly maxFileBytes?: number | undefined;
  readonly frequentUseThreshold?: number | undefined;
  readonly descriptionCostThreshold?: number | undefined;
};

type CatalogSkill = {
  readonly skill: SkillRecord;
  readonly skillName: string;
  readonly pluginName?: string | undefined;
  readonly descriptionLength: number;
  readonly aliasKeys: readonly string[];
  readonly mediumPhrases: readonly string[];
};

type MatchedUsageEvent = SkillUsageEvent & {
  readonly skillKey: string;
  readonly dedupeMarker: string;
};

type ParsedUsageSource = {
  readonly sourcePath: string;
  readonly readable: boolean;
  readonly events: readonly MatchedUsageEvent[];
  readonly coverage: UsageSourceCoverage;
  readonly diagnostics: readonly Diagnostic[];
};

const DEFAULT_RECENT_WINDOW_DAYS = 30;
const DEFAULT_FREQUENT_USE_THRESHOLD = 5;
const DEFAULT_DESCRIPTION_COST_THRESHOLD = 280;

export const analyzeSkillUsage = async (
  input: AnalyzeSkillUsageInput,
): Promise<SkillUsageAnalysis> => {
  const sourcePaths = input.usageSourcePaths ?? [];
  const diagnostics: Diagnostic[] = [...(input.coverageDiagnostics ?? [])];
  const catalog = buildCatalog(input.skills);
  const aliasMap = buildAliasMap(catalog);
  const phraseMap = buildPhraseMap(catalog);
  const skillPathMap = buildSkillPathMap(catalog);
  const events: MatchedUsageEvent[] = [];
  const sourceCoverage: UsageSourceCoverage[] = [];
  let readableSourceCount = 0;

  if (sourcePaths.length === 0) {
    diagnostics.push({
      code: "usage-source-none",
      severity: "warning",
      message: "No Codex usage sources were available, so usage coverage is incomplete.",
    });
  }

  const parsedSources = await Promise.all(
    sourcePaths.map((sourcePath) =>
      parseUsageSource({
        sourcePath,
        aliasMap,
        phraseMap,
        skillPathMap,
      }),
    ),
  );

  for (const source of parsedSources) {
    sourceCoverage.push(source.coverage);
    diagnostics.push(...source.diagnostics);
    if (source.readable) readableSourceCount += 1;
    events.push(...source.events);
  }

  const dedupedEvents: MatchedUsageEvent[] = [];
  const dedupeKeys = new Set<string>();
  for (const event of events) {
    const key = eventKey(event);
    if (dedupeKeys.has(key)) continue;
    dedupeKeys.add(key);
    dedupedEvents.push(event);
  }

  return buildAnalysis({
    catalog,
    sourcePaths,
    readableSourceCount,
    sourceCoverage,
    diagnostics,
    events: dedupedEvents,
    now: input.now ?? new Date(),
    recentWindowDays: input.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS,
    frequentUseThreshold: input.frequentUseThreshold ?? DEFAULT_FREQUENT_USE_THRESHOLD,
    descriptionCostThreshold: input.descriptionCostThreshold ?? DEFAULT_DESCRIPTION_COST_THRESHOLD,
  });
};

const parseUsageSource = async (input: {
  readonly sourcePath: string;
  readonly aliasMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly phraseMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly skillPathMap: ReadonlyMap<string, readonly CatalogSkill[]>;
}): Promise<ParsedUsageSource> => {
  const events: MatchedUsageEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const diagnosticCodes = new Set<string>();
  let recordCount = 0;
  let parsedRecordCount = 0;
  let invalidRecordCount = 0;
  const handle = await open(input.sourcePath, "r").catch((error: unknown) => {
    const diagnostic = {
      code: "usage-source-unreadable",
      severity: "warning",
      message: error instanceof Error ? error.message : `Unable to read ${input.sourcePath}`,
      path: input.sourcePath,
    } satisfies Diagnostic;
    diagnostics.push(diagnostic);
    diagnosticCodes.add(diagnostic.code);
    return undefined;
  });

  if (handle === undefined) {
    return {
      sourcePath: input.sourcePath,
      readable: false,
      events,
      diagnostics,
      coverage: {
        sourcePath: input.sourcePath,
        status: "incomplete",
        recordCount,
        parsedRecordCount,
        invalidRecordCount,
        eventCount: events.length,
        diagnosticCodes: [...diagnosticCodes].sort(),
      },
    };
  }

  try {
    for await (const line of handle.readLines()) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      recordCount += 1;

      const record = parseJsonLine(trimmed, input.sourcePath, diagnostics);
      if (record === undefined) {
        invalidRecordCount += 1;
        diagnosticCodes.add("usage-source-invalid-json");
        continue;
      }
      parsedRecordCount += 1;

      const timestamp = extractTimestamp(record);
      const dedupeMarker = extractTurnMarker(record) ?? timestamp ?? String(recordCount);

      for (const match of matchRecordSkillUse({
        record,
        aliasMap: input.aliasMap,
        phraseMap: input.phraseMap,
        skillPathMap: input.skillPathMap,
        sourcePath: input.sourcePath,
        diagnostics,
        diagnosticCodes,
      })) {
        events.push({
          skillKey: skillKey(match.skill.skill),
          dedupeMarker,
          skillName: match.skill.skillName,
          skillPath: match.skill.skill.skillPath,
          sourcePath: input.sourcePath,
          confidence: match.confidence,
          evidenceKind: match.evidenceKind,
          ...(timestamp === undefined ? {} : { timestamp }),
        });
      }
    }
  } catch (error: unknown) {
    const diagnostic = {
      code: "usage-source-unreadable",
      severity: "warning",
      message: error instanceof Error ? error.message : `Unable to read ${input.sourcePath}`,
      path: input.sourcePath,
    } satisfies Diagnostic;
    diagnostics.push(diagnostic);
    diagnosticCodes.add(diagnostic.code);
  } finally {
    await handle.close();
  }

  return {
    sourcePath: input.sourcePath,
    readable: true,
    events,
    diagnostics,
    coverage: {
      sourcePath: input.sourcePath,
      status: diagnosticCodes.size === 0 ? "complete" : "incomplete",
      recordCount,
      parsedRecordCount,
      invalidRecordCount,
      eventCount: events.length,
      diagnosticCodes: [...diagnosticCodes].sort(),
    },
  };
};

const parseJsonLine = (
  line: string,
  sourcePath: string,
  diagnostics: Diagnostic[],
): unknown | undefined => {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    diagnostics.push({
      code: "usage-source-invalid-json",
      severity: "warning",
      message: error instanceof Error ? error.message : "Usage source contained invalid JSON.",
      path: sourcePath,
    });
    return undefined;
  }
};

const matchRecordSkillUse = (input: {
  readonly record: unknown;
  readonly aliasMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly phraseMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly skillPathMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly sourcePath: string;
  readonly diagnostics: Diagnostic[];
  readonly diagnosticCodes: Set<string>;
}): readonly {
  readonly skill: CatalogSkill;
  readonly confidence: Exclude<SkillUsageConfidence, "none">;
  readonly evidenceKind: SkillUsageEvidenceKind;
}[] => {
  const matches: {
    readonly skill: CatalogSkill;
    readonly confidence: Exclude<SkillUsageConfidence, "none">;
    readonly evidenceKind: SkillUsageEvidenceKind;
  }[] = [];

  const userText = extractRoleText(input.record, "user");
  for (const alias of extractExplicitUserAliases(userText)) {
    const skill = resolveAlias({
      alias,
      aliasMap: input.aliasMap,
      sourcePath: input.sourcePath,
      diagnostics: input.diagnostics,
      diagnosticCodes: input.diagnosticCodes,
    });
    if (skill !== undefined) {
      matches.push({ skill, confidence: "high", evidenceKind: "explicit-user-invocation" });
    }
  }

  for (const skillPath of extractSkillMarkdownPaths(userText)) {
    const skill = resolveSkillPath({
      skillPath,
      skillPathMap: input.skillPathMap,
      sourcePath: input.sourcePath,
      diagnostics: input.diagnostics,
      diagnosticCodes: input.diagnosticCodes,
    });
    if (skill !== undefined) {
      matches.push({ skill, confidence: "high", evidenceKind: "codex-skill-markdown-link" });
    }
  }

  if (isFunctionOrToolCallRecord(input.record)) {
    for (const skillPath of extractSkillMarkdownPathsFromUnknown(input.record)) {
      const skill = resolveSkillPath({
        skillPath,
        skillPathMap: input.skillPathMap,
        sourcePath: input.sourcePath,
        diagnostics: input.diagnostics,
        diagnosticCodes: input.diagnosticCodes,
      });
      if (skill !== undefined) {
        matches.push({ skill, confidence: "high", evidenceKind: "tool-skill-md-read" });
      }
    }
  }

  const assistantText = extractRoleText(input.record, "assistant");
  const explicitAssistantPattern = /(?:using|use|used)\s+(?:the\s+)?`([^`]+)`\s+skill/giu;
  for (const match of assistantText.matchAll(explicitAssistantPattern)) {
    const skill = resolveAlias({
      alias: match[1] ?? "",
      aliasMap: input.aliasMap,
      sourcePath: input.sourcePath,
      diagnostics: input.diagnostics,
      diagnosticCodes: input.diagnosticCodes,
    });
    if (skill !== undefined) {
      matches.push({ skill, confidence: "medium", evidenceKind: "assistant-announcement" });
    }
  }

  const normalizedText = normalizeTextForPhraseSearch(assistantText);
  for (const [phrase, candidates] of input.phraseMap) {
    if (!containsPhrase(normalizedText, `${phrase} skill`)) continue;
    const skill = resolveCandidates({
      candidates,
      sourcePath: input.sourcePath,
      diagnostics: input.diagnostics,
      diagnosticCodes: input.diagnosticCodes,
    });
    if (skill !== undefined) {
      matches.push({ skill, confidence: "medium", evidenceKind: "assistant-announcement" });
    }
  }

  return matches;
};

const extractExplicitUserAliases = (text: string): readonly string[] => {
  const aliases: string[] = [];
  const pattern = /(^|[^\w:.-])\$([a-z0-9](?:[a-z0-9._:-]*[a-z0-9])?)(?=$|[^a-z0-9_:-])/giu;
  for (const match of text.matchAll(pattern)) {
    const alias = match[2];
    if (alias !== undefined) aliases.push(alias);
  }
  return aliases;
};

const extractSkillMarkdownPaths = (text: string): readonly string[] => {
  const paths: string[] = [];
  const markdownPattern = /\[[^\]]*\]\(([^)]*SKILL\.md(?:#[^)]*)?)\)/giu;
  for (const match of text.matchAll(markdownPattern)) {
    const linkedPath = normalizeSkillPathReference(match[1] ?? "");
    if (linkedPath !== undefined) paths.push(linkedPath);
  }
  return paths;
};

const extractSkillMarkdownPathsFromUnknown = (value: unknown): readonly string[] => {
  const paths: string[] = [];
  const pathPattern = /(?:file:\/\/)?(\/[^\s"'`),]+\/SKILL\.md)(?:#[^\s"'`),]+)?/giu;
  for (const text of collectStringValues(value)) {
    for (const match of text.matchAll(pathPattern)) {
      const linkedPath = normalizeSkillPathReference(match[1] ?? "");
      if (linkedPath !== undefined) paths.push(linkedPath);
    }
  }
  return paths;
};

const resolveAlias = (input: {
  readonly alias: string;
  readonly aliasMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly sourcePath: string;
  readonly diagnostics: Diagnostic[];
  readonly diagnosticCodes: Set<string>;
}): CatalogSkill | undefined => {
  const candidates = input.aliasMap.get(normalizeAlias(input.alias)) ?? [];
  return resolveCandidates({ ...input, candidates });
};

const resolveSkillPath = (input: {
  readonly skillPath: string;
  readonly skillPathMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly sourcePath: string;
  readonly diagnostics: Diagnostic[];
  readonly diagnosticCodes: Set<string>;
}): CatalogSkill | undefined => {
  const candidates = input.skillPathMap.get(normalizeSkillPath(input.skillPath)) ?? [];
  return resolveCandidates({ ...input, candidates });
};

const resolveCandidates = (input: {
  readonly candidates: readonly CatalogSkill[];
  readonly sourcePath: string;
  readonly diagnostics: Diagnostic[];
  readonly diagnosticCodes: Set<string>;
}): CatalogSkill | undefined => {
  if (input.candidates.length === 1) return input.candidates[0];
  if (input.candidates.length > 1) {
    const diagnostic = {
      code: "usage-evidence-ambiguous",
      severity: "warning",
      message: "Usage evidence matched multiple scanned skills and was not assigned.",
      path: input.sourcePath,
    } satisfies Diagnostic;
    input.diagnostics.push(diagnostic);
    input.diagnosticCodes.add(diagnostic.code);
  }
  return undefined;
};

const buildAnalysis = (input: {
  readonly catalog: readonly CatalogSkill[];
  readonly sourcePaths: readonly string[];
  readonly readableSourceCount: number;
  readonly sourceCoverage: readonly UsageSourceCoverage[];
  readonly diagnostics: readonly Diagnostic[];
  readonly events: readonly MatchedUsageEvent[];
  readonly now: Date;
  readonly recentWindowDays: number;
  readonly frequentUseThreshold: number;
  readonly descriptionCostThreshold: number;
}): SkillUsageAnalysis => {
  const eventsBySkill = groupEventsBySkill(input.events);
  const duplicateNames = duplicateSkillNames(input.catalog);
  const coverageStatus = classifyCoverageStatus({
    sourceCoverage: input.sourceCoverage,
    diagnostics: input.diagnostics,
  });
  const summaries = input.catalog.map((catalogSkill) => {
    const skillEvents = eventsBySkill.get(skillKey(catalogSkill.skill)) ?? [];
    const usageCount = skillEvents.length;
    const recentUsageCount = skillEvents.filter((event) => {
      if (event.timestamp === undefined) return false;
      return isRecent(event.timestamp, input.now, input.recentWindowDays);
    }).length;
    const lastUsedAt = latestTimestamp(skillEvents);
    const lastEvidenceKind = summarizeLastEvidenceKind(skillEvents, lastUsedAt);
    const confidence = summarizeConfidence(skillEvents);
    const enabled = isEnabled(catalogSkill.skill);
    const tier = classifyTier({
      usageCount,
      lastUsedAt,
      readableSourceCount: input.readableSourceCount,
      coverageStatus,
      enabled,
      hasOnlyAssistantAnnouncementEvidence: hasOnlyAssistantAnnouncementEvidence(skillEvents),
      now: input.now,
      recentWindowDays: input.recentWindowDays,
      frequentUseThreshold: input.frequentUseThreshold,
    });
    const baseSummary = {
      skillName: catalogSkill.skillName,
      directoryName: catalogSkill.skill.directoryName,
      ecosystem: catalogSkill.skill.ecosystem,
      source: catalogSkill.skill.source,
      enabled,
      rootPath: catalogSkill.skill.rootPath,
      skillPath: catalogSkill.skill.skillPath,
      usageCount,
      recentUsageCount,
      tier,
      confidence,
      coverageStatus,
      ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
      ...(lastEvidenceKind === undefined ? {} : { lastEvidenceKind }),
      ...(catalogSkill.pluginName === undefined ? {} : { pluginName: catalogSkill.pluginName }),
      descriptionLength: catalogSkill.descriptionLength,
    };
    return {
      ...baseSummary,
      recommendations: buildRecommendations({
        skill: catalogSkill,
        tier,
        confidence,
        usageCount,
        coverageStatus,
        isDuplicate: duplicateNames.has(catalogSkill.skillName),
        descriptionCostThreshold: input.descriptionCostThreshold,
      }),
    };
  });

  const skillsByUsage = summaries.sort(compareUsageSummaries);
  const recommendations = skillsByUsage.flatMap((summary) => summary.recommendations);

  return {
    sourcePaths: input.sourcePaths,
    readableSourceCount: input.readableSourceCount,
    coverageStatus,
    sourceCoverage: input.sourceCoverage,
    diagnostics: input.diagnostics,
    totalSkills: input.catalog.length,
    enabledSkillCount: summaries.filter((summary) => summary.enabled).length,
    disabledSkillCount: summaries.filter((summary) => !summary.enabled).length,
    usedSkillCount: summaries.filter((summary) => summary.usageCount > 0).length,
    unusedSkillCount: summaries.filter((summary) => summary.enabled && summary.tier === "unused")
      .length,
    unknownSkillCount: summaries.filter((summary) => summary.enabled && summary.tier === "unknown")
      .length,
    duplicateSkillCount: summaries.filter((summary) => duplicateNames.has(summary.skillName))
      .length,
    pluginContributedSkillCount: summaries.filter((summary) => summary.pluginName !== undefined)
      .length,
    events: input.events.map(
      ({ skillKey: _skillKey, dedupeMarker: _dedupeMarker, ...event }) => event,
    ),
    skillsByUsage,
    recommendations,
  };
};

const buildRecommendations = (input: {
  readonly skill: CatalogSkill;
  readonly tier: SkillUsageTier;
  readonly confidence: SkillUsageConfidence;
  readonly usageCount: number;
  readonly coverageStatus: UsageSourceCoverageStatus;
  readonly isDuplicate: boolean;
  readonly descriptionCostThreshold: number;
}): readonly SkillCleanupRecommendation[] => {
  const recommendations: SkillCleanupRecommendation[] = [];
  const add = (action: SkillCleanupAction, reason: string) => {
    recommendations.push({
      action,
      skillName: input.skill.skillName,
      skillPath: input.skill.skill.skillPath,
      reason,
      confidence: input.confidence,
    });
  };

  if (!isEnabled(input.skill.skill)) {
    if (input.usageCount > 0) {
      add(
        "review",
        "Skill is disabled but has detected local usage; review whether to recover or re-enable it.",
      );
    }
    return recommendations;
  }

  if (input.tier === "frequent" || input.tier === "recent") {
    add("keep", "Detected recent or frequent local usage.");
    if (input.skill.descriptionLength >= input.descriptionCostThreshold) {
      add("shorten-description", "Skill appears useful but has high description context cost.");
    }
  } else if (input.tier === "unknown") {
    add(
      "review",
      input.usageCount > 0
        ? "Only low-confidence assistant usage evidence was detected, so usage requires review."
        : input.coverageStatus === "complete"
          ? "No readable usage sources were available, so usage is unknown."
          : "Usage coverage is incomplete, so absence of evidence requires review.",
    );
  } else if (
    input.tier === "unused" &&
    input.coverageStatus === "complete" &&
    (input.skill.skill.source === "global" || input.skill.skill.source === "custom")
  ) {
    add("disable-candidate", "No local usage was detected for this non-project skill.");
  } else if (input.tier === "rare") {
    add("review", "Only older or low-confidence usage was detected.");
  }

  if (input.isDuplicate) {
    add("merge-candidate", "Another scanned skill has the same canonical name.");
  }

  return recommendations;
};

const classifyTier = (input: {
  readonly usageCount: number;
  readonly lastUsedAt: string | undefined;
  readonly readableSourceCount: number;
  readonly coverageStatus: UsageSourceCoverageStatus;
  readonly enabled: boolean;
  readonly hasOnlyAssistantAnnouncementEvidence: boolean;
  readonly now: Date;
  readonly recentWindowDays: number;
  readonly frequentUseThreshold: number;
}): SkillUsageTier => {
  if (input.readableSourceCount === 0) return "unknown";
  if (input.coverageStatus !== "complete" && input.usageCount === 0) return "unknown";
  if (!input.enabled && input.usageCount === 0) return "unknown";
  if (input.usageCount === 0) return "unused";
  if (input.hasOnlyAssistantAnnouncementEvidence) return "unknown";
  if (input.usageCount >= input.frequentUseThreshold) return "frequent";
  if (
    input.lastUsedAt !== undefined &&
    isRecent(input.lastUsedAt, input.now, input.recentWindowDays)
  ) {
    return "recent";
  }
  return "rare";
};

const isRecent = (timestamp: string, now: Date, recentWindowDays: number): boolean => {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return false;
  const windowMilliseconds = recentWindowDays * 24 * 60 * 60 * 1000;
  return now.getTime() - parsed <= windowMilliseconds;
};

const buildCatalog = (skills: readonly SkillRecord[]): readonly CatalogSkill[] =>
  skills.map((skill) => {
    const skillName = readFrontmatterString(skill, "name") ?? skill.directoryName;
    const pluginName = inferPluginName(skill);
    const aliases = new Set([skillName, skill.directoryName]);
    if (pluginName !== undefined) {
      aliases.add(`${pluginName}:${skillName}`);
      aliases.add(`${pluginName}:${skill.directoryName}`);
    }
    const aliasKeys = [...aliases].map(normalizeAlias);
    return {
      skill,
      skillName,
      ...(pluginName === undefined ? {} : { pluginName }),
      descriptionLength: readFrontmatterString(skill, "description")?.length ?? 0,
      aliasKeys,
      mediumPhrases: aliasKeys.map((alias) => alias.replace(/:/g, " ").replace(/-/g, " ")),
    };
  });

const buildAliasMap = (
  catalog: readonly CatalogSkill[],
): ReadonlyMap<string, readonly CatalogSkill[]> => {
  const map = new Map<string, CatalogSkill[]>();
  for (const skill of catalog) {
    for (const alias of skill.aliasKeys) {
      const existing = map.get(alias) ?? [];
      existing.push(skill);
      map.set(alias, existing);
    }
  }
  return map;
};

const buildPhraseMap = (
  catalog: readonly CatalogSkill[],
): ReadonlyMap<string, readonly CatalogSkill[]> => {
  const map = new Map<string, CatalogSkill[]>();
  for (const skill of catalog) {
    for (const phrase of skill.mediumPhrases) {
      const existing = map.get(phrase) ?? [];
      existing.push(skill);
      map.set(phrase, existing);
    }
  }
  return map;
};

const buildSkillPathMap = (
  catalog: readonly CatalogSkill[],
): ReadonlyMap<string, readonly CatalogSkill[]> => {
  const map = new Map<string, CatalogSkill[]>();
  for (const skill of catalog) {
    const key = normalizeSkillPath(skill.skill.skillPath);
    const existing = map.get(key) ?? [];
    existing.push(skill);
    map.set(key, existing);
  }
  return map;
};

const extractRoleText = (record: unknown, role: "assistant" | "user"): string => {
  if (!isRecord(record)) return "";
  if (record.role === role) return collectText(record.content ?? record.text);
  const message = isRecord(record.message) ? record.message : undefined;
  if (message?.role === role) return collectText(message.content ?? message.text);
  const payload = isRecord(record.payload) ? record.payload : undefined;
  if (payload?.role === role) return collectText(payload.content ?? payload.text);
  const payloadMessage = isRecord(payload?.message) ? payload.message : undefined;
  if (payloadMessage?.role === role) {
    return collectText(payloadMessage.content ?? payloadMessage.text);
  }
  if (typeof record.type === "string" && record.type.includes(role)) {
    return collectText(
      record.content ??
        record.text ??
        message?.content ??
        message?.text ??
        payload?.content ??
        payload?.text ??
        payloadMessage?.content ??
        payloadMessage?.text,
    );
  }
  return "";
};

const isFunctionOrToolCallRecord = (record: unknown): boolean => {
  if (!isRecord(record)) return false;
  return collectStringValues(record).some((value) =>
    /function_call|tool_call|exec_command|read_mcp_resource|read_file|open|cat|sed/iu.test(value),
  );
};

const collectText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        const text = collectText(item);
        return text ? [text] : [];
      })
      .join("\n");
  }
  if (!isRecord(value)) return "";
  return collectText(value.text ?? value.content);
};

const collectStringValues = (value: unknown): readonly string[] => {
  const strings: string[] = [];
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      strings.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const child of Object.values(candidate)) visit(child);
  };
  visit(value);
  return strings;
};

const extractTurnMarker = (record: unknown): string | undefined => {
  if (!isRecord(record)) return undefined;
  for (const key of ["timestamp", "ts", "created_at", "turn_id", "turnId", "id"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  const message = isRecord(record.message) ? record.message : undefined;
  if (message === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at", "turn_id", "turnId", "id"]) {
    const value = message[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  const payload = isRecord(record.payload) ? record.payload : undefined;
  if (payload === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at", "turn_id", "turnId", "id"]) {
    const value = payload[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  const payloadMessage = isRecord(payload.message) ? payload.message : undefined;
  if (payloadMessage === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at", "turn_id", "turnId", "id"]) {
    const value = payloadMessage[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return undefined;
};

const extractTimestamp = (record: unknown): string | undefined => {
  if (!isRecord(record)) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  const message = isRecord(record.message) ? record.message : undefined;
  if (message === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = message[key];
    if (typeof value === "string") return value;
  }
  const payload = isRecord(record.payload) ? record.payload : undefined;
  if (payload === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = payload[key];
    if (typeof value === "string") return value;
  }
  const payloadMessage = isRecord(payload.message) ? payload.message : undefined;
  if (payloadMessage === undefined) return undefined;
  for (const key of ["timestamp", "ts", "created_at"]) {
    const value = payloadMessage[key];
    if (typeof value === "string") return value;
  }
  return undefined;
};

const groupEventsBySkill = (
  events: readonly MatchedUsageEvent[],
): ReadonlyMap<string, readonly MatchedUsageEvent[]> => {
  const map = new Map<string, MatchedUsageEvent[]>();
  for (const event of events) {
    const existing = map.get(event.skillKey) ?? [];
    existing.push(event);
    map.set(event.skillKey, existing);
  }
  return map;
};

const latestTimestamp = (events: readonly SkillUsageEvent[]): string | undefined => {
  const timestamps = events
    .map((event) => event.timestamp)
    .filter((timestamp): timestamp is string => timestamp !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return timestamps[0];
};

const summarizeLastEvidenceKind = (
  events: readonly SkillUsageEvent[],
  lastUsedAt: string | undefined,
): SkillUsageEvidenceKind | undefined => {
  if (events.length === 0) return undefined;
  if (lastUsedAt !== undefined) {
    const latestEvent = events.find((event) => event.timestamp === lastUsedAt);
    if (latestEvent !== undefined) return latestEvent.evidenceKind;
  }
  return [...events].sort(
    (left, right) =>
      confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
      timestampValue(right.timestamp) - timestampValue(left.timestamp) ||
      left.evidenceKind.localeCompare(right.evidenceKind),
  )[0]?.evidenceKind;
};

const summarizeConfidence = (events: readonly SkillUsageEvent[]): SkillUsageConfidence => {
  if (events.some((event) => event.confidence === "high")) return "high";
  if (events.some((event) => event.confidence === "medium")) return "medium";
  return "none";
};

const hasOnlyAssistantAnnouncementEvidence = (events: readonly SkillUsageEvent[]): boolean =>
  events.length > 0 && events.every((event) => event.evidenceKind === "assistant-announcement");

const classifyCoverageStatus = (input: {
  readonly sourceCoverage: readonly UsageSourceCoverage[];
  readonly diagnostics: readonly Diagnostic[];
}): UsageSourceCoverageStatus => {
  if (input.sourceCoverage.length === 0) return "incomplete";
  if (input.sourceCoverage.some((coverage) => coverage.status !== "complete")) {
    return "incomplete";
  }
  if (input.diagnostics.some(isCoverageGapDiagnostic)) return "incomplete";
  return "complete";
};

const isCoverageGapDiagnostic = (diagnostic: Diagnostic): boolean =>
  diagnostic.code === "usage-source-discovery-truncated" ||
  diagnostic.code === "usage-source-none" ||
  diagnostic.code === "usage-source-unreadable" ||
  diagnostic.code === "usage-source-invalid-json";

const duplicateSkillNames = (catalog: readonly CatalogSkill[]): ReadonlySet<string> => {
  const counts = new Map<string, number>();
  for (const skill of catalog) {
    counts.set(skill.skillName, (counts.get(skill.skillName) ?? 0) + 1);
  }
  const duplicateNames = new Set<string>();
  for (const [skillName, count] of counts) {
    if (count > 1) duplicateNames.add(skillName);
  }
  return duplicateNames;
};

const compareUsageSummaries = (left: SkillUsageSummary, right: SkillUsageSummary): number => {
  const usageDifference = right.usageCount - left.usageCount;
  if (usageDifference !== 0) return usageDifference;
  const recencyDifference = timestampValue(right.lastUsedAt) - timestampValue(left.lastUsedAt);
  if (recencyDifference !== 0) return recencyDifference;
  const confidenceDifference = confidenceRank(right.confidence) - confidenceRank(left.confidence);
  if (confidenceDifference !== 0) return confidenceDifference;
  return left.skillName.localeCompare(right.skillName);
};

const confidenceRank = (confidence: SkillUsageConfidence): number => {
  if (confidence === "high") return 2;
  if (confidence === "medium") return 1;
  return 0;
};

const timestampValue = (timestamp: string | undefined): number => {
  if (timestamp === undefined) return 0;
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
};

const eventKey = (event: MatchedUsageEvent): string =>
  `${event.sourcePath}:${event.dedupeMarker}:${event.skillKey}:${event.evidenceKind}`;

const skillKey = (skill: SkillRecord): string => skill.skillPath;

const readFrontmatterString = (skill: SkillRecord, key: string): string | undefined => {
  if (!skill.parseResult.ok) return undefined;
  const value = skill.parseResult.frontmatter.data[key];
  return typeof value === "string" ? value : undefined;
};

const isEnabled = (skill: SkillRecord): boolean => skill.enabled !== false;

const inferPluginName = (skill: SkillRecord): string | undefined => {
  const segments = skill.skillPath.split(path.sep);
  const cacheIndex = segments.lastIndexOf("cache");
  const skillsIndex = segments.lastIndexOf("skills");
  if (cacheIndex === -1 || skillsIndex === -1 || skillsIndex <= cacheIndex + 2) return undefined;
  const between = segments.slice(cacheIndex + 1, skillsIndex);
  const candidates = between.filter(
    (segment) =>
      segment !== "local" &&
      !/^[a-f0-9]{7,}$/iu.test(segment) &&
      !segment.endsWith("-official") &&
      !segment.endsWith("-bundled") &&
      !segment.endsWith("-curated"),
  );
  return candidates.at(-1);
};

const normalizeAlias = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[`"']/g, "")
    .replace(/[’]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeSkillPathReference = (value: string): string | undefined => {
  const withoutFragment = value.replace(/^file:\/\//u, "").replace(/#.*$/u, "");
  try {
    return normalizeSkillPath(decodeURIComponent(withoutFragment));
  } catch {
    return normalizeSkillPath(withoutFragment);
  }
};

const normalizeSkillPath = (value: string): string => path.normalize(value.trim());

const normalizeTextForPhraseSearch = (value: string): string =>
  ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

const containsPhrase = (normalizedText: string, phrase: string): boolean =>
  normalizedText.includes(` ${phrase} `);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
