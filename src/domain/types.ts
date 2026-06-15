export type SkillEcosystem = "claude" | "codex" | "custom";

export type SkillRoot = {
  readonly ecosystem: SkillEcosystem;
  readonly rootPath: string;
  readonly source: "detected" | "custom";
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

export type FindingCategory =
  | "frontmatter"
  | "description"
  | "body-quality"
  | "progressive-disclosure"
  | "references"
  | "scripts"
  | "evals"
  | "portability"
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
  readonly agentRepairable: boolean;
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
  readonly skillDir: string;
  readonly skillPath: string;
  readonly directoryName: string;
  readonly content: string;
  readonly parseResult: ParseResult;
};

export type ScanResult = {
  readonly roots: readonly SkillRoot[];
  readonly skills: readonly SkillRecord[];
  readonly diagnostics: readonly Diagnostic[];
  readonly findings: readonly Finding[];
};
