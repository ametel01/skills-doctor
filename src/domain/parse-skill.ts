import { parseDocument } from "yaml";
import type { ParseResult } from "./types.js";

const FRONTMATTER_OPEN_PATTERN = /^---[ \t]*(?:\r?\n|$)/;
const FRONTMATTER_CLOSE_PATTERN = /^---[ \t]*(?:\r?\n|$)/gm;

export const parseSkillContent = (content: string): ParseResult => {
  const openingMatch = FRONTMATTER_OPEN_PATTERN.exec(content);
  if (openingMatch === null) {
    return {
      ok: false,
      error: {
        code: "missing-frontmatter",
        message: "SKILL.md must start with YAML frontmatter delimited by ---.",
      },
    };
  }

  FRONTMATTER_CLOSE_PATTERN.lastIndex = openingMatch[0].length;
  const closingMatch = FRONTMATTER_CLOSE_PATTERN.exec(content);
  if (closingMatch === null) {
    return {
      ok: false,
      error: {
        code: "invalid-frontmatter",
        message: "SKILL.md frontmatter could not be read.",
      },
    };
  }

  const raw = content.slice(openingMatch[0].length, closingMatch.index).replace(/\r?\n$/, "");

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
      body: content.slice(closingMatch.index + closingMatch[0].length),
    },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
