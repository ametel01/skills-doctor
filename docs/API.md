# Public API And Report Schema

Skills Doctor publishes a typed root export for integrations that need to scan
Agent Skills without launching the interactive CLI.

Install the package and import from the package root:

```ts
import {
  analyzeSkillUsage,
  buildScanReport,
  discoverUsageSources,
  discoverSkillRoots,
  resolveScanExitCode,
  scanSkillRoots,
} from "skills-doctor";
```

The public API is exported from `src/index.ts`. CLI command modules are not part
of the public API and should not be imported by consumers.

## Common Flow

Most integrations should follow the same flow as CLI JSON mode:

```ts
import {
  buildScanReport,
  discoverSkillRoots,
  resolveScanExitCode,
  scanSkillRoots,
} from "skills-doctor";

const directory = process.cwd();
const discovered = await discoverSkillRoots({
  cwd: directory,
  homeDir: "/home/user",
});
const scan = await scanSkillRoots({ roots: discovered.roots });
const report = buildScanReport({
  version: "0.0.0",
  directory,
  elapsedMilliseconds: 0,
  scan,
});

process.exitCode = resolveScanExitCode(report);
```

`skills-doctor --json` and `buildScanReport()` share the same `ScanReport`
shape. The CLI adds its package version and measured elapsed time; API callers
provide those values.

## Supported Exports

Discovery and scanning:

- `discoverSkillRoots(input)`: finds local, global, and custom skill roots.
- `discoverUsageSources(input?)`: finds bounded local Codex usage sources under
  known `~/.codex` paths and detects context-budget pressure.
- `scanSkillRoots(input)`: reads skills from selected roots, parses `SKILL.md`,
  discovers package artifact metadata, and returns skills, optional package
  records, diagnostics, and findings.
- `parseSkillContent(content)`: parses one `SKILL.md` string into frontmatter
  and body data.
- `analyzeSkillUsage(input)`: ranks scanned skills by detected local Codex
  usage and returns conservative cleanup recommendations.

Rules and scoring:

- `validateStructuralRules(skills)`: validates required skill shape.
- `buildMissingSkillFinding(input)`: builds the structural missing-skill
  finding used for unreadable or missing skill files.
- `validateQualityRules(skills, options?)`: validates descriptions, body quality,
  progressive disclosure, resources, scripts, eval guidance, and
  cross-ecosystem divergence. `options` can inject resource and eval existence
  checks for in-memory or alternate filesystem integrations.
- `validateSecurityRules(skills, options?)`: validates deterministic security
  heuristics for suspicious `SKILL.md` instructions such as instruction
  subversion, secret exfiltration, network exfiltration, remote execution,
  high-risk destructive actions, safety disablement, and obfuscated execution.
  Findings describe suspicious patterns and are not proof of malicious intent.
- `calculateScore(findings, options?)`: calculates a score summary.
- `getScoreLabel(value)`: maps a numeric score to a score label.

Reports and rendering:

- `buildScanReport(input)`: builds the machine-readable `ScanReport`.
- `ruleCatalog`: structured metadata for emitted rule IDs, severities,
  categories, and descriptions.
- `summarizeFindings(findings)`: groups counts by severity, skill, and category.
- `renderHumanSummary(report, options?)`: renders a short text summary.
- `resolveScanExitCode(report)`: returns `1` when blocking findings or error
  diagnostics remain, otherwise `0`. Pass `ScanExitCodeOptions` for stricter
  warning, advice, or minimum-score gates.
- `writeFindingsDirectory(input)`: writes `findings.json`, `findings.md`, and
  per-skill report files.
- `writeCleanupDirectory(input)`: writes `usage.json` and `usage.md` cleanup
  report files.

Repair handoff helpers:

- `buildCleanupHandoffPrompt(input)`: builds the cleanup prompt body.
- `buildHandoffPrompt(input)`: builds the repair prompt body.
- `compareFindings(before, after)`: compares pre- and post-repair findings.
- `renderPostHandoffSummary(report, comparison)`: renders a post-repair summary.

Exported types include:

- `BuildHandoffPromptInput`
- `BuildScanReportInput`
- `BuildScanReportUsageInput`
- `BuildCleanupHandoffPromptInput`
- `CleanupDirectoryInput`
- `CleanupDirectoryResult`
- `CodexPressureRow`
- `CapabilityFact`
- `CapabilityKind`
- `ContextBudgetPressure`
- `ContextPressureLevel`
- `Diagnostic`
- `Finding`
- `FindingCategory`
- `FindingConfidence`
- `FindingEvidence`
- `FindingEvidenceChain`
- `FindingEvidenceChainItem`
- `FindingEvidenceLine`
- `FindingSeverity`
- `FindingsComparison`
- `FindingsDirectoryInput`
- `FindingsDirectoryResult`
- `ParseFailure`
- `ParsedFrontmatter`
- `ParseResult`
- `QualityRuleOptions`
- `ResourceStatus`
- `RuleCatalogEntry`
- `SecurityRuleOptions`
- `ScanReport`
- `ScanReportUsage`
- `ScanResult`
- `ScoreLabel`
- `ScoreSummary`
- `ScanExitCodeOptions`
- `ScanGateSeverity`
- `SecurityPriority`
- `SkillEcosystem`
- `SkillArtifact`
- `SkillArtifactSymlinkStatus`
- `SkillArtifactType`
- `SkillPackage`
- `SkillRecord`
- `SkillRoot`
- `SkillSummary`
- `SkillUsageAnalysis`
- `SkillUsageConfidence`
- `SkillUsageEvent`
- `SkillUsageSummary`
- `SkillUsageTier`

## Filesystem Notes

The scanner reads local skill files. It does not upload file contents or call a
hosted model.

By default, `validateQualityRules()` performs filesystem checks for referenced
resources and eval files. A `SkillRecord` passed to this function should have a
real `skillDir` when you expect resource, script, asset, or eval checks to be
accurate.

For in-memory or alternate filesystem integrations, pass `QualityRuleOptions`:

```ts
const findings = await validateQualityRules(skills, {
  resourceExists: async (_skill, referencePath) => referencePath === "references/spec.md",
  evalsExist: async () => true,
});
```

Use `resourceStatus` instead of `resourceExists` when the adapter needs to
distinguish an existing in-skill resource from a reference that escapes the
skill directory:

```ts
type ResourceStatus = "inside" | "missing" | "escapes";
```

## Package Security Model

The package security model is additive and supports integrations that need to
reason about more than one `SKILL.md` file. Existing callers can continue to use
`SkillRecord` and `validateSecurityRules(skills)`. Package-level scanning uses
these types as it expands artifact discovery and cross-file evidence.

```ts
type SkillPackage = {
  readonly skill: SkillRecord;
  readonly artifacts: readonly SkillArtifact[];
  readonly capabilities?: readonly CapabilityFact[];
};

type SkillArtifact = {
  readonly type: SkillArtifactType;
  readonly path: string;
  readonly relativePath: string;
  readonly readable: boolean;
  readonly hidden: boolean;
  readonly executable?: boolean;
  readonly symlinkStatus: "none" | "inside" | "escapes" | "broken";
  readonly realPath?: string;
  readonly content?: string;
  readonly contentHash?: string;
  readonly diagnostic?: Diagnostic;
};

type CapabilityFact = {
  readonly kind: CapabilityKind;
  readonly artifactPath: string;
  readonly confidence: "high" | "medium" | "low";
  readonly line?: number;
  readonly evidence?: FindingEvidence;
  readonly description?: string;
};
```

`CapabilityKind` values describe observed package capabilities, including
`reads_secrets`, `network_egress`, `remote_code_exec`, `persistence`,
`self_modifies`, `bypasses_approval`, `destructive_action`, `obfuscation`,
`broad_tool_access`, `external_dependency`, `mcp_access`, and
`hidden_artifact`.

`SecurityPriority` values are `P0`, `P1`, and `P2`. Future package-level
security rules populate this priority on security findings while preserving the
existing `severity` field.

## ScanReport

`ScanReport` is the stable machine-readable report shape for `schemaVersion: 1`.

```ts
type ScanReport = {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly version: string;
  readonly directory: string;
  readonly elapsedMilliseconds: number;
  readonly scannedRoots: readonly SkillRoot[];
  readonly diagnostics: readonly Diagnostic[];
  readonly skillCount: number;
  readonly findingCount: number;
  readonly qualityFindingCount: number;
  readonly securityFindingCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
  readonly score: ScoreSummary;
  readonly skills: readonly SkillSummary[];
  readonly findings: readonly Finding[];
  readonly usage?: ScanReportUsage;
  readonly handoffRequested: boolean;
};
```

Fields:

- `schemaVersion`: machine-readable schema version. Current value is `1`.
- `ok`: `true` when there are no error findings and no error diagnostics.
- `version`: package or caller-provided scanner version.
- `directory`: scanned directory.
- `elapsedMilliseconds`: scan duration supplied by the caller or CLI.
- `scannedRoots`: roots selected for scanning.
- `diagnostics`: scan-level issues that are not tied to a parsed skill finding.
- `skillCount`: number of parsed skill records.
- `findingCount`: total number of quality and security findings.
- `qualityFindingCount`: number of non-security quality findings.
- `securityFindingCount`: number of security review findings.
- `errorCount`: number of blocking quality error findings.
- `warningCount`: number of quality warning findings.
- `adviceCount`: number of quality advisory findings.
- `score`: quality score summary from `calculateScore()`.
- `skills`: per-skill summaries.
- `findings`: detailed rule findings.
- `usage`: optional usage analysis included only when the caller supplies usage
  data or the CLI runs with `--usage`/interactive usage analysis.
