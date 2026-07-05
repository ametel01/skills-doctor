# Agent Skills Specification and Authoring Guide

This document consolidates the rules and best practices from the Agent Skills
website for creating correct, effective, portable skills.

Sources crawled on 2026-06-15:

- https://agentskills.io/home.md
- https://agentskills.io/specification.md
- https://agentskills.io/skill-creation/quickstart.md
- https://agentskills.io/skill-creation/best-practices.md
- https://agentskills.io/skill-creation/optimizing-descriptions.md
- https://agentskills.io/skill-creation/evaluating-skills.md
- https://agentskills.io/skill-creation/using-scripts.md
- https://agentskills.io/client-implementation/adding-skills-support.md
- https://agentskills.io/clients.md
- https://agentskills.io/llms.txt

## Purpose

An Agent Skill is a lightweight, open-format folder that gives an AI agent
specialized knowledge, procedures, executable helpers, reference material, and
templates. A skill should make a class of tasks more reliable, repeatable, and
auditable than the agent could make it from general knowledge alone.

Skills work through progressive disclosure:

1. At startup, the agent sees only each skill's `name` and `description`.
2. When a task matches a description, the agent loads the full `SKILL.md`.
3. The agent loads scripts, references, and assets only when the active
   instructions require them.

The consequence for authors is simple: the description must trigger the right
tasks, the main `SKILL.md` must be concise and actionable, and detailed material
must be split into on-demand files.

## Required Directory Shape

A skill is a directory containing a `SKILL.md` file.

```text
skill-name/
  SKILL.md
  scripts/
  references/
  assets/
```

Only `SKILL.md` is required. The optional directories have conventional roles:

- `scripts/`: executable code that agents can run.
- `references/`: detailed documentation read on demand.
- `assets/`: templates, images, schemas, data files, and other static resources.

The skill directory name must match the `name` frontmatter value.

## `SKILL.md` Format

`SKILL.md` must contain YAML frontmatter followed by Markdown instructions.

Minimal valid file:

```markdown
---
name: skill-name
description: A description of what this skill does and when to use it.
---

Instructions for the agent.
```

The body has no strict format restrictions, but it should contain only material
that helps the agent perform the task effectively.

Recommended body content:

- Step-by-step procedures.
- Examples of inputs and outputs.
- Common edge cases and gotchas.
- Validation steps.
- References to scripts, references, or assets when they are needed.

## Frontmatter Rules

### `name`

Required.

Rules:

- Must be 1 to 64 characters.
- Must contain only lowercase letters, numbers, and hyphens.
- Must not start with a hyphen.
- Must not end with a hyphen.
- Must not contain consecutive hyphens.
- Must match the parent directory name.

Good examples:

```yaml
name: pdf-processing
name: data-analysis
name: code-review
```

Bad examples:

```yaml
name: PDF-Processing
name: -pdf
name: pdf--processing
```

### `description`

Required.

Rules:

- Must be 1 to 1024 characters.
- Must describe both what the skill does and when to use it.
- Must include specific user-intent keywords that help agents identify relevant
  tasks.
- Should be short enough not to waste catalog context.

Good pattern:

```yaml
description: Extract text and tables from PDF files, fill PDF forms, and merge multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
```

Weak pattern:

```yaml
description: Helps with PDFs.
```

The description carries the burden of activation because it is the only skill
instruction loaded during discovery.

### `license`

Optional.

Rules:

- Use it to identify the license applied to the skill.
- Keep it short.
- Prefer a license name or a reference to a bundled license file.

Example:

```yaml
license: Apache-2.0
```

### `compatibility`

Optional.

Rules:

- Must be 1 to 500 characters if present.
- Include it only when the skill has specific environment requirements.
- Use it for intended agent products, required system packages, network access,
  language runtimes, or other execution requirements.

Examples:

```yaml
compatibility: Requires git, docker, jq, and internet access
compatibility: Requires Python 3.14+ and uv
```

Most skills do not need this field.

### `metadata`

Optional.

Rules:

- Must be a YAML mapping.
- Use string keys and string values.
- Use reasonably unique key names to avoid accidental conflicts with client
  fields.

