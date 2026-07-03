import type {
  CapabilityFact,
  CapabilityKind,
  FindingConfidence,
  FindingEvidence,
  SkillArtifact,
  SkillPackage,
} from "../types.js";
import { findCommandIndicators } from "./commands.js";
import type { CapabilityIndicator } from "./detector-types.js";
import { readContentLines } from "./detector-types.js";
import { findNetworkIndicators } from "./network.js";
import { findObfuscationIndicators } from "./obfuscation.js";
import { findPermissionIndicators } from "./permissions.js";
import { findSecretIndicators, redactSecretValues } from "./secrets.js";

export const deriveCapabilityFacts = (skillPackage: SkillPackage): readonly CapabilityFact[] => {
  const facts = skillPackage.artifacts.flatMap((artifact) => deriveArtifactCapabilities(artifact));
  const byKey = new Map<string, CapabilityFact>();
  for (const fact of facts) {
    byKey.set(capabilityKey(fact), fact);
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.artifactPath.localeCompare(right.artifactPath) ||
      left.kind.localeCompare(right.kind) ||
      (left.line ?? 0) - (right.line ?? 0),
  );
};

const deriveArtifactCapabilities = (artifact: SkillArtifact): readonly CapabilityFact[] => {
  const metadataFacts = deriveMetadataCapabilities(artifact);
  if (artifact.content === undefined) return metadataFacts;

  const lines = readContentLines(artifact.content);
  const contentFacts = [
    ...findSecretIndicators(lines),
    ...findNetworkIndicators(lines),
    ...findCommandIndicators(lines),
    ...findPermissionIndicators(lines),
    ...findObfuscationIndicators(lines),
  ].map((indicator) => buildFact(artifact, indicator));

  return [...metadataFacts, ...contentFacts];
};

const deriveMetadataCapabilities = (artifact: SkillArtifact): readonly CapabilityFact[] => {
  const indicators: CapabilityFact[] = [];
  if (artifact.hidden) {
    indicators.push(
      buildMetadataFact(
        artifact,
        "hidden_artifact",
        "medium",
        "Artifact is hidden by a dotfile or hidden directory path.",
      ),
    );
  }
  if (artifact.symlinkStatus === "escapes") {
    indicators.push(
      buildMetadataFact(
        artifact,
        "hidden_artifact",
        "high",
        "Artifact is a symlink that resolves outside the skill directory.",
      ),
    );
  }
  if (artifact.type === "mcp-config") {
    indicators.push(
      buildMetadataFact(artifact, "mcp_access", "medium", "Artifact is an MCP configuration file."),
    );
  }
  return indicators;
};

const buildMetadataFact = (
  artifact: SkillArtifact,
  kind: CapabilityKind,
  confidence: FindingConfidence,
  description: string,
): CapabilityFact => ({
  kind,
  artifactPath: artifact.path,
  confidence,
  description,
});

const buildFact = (artifact: SkillArtifact, indicator: CapabilityIndicator): CapabilityFact => ({
  kind: indicator.kind,
  artifactPath: artifact.path,
  confidence: indicator.confidence,
  line: indicator.line,
  evidence: buildEvidence(artifact, indicator.line),
  description: indicator.description,
});

const buildEvidence = (
  artifact: SkillArtifact,
  lineNumber: number,
): FindingEvidence | undefined => {
  if (artifact.content === undefined) return undefined;
  const line = readContentLines(artifact.content).find(
    (candidate) => candidate.number === lineNumber,
  );
  if (line === undefined) return undefined;
  return {
    path: artifact.path,
    startLine: line.number,
    endLine: line.number,
    excerpt: [
      {
        line: line.number,
        text: redactSecretValues(line.text),
        highlighted: true,
      },
    ],
  };
};

const capabilityKey = (fact: CapabilityFact): string =>
  [fact.kind, fact.artifactPath, fact.line ?? 0].join("\0");