- `handoffRequested`: whether the report came from a scan that requested repair
  handoff.

## Usage Analysis

Usage source discovery is local, bounded, and best-effort. It checks known Codex
paths only:

- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/history.jsonl`
- `~/.codex/logs_2.sqlite` when an optional adapter is supplied

Unreadable or missing usage sources produce warning diagnostics and do not fail
the scan. `logs_2.sqlite` is optional; integrations can provide
`ReadCodexSqlitePressure` to add structured pressure rows without making SQLite
a hard dependency.

`ScanReportUsage` contains source paths, source diagnostics, context pressure,
aggregate counts, `skillsByUsage`, recommendations, and all disable-candidate
recommendations. It does not include raw user prompts or assistant transcript
text.

## Finding

`Finding` describes a rule violation tied to a skill.

```ts
type Finding = {
  readonly ruleId: string;
  readonly severity: "error" | "warning" | "advice";
  readonly category:
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
  readonly title: string;
  readonly message: string;
  readonly suggestion: string;
  readonly ecosystem: "claude" | "codex" | "custom";
  readonly rootPath: string;
  readonly skillDir: string;
  readonly skillPath: string;
  readonly skillName?: string;
  readonly line?: number;
  readonly evidence?: FindingEvidence;
  readonly priority?: "P0" | "P1" | "P2";
  readonly capabilities?: readonly CapabilityKind[];
  readonly evidenceChain?: FindingEvidenceChain;
  readonly confidence?: "high" | "medium" | "low";
  readonly rationale?: string;
  readonly counterevidence?: readonly string[];
  readonly agentRepairable: boolean;
};

type FindingEvidence = {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly excerpt: readonly FindingEvidenceLine[];
};

type FindingEvidenceLine = {
  readonly line: number;
  readonly text: string;
  readonly highlighted: boolean;
};
```

`ruleId` values are documented in `docs/RULES.md`. `line` is present only when
the scanner can resolve a specific source line. Security findings include
`evidence` when the scanner can show the excerpt that triggered the warning.
Security findings may also include `confidence`, `rationale`, and
`counterevidence` so callers can distinguish high-confidence source/action/sink
stories from medium-confidence harmful-language matches and display the filters
that were considered. Evidence excerpts redact common secret-token patterns.
Package-level security findings may also include `priority`, `capabilities`,
and `evidenceChain` fields. These are optional so existing `schemaVersion: 1`
reports remain compatible when package-level scanning is not active.

Use `ruleCatalog` when integrations need structured rule metadata without
scraping Markdown:

```ts
import { ruleCatalog } from "skills-doctor";

const metadata = ruleCatalog.find((entry) => entry.ruleId === finding.ruleId);
```

## Diagnostic

`Diagnostic` describes scan-level issues such as unreadable roots or unreadable
`SKILL.md` files.

```ts
type Diagnostic = {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
};
```

Example:

```json
{
  "code": "unreadable-skill-file",
  "severity": "error",
  "message": "Could not read SKILL.md.",
  "path": "/repo/.agents/skills/example/SKILL.md"
}
```

Diagnostics should not include secret values. Paths may still reveal local
filesystem structure, so downstream systems should treat reports as local
developer artifacts unless users explicitly export them.

## SkillRoot

`SkillRoot` identifies a selected root directory.

```ts
type SkillRoot = {
  readonly ecosystem: "claude" | "codex" | "custom";
  readonly rootPath: string;
  readonly source: "local" | "global" | "custom";
};
```

## SkillSummary

`SkillSummary` is the per-skill aggregate stored in `ScanReport.skills`.

```ts
type SkillSummary = {
  readonly ecosystem: string;
  readonly name: string;
  readonly directoryName: string;
  readonly skillPath: string;
  readonly findingCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly adviceCount: number;
};
```

## Exit Codes

`resolveScanExitCode(report, options?)` mirrors the CLI blocking behavior:

- returns `0` when there are no quality error findings and no error diagnostics.
- returns `1` when `report.errorCount > 0` or any diagnostic has
  `severity: "error"`.

Quality warnings and advice appear in the report but do not make the exit code
fail. Pass `{ failOn: "warning" }`, `{ failOn: "advice" }`, or
`{ minScore: 95 }` to opt into stricter automation gates. These options match
the CLI `--fail-on` and `--min-score` flags. Security findings are separate
review warnings and are excluded from quality exit gates, including stricter
`failOn` options.

## Compatibility

`schemaVersion: 1` is the machine-readable compatibility contract. Consumers
should check `schemaVersion` before relying on a report shape. Adding optional
fields may happen in a minor release; removing or renaming current fields
requires a breaking schema and package version change.
