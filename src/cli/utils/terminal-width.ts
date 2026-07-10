const RESET_ANSI = "\x1b[0m";
// biome-ignore lint/complexity/useRegexLiterals: keep the ESC character out of source regex literals.
const ANSI_PATTERN = new RegExp("\\x1b\\[[0-9;?]*[ -/]*[@-~]", "gu");
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const stripTerminalAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

export const terminalGraphemes = (text: string): readonly string[] =>
  [...segmenter.segment(stripTerminalAnsi(text))].map((segment) => segment.segment);

export const terminalCellWidth = (text: string): number =>
  terminalGraphemes(text).reduce((width, grapheme) => width + graphemeCellWidth(grapheme), 0);

export const truncateTerminalCells = (
  text: string,
  width: number,
  options: { readonly suffix?: string | undefined } = {},
): string => {
  if (width <= 0) return "";
  if (terminalCellWidth(text) <= width) return text;

  const suffix = options.suffix ?? "";
  const suffixWidth = terminalCellWidth(suffix);
  if (suffixWidth >= width) return truncatePlainCells(suffix, width);
  const contentWidth = width - suffixWidth;
  let result = "";
  let consumed = 0;
  let index = 0;

  for (const match of text.matchAll(ANSI_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const chunk = text.slice(index, matchIndex);
    const next = appendGraphemesWithinWidth(chunk, result, consumed, contentWidth);
    result = next.text;
    consumed = next.width;
    if (next.truncated) {
      return finishTruncation(result, suffix, text.includes("\x1b["));
    }
    result += match[0] ?? "";
    index = matchIndex + (match[0]?.length ?? 0);
  }

  const next = appendGraphemesWithinWidth(text.slice(index), result, consumed, contentWidth);
  return finishTruncation(next.text, suffix, text.includes("\x1b["));
};

export const padTerminalCells = (text: string, width: number): string =>
  `${text}${" ".repeat(Math.max(0, width - terminalCellWidth(text)))}`;

const appendGraphemesWithinWidth = (
  input: string,
  initialText: string,
  initialWidth: number,
  width: number,
): { readonly text: string; readonly width: number; readonly truncated: boolean } => {
  let text = initialText;
  let used = initialWidth;
  for (const segment of segmenter.segment(input)) {
    const grapheme = segment.segment;
    const graphemeWidth = graphemeCellWidth(grapheme);
    if (used + graphemeWidth > width) return { text, width: used, truncated: true };
    text += grapheme;
    used += graphemeWidth;
  }
  return { text, width: used, truncated: false };
};

const truncatePlainCells = (text: string, width: number): string =>
  appendGraphemesWithinWidth(text, "", 0, width).text;

const finishTruncation = (text: string, suffix: string, hadAnsi: boolean): string =>
  `${text}${suffix}${hadAnsi ? RESET_ANSI : ""}`;

const graphemeCellWidth = (grapheme: string): number => {
  const codePoints = [...grapheme];
  if (codePoints.length === 0 || codePoints.every(isZeroWidth)) return 0;
  return codePoints.some(isWide) || isEmojiPresentationGrapheme(codePoints) ? 2 : 1;
};

const isEmojiPresentationGrapheme = (codePoints: readonly string[]): boolean =>
  codePoints.some((character) => isEmojiVariationSelector(character) || isKeycap(character)) ||
  codePoints.some(isRegionalIndicator);

const isZeroWidth = (character: string): boolean =>
  /^\p{Mark}$/u.test(character) || character === "\u200d" || isVariationSelector(character);

const isVariationSelector = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
};

const isEmojiVariationSelector = (character: string): boolean => character === "\ufe0f";

const isKeycap = (character: string): boolean => character === "\u20e3";

const isRegionalIndicator = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
};

const isWide = (character: string): boolean => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
};
