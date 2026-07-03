# Skills Doctor Rule Catalog

Rules are grouped by the scanner category. Severity and intent can be refined here before adding CLI surfaces for rule discovery.

## Frontmatter

| Rule ID | Severity | Category | What it checks |
| --- | --- | --- | --- |
| `missing-skill` | error | frontmatter | A manually validated skill directory is missing `SKILL.md`. |
| `missing-frontmatter` | error | frontmatter | `SKILL.md` does not start with YAML frontmatter delimited by `---`. |
| `invalid-frontmatter` | error | frontmatter | `SKILL.md` frontmatter could not be read. |
| `invalid-yaml` | error | frontmatter | `SKILL.md` frontmatter YAML is invalid. |
| `frontmatter-not-map` | error | frontmatter | `SKILL.md` frontmatter is not a mapping. |
| `unknown-frontmatter-field` | warning | frontmatter | Frontmatter contains unsupported fields. |
| `missing-name` | error | frontmatter | Required `name` field is missing or empty. |
| `missing-description` | error | description | Required `description` field is missing or empty. |
| `description-too-long` | error | description | Description exceeds maximum length. |
| `name-too-long` | error | frontmatter | Skill name exceeds maximum length. |
| `invalid-name-characters` | error | frontmatter | Skill name has disallowed characters. |
| `invalid-name-hyphen-edge` | error | frontmatter | Skill name starts or ends with a hyphen. |
| `invalid-name-consecutive-hyphens` | error | frontmatter | Skill name contains consecutive hyphens. |
| `name-directory-mismatch` | error | frontmatter | `name` does not match parent directory. |
| `invalid-license-field` | warning | frontmatter | Optional `license` field is not a string. |
| `invalid-compatibility-field` | error | frontmatter | Optional `compatibility` field is invalid or too long. |
| `compatibility-too-long` | error | frontmatter | Optional `compatibility` value exceeds limit. |
| `invalid-metadata-field` | error | frontmatter | Optional `metadata` field is not a map. |
| `invalid-allowed-tools-field` | error | frontmatter | `allowed-tools` is malformed. |
| `allowed-tools-experimental` | warning | frontmatter | `allowed-tools` support is experimental. |

## Description

| Rule ID | Severity | Category | What it checks |
| --- | --- | --- | --- |
| `weak-description-trigger` | warning | description | Description lacks an activation trigger. |
| `vague-description` | warning | description | Description is too generic. |
| `implementation-focused-description` | advice | description | Description describes implementation details over user intent. |

## Body quality

| Rule ID | Severity | Category | What it checks |
| --- | --- | --- | --- |
| `placeholder-body` | warning | body-quality | Placeholder text exists in body. |
| `generic-body` | warning | body-quality | Body is overly generic. |
| `missing-workflow-steps` | warning | body-quality | No concrete workflow structure is present. |
| `tool-menu-without-default` | advice | body-quality | Tool lists without a default path. |
| `destructive-without-safety` | warning | body-quality | Destructive actions lack safety constraints. |
| `skill-md-too-many-lines` | warning | progressive-disclosure | Very long markdown body for single skill. |
| `skill-md-too-many-tokens` | warning | progressive-disclosure | Body token estimate exceeds recommended budget. |
| `generic-resource-reference` | warning | progressive-disclosure | Resource directory is referenced without a specific trigger. |
| `script-without-help-guidance` | warning | scripts | Script reference lacks usage/help documentation. |
| `interactive-script-guidance` | warning | scripts | Script guidance appears interactive. |
| `unpinned-package-runner` | advice | scripts | Unpinned package-runner command is used. |

## Resources and portability

| Rule ID | Severity | Category | What it checks |
| --- | --- | --- | --- |
| `missing-referenced-resource` | warning | references/scripts/assets | Referenced `scripts/`, `references/`, or `assets/` file does not exist in-skill. |
| `resource-reference-escapes-skill` | warning | references/scripts/assets | Resource references attempt directory traversal outside the skill directory. |
| `missing-skill-evals` | advice | evals | Non-trivial skill lacks `evals/evals.json`. |
| `cross-ecosystem-skill-divergence` | warning | cross-ecosystem | Same-name skills diverge across Claude/Codex within the same scope. |

## Security

Security rules are deterministic heuristics for suspicious instructions or
capabilities in `SKILL.md`. They are not proof of malicious intent; they flag
content that should be removed or reviewed before a skill is trusted.

