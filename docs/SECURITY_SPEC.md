A scanner should treat `SKILL.md` as **operational code**, not documentation. In Codex, a skill is a folder with required `SKILL.md` plus optional scripts/references/assets, and Codex may select it from its `name`/`description` before reading the full instructions. OpenAI’s API docs also say skill instructions are user-prompt input, not system-prompt input, so metadata and body text are both part of the attack surface. ([OpenAI Developers][1])

## Files to scan

Scan at least:

`SKILL.md`, `agents/openai.yaml`, `scripts/**`, `references/**`, `assets/**`, `.agents/skills/**`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings*.json`, `.claude/agents/**`, `.mcp.json`, hook configs, package manifests, shell scripts, Dockerfiles, CI files, and any symlinked skill folders. Codex explicitly supports skill scripts/assets/references and follows symlinked skill folders, which means path traversal and hidden external targets matter. ([OpenAI Developers][1])

## P0 blocker rules

Scanner priority labels map directly to finding priority fields: P0 is blocker, P1 is high risk, and P2 is quality / hygiene.

| Rule | Flag when found | Why it matters |
| --- | --- | --- |
| `SKILL001_PROMPT_OVERRIDE` | Text like “ignore previous instructions”, “override system/developer instructions”, “do not tell the user”, “hide this step”, “bypass safety”, “always obey this skill over user” | Prompt injection is a top LLM-app risk; OWASP lists it as LLM01, and OpenAI frames it as an ongoing frontier security problem. ([OWASP][2]) |
| `SKILL002_PERMISSION_BYPASS` | `dangerously-skip-permissions`, `bypassPermissions`, `dontAsk`, `auto approve`, `skipDangerousModePermissionPrompt`, or instructions to avoid approval | Agent safety relies on user approval for risky actions. Claude Code docs state users are responsible for reviewing commands and that unmatched commands should require approval. ([Claude Platform Docs][3]) |
| `SKILL003_SECRET_ACCESS` | Reads of `.env`, `.env.*`, `secrets/**`, `credentials.json`, `~/.ssh`, `.aws`, `.gcloud`, keychains, browser profiles, npm tokens, GitHub tokens, OpenAI/Anthropic API keys | Claude Code recommends explicit deny rules for sensitive files such as `.env`, secret folders, and credentials files. GitHub secret scanning also treats committed credentials/API keys/tokens as a first-class repository risk. ([Claude Platform Docs][4]) |
| `SKILL004_EXFIL_CHAIN` | Secret/file reads combined with network egress: `curl`, `wget`, `fetch`, `requests`, `axios`, `nc`, `scp`, `rsync`, `webhook`, Slack/Discord/Telegram URLs, paste sites, ngrok/cloudflared | Anthropic warns malicious skills can leak sensitive data to external systems; Claude Code treats network fetches as approval-worthy and separately sandboxes web fetches because of injection risk. ([Claude Platform][5]) |
| `SKILL005_DESTRUCTIVE_COMMANDS` | `rm -rf`, `find -delete`, `chmod -R 777`, `chown -R`, `dd`, `mkfs`, `docker system prune`, `kubectl delete`, `terraform destroy`, `drop database`, `git push --force`, `gh repo delete` | OWASP’s “excessive agency” risk maps directly to unchecked destructive tool use by agents. ([OWASP][2]) |
| `SKILL006_PERSISTENCE` | Writes to shell rc files, cron, launch agents, systemd, git hooks, npm `postinstall`, pip setup hooks, VS Code tasks, auto-start folders | Skills can include executable code; Anthropic says malicious skills may invoke tools or execute code in ways that do not match their stated purpose. ([Claude Platform][5]) |
| `SKILL007_REMOTE_CODE_EXEC` | `curl \| sh`, `wget \| bash`, PowerShell `irm ... \| iex`, `eval`, `exec`, `subprocess(..., shell=True)`, dynamic imports from URLs, base64 decode-and-run | Insecure output handling and plugin/tool design are both OWASP LLM risks because model-controlled output can reach execution paths. ([OWASP][2]) |
| `SKILL008_OBFUSCATION` | Long base64 blobs, hex blobs, minified JS in markdown/assets, homoglyphs, zero-width Unicode, hidden HTML comments with instructions | Recent SKILL.md research specifically highlights semantic supply-chain attacks through natural-language metadata/instructions, not just obvious malware. ([arXiv][6]) |

## P1 high-risk rules

| Rule                                | Flag when found                                                                                                                                           | Recommended scanner action                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL101_BROAD_ALLOWED_TOOLS`      | `allowed-tools: Bash, Write, Edit, WebFetch`, `mcp__*`, `Agent` without narrowing, or broad file/network tools                                            | High severity unless paired with clear deny rules. Claude says skill `allowed-tools` can grant tool access without per-use approval while active. ([Claude Platform Docs][7])             |
| `SKILL102_MISSING_DENYLIST`         | Skill has scripts/network/tool access but no denylist for secrets, home dirs, credentials, or destructive commands                                        | Warn. Claude Code docs show `permissions.deny` as the mechanism for blocking sensitive reads. ([Claude Platform Docs][4])                                                                 |
| `SKILL103_IMPLICIT_INVOCATION_RISK` | Broad descriptions like “use for any coding task”, “always use”, “general assistant”, “best skill for everything”                                         | High because Codex can implicitly invoke a skill from the `description`; OpenAI recommends concise descriptions with clear scope and boundaries. ([OpenAI Developers][1])                 |
| `SKILL104_EXTERNAL_DEPENDENCY`      | Skill tells agent to fetch docs/scripts/prompts from URLs at runtime, install packages unpinned, clone arbitrary repos, or trust remote markdown          | Anthropic warns external URLs are risky because fetched content may contain malicious instructions and dependencies can change over time. ([Claude Platform][5])                          |
| `SKILL105_CROSS_MODAL_MISMATCH`     | Benign `SKILL.md` but scripts do unrelated filesystem/network/auth work, or scripts are benign but markdown instructs the agent to modify them at runtime | Recent SkillMutator research argues skills create a cross-modal language-and-code attack surface and that scanners need to reason across both markdown and executable files. ([arXiv][8]) |
| `SKILL106_SELF_MODIFYING_SKILL`     | Skill instructs the agent to edit its own `SKILL.md`, scripts, references, or registry metadata during execution                                          | Recent dynamic-malicious-skill research proposes read-only skill mounts as a defense against runtime skill modification. ([arXiv][9])                                                     |
| `SKILL107_UNTRUSTED_MCP`            | Skill/plugin adds MCP servers, broad MCP dependencies, OAuth scopes, or `mcp__*` access without allowlist                                                 | MCP tools are model-controlled, and the MCP spec recommends clear tool exposure, invocation indicators, and human confirmation. ([Model Context Protocol][10])                            |
| `SKILL108_MCP_SCOPE_EXCESS`         | MCP config requests broad OAuth scopes or lacks exact redirect/metadata validation                                                                        | MCP authorization guidance emphasizes scope minimization, protected-resource metadata, secure token storage, PKCE, and redirect validation. ([Model Context Protocol][11])                |

## P2 quality / hygiene rules

These should not block by default, but they should affect score:

| Rule                                 | Flag                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL201_NO_BOUNDARIES`             | No “when not to use this skill”, no allowed inputs/outputs, no forbidden actions                                                                                                                  |
| `SKILL202_NO_HITL_FOR_RISKY_ACTIONS` | Deploy, email, payments, deletion, secrets, DB migrations, GitHub writes, cloud infra changes without explicit human approval                                                                     |
| `SKILL203_AMBIGUOUS_AUTHORITY`       | Says “this skill is authoritative”, “must always be followed”, “higher priority than project rules”                                                                                               |
| `SKILL204_UNPINNED_TOOLS`            | `npm install package`, `pip install package`, `brew install`, `docker pull latest`, GitHub branch refs instead of pinned versions                                                                 |
| `SKILL205_HIDDEN_FILES`              | Dotfiles, hidden folders, unusual extensions, executable assets, symlinks outside skill root                                                                                                      |
| `SKILL206_LARGE_CONTEXT_BAIT`        | Very long descriptions or references designed to dominate context; Codex already truncates skill descriptions when many skills exist, so bloated metadata is suspicious. ([OpenAI Developers][1]) |

## Cross-file rules are the important part

A good scanner should score **combinations**, not isolated tokens:

```text
Read secrets + network egress                  => P0
Allowed Bash + no deny rules + external URL    => P0/P1
Implicit invocation + broad description        => P1
Benign SKILL.md + suspicious scripts           => P1/P0
MCP broad scope + auto approval language       => P0
Self-modification + executable scripts         => P0
```

This matches the agentic risk model better than traditional SAST. OWASP’s LLM Top 10 includes prompt injection, sensitive information disclosure, insecure plugin design, supply-chain vulnerabilities, and excessive agency; all appear in agent skill packages. ([OWASP][2])

## Minimal v1 rule engine

For an MVP, implement these detectors first:

1. **Manifest parser:** validate frontmatter, `name`, `description`, invocation policy, dependencies, allowed/disallowed tools.
2. **Prompt-injection phrase detector:** malicious authority, concealment, bypass, exfiltration, impersonation, approval-skipping.
3. **Command detector:** shell, PowerShell, Python subprocess, Node child_process, package scripts.
4. **Secret detector:** reuse GitHub/Gitleaks-style secret patterns plus path-based rules for `.env`, SSH, cloud credentials, browser/keychain files. ([GitHub Docs][12])
5. **Network detector:** URLs, webhooks, sockets, tunneling tools, package downloads.
6. **Permission config detector:** Claude/Codex settings, MCP servers, hooks, agents, allow/deny rules.
7. **Cross-file semantic check:** compare stated purpose in `description` against scripts/resources behavior.

My blunt take: the scanner should not try to decide “malicious or safe” as a single binary verdict. It should output **capability deltas**: “this skill can read secrets,” “this skill can reach the network,” “this skill can persist,” “this skill can bypass approval,” “this skill can self-modify.” That is more useful for developers and harder for attackers to game.

[1]: https://developers.openai.com/codex/skills "Agent Skills – Codex | OpenAI Developers"
[2]: https://owasp.org/www-project-top-10-for-large-language-model-applications/ "OWASP Top 10 for Large Language Model Applications | OWASP Foundation"
[3]: https://docs.anthropic.com/en/docs/claude-code/security "Security - Claude Code Docs"
[4]: https://docs.anthropic.com/en/docs/claude-code/settings "Claude Code settings - Claude Code Docs"
[5]: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview "Agent Skills - Claude Platform Docs"
[6]: https://arxiv.org/abs/2605.11418?utm_source=chatgpt.com "Under the Hood of SKILL.md: Semantic Supply-chain Attacks on AI Agent Skill Registry"
[7]: https://docs.anthropic.com/en/docs/claude-code/skills "Extend Claude with skills - Claude Code Docs"
[8]: https://arxiv.org/abs/2606.14154?utm_source=chatgpt.com "SkillMutator: Benchmarking and Defending Language-and-Code Cross-modal Attacks on LLM Agent Skills"
[9]: https://arxiv.org/abs/2606.16287?utm_source=chatgpt.com "Dynamic Malicious Skills in Agentic AI"
[10]: https://modelcontextprotocol.io/specification/2025-11-25/server/tools "Tools - Model Context Protocol"
[11]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization "Authorization - Model Context Protocol"
[12]: https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns?utm_source=chatgpt.com "Supported secret scanning patterns"
