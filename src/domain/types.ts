export type SkillEcosystem = "claude" | "codex" | "custom";

export type SkillRoot = {
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly source: "local" | "global" | "custom";
};

export type DiagnosticSeverity = "info" | "warning" | "error";

export type Diagnostic = {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
};

export type ParsedFrontmatter = {
  readonly data: Readonly<Record<string, unknown>>;
  readonly raw: string;
  readonly body: string;
};

export type ParseFailure = {
  readonly code: string;
  readonly message: string;
};

export type FindingSeverity = "error" | "warning" | "advice";
export type FindingConfidence = "high" | "medium" | "low";
export type SecurityPriority = "P0" | "P1" | "P2";

export type SkillArtifactType =
  | "skill-md"
  | "openai-agent-config"
  | "script"
  | "reference"
  | "asset"
  | "agent-instructions"
  | "claude-settings"
  | "claude-agent"
  | "mcp-config"
  | "hook-config"
  | "package-manifest"
  | "shell-script"
  | "dockerfile"
  | "ci-config"
  | "other";

export type SkillArtifactSymlinkStatus = "none" | "inside" | "escapes" | "broken";

export type SkillArtifact = {
  readonly type: SkillArtifactType;
  readonly path: string;
  readonly relativePath: string;
  readonly readable: boolean;
  readonly hidden: boolean;
  readonly executable?: boolean | undefined;
  readonly symlinkStatus: SkillArtifactSymlinkStatus;
  readonly realPath?: string | undefined;
  readonly content?: string | undefined;
  readonly contentHash?: string | undefined;
  readonly diagnostic?: Diagnostic | undefined;
};

export type CapabilityKind =
  | "reads_secrets"
  | "network_egress"
  | "remote_code_exec"
  | "persistence"
  | "self_modifies"
  | "bypasses_approval"
  | "destructive_action"
  | "obfuscation"
  | "broad_tool_access"
  | "external_dependency"
  | "mcp_access"
  | "hidden_artifact";

export type CapabilityFact = {
  readonly kind: CapabilityKind;
  readonly artifactPath: string;
  readonly confidence: FindingConfidence;
  readonly line?: number | undefined;
  readonly evidence?: FindingEvidence | undefined;
  readonly description?: string | undefined;
};

export type FindingEvidenceChainItem = {
  readonly path: string;
  readonly artifactType?: SkillArtifactType | undefined;
  readonly capability?: CapabilityKind | undefined;
  readonly startLine?: number | undefined;
  readonly endLine?: number | undefined;
  readonly excerpt?: readonly FindingEvidenceLine[] | undefined;
  readonly note?: string | undefined;
};

export type FindingEvidenceChain = {
  readonly summary: string;
  readonly items: readonly FindingEvidenceChainItem[];
};

export type FindingCategory =
  | "frontmatter"
  | "description"
  | "body-quality"
  | "progressive-disclosure"
  | "references"
  | "assets"
  | "scripts"
  | "evals"
  | "portability"
  | "security"
  | "cross-ecosystem";

export type Finding = {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly skillDir: string;
  readonly skillPath: string;
  readonly skillName?: string | undefined;
  readonly line?: number | undefined;
  readonly evidence?: FindingEvidence | undefined;
  readonly priority?: SecurityPriority | undefined;
  readonly capabilities?: readonly CapabilityKind[] | undefined;
  readonly evidenceChain?: FindingEvidenceChain | undefined;
  readonly confidence?: FindingConfidence | undefined;
  readonly rationale?: string | undefined;
  readonly counterevidence?: readonly string[] | undefined;
  readonly agentRepairable: boolean;
};

export type FindingEvidence = {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly excerpt: readonly FindingEvidenceLine[];
};

export type FindingEvidenceLine = {
  readonly line: number;
  readonly text: string;
  readonly highlighted: boolean;
};

export type ParseResult =
  | {
      readonly ok: true;
      readonly frontmatter: ParsedFrontmatter;
    }
  | {
      readonly ok: false;
      readonly error: ParseFailure;
    };

export type SkillRecord = {
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly source: "local" | "global" | "custom";
  readonly enabled?: boolean | undefined;
  readonly skillDir: string;
  readonly skillPath: string;
  readonly directoryName: string;
  readonly content: string;
  readonly parseResult: ParseResult;
};

export type SkillPackage = {
  readonly skill: SkillRecord;
  readonly artifacts: readonly SkillArtifact[];
  readonly capabilities?: readonly CapabilityFact[] | undefined;
};

export type ScanResult = {
  readonly roots: readonly SkillRoot[];
  readonly skills: readonly SkillRecord[];
  readonly disabledSkills?: readonly SkillRecord[] | undefined;
  readonly packages?: readonly SkillPackage[] | undefined;
  readonly diagnostics: readonly Diagnostic[];
  readonly findings: readonly Finding[];
};