Example:

```yaml
metadata:
  author: example-org
  version: "1.0"
```

### `allowed-tools`

Optional and experimental.

Rules:

- Must be a space-separated string of pre-approved tools.
- Support varies across agent implementations.
- Do not rely on it as the only safety control.

Example:

```yaml
allowed-tools: Bash(git:*) Bash(jq:*) Read
```

## Progressive Disclosure Rules

Design every skill for three loading stages:

- Metadata: `name` and `description`, roughly 50 to 100 tokens per skill.
- Instructions: the full `SKILL.md` body, recommended under 5,000 tokens.
- Resources: scripts, references, and assets, loaded only when needed.

Rules:

- Keep the main `SKILL.md` under 500 lines.
- Move detailed reference material into separate files.
- Do not eagerly include exhaustive API references in `SKILL.md`.
- Tell the agent exactly when to load each referenced file.
- Prefer "Read `references/api-errors.md` if the API returns a non-200 status"
  over "See `references/` for details."
- Keep file references shallow; avoid deeply nested reference chains.
- Use relative paths from the skill root.

Good references:

````markdown
See [API errors](references/api-errors.md) if the request fails.

Run:

```bash
python scripts/validate.py output/
```
````

## Scope and Content Quality

### Start from Real Expertise

Effective skills are grounded in real domain knowledge, not generic LLM output.
The best source material is actual work, project artifacts, and recurring
corrections.

Use these inputs:

- Completed hands-on tasks with an agent.
- Corrections you gave during those tasks.
- The sequence of steps that succeeded.
- Input and output formats from real cases.
- Project-specific context the agent did not know.
- Internal documentation, runbooks, and style guides.
- API specifications, schemas, and configuration files.
- Code review comments and issue trackers.
- Version-control patches and fixes.
- Real failure cases and resolutions.

Avoid generic filler such as "handle errors appropriately" or "follow best
practices." Replace it with concrete rules, tool choices, edge cases, and
organization-specific constraints.

### Add What the Agent Lacks

Every instruction should answer this question: would the agent likely get this
wrong without the skill?

Include:

- Project-specific conventions.
- Domain-specific procedures.
- Non-obvious edge cases.
- Exact APIs, tools, commands, and file formats to use.
- Local naming mismatches and service quirks.
- Validation gates that are easy to skip.

Omit:

- General explanations the agent already knows.
- Long background introductions.
- Common programming facts.
- Exhaustive edge cases better handled by agent judgment.
- Instructions that do not apply to the current skill scope.

If the agent already handles the task well without the skill, the skill may not
be adding value.

### Design Coherent Units

A skill should cover one coherent unit of work that composes well with other
skills.

Rules:

- Do not make a skill so narrow that a normal task needs many skills.
- Do not make a skill so broad that it triggers imprecisely.
- Keep adjacent domains separate when their procedures, tools, or failure modes
  differ.
- Combine tasks only when they form a natural workflow.

Example: querying a database and formatting the results can be one coherent
skill. Querying a database, administering the database, and managing backups is
probably too broad.

### Aim for Moderate Detail

Concise, stepwise guidance with a working example often outperforms exhaustive
documentation.

Rules:

- Prefer actionable procedures over encyclopedic coverage.
- Give the default path first.
- Add alternatives only when the agent needs an escape hatch.
- If a skill causes wasted work, remove or tighten the instruction that caused
  it.
- If pass rates plateau despite adding rules, the skill may be over-constrained.

## Instruction Style

### Match Specificity to Fragility

Use flexible guidance when multiple approaches are valid. Explain why an
instruction matters so the agent can make context-sensitive decisions.

Use strict, prescriptive instructions when:

- The operation is fragile.
- A sequence must be followed exactly.
- Consistency matters.
- The task is destructive, stateful, regulated, or hard to recover.

Most skills need a mix of both. Calibrate each section independently.

### Provide Defaults, Not Menus

When several tools or approaches could work:

- Pick one default.
- Explain when to use the fallback.
- Do not present a long list of equal options.

Good pattern:

