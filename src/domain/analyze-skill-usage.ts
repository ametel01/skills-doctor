import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic, SkillRecord } from "./types.js";

export type SkillUsageTier = "frequent" | "recent" | "rare" | "unused" | "unknown";
export type SkillUsageConfidence = "high" | "medium" | "none";

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
  readonly rootPath: string;
  readonly skillPath: string;
  readonly usageCount: number;
  readonly recentUsageCount: number;
  readonly tier: SkillUsageTier;
  readonly confidence: SkillUsageConfidence;
  readonly lastUsedAt?: string | undefined;
  readonly pluginName?: string | undefined;
  readonly descriptionLength: number;
  readonly recommendations: readonly SkillCleanupRecommendation[];
};

export type SkillUsageAnalysis = {
  readonly sourcePaths: readonly string[];
  readonly readableSourceCount: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly totalSkills: number;
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
  readonly now?: Date | undefined;
  readonly recentWindowDays?: number | undefined;
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

const DEFAULT_RECENT_WINDOW_DAYS = 30;
const DEFAULT_FREQUENT_USE_THRESHOLD = 5;
const DEFAULT_DESCRIPTION_COST_THRESHOLD = 280;

export const analyzeSkillUsage = async (
  input: AnalyzeSkillUsageInput,
): Promise<SkillUsageAnalysis> => {
  const sourcePaths = input.usageSourcePaths ?? [];
  const diagnostics: Diagnostic[] = [];
  const catalog = buildCatalog(input.skills);
  const aliasMap = buildAliasMap(catalog);
  const phraseMap = buildPhraseMap(catalog);
  const events: MatchedUsageEvent[] = [];
  let readableSourceCount = 0;

  const sourceContents = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      try {
        return { sourcePath, content: await readFile(sourcePath, "utf8") };
      } catch (error: unknown) {
        return {
          sourcePath,
          diagnostic: {
            code: "usage-source-unreadable",
            severity: "warning",
            message: error instanceof Error ? error.message : `Unable to read ${sourcePath}`,
            path: sourcePath,
          } satisfies Diagnostic,
        };
      }
    }),
  );

  for (const { sourcePath, content, diagnostic } of sourceContents) {
    if (diagnostic !== undefined) {
      diagnostics.push(diagnostic);
      continue;
    }
    if (content === undefined) {
      diagnostics.push({
        code: "usage-source-unreadable",
        severity: "warning",
        message: `Unable to read ${sourcePath}`,
        path: sourcePath,
      });
      continue;
    }

    readableSourceCount += 1;
    events.push(...parseUsageSource({ sourcePath, content, aliasMap, phraseMap, diagnostics }));
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
    diagnostics,
    events: dedupedEvents,
    now: input.now ?? new Date(),
    recentWindowDays: input.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS,
    frequentUseThreshold: input.frequentUseThreshold ?? DEFAULT_FREQUENT_USE_THRESHOLD,
    descriptionCostThreshold: input.descriptionCostThreshold ?? DEFAULT_DESCRIPTION_COST_THRESHOLD,
  });
};

const parseUsageSource = (input: {
  readonly sourcePath: string;
  readonly content: string;
  readonly aliasMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly phraseMap: ReadonlyMap<string, readonly CatalogSkill[]>;
  readonly diagnostics: Diagnostic[];
}): readonly MatchedUsageEvent[] => {
  const events: MatchedUsageEvent[] = [];
  const lines = input.content.split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const record = parseJsonLine(trimmed, input.sourcePath, input.diagnostics);
    if (record === undefined) continue;

    const assistantText = extractAssistantText(record);
    if (assistantText.length === 0) continue;

    const timestamp = extractTimestamp(record);
    const dedupeMarker = extractTurnMarker(record) ?? timestamp ?? String(lineIndex + 1);
    for (const match of matchSkillUse(assistantText, input.aliasMap, input.phraseMap)) {
      events.push({
        skillKey: skillKey(match.skill.skill),
        dedupeMarker,
        skillName: match.skill.skillName,
        skillPath: match.skill.skill.skillPath,
        sourcePath: input.sourcePath,
        confidence: match.confidence,
        ...(timestamp === undefined ? {} : { timestamp }),
      });
    }
  }

  return events;
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

