import { parseDocument } from "yaml";
import type { ParseResult } from "./types.js";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export const parseSkillContent = (content: string): ParseResult => {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (match === null) {
    return {
      ok: false,
      error: {
        code: "missing-frontmatter",
        message: "SKILL.md must start with YAML frontmatter delimited by ---.",
      },
    };
  }

  const raw = match[1];
  if (raw === undefined) {
    return {
      ok: false,
      error: {
        code: "invalid-frontmatter",
        message: "SKILL.md frontmatter could not be read.",
      },
    };
  }

  const document = parseDocument(raw);
  if (document.errors.length > 0) {
    return {
      ok: false,
      error: {
        code: "invalid-yaml",
        message: document.errors[0]?.message ?? "YAML frontmatter is invalid.",
      },
    };
  }

  const parsed = document.toJS({ mapAsMap: false }) as unknown;
  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: {
        code: "frontmatter-not-map",
        message: "YAML frontmatter must be a mapping.",
      },
    };
  }

  return {
    ok: true,
    frontmatter: {
      data: parsed,
      raw,
      body: content.slice(match[0].length),
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