```markdown
Use `pdfplumber` for text extraction. For scanned PDFs requiring OCR, use
`pdf2image` with `pytesseract`.
```

Bad pattern:

```markdown
You can use pypdf, pdfplumber, PyMuPDF, pdf2image, or another library.
```

### Favor Procedures Over Declarations

A skill should teach the agent how to approach a class of problems, not hardcode
one answer for one instance.

Good pattern:

```markdown
1. Read `references/schema.yaml` to find relevant tables.
2. Join tables using the `_id` foreign key convention.
3. Apply filters from the user's request as WHERE clauses.
4. Aggregate numeric columns as needed.
5. Return a markdown table.
```

Weak pattern:

```markdown
Join `orders` to `customers`, filter EMEA, and sum `amount`.
```

Specific output templates, safety constraints, and tool-specific instructions
are still valuable when they generalize across tasks.

## Effective `SKILL.md` Sections

Use only the sections that fit the skill.

### Workflow

Use for multi-step tasks. Include:

- Preconditions.
- Ordered steps.
- Decision points.
- Validation after important steps.
- Cleanup or handoff requirements.

### Gotchas

Use for non-obvious facts that defy reasonable assumptions.

Rules:

- Put high-value gotchas in `SKILL.md`, not only in references.
- Add a gotcha when an agent mistake requires correction.
- Make each gotcha concrete.

Examples of good gotcha content:

- Soft-delete columns that must be filtered.
- Different services using different names for the same identifier.
- Health checks that do not verify downstream dependencies.
- File formats that look standard but have local deviations.

### Output Templates

Use templates when the output format matters. Agents follow concrete structures
more reliably than prose descriptions.

Rules:

- Keep short templates inline.
- Move long or conditional templates to `assets/`.
- Tell the agent when to use each asset.
- Allow adaptation when the template is a starting structure rather than a
  rigid schema.

### Checklists

Use checklists for multi-step workflows with dependencies or validation gates.

Good pattern:

```markdown
Progress:
- [ ] Step 1: Analyze the input.
- [ ] Step 2: Create the mapping.
- [ ] Step 3: Validate the mapping.
- [ ] Step 4: Generate the output.
- [ ] Step 5: Verify the output.
```

### Validation Loops

Use a validation loop when the agent can check its own work.

Pattern:

1. Do the work.
2. Run a validator, checklist, or self-check.
3. Read the failure evidence.
4. Fix issues.
5. Repeat until validation passes.

Validation can be a script, a reference checklist, or a structured review
against requirements.

### Plan-Validate-Execute

Use this pattern for batch, destructive, high-impact, or hard-to-reverse work.

Pattern:

1. Extract or inspect the source of truth.
2. Create a structured plan or mapping.
3. Validate the plan against the source of truth.
4. Revise until valid.
5. Execute from the validated plan.

The validation step must provide enough detail for the agent to self-correct,
such as listing available fields when a requested field is not found.

## Description Optimization

### Activation Principles

The `description` field is the primary mechanism agents use to decide whether to
load a skill. It must describe when the skill is useful in terms of the user's
intent.

Rules:

- Use imperative phrasing: "Use this skill when..."
- Focus on what the user is trying to accomplish.
- Do not focus on the skill's internal implementation.
- Be explicit about indirect cases where the skill applies.
- Be precise enough to avoid triggering on near-miss tasks.
- Keep the field under 1024 characters.
- Use a few sentences or a short paragraph.

Good description pattern:

```yaml
description: >
  Analyze CSV and tabular data files by computing summaries, adding derived
  columns, cleaning messy data, and generating charts. Use this skill when the
  user has a CSV, TSV, or spreadsheet-like file and wants to explore, transform,
  or visualize data, even if they do not explicitly say "CSV" or "analysis."
```

### Trigger Eval Queries

Create realistic prompts labeled with whether the skill should trigger.

Recommended set:

- About 20 total queries.
- 8 to 10 should-trigger queries.
- 8 to 10 should-not-trigger queries.

Should-trigger queries should vary:

