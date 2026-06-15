import type { ScoreSummary } from "../../domain/calculate-score.js";

export type RenderScoreHeaderOptions = {
  readonly columns?: number | undefined;
  readonly color?: boolean | undefined;
  readonly displayScore?: number | undefined;
  readonly potentialScore?: number | undefined;
  readonly rainbowFrame?: number | undefined;
};

export type PrintScoreHeaderOptions = RenderScoreHeaderOptions & {
  readonly score: ScoreSummary;
  readonly write: (message: string) => void;
  readonly animate?: boolean | undefined;
  readonly frameCount?: number | undefined;
  readonly frameDelayMilliseconds?: number | undefined;
};

const PERFECT_SCORE = 100;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;
const SCORE_BAR_WIDTH_CHARS = 50;
const SCORE_BAR_MIN_WIDTH_CHARS = 10;
const RIGHT_EDGE_SAFETY_COLUMNS = 1;
const SCORE_HEADER_ANIMATION_FRAME_COUNT = 40;
const SCORE_HEADER_ANIMATION_FRAME_DELAY_MS = 50;
const FACE_INDENT = "  ";
const FACE_BOX_TOP_BORDER = "┌─────┐";
const SCORE_RIGHT_COLUMN_OFFSET =
  FACE_INDENT.length + FACE_BOX_TOP_BORDER.length + FACE_INDENT.length;
const BRANDING_LINE = "Skills Doctor";

export const renderScoreHeader = (
  score: ScoreSummary,
  options: RenderScoreHeaderOptions = {},
): string => {
  const displayScore = options.displayScore ?? score.value;
  const faceLines = buildFaceLines(score.value, Boolean(options.color), options.rainbowFrame);
  const scoreLine = buildScoreLine(displayScore, score.value, score.label, Boolean(options.color));
  const barLine =
    options.potentialScore === undefined
      ? buildScoreBar(displayScore, score.value, options)
      : buildProjectedScoreBar(score.value, options.potentialScore, options);
  return [
    buildScoreHeaderLine(faceLines[0] ?? "", scoreLine),
    buildScoreHeaderLine(faceLines[1] ?? "", barLine),
    buildScoreHeaderLine(faceLines[2] ?? "", dim(BRANDING_LINE, Boolean(options.color))),
    buildScoreHeaderLine(faceLines[3] ?? "", ""),
    "",
  ].join("\n");
};

export const printScoreHeader = async (options: PrintScoreHeaderOptions): Promise<void> => {
  if (!options.animate) {
    options.write(renderScoreHeader(options.score, options));
    return;
  }

  options.write(renderScoreHeader(options.score, { ...options, displayScore: 0 }));
  options.write("\x1b[5A");
  await printAnimatedScore(options);
  options.write("\x1b[3B");
};

const printAnimatedScore = async (options: PrintScoreHeaderOptions): Promise<void> => {
  const frameCount = options.frameCount ?? SCORE_HEADER_ANIMATION_FRAME_COUNT;
  const delayMilliseconds = options.frameDelayMilliseconds ?? SCORE_HEADER_ANIMATION_FRAME_DELAY_MS;
  const faceLines = buildFaceLines(options.score.value, Boolean(options.color));

  for (let frame = 0; frame <= frameCount; frame += 1) {
    const progress = frameCount === 0 ? 1 : easeOutCubic(frame / frameCount);
    const displayScore = Math.round(options.score.value * progress);
    const cursorUp = frame === 0 ? "" : "\x1b[2A";
    const isFinalFrame = frame === frameCount;
    const scoreLine = buildScoreLine(
      displayScore,
      options.score.value,
      options.score.label,
      Boolean(options.color),
    );
    const barLine =
      isFinalFrame && options.potentialScore !== undefined
        ? buildProjectedScoreBar(options.score.value, options.potentialScore, options)
        : buildScoreBar(displayScore, options.score.value, options);

    options.write(
      `${cursorUp}\r${buildScoreHeaderLine(faceLines[0] ?? "", scoreLine)}\n\r${buildScoreHeaderLine(faceLines[1] ?? "", barLine)}\n`,
    );

    if (frame < frameCount && delayMilliseconds > 0) {
      await sleep(delayMilliseconds);
    }
  }
};

const buildScoreLine = (
  displayScore: number,
  finalScore: number,
  label: string,
  shouldColor: boolean,
): string => {
  const scoreNumber = colorizeByScore(String(displayScore), finalScore, shouldColor);
  const scoreLabel = colorizeByScore(label, finalScore, shouldColor);
  return `${scoreNumber} ${dim(`/ ${PERFECT_SCORE}`, shouldColor)} ${scoreLabel}`;
};

