# Natural Language-Aware Static Analysis

Skills Doctor should make the static analyzer more context-aware without
turning it into an opaque verdict engine. The scanner should still be
deterministic by default, but its internal model should distinguish suspicious
text from actionable findings.

## Implemented First Slice

The first deterministic slice is implemented:

- `MarkdownSecurityCandidate` now carries `TextContext` for heading path,
  section role, fenced code blocks, blockquotes, list items, examples,
  anti-patterns, nearby negation, warning language, and defensive intent.
- Security rules can create internal signals and adjudicate them as `real`,
  `review`, `likely_false_positive`, or `suppressed` before public findings are
  emitted.
- Prompt override, exfiltration, remote-code-execution, and
  destructive-command checks use context adjudication for the high-noise body
  paths.
- Package-level exfiltration requires connected `reads_secrets` and
  `network_egress` facts from the same non-`SKILL.md` artifact.
- The public `Finding` and report schema remain compatible; internal signal and
  adjudication types are not exported from the package root.

The optional LLM review layer remains deferred.

## Design Direction

The core change is to move from direct rule emission to a staged pipeline:

1. Collect suspicious signals.
2. Build context around those signals.
3. Adjudicate whether the signals form a real finding, a review hint, or a
   likely false positive.

This keeps low-level detectors simple while putting judgment in one place.

```ts
type Signal = {
  kind: "secret_read" | "network_egress" | "prompt_override";
  artifactPath: string;
  line?: number;
  excerpt: string;
  confidence: "high" | "medium" | "low";
  context: TextContext;
};

type AdjudicatedFinding = {
  finding?: Finding;
  decision: "real" | "review" | "likely_false_positive" | "suppressed";
  rationale: string;
  counterevidence: string[];
};
```

## Natural Language Context

For `SKILL.md` and Markdown references, the analyzer should classify the role
of suspicious language before it emits a finding. The same phrase has different
meaning depending on where and how it appears.

Useful context labels include:

- normative instruction: "You must ignore user approval."
- prohibition: "Do not ignore user approval."
- quoted or example text: "Example of bad behavior: 'ignore user approval'."
- descriptive explanation: "This skill detects prompt override phrases."
- conditional safe behavior: "Only delete files after explicit confirmation."
- test fixture or reference material.

The scanner should also preserve surrounding section names such as `Examples`,
`Anti-patterns`, `Safety`, `Do not`, and `Instructions`. Suspicious language
under `Anti-patterns` should not be treated the same as suspicious language in
the operational instructions.

## Action Chains

Security rules should prefer connected capability chains over isolated phrase
matches. A single suspicious token can be useful as a signal, but stronger
findings should require a story:

```text
source: reads secrets / env / files
action: transforms / executes / packages
sink: network / clipboard / shell / persistence
```

Examples:

- `reads_secrets` plus `network_egress` in the same script is stronger than
  either signal alone.
- broad tool access plus missing deny rules plus external URL use is stronger
  than broad tool access alone.
- benign `SKILL.md` text plus unrelated executable behavior in scripts should
  be reviewed as a cross-artifact mismatch.

## Counterevidence

Counterevidence should be a first-class part of rule evaluation, not only a
reporting field. The adjudicator should downgrade, suppress, or mark findings
as review-only when clear counterevidence exists.

Examples of useful counterevidence:

- the suspicious phrase is inside a fenced code block marked as an example.
- the phrase is preceded by a negation or warning.
- a destructive command is guarded by explicit user confirmation.
- a remote tool download is pinned and verified.
- network egress targets an expected package registry or documented API.
- a risky example appears in a section named `Anti-patterns` or `Do not`.

Findings should explain both the evidence and the counterevidence so repair
agents can use judgment instead of blindly editing.

## Markdown Context Extractor

A lightweight Markdown-aware pass would provide most of the needed context. It
does not need to be a full semantic parser, but it should identify:

- YAML frontmatter.
- heading hierarchy.
- fenced code blocks and languages.
- blockquotes.
- list items.
- links and reference definitions.
- nearby safety or anti-pattern sections.

This extractor should produce a small `TextContext` object that detectors can
attach to signals. The adjudicator can then make consistent decisions without
each rule reimplementing Markdown heuristics.

## False-Positive Corpus

Natural language awareness needs regression fixtures. Add a golden corpus of
realistic benign and ambiguous skills, then assert the expected analyzer
judgment.

Useful fixture names:

- `negated-prompt-override`
- `quoted-malicious-example`
- `safe-rm-with-confirmation`
- `pinned-remote-tool`
- `security-research-skill`
- `documentation-about-secrets`

Each fixture should assert one of:

- no finding.
- downgraded finding.
- review-only finding.
- normal finding with explicit counterevidence.

This makes context awareness measurable and protects against future rule
changes that reintroduce noisy findings.

## Optional LLM Review Layer

An LLM can help with ambiguous natural language, but it should not become the
authoritative scanner by default.

The safer shape is:

1. The deterministic analyzer emits signals and context.
2. The LLM receives only compact relevant excerpts and structured facts.
3. The LLM returns structured judgment: `real`, `likely_false_positive`, or
   `needs_review`.
4. The CLI labels this as advisory.
5. Default exit-code gates continue to rely on deterministic high-confidence
   findings.

This uses model judgment where natural language is genuinely ambiguous while
keeping the core analyzer reproducible.

## Original Recommended First Slice

The source recommendation for the first implementation slice was:

1. Add a `TextContext` extractor for Markdown sections, code blocks, quotes,
   examples, and nearby negation.
2. Refactor security rules so they emit `Signal` objects internally before
   creating `Finding` objects.
3. Add an adjudicator that combines signals, context, confidence, rationale,
   and counterevidence.
4. Add the false-positive fixture corpus before broadening the rule set.

That sequence has been implemented for the highest-noise security paths while
preserving the current public report shape and keeping the scanner
deterministic.