- Phrasing: formal, casual, typo-prone, abbreviated.
- Explicitness: some name the domain, others imply it.
- Detail: terse prompts and context-heavy prompts.
- Complexity: single-step and multi-step workflows.

Should-not-trigger queries should include near misses:

- Prompts that share keywords but need a different skill.
- Adjacent workflows outside the skill's scope.
- Tasks involving the same file type but a different goal.

Avoid negative examples that are obviously unrelated; they do not test precision.

### Trigger Testing

Run each eval query through the target agent with the skill installed and check
whether the agent loaded `SKILL.md`.

Rules:

- A positive query passes when the skill triggers.
- A negative query passes when the skill does not trigger.
- Run each query multiple times because model behavior is nondeterministic.
- Three runs per query is a reasonable starting point.
- Use trigger rate: triggered runs divided by total runs.
- A 0.5 threshold is a reasonable default for pass/fail classification.
- Script the process when possible.
- If the client supports it, stop a run early when the activation outcome is
  clear.

### Avoid Overfitting

Split trigger eval queries:

- Train set: about 60 percent.
- Validation set: about 40 percent.

Rules:

- Keep proportional mixes of positive and negative examples in both sets.
- Shuffle randomly.
- Keep the split fixed across iterations.
- Use train failures to revise the description.
- Use validation pass rate to select the best description.
- Do not tune directly on validation failures.
- Avoid adding exact keywords from failed train queries.
- Generalize the category or intent behind the failure.
- Try a structurally different description if incremental tweaks stall.

Five optimization iterations is usually enough. If performance does not improve,
the query set may be mislabeled, too easy, too hard, or otherwise poorly chosen.

### Applying a Description Change

After selecting a description:

1. Update the `description` field in `SKILL.md`.
2. Verify it is under 1024 characters.
3. Try a few manual prompts.
4. For stronger evidence, write 5 to 10 fresh prompts not used in optimization.
5. Run the fresh prompts through the eval script.

## Skill Output Evaluation

Output evals test whether a skill improves work quality, not only whether it
activates.

### Test Case Format

Store test cases in `evals/evals.json` inside the skill directory.

Each test case should include:

- `id`: stable identifier.
- `prompt`: realistic user message.
- `expected_output`: human-readable success description.
- `files`: optional input files.
- `assertions`: optional detailed checks added after initial runs.

Example:

```json
{
  "skill_name": "csv-analyzer",
  "evals": [
    {
      "id": 1,
      "prompt": "I have a CSV of monthly sales data in data/sales_2025.csv. Can you find the top 3 months by revenue and make a bar chart?",
      "expected_output": "A bar chart image showing the top 3 months by revenue, with labeled axes and values.",
      "files": ["evals/files/sales_2025.csv"]
    }
  ]
}
```

Skills Doctor statically checks non-trivial skills for an `evals/evals.json`
file with valid JSON, a root `skill_name`, a non-empty `evals` array,
realistic non-empty `prompt` and `expected_output` strings, well-formed
relative `files` paths when present, and non-vague string assertions when
assertions are supplied. If mature eval material is present, it also advises
authors to include baseline or previous-version comparison guidance.

The scanner does not run trigger evals, output evals, grading scripts, timing
collection, or benchmark generation. Files such as `timing.json`,
`grading.json`, and `benchmark.json` are run artifacts, not required package
inputs.

Rules for test prompts:

- Start with 2 to 3 cases.
- Expand after the first result review.
- Vary phrasing, detail, formality, and context.
- Include at least one edge case.
- Use realistic file paths, column names, and personal context.
- Avoid vague prompts that do not test anything.

### Baselines

Run every eval twice:

- With the skill.
- Without the skill, or with the previous skill version.

When improving an existing skill, snapshot the old version and compare against
that snapshot instead of a no-skill baseline.

### Run Isolation

Each eval run should start with clean context:

- No leftover state from development.
- No previous eval conversation.
- Only the skill instructions for the with-skill run.
- The same prompt and input files for the baseline run.

Use subagents or separate sessions when the client supports them.

### Workspace Structure

Use a repeatable workspace structure:

```text
skill-name/
  SKILL.md
  evals/
    evals.json
skill-name-workspace/
  iteration-1/
    eval-case-name/
      with_skill/
        outputs/
        timing.json
        grading.json
      without_skill/
        outputs/
        timing.json
        grading.json
    benchmark.json
```

Record timing and token data:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332
}
```

### Assertions

Assertions are verifiable statements about the output.

Good assertions:

- The output file is valid JSON.
- The chart has labeled axes.
- The report includes at least three recommendations.
- The output contains a generated image file.

Weak assertions:

- The output is good.
- The output uses one exact phrase when equivalent wording would be acceptable.

Rules:

- Add assertions after reviewing first-run outputs.
- Use scripts for mechanical checks where possible.
- Use LLM grading for observable but non-mechanical checks.
- Do not require assertions for every quality dimension.
- Let human review cover style, taste, and whether the result actually solves
  the user's problem.

### Grading

For each assertion, record:

- PASS or FAIL.
- Concrete evidence from the output.
- Summary counts and pass rate.

Rules:

- Require concrete evidence for PASS.
- Do not give benefit of the doubt.
- Review whether the assertions themselves are useful.
- Fix assertions that are too easy, too hard, brittle, or unverifiable.
- For comparing versions, consider blind comparison so the judge does not know
  which output came from which skill version.

### Aggregation

Aggregate results into `benchmark.json`.

Track:

- Mean pass rate.
- Time.
- Token usage.
- Delta between with-skill and baseline.
- Standard deviation when multiple runs make it meaningful.

Interpretation rules:

- A skill should buy enough quality to justify its time and token cost.
- Assertions that always pass in both configurations do not prove skill value.
- Assertions that always fail in both configurations may be broken or too hard.
- Assertions that pass with the skill and fail without it show where the skill
  adds value.
- High variance suggests flaky evals or ambiguous instructions.
- Time or token outliers should be investigated through execution transcripts.

### Human Review

After automated grading, review actual outputs.

Rules:

- Record specific feedback per test case.
- Empty feedback means the output looked fine.
- Feedback must be actionable.
- Use human review to catch issues not expressed as assertions.

### Iteration Loop

Use failed assertions, human feedback, and execution transcripts to revise the
skill.

Rules:

- Generalize from feedback.
- Do not patch narrowly for one test case unless the case represents a real
  class of tasks.
- Keep the skill lean.
- Explain why important instructions exist.
- Remove instructions that cause wasted work.
- Bundle repeated helper logic into `scripts/`.
- Rerun all test cases in a new iteration directory.
- Stop when quality is satisfactory, human feedback is consistently empty, or
  further iterations no longer improve results.

## Scripts in Skills

Scripts are appropriate when a skill needs reusable logic, exact validation, or
repeated transformations that agents would otherwise reinvent.

### One-Off Commands

Use one-off commands in `SKILL.md` when an existing tool already does the job
with a simple invocation.

Rules:

- Pin versions when using runtime package runners.
- State prerequisites in `SKILL.md`.
- Use the `compatibility` field for environment-level requirements.
- Move complex or fragile commands into tested scripts.

Common runners:

- `uvx package@version` for Python tools.
- `pipx run package==version` for Python tools.
- `npx package@version` for npm tools.
- `bunx package@version` for Bun environments.
- `deno run` for Deno scripts or package specifiers.
- `go run module@version` for Go tools.

Use Bun-specific commands only when the user's environment has Bun.

### Referencing Scripts

Rules:

- Put reusable scripts in `scripts/`.
- Reference scripts with relative paths from the skill root.
- List available scripts in `SKILL.md`.
- Describe what each script does.
- Show exact commands for common usage.
- In support files, script paths in code blocks are still relative to the skill
  root.

Example:

````markdown
## Available scripts

- `scripts/validate.sh`: validates configuration files.
- `scripts/process.py`: processes input data.

## Workflow

1. Run validation:

   ```bash
   bash scripts/validate.sh "$INPUT_FILE"
   ```
````

### Self-Contained Scripts

Prefer scripts that declare their own dependencies and run with one command.

Supported patterns:

- Python: PEP 723 inline metadata, run with `uv run scripts/name.py`.
- Deno: import `npm:` or `jsr:` packages directly.
- Bun: import pinned packages directly when no `node_modules` disables
  auto-install.
- Ruby: use `bundler/inline`.

Rules:

- Pin dependency versions or version ranges.
- Add Python `requires-python` when needed.
- Use lockfiles where supported and worthwhile.
- Avoid separate install steps unless necessary.

### Script Interface Rules

Agents use stdout, stderr, and exit codes to decide what to do next. Design
script interfaces for non-interactive agent use.

Hard rule:

- Do not use interactive prompts. Agents cannot reliably answer TTY prompts,
  password dialogs, or confirmation menus.

Input rules:

- Accept input through flags, environment variables, files, or stdin.
- Reject ambiguous input with a clear error.
- Use enums and closed sets where possible.
- Provide safe defaults.
- Require explicit flags such as `--confirm` or `--force` for risky operations.
- Provide `--dry-run` for destructive or stateful operations.

Help rules:

- Implement concise `--help`.
- Include a short description.
- List flags and defaults.
- Include usage examples.
- Document meaningful exit codes.

Error rules:

- Say what went wrong.
- Say what was expected.
- Say what to try next.
- Include received invalid values when useful.

Output rules:

- Prefer structured output such as JSON, CSV, or TSV.
- Send machine-readable data to stdout.
- Send diagnostics, progress, and warnings to stderr.
- Keep output size predictable.
- Default to summaries or limits for large output.
- Support pagination flags such as `--offset`.
- For large output that cannot be paginated, require an `--output` file or an
  explicit `-` opt-in for stdout.

Skills Doctor checks these script rules statically. It verifies referenced
script files exist, flags interactive implementations, reports risky operations
without safety flags, warns when `SKILL.md` says to use `--help` but the script
has no apparent help handler, and advises on structured-output scripts whose
nearby guidance does not document output format, stderr diagnostics, or output
bounds. It does not execute scripts or prove all runtime interfaces are correct.

Reliability rules:

- Make scripts idempotent where possible.
- Use "create if not exists" patterns when retrying is plausible.
- Use distinct exit codes for different failure classes.
- Handle edge cases gracefully.
- Emit helpful messages instead of opaque failures.

## References and Assets

### `references/`

Use `references/` for detailed documentation that is not needed on every skill
activation.

Rules:

- Keep each reference file focused.
- Tell the agent when to read each reference.
- Avoid burying critical gotchas in references unless the trigger is obvious.
- Prefer one-level file references from `SKILL.md`.
- Use domain-specific filenames when helpful.

Common examples:

- `references/REFERENCE.md`
- `references/api-errors.md`
- `references/schema.md`
- `references/forms.md`

### `assets/`

Use `assets/` for static resources.

Examples:

- Document templates.
- Configuration templates.
- Report templates.
- Images and diagrams.
- Lookup tables.
- Schemas.
- Example data files.

Rules:

- Reference assets only when needed.
- Explain how the agent should adapt or preserve each asset.
- Keep large assets out of `SKILL.md`.

## Validation and Correctness

Use the reference validator for strict format checks:

```bash
skills-ref validate ./my-skill
```

This checks `SKILL.md` frontmatter and naming conventions.

Author-side correctness checklist:

- Directory name matches `name`.
- `name` follows all character and length rules.
- `description` is non-empty and under 1024 characters.
- `description` says what the skill does and when to use it.
- Optional fields respect their constraints.
- YAML frontmatter parses.
- Main body is under 500 lines.
- Main body is recommended under 5,000 tokens.
- Relative paths resolve from the skill root.
- Referenced files exist.
- Scripts run non-interactively.
- Scripts have clear help and errors.
- Skill-specific evals exist for non-trivial skills.
- The skill improves output quality compared with a baseline.

## Cross-Client Portability

Agent Skills are an open format used across many clients. The file format is
portable, but discovery paths, activation UX, permissions, and tool support vary.

Authoring rules for portability:

- Follow the strict `SKILL.md` format even if one client accepts looser files.
- Avoid relying on client-specific hidden behavior.
- Use `.agents/skills/` when documenting cross-client project installation.
- Include `compatibility` only when environment requirements matter.
- Use relative paths, not absolute paths.
- Keep scripts non-interactive.
- Make prerequisites explicit.
- Treat `allowed-tools` as experimental.
- Do not assume every client supports every script runner.
- Prefer self-contained scripts over project-global setup.

Discovery expectations from client guidance:

- Clients often scan project-level and user-level skill directories.
- Project-level skills commonly override user-level skills with the same name.
- Clients may scan both client-specific paths and `.agents/skills/`.
- Some clients also scan legacy or compatibility paths.
- Cloud or sandboxed clients may need uploaded, bundled, or remotely provisioned
  skills rather than local user-level directories.

Security and trust expectations:

- Project-level skills from untrusted repositories can inject instructions into
  agent context.
- Clients may gate project-level skills behind workspace trust.
- Skill authors should avoid surprising side effects.
- Destructive scripts should require explicit flags and offer dry runs.

## Client Implementation Notes That Affect Authors

These rules are mainly for agent implementers, but authors should understand
them because they explain why good skill structure matters.

Discovery:

- A skill is discovered as a subdirectory containing a file named exactly
  `SKILL.md`.
- Non-skill files such as `README.md` in a skills directory are ignored.
- Clients may skip directories like `.git/` and `node_modules/`.
- Clients may impose max-depth and max-directory limits.
- When a project-local skill and a user-global skill share the same name in the
  same ecosystem, project-level skills conventionally take precedence. Skills
  Doctor still scans both records and reports a portability warning on the
  shadowed global skill so authors know which copy is likely inactive.

Parsing:

- Strict skills should use valid YAML frontmatter.
- Some clients may leniently load malformed or non-conforming skills, but
  authors should not depend on that.
- Missing or empty descriptions often cause a skill to be skipped because the
  agent cannot decide when to use it.

Disclosure:

- The model usually sees only a compact skill catalog at startup.
- Each catalog entry includes at least name and description.
- Some clients include the `SKILL.md` location so the model can load it.
- Filtered or disabled skills should be hidden entirely from the model.

Activation:

- Most clients rely on model judgment rather than keyword-only trigger matching.
- Some clients activate by file read.
- Some clients provide a dedicated activation tool.
- User-explicit activation may use slash commands or mention syntax.
- The model may receive either the full `SKILL.md` or the body with frontmatter
  stripped.

Context management:

- Skill content should be protected from context compaction once activated.
- Clients may deduplicate repeated activation attempts.
- Complex skills may run in subagent sessions in clients that support
  delegation.

Bundled resources:

- Activation tools may list bundled files without reading them eagerly.
- The model should load specific resources on demand.
- Skill directories may be allowlisted so the agent can read bundled resources
  without repeated permission prompts.

## Quickstart Pattern for a Minimal Skill

A minimal useful skill can be under 20 lines when the task is simple.

Example shape:

````markdown
---
name: roll-dice
description: Roll dice using a random number generator. Use when asked to roll a die, roll dice, or generate a random dice roll.
---

To roll a die, run a command that generates a random number from 1 to the
requested number of sides. Replace `<sides>` with the number of sides.

```bash
echo $((RANDOM % <sides> + 1))
```
````

Lessons from the quickstart:

- One file can be enough.
- The folder name and `name` must match.
- The description tells the agent when to activate.
- The body tells the agent exactly how to perform the task.
- A simple command can be appropriate when it is clear and safe.
- Compatible clients may require users to confirm tool execution.
- Tool-use reliability can vary by model.

## Anti-Patterns

Avoid these patterns:

- Vague descriptions such as "Helps with data."
- Descriptions that mention implementation but not user intent.
- Descriptions so broad they trigger on adjacent tasks.
- Descriptions so narrow they miss indirect user requests.
- Generic advice with no project-specific value.
- Huge `SKILL.md` files that front-load every reference.
- Deep chains of references.
- Long menus of equally weighted tools.
- Commands that are complex, fragile, and untested.
- Scripts with interactive prompts.
- Scripts that print mixed diagnostics and data to stdout.
- Destructive operations without dry runs or explicit confirmation flags.
- Assertions that are too vague to grade.
- Evals that compare nothing against no-skill or previous-skill baselines.
- Overfitting descriptions to exact eval-query wording.
- Putting critical gotchas in files the agent may not know to read.
- Depending on experimental fields for core behavior.

## Comprehensive Authoring Checklist

Use this checklist before publishing or installing a skill.

Structure:

- [ ] The skill is a directory.
- [ ] The directory contains `SKILL.md`.
- [ ] Optional `scripts/`, `references/`, and `assets/` directories are used
      only when needed.
- [ ] The directory name matches frontmatter `name`.

Frontmatter:

- [ ] `name` is present.
- [ ] `name` is 1 to 64 characters.
- [ ] `name` uses only lowercase letters, numbers, and hyphens.
- [ ] `name` does not start or end with a hyphen.
- [ ] `name` has no consecutive hyphens.
- [ ] `description` is present.
- [ ] `description` is 1 to 1024 characters.
- [ ] `description` states what the skill does.
- [ ] `description` states when to use it.
- [ ] `description` is phrased around user intent.
- [ ] Optional `license` is short.
- [ ] Optional `compatibility` is included only when needed and under 500
      characters.
- [ ] Optional `metadata` is a mapping.
- [ ] Optional `allowed-tools` is treated as experimental.

Main instructions:

- [ ] `SKILL.md` is under 500 lines.
- [ ] `SKILL.md` is recommended under 5,000 tokens.
- [ ] Instructions are specific to what the agent would not already know.
- [ ] The default path is clear.
- [ ] Fragile operations are prescriptive.
- [ ] Flexible operations explain intent and tradeoffs.
- [ ] Procedures generalize beyond one exact task.
- [ ] Gotchas are concrete and visible.
- [ ] Output templates are included when output shape matters.
- [ ] Validation loops are included where useful.
- [ ] Plan-validate-execute is used for risky batch work.

Progressive disclosure:

- [ ] Detailed references are moved out of `SKILL.md`.
- [ ] Each referenced file has a clear load trigger.
- [ ] References are shallow and relative to the skill root.
- [ ] Critical gotchas are not hidden behind ambiguous references.
- [ ] Large templates or assets live in `assets/`.

Scripts:

- [ ] One-off commands are version-pinned where practical.
- [ ] Complex commands are moved into scripts.
- [ ] Scripts are self-contained where practical.
- [ ] Runtime prerequisites are documented.
- [ ] Scripts are non-interactive.
- [ ] Scripts support `--help`.
- [ ] Scripts emit helpful errors.
- [ ] Structured data goes to stdout.
- [ ] Diagnostics go to stderr.
- [ ] Destructive scripts support dry runs or explicit confirmation flags.
- [ ] Scripts are idempotent where possible.
- [ ] Output size is bounded or pageable.

Description evaluation:

- [ ] Trigger eval queries exist for non-trivial skills.
- [ ] Positive queries cover direct and indirect user intent.
- [ ] Negative queries include near misses.
- [ ] Queries are realistic.
- [ ] Train and validation splits are fixed.
- [ ] The selected description generalizes beyond train failures.

Output evaluation:

- [ ] `evals/evals.json` exists for non-trivial skills.
- [ ] Each test case has a realistic prompt.
- [ ] Each test case defines expected output.
- [ ] Input files are included when needed.
- [ ] Runs compare with-skill against baseline.
- [ ] Runs start from clean context.
- [ ] Assertions have concrete evidence.
- [ ] Timing and token costs are tracked.
- [ ] Human review feedback is recorded.
- [ ] Revisions are based on failed assertions, human feedback, and transcripts.

Portability and safety:

- [ ] The skill uses valid YAML even if a client might be lenient.
- [ ] Paths are relative.
- [ ] Client-specific assumptions are documented.
- [ ] Project-specific installation guidance uses `.agents/skills/` where
      cross-client portability matters.
- [ ] The skill does not surprise users with side effects.
- [ ] The skill can be validated with `skills-ref validate ./skill-name`.