const matchSkillUse = (
  assistantText: string,
  aliasMap: ReadonlyMap<string, readonly CatalogSkill[]>,
  phraseMap: ReadonlyMap<string, readonly CatalogSkill[]>,
): readonly {
  readonly skill: CatalogSkill;
  readonly confidence: Exclude<SkillUsageConfidence, "none">;
}[] => {
  const matches: {
    readonly skill: CatalogSkill;
    readonly confidence: Exclude<SkillUsageConfidence, "none">;
  }[] = [];
  const highConfidencePattern = /(?:using|use|used)\s+(?:the\s+)?`([^`]+)`\s+skill/giu;
  for (const match of assistantText.matchAll(highConfidencePattern)) {
    const alias = normalizeAlias(match[1] ?? "");
    const candidates = aliasMap.get(alias) ?? [];
    if (candidates.length === 1) {
      const skill = candidates[0];
      if (skill !== undefined) matches.push({ skill, confidence: "high" });
    }
  }

  const normalizedText = normalizeTextForPhraseSearch(assistantText);
  for (const [phrase, candidates] of phraseMap) {
    if (candidates.length !== 1) continue;
    if (!containsPhrase(normalizedText, `${phrase} skill`)) continue;
    const skill = candidates[0];
    if (skill !== undefined) matches.push({ skill, confidence: "medium" });
  }

  return matches;
};

const buildAnalysis = (input: {
  readonly catalog: readonly CatalogSkill[];
  readonly sourcePaths: readonly string[];
  readonly readableSourceCount: number;
  readonly diagnostics: readonly Diagnostic[];
  readonly events: readonly MatchedUsageEvent[];
  readonly now: Date;
  readonly recentWindowDays: number;
  readonly frequentUseThreshold: number;
  readonly descriptionCostThreshold: number;
}): SkillUsageAnalysis => {
  const eventsBySkill = groupEventsBySkill(input.events);
  const duplicateNames = duplicateSkillNames(input.catalog);
  const summaries = input.catalog.map((catalogSkill) => {
    const skillEvents = eventsBySkill.get(skillKey(catalogSkill.skill)) ?? [];
    const usageCount = skillEvents.length;
    const recentUsageCount = skillEvents.filter((event) => {
      if (event.timestamp === undefined) return false;
      return isRecent(event.timestamp, input.now, input.recentWindowDays);
    }).length;
    const lastUsedAt = latestTimestamp(skillEvents);
    const confidence = summarizeConfidence(skillEvents);
    const tier = classifyTier({
      usageCount,
      lastUsedAt,
      readableSourceCount: input.readableSourceCount,
      now: input.now,
      recentWindowDays: input.recentWindowDays,
      frequentUseThreshold: input.frequentUseThreshold,
    });
    const baseSummary = {
      skillName: catalogSkill.skillName,
      directoryName: catalogSkill.skill.directoryName,
      ecosystem: catalogSkill.skill.ecosystem,
      source: catalogSkill.skill.source,
      rootPath: catalogSkill.skill.rootPath,
      skillPath: catalogSkill.skill.skillPath,
      usageCount,
      recentUsageCount,
      tier,
      confidence,
      ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
      ...(catalogSkill.pluginName === undefined ? {} : { pluginName: catalogSkill.pluginName }),
      descriptionLength: catalogSkill.descriptionLength,
    };
    return {
      ...baseSummary,
      recommendations: buildRecommendations({
        skill: catalogSkill,
        tier,
        confidence,
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
    diagnostics: input.diagnostics,
    totalSkills: input.catalog.length,
    usedSkillCount: summaries.filter((summary) => summary.usageCount > 0).length,
    unusedSkillCount: summaries.filter((summary) => summary.tier === "unused").length,
    unknownSkillCount: summaries.filter((summary) => summary.tier === "unknown").length,
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

  if (input.tier === "frequent" || input.tier === "recent") {
    add("keep", "Detected recent or frequent local usage.");
    if (input.skill.descriptionLength >= input.descriptionCostThreshold) {
      add("shorten-description", "Skill appears useful but has high description context cost.");
    }
  } else if (input.tier === "unknown") {
    add("review", "No readable usage sources were available, so usage is unknown.");
  } else if (
    input.tier === "unused" &&
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
  readonly now: Date;
  readonly recentWindowDays: number;
  readonly frequentUseThreshold: number;
}): SkillUsageTier => {
  if (input.readableSourceCount === 0) return "unknown";
  if (input.usageCount === 0) return "unused";
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

const extractAssistantText = (record: unknown): string => {
  if (!isRecord(record)) return "";
  if (record.role === "assistant") return collectText(record.content ?? record.text);
  const message = isRecord(record.message) ? record.message : undefined;
  if (message?.role === "assistant") return collectText(message.content ?? message.text);
  const payload = isRecord(record.payload) ? record.payload : undefined;
  if (payload?.role === "assistant") return collectText(payload.content ?? payload.text);
  const payloadMessage = isRecord(payload?.message) ? payload.message : undefined;
  if (payloadMessage?.role === "assistant") {
    return collectText(payloadMessage.content ?? payloadMessage.text);
  }
  if (typeof record.type === "string" && record.type.includes("assistant")) {
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

const summarizeConfidence = (events: readonly SkillUsageEvent[]): SkillUsageConfidence => {
  if (events.some((event) => event.confidence === "high")) return "high";
  if (events.some((event) => event.confidence === "medium")) return "medium";
  return "none";
};

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
  `${event.sourcePath}:${event.dedupeMarker}:${event.skillKey}`;

const skillKey = (skill: SkillRecord): string => skill.skillPath;

const readFrontmatterString = (skill: SkillRecord, key: string): string | undefined => {
  if (!skill.parseResult.ok) return undefined;
  const value = skill.parseResult.frontmatter.data[key];
  return typeof value === "string" ? value : undefined;
};

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
