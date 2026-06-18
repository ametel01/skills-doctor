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