const buildScoreBar = (
  displayScore: number,
  colorScore: number,
  options: RenderScoreHeaderOptions,
): string => {
  const width = getScoreBarWidth(options.columns);
  const filledCount = getFilledCount(displayScore, width);
  const emptyCount = Math.max(0, width - filledCount);
  return (
    colorizeByScore("█".repeat(filledCount), colorScore, Boolean(options.color)) +
    dim("░".repeat(emptyCount), Boolean(options.color))
  );
};

const buildProjectedScoreBar = (
  currentScore: number,
  potentialScore: number,
  options: RenderScoreHeaderOptions,
): string => {
  const width = getScoreBarWidth(options.columns);
  const currentFill = getFilledCount(currentScore, width);
  const potentialFill = Math.min(getFilledCount(potentialScore, width), width);
  const gainCount = Math.max(0, potentialFill - currentFill);
  const emptyCount = Math.max(0, width - currentFill - gainCount);
  const shouldColor = Boolean(options.color);
  return (
    colorizeByScore("█".repeat(currentFill), currentScore, shouldColor) +
    dim(colorizeByScore("▓".repeat(gainCount), currentScore, shouldColor), shouldColor) +
    dim("░".repeat(emptyCount), shouldColor)
  );
};

const getFilledCount = (score: number, width: number): number =>
  Math.round((Math.max(0, Math.min(PERFECT_SCORE, score)) / PERFECT_SCORE) * width);

const getScoreBarWidth = (columns: number | undefined): number => {
  if (columns === undefined || !Number.isFinite(columns)) return SCORE_BAR_WIDTH_CHARS;
  return Math.max(
    SCORE_BAR_MIN_WIDTH_CHARS,
    Math.min(
      SCORE_BAR_WIDTH_CHARS,
      Math.floor(columns) - SCORE_RIGHT_COLUMN_OFFSET - RIGHT_EDGE_SAFETY_COLUMNS,
    ),
  );
};

const buildScoreHeaderLine = (faceLine: string, rightColumnContent: string): string => {
  const separator = rightColumnContent.length > 0 ? "  " : "";
  return `${FACE_INDENT}${faceLine}${separator}${rightColumnContent}`;
};

const buildFaceLines = (
  score: number,
  shouldColor: boolean,
  rainbowFrame: number | undefined = undefined,
): readonly string[] => {
  const [eyes, mouth] = getFace(score);
  const rawLines = [FACE_BOX_TOP_BORDER, `│ ${eyes} │`, `│ ${mouth} │`, "└─────┘"];
  if (score === PERFECT_SCORE && shouldColor) {
    return rawLines.map((line, index) => colorizeRainbowText(line, rainbowFrame ?? 0, index * 4));
  }
  return rawLines.map((line) => colorizeByScore(line, score, shouldColor));
};

const getFace = (score: number): readonly [string, string] => {
  if (score >= SCORE_GOOD_THRESHOLD) return ["◠ ◠", " ▽ "];
  if (score >= SCORE_OK_THRESHOLD) return ["• •", " ─ "];
  return ["x x", " ▽ "];
};

const colorizeByScore = (text: string, score: number, shouldColor: boolean): string => {
  if (!shouldColor || text.length === 0) return text;
  if (score >= SCORE_GOOD_THRESHOLD) return color(text, 32);
  if (score >= SCORE_OK_THRESHOLD) return color(text, 33);
  return color(text, 31);
};

const dim = (text: string, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[2m${text}\x1b[22m` : text;

const color = (text: string, code: number): string => `\x1b[${code}m${text}\x1b[39m`;

const colorizeRainbowText = (text: string, frame: number, offset = 0): string =>
  [...text]
    .map((character, index) => {
      if (character === " ") return character;
      const hue = ((index + offset) * 37 + frame * 9) % 360;
      return trueColor(character, hslToRgb(hue, 0.72, 0.58));
    })
    .join("");

const trueColor = (
  text: string,
  { red, green, blue }: { readonly red: number; readonly green: number; readonly blue: number },
): string => `\x1b[38;2;${red};${green};${blue}m${text}\x1b[39m`;

const hslToRgb = (
  hue: number,
  saturation: number,
  lightness: number,
): { readonly red: number; readonly green: number; readonly blue: number } => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [red1, green1, blue1] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return {
    red: Math.round((red1 + match) * 255),
    green: Math.round((green1 + match) * 255),
    blue: Math.round((blue1 + match) * 255),
  };
};

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3;

const sleep = async (milliseconds: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