The scanner first builds Markdown candidates from body lines, command fences,
inline commands, table rows, nearby lines, and section context. A candidate
becomes a reportable security finding only when the rule can assemble its
required evidence after counterevidence filters run. Broad keyword matches,
destination-only examples, or isolated command snippets are not enough by
themselves.

Intent is classified conservatively:

- Harmful intent is direct guidance to subvert instructions, conceal behavior,
  bypass confirmations, transfer secrets to external destinations, execute
  fetched content, weaken safety controls, hide traces, or run obfuscated
  external content.
- Defensive intent includes guidance to refuse prompt injection, preserve
  higher-priority instructions, protect secrets, require user confirmation, or
  warn against unsafe commands. Defensive matches are suppressed unless the
  same bounded context still contains a harmful source/action/destination or
  fetch/execute story.
- Operational intent includes ordinary setup and integration examples such as
  webhook signing-secret configuration, official service API authentication,
  remote docs or spec parsing, and local static parsing. These are suppressed
  unless they also connect sensitive material to an unrelated external sink or
  fetched content to execution.
- Ambiguous intent covers partial evidence, such as a sensitive source with no
  transfer destination or a remote URL with no execution sink. Ambiguous
  candidates remain unreported until a rule-specific evidence story is present.

| Rule ID | Severity | Category | What it checks |
| --- | --- | --- | --- |
| `prompt-injection-instruction` | warning | security | Skill instructions appear to subvert higher-priority instructions. |
| `secret-exfiltration-instruction` | warning | security | Skill instructions appear to send secrets outside the local task context. |
| `network-exfiltration-command` | warning | security | Network transfer guidance appears near secret or sensitive file reading. |
| `remote-code-execution-bootstrap` | warning | security | Skill instructions appear to fetch remote content and execute it. |
| `destructive-command-high-risk` | warning | security | Skill instructions describe broad destructive or trace-hiding actions. |
| `agent-safety-disablement` | warning | security | Skill instructions appear to disable sandboxing, permissions, or confirmation. |
| `external-resource-obfuscation` | warning | security | Skill instructions appear to decode or stage obscured content for execution. |

Evidence requirements by rule:

- `prompt-injection-instruction` reports explicit instruction subversion,
  concealment, confirmation bypass, or continuing after denial. Defensive prompt
  injection guidance, secret-protection guidance, and confirmation requirements
  are counterevidence and are filtered before reporting.
- `secret-exfiltration-instruction` reports only when bounded Markdown context
  contains a sensitive source, a connective transfer action, and a suspicious
  external destination. Local webhook signing-secret setup, local signature
  verification, and destination-only documentation are counterevidence.
- `network-exfiltration-command` reports network or transfer commands when they
  connect sensitive sources to a non-local external destination. Local
  destinations, parse-only commands, and official service API authentication are
  counterevidence unless secret material is also sent to an unrelated external
  sink.
- `remote-code-execution-bootstrap` reports remote fetch evidence paired with a
  shell or interpreter execution sink in the same command flow, or prose that
  explicitly says to execute fetched content. Remote docs/spec parsing,
  parse-only pipelines, local static parsers, and unrelated inline snippets are
  counterevidence.
- `destructive-command-high-risk` reports broad deletion, trace removal, or
  permission weakening when not framed as prevention or scoped confirmation
  guidance.
- `agent-safety-disablement` reports sandbox, permission, review, or
  confirmation bypass instructions when they are not merely descriptive launch
  previews or defensive examples.
- `external-resource-obfuscation` reports decode-or-stage guidance for
  obfuscated external content when paired with shell or interpreter execution.
  Defensive warnings and decode-only fixture handling are counterevidence.

Security findings include optional confidence metadata:

- `high`: the rule found a complete evidence chain, such as
  source/action/destination exfiltration evidence or remote fetch plus execution
  evidence.
- `medium`: the rule found explicit harmful prompt, destructive, safety bypass,
  or obfuscation language after counterevidence filters ran.
- `low`: supported by the report schema for future review hints. Current
  built-in security rules do not emit low-confidence findings.

Security findings are separate review warnings. They are counted in
`findingCount` and `securityFindingCount`, but they are excluded from the
quality score, per-skill quality counts, and default exit-code gates. `--fail-on
warning`, `--fail-on advice`, and `--min-score` apply to quality findings and
error diagnostics, not to security findings.
