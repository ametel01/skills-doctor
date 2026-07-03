/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
 * Hallmark · genre: modern-minimal · macrostructure: Workbench · theme: Terminal · enrichment: none · nav: N8 · footer: Ft4
 * knobs: score-result-panel · adaptive-width · responsive-metric-strip · package-version-brand · security-summary
 */
import readline from "node:readline";
import type { ScanReport } from "../../domain/build-report.js";
import type { Choice } from "./prompts.js";
import { PromptCancelledError } from "./prompts.js";

export type TuiDashboardOptions = {
  readonly columns?: number | undefined;
  readonly color?: boolean | undefined;
  readonly selectedIndex?: number | undefined;
};

export type TuiSelectOptions = TuiDashboardOptions & {
  readonly write: (message: string) => void;
  readonly stdin?: NodeJS.ReadStream | undefined;
};

const MIN_COLUMNS = 76;
const DEFAULT_COLUMNS = 120;
const HEADER_GAP = 4;
const BRAND_WIDE_WIDTH = 48;
const BRAND_COMPACT_WIDTH = 36;
const BRAND_MIN_COLUMNS = 112;
const BRAND_WIDE_COLUMNS = 150;
const METRIC_WIDE_COLUMNS = 170;
const METRIC_MEDIUM_COLUMNS = 96;
const ESC = "\x1b[";
export const TUI_CLEAR_SCREEN = `${ESC}?25l${ESC}3J${ESC}2J${ESC}H`;
// biome-ignore lint/complexity/useRegexLiterals: literal ESC triggers noControlCharactersInRegex.
const ANSI_PATTERN = new RegExp("\\x1b\\[[0-9;?]*[ -/]*[@-~]", "gu");
// biome-ignore lint/complexity/useRegexLiterals: literal ESC triggers noControlCharactersInRegex.
const ANSI_SEQUENCE_PATTERN = new RegExp("\\x1b\\[[0-9;?]*[ -/]*[@-~]", "y");

export const renderTuiDashboard = <Value extends string>(
  report: ScanReport,
  choices: readonly Choice<Value>[],
  options: TuiDashboardOptions = {},
): string => {
  const width = normalizeColumns(options.columns);
  const selectedIndex = options.selectedIndex ?? 0;
  const shouldColor = Boolean(options.color);
  const leftWidth = getHeaderLeftWidth(width);
  const lines: string[] = [
    ...renderHeader(report, width, shouldColor),
    "",
    ...renderScoreResult(report, leftWidth, shouldColor),
    "",
    ...renderMetricStrip(report, width, shouldColor),
  ];

  if (choices.length > 0) {
    lines.push("", ...renderNextStepPanel(choices, selectedIndex, width, shouldColor));
  }

  lines.push("", renderControls(shouldColor));
  return `${lines.map((line) => paintScreenLine(line, width, shouldColor)).join("\n")}\n`;
};

export const selectTuiAction = async <Value extends string>(
  report: ScanReport,
  choices: readonly Choice<Value>[],
  options: TuiSelectOptions,
): Promise<Value> => {
  if (choices.length === 0) {
    throw new Error("TUI select requires at least one choice.");
  }

  const stdin = options.stdin ?? process.stdin;
  if (stdin.setRawMode === undefined) {
    throw new Error("TUI select requires a raw-mode TTY.");
  }

  let selectedIndex = 0;
  const followsTerminalResize = options.columns === undefined;
  const render = () => {
    const columns = options.columns ?? process.stdout.columns;
    options.write(
      `${TUI_CLEAR_SCREEN}${renderTuiDashboard(report, choices, {
        columns,
        color: options.color,
        selectedIndex,
      })}`,
    );
  };

  return await new Promise<Value>((resolve, reject) => {
    const wasRaw = stdin.isRaw;

    const cleanup = () => {
      if (followsTerminalResize) {
        process.stdout.off("resize", render);
      }
      stdin.off("keypress", onKeypress);
      stdin.setRawMode?.(wasRaw === true);
      stdin.pause();
      options.write(`${ESC}?25h`);
    };

    const finish = (value: Value) => {
      cleanup();
      resolve(value);
    };

    const cancel = () => {
      cleanup();
      reject(new PromptCancelledError());
    };

    const onKeypress = (character: string | undefined, key: readline.Key) => {
      if (key.ctrl && key.name === "c") {
        cancel();
        return;
      }
      if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
        return;
      }
      if (key.name === "down" || key.name === "j") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
        return;
      }
      if (key.name === "home") {
        selectedIndex = 0;
        render();
        return;
      }
      if (key.name === "end") {
        selectedIndex = choices.length - 1;
        render();
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        const choice = choices[selectedIndex];
        if (choice !== undefined) finish(choice.value);
        return;
      }
      if (character === "q") {
        const exitChoice = choices.find((choice) => choice.value === "exit");
        const fallbackChoice = exitChoice ?? choices[selectedIndex] ?? choices[0];
        if (fallbackChoice !== undefined) finish(fallbackChoice.value);
        return;
      }

      const shortcutIndex = resolveShortcutIndex(character, choices);
      if (shortcutIndex !== undefined) {
        selectedIndex = shortcutIndex;
        render();
        const choice = choices[selectedIndex];
        if (choice !== undefined) finish(choice.value);
      }
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", onKeypress);
    if (followsTerminalResize) {
      process.stdout.on("resize", render);
    }
    render();
  });
};

export const waitForTuiContinue = async (input: {
  readonly write: (message: string) => void;
  readonly color?: boolean | undefined;
  readonly stdin?: NodeJS.ReadStream | undefined;
}): Promise<void> => {
  const stdin = input.stdin ?? process.stdin;
  if (stdin.setRawMode === undefined) return;

  input.write(`\n${dim("Press any key to return to the dashboard.", Boolean(input.color))}`);
  await new Promise<void>((resolve, reject) => {
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode?.(wasRaw === true);
      stdin.pause();
      input.write("\n");
    };
    const onKeypress = (_character: string | undefined, key: readline.Key) => {
      cleanup();
      if (key.ctrl && key.name === "c") {
        reject(new PromptCancelledError());
        return;
      }
      resolve();
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", onKeypress);
  });
};

const renderHeader = (
  report: ScanReport,
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const brandWidth = getBrandWidth(width);
  const brand = brandWidth === 0 ? [] : renderBrandBox(report.version, brandWidth, shouldColor);
  const leftWidth = getHeaderLeftWidth(width);
  const statusLines = [
    `${green("›", shouldColor)}  ${success("npx", shouldColor)} ${bright("skills-doctor@latest", shouldColor)}`,
    `${success("✓", shouldColor)}  Scanning scope: ${formatScanScope(report)}`,
    `${success("✓", shouldColor)}  Skill source: ${formatSkillSource(report)}`,
    `${info("ⓘ", shouldColor)}  Reading Codex skill settings...`,
    `${info("ⓘ", shouldColor)}  Scanning skills...`,
    "",
  ].map((line) => fitToWidth(line, leftWidth));

  if (brandWidth === 0) return statusLines;

  return statusLines.map(
    (line, index) => `${line}${" ".repeat(HEADER_GAP)}${brand[index] ?? " ".repeat(brandWidth)}`,
  );
};

const renderBrandBox = (
  version: string,
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const art =
    width >= BRAND_WIDE_WIDTH
      ? [
          `${violet(" ╭──────╮", shouldColor)}   ${strong("skills-doctor", shouldColor)}`,
          `${blue("╭│ ◠  ◠ │╮", shouldColor)}  ${muted("Diagnose. Optimize. Focus.", shouldColor)}`,
          `${violet("╰│  ──  │╯", shouldColor)}  ${subtleBadge(` v${version} `, shouldColor)}`,
          `${blue(" ╰──┬───╯", shouldColor)}   ${info("●", shouldColor)}${green("●", shouldColor)}${amber("●", shouldColor)}`,
          `${blue("    ╰─", shouldColor)}${info("●", shouldColor)}${green("●", shouldColor)}`,
        ]
      : [
          `${violet("╭────╮", shouldColor)} ${strong("skills-doctor", shouldColor)}`,
          `${blue("│ ◠◠ │", shouldColor)} ${muted("Diagnose. Focus.", shouldColor)}`,
          `${blue("╰─┬──╯", shouldColor)} ${subtleBadge(` v${version} `, shouldColor)}`,
          `${blue("  ╰─", shouldColor)}${info("●", shouldColor)}${green("●", shouldColor)}${amber("●", shouldColor)}`,
        ];
  return box("", art, width, shouldColor);
};

const SCORE_PANEL_FACE_WIDTH = 7;
const SCORE_PANEL_GAP = 2;
const PERFECT_SCORE = 100;
const SCORE_GOOD_THRESHOLD = 75;
const SCORE_OK_THRESHOLD = 50;

const renderScoreResult = (
  report: ScanReport,
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const innerWidth = width - 4;
  const title = scoreColor("Scan score", report.score.value, shouldColor);
  const score = report.score;
  const faceLines = renderScoreFace(score.value, shouldColor);
  const detailWidth = Math.max(1, innerWidth - SCORE_PANEL_FACE_WIDTH - SCORE_PANEL_GAP);
  const meterWidth = Math.max(12, Math.min(42, detailWidth - 2));
  const penalty = formatPenalty(score.penalty);
  const ruleSummary = `${score.distinctErrorRuleCount} error rules · ${score.distinctWarningRuleCount} warning rules · ${score.distinctAdviceRuleCount} advice rules`;
  const outcome = report.ok ? "scan passed" : "action needed";
  const body = [
    renderScorePanelLine(
      faceLines[0] ?? "",
      `${scoreColor(String(score.value), score.value, shouldColor)} ${dim(
        `/ ${PERFECT_SCORE}`,
        shouldColor,
      )} ${scoreColor(score.label, score.value, shouldColor)} ${dim("·", shouldColor)} ${scoreColor(outcome, score.value, shouldColor)}`,
      detailWidth,
    ),
    renderScorePanelLine(
      faceLines[1] ?? "",
      `${renderScoreMeter(score.value, meterWidth, shouldColor)} ${dim(
        `${score.value}%`,
        shouldColor,
      )}`,
      detailWidth,
    ),
    renderScorePanelLine(
      faceLines[2] ?? "",
      `${strong(penalty, shouldColor)} ${muted("score penalty", shouldColor)}`,
      detailWidth,
    ),
    renderScorePanelLine(faceLines[3] ?? "", muted(ruleSummary, shouldColor), detailWidth),
  ];

  return box(title, body, width, shouldColor);
};

const renderScorePanelLine = (faceLine: string, detail: string, detailWidth: number): string =>
  `${padRight(faceLine, SCORE_PANEL_FACE_WIDTH)}${" ".repeat(SCORE_PANEL_GAP)}${fitToWidth(
    detail,
    detailWidth,
  )}`;

const renderScoreFace = (score: number, shouldColor: boolean): readonly string[] => {
  const [eyes, mouth] = getScoreFace(score);
  return ["╭─────╮", `│ ${eyes} │`, `│ ${mouth} │`, "╰─────╯"].map((line) =>
    scoreColor(line, score, shouldColor),
  );
};

const getScoreFace = (score: number): readonly [string, string] => {
  if (score >= SCORE_GOOD_THRESHOLD) return ["◠ ◠", " ▽ "];
  if (score >= SCORE_OK_THRESHOLD) return ["• •", " ─ "];
  return ["x x", " ▽ "];
};

const renderScoreMeter = (score: number, width: number, shouldColor: boolean): string => {
  const boundedScore = Math.max(0, Math.min(PERFECT_SCORE, score));
  const filledCount = Math.round((boundedScore / PERFECT_SCORE) * width);
  return (
    scoreColor("█".repeat(filledCount), score, shouldColor) +
    dim("░".repeat(Math.max(0, width - filledCount)), shouldColor)
  );
};

const formatPenalty = (penalty: number): string =>
  penalty === 0 ? "0" : Number.isInteger(penalty) ? String(penalty) : penalty.toFixed(2);

const scoreColor = (text: string, score: number, shouldColor: boolean): string => {
  if (score >= SCORE_GOOD_THRESHOLD) return success(text, shouldColor);
  if (score >= SCORE_OK_THRESHOLD) return amber(text, shouldColor);
  return danger(text, shouldColor);
};

const renderMetricStrip = (
  report: ScanReport,
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const metrics = buildMetrics(report, shouldColor);
  const columnsPerRow = getMetricColumnsPerRow(width, metrics.length);
  const metricRows = chunk(metrics, columnsPerRow);
  const lines: string[] = [
    `${border("╭", shouldColor)}${border("─".repeat(width - 2), shouldColor)}${border("╮", shouldColor)}`,
  ];

  metricRows.forEach((rowMetrics, rowIndex) => {
    const count = rowMetrics.length;
    const columnWidth = Math.max(15, Math.floor((width - 2 - (count - 1)) / count));
    for (const metricLineIndex of [0, 1, 2, 3, 4]) {
      const cells = rowMetrics.map((metric) =>
        padRight(` ${metric[metricLineIndex] ?? ""}`, columnWidth),
      );
      lines.push(
        `${border("│", shouldColor)}${cells.join(border("│", shouldColor))}${border("│", shouldColor)}`,
      );
    }
    if (rowIndex < metricRows.length - 1) {
      lines.push(
        `${border("├", shouldColor)}${border("─".repeat(width - 2), shouldColor)}${border("┤", shouldColor)}`,
      );
    }
  });

  lines.push(
    `${border("╰", shouldColor)}${border("─".repeat(width - 2), shouldColor)}${border("╯", shouldColor)}`,
  );
  return lines;
};

const buildMetrics = (report: ScanReport, shouldColor: boolean): readonly (readonly string[])[] => {
  const usage = report.usage;
  const cleanupCandidateCount =
    usage?.recommendations.filter((recommendation) => recommendation.action === "disable-candidate")
      .length ?? 0;
  const pressure = usage?.contextPressure.level ?? "unknown";
  return [
    [
      `${blue("⌕", shouldColor)} ${blue("Skills", shouldColor)}`,
      "",
      strong(String(report.skillCount), shouldColor),
      muted("scanned", shouldColor),
      "",
    ],
    [
      `${green("◇", shouldColor)} ${green("Issues", shouldColor)}`,
      "",
      report.qualityFindingCount === 0
        ? strong("none", shouldColor)
        : danger(String(report.qualityFindingCount), shouldColor),
      report.qualityFindingCount === 0
        ? muted("detected", shouldColor)
        : muted(
            `${report.errorCount} error · ${report.warningCount} warning · ${report.adviceCount} tip`,
            shouldColor,
          ),
    ],
    [
      `${danger("⌬", shouldColor)} ${danger("Security findings", shouldColor)}`,
      "",
      report.securityFindingCount === 0
        ? strong("none", shouldColor)
        : danger(String(report.securityFindingCount), shouldColor),
      report.securityFindingCount === 0
        ? muted("detected", shouldColor)
        : muted(formatSecurityPriorities(report), shouldColor),
      "",
    ],
    [
      `${violet("◷", shouldColor)} ${violet("Usage analysis", shouldColor)}`,
      "",
      usage === undefined
        ? dim("not run", shouldColor)
        : `${success(String(usage.usedSkillCount), shouldColor)} ${dim("used", shouldColor)}`,
      usage === undefined
        ? ""
        : `${amber(String(usage.unusedSkillCount), shouldColor)} ${dim("unused", shouldColor)}`,
      usage === undefined
        ? ""
        : `${dim(String(usage.unknownSkillCount), shouldColor)} ${dim("unknown", shouldColor)}`,
    ],
    [
      `${orange("◌", shouldColor)} ${orange("Context budget", shouldColor)}`,
      "",
      strong(pressure, shouldColor),
      muted("pressure", shouldColor),
      renderPressureDots(pressure, shouldColor),
    ],
    [
      `${amber("✧", shouldColor)} ${amber("Cleanup candidates", shouldColor)}`,
      "",
      cleanupCandidateCount === 0
        ? strong("none", shouldColor)
        : strong(String(cleanupCandidateCount), shouldColor),
      muted("enabled unused skills", shouldColor),
    ],
  ];
};

const renderNextStepPanel = <Value extends string>(
  choices: readonly Choice<Value>[],
  selectedIndex: number,
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const title = `${blue("⚑", shouldColor)} ${blue("Next step", shouldColor)}`;
  const lines = choices.map((choice, index) =>
    renderChoiceRow(choice, index, selectedIndex === index, width - 6, shouldColor),
  );
  return framedPanel([title, ...lines], width, selectedBorder, shouldColor);
};

const renderChoiceRow = <Value extends string>(
  choice: Choice<Value>,
  index: number,
  selected: boolean,
  width: number,
  shouldColor: boolean,
): string => {
  const shortcut = choice.value === "exit" ? "0" : String(index + 1);
  const shortcutBadge = selected
    ? selectedBadge(` ${shortcut} `, shouldColor)
    : subtleBadge(` ${shortcut} `, shouldColor);
  const displayName = formatDashboardChoiceName(choice.name);
  const name = selected ? bright(displayName, shouldColor) : displayName;
  const description = choice.description === undefined ? "" : dim(choice.description, shouldColor);
  const arrow = dim("→", shouldColor);
  const left = `${shortcutBadge}  ${name}`;
  const descriptionColumn = Math.max(28, Math.floor(width * 0.28));
  const content = `${padRight(left, descriptionColumn)} ${description}`;
  const row = `${padRight(content, width - visibleLength(arrow) - 1)} ${arrow}`;
  return selected
    ? `${selectedBorder("╭", shouldColor)}${selectedRow(row, shouldColor)}${selectedBorder("╮", shouldColor)}`
    : ` ${row} `;
};

const formatDashboardChoiceName = (name: string): string => {
  if (name === "Choose unused skills to disable") return "Disable unused skills";
  if (name === "Fix selected security findings with Claude or Codex") {
    return "Fix selected security findings";
  }
  return name;
};

const renderControls = (shouldColor: boolean): string =>
  [
    subtleBadge("↑", shouldColor),
    subtleBadge("↓", shouldColor),
    dim(" navigate   ", shouldColor),
    subtleBadge("↵", shouldColor),
    dim(" select   ", shouldColor),
    subtleBadge("q", shouldColor),
    dim(" quit", shouldColor),
  ].join(" ");

const box = (
  title: string,
  bodyLines: readonly string[],
  width: number,
  shouldColor: boolean,
): readonly string[] => {
  const titleSegment = title.length === 0 ? "" : ` ${title} `;
  const topRuleWidth = Math.max(0, width - 2 - visibleLength(titleSegment));
  return [
    `${border("╭", shouldColor)}${titleSegment}${border("─".repeat(topRuleWidth), shouldColor)}${border("╮", shouldColor)}`,
    ...bodyLines.map((line) => {
      const content = padRight(line, width - 4);
      return `${border("│", shouldColor)} ${content} ${border("│", shouldColor)}`;
    }),
    `${border("╰", shouldColor)}${border("─".repeat(width - 2), shouldColor)}${border("╯", shouldColor)}`,
  ];
};

const framedPanel = (
  bodyLines: readonly string[],
  width: number,
  panelBorder: (text: string, shouldColor: boolean) => string,
  shouldColor: boolean,
): readonly string[] => [
  `${panelBorder("╭", shouldColor)}${panelBorder("─".repeat(width - 2), shouldColor)}${panelBorder("╮", shouldColor)}`,
  ...bodyLines.map((line) => {
    const content = padRight(line, width - 4);
    return `${panelBorder("│", shouldColor)} ${content} ${panelBorder("│", shouldColor)}`;
  }),
  `${panelBorder("╰", shouldColor)}${panelBorder("─".repeat(width - 2), shouldColor)}${panelBorder("╯", shouldColor)}`,
];

const getHeaderLeftWidth = (width: number): number =>
  Math.max(32, width - getBrandWidth(width) - (getBrandWidth(width) === 0 ? 0 : HEADER_GAP));

const normalizeColumns = (columns: number | undefined): number => {
  if (columns === undefined || !Number.isFinite(columns)) return DEFAULT_COLUMNS;
  return Math.max(MIN_COLUMNS, Math.floor(columns));
};

const getBrandWidth = (width: number): number => {
  if (width < BRAND_MIN_COLUMNS) return 0;
  if (width < BRAND_WIDE_COLUMNS) return BRAND_COMPACT_WIDTH;
  return BRAND_WIDE_WIDTH;
};

const getMetricColumnsPerRow = (width: number, metricCount: number): number => {
  if (width >= METRIC_WIDE_COLUMNS) return metricCount;
  if (width >= METRIC_MEDIUM_COLUMNS) return Math.min(3, metricCount);
  return Math.min(2, metricCount);
};

const chunk = <Value>(items: readonly Value[], size: number): readonly Value[][] => {
  const chunks: Value[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const formatSecurityPriorities = (report: ScanReport): string =>
  `Crit ${report.securityPriorityCounts.P0} · High ${report.securityPriorityCounts.P1} · Med ${report.securityPriorityCounts.P2}`;

const formatScanScope = (report: ScanReport): string => {
  const sources = new Set(report.scannedRoots.map((root) => root.source));
  if (sources.has("global") && sources.has("local")) {
    return "Global/root and local project skills";
  }
  if (sources.has("global")) return "Global/root skills (~/.claude/skills, ~/.agents/skills)";
  if (sources.has("local")) return "Local project skills (./.claude/skills, ./.agents/skills)";
  if (sources.has("custom")) return "Custom skills path";
  return "Selected skills";
};

const formatSkillSource = (report: ScanReport): string => {
  const ecosystems = new Set(report.scannedRoots.map((root) => root.ecosystem));
  if (ecosystems.has("claude") && ecosystems.has("codex")) {
    return "Claude and Codex/agents skills";
  }
  if (ecosystems.has("codex")) return "Codex/agents (.agents/skills)";
  if (ecosystems.has("claude")) return "Claude (.claude/skills)";
  return "Custom skills";
};

const renderPressureDots = (level: string, shouldColor: boolean): string => {
  if (level === "low") return `${success("●", shouldColor)} ${dim("● ●", shouldColor)}`;
  if (level === "medium") return `${amber("● ●", shouldColor)} ${dim("●", shouldColor)}`;
  if (level === "high") return danger("● ● ●", shouldColor);
  return dim("● ● ●", shouldColor);
};

const resolveShortcutIndex = <Value extends string>(
  character: string | undefined,
  choices: readonly Choice<Value>[],
): number | undefined => {
  if (character === undefined) return undefined;
  if (character === "0") {
    const exitIndex = choices.findIndex((choice) => choice.value === "exit");
    return exitIndex >= 0 ? exitIndex : undefined;
  }
  const numeric = Number(character);
  if (!Number.isInteger(numeric) || numeric < 1) return undefined;
  const index = numeric - 1;
  return index < choices.length ? index : undefined;
};

const padRight = (text: string, width: number): string =>
  `${text}${" ".repeat(Math.max(0, width - visibleLength(text)))}`;

const fitToWidth = (text: string, width: number): string =>
  padRight(truncateVisible(text, width), width);

const truncateVisible = (text: string, width: number): string => {
  if (width <= 0) return "";
  if (visibleLength(text) <= width) return text;

  let visible = 0;
  let index = 0;
  let result = "";
  while (index < text.length && visible < width) {
    ANSI_SEQUENCE_PATTERN.lastIndex = index;
    const ansiMatch = ANSI_SEQUENCE_PATTERN.exec(text);
    if (ansiMatch?.index === index) {
      result += ansiMatch[0];
      index += ansiMatch[0].length;
      continue;
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    result += character;
    visible += 1;
    index += character.length;
  }

  return result;
};

const visibleLength = (text: string): number => stripAnsi(text).length;

const stripAnsi = (text: string): string => text.replace(ANSI_PATTERN, "");

const selectedRow = (text: string, shouldColor: boolean): string =>
  shouldColor ? `\x1b[48;2;19;38;79m${text}\x1b[49m` : text;

const selectedBadge = (text: string, shouldColor: boolean): string =>
  shouldColor
    ? `\x1b[38;2;238;245;255m\x1b[48;2;57;105;215m${text}\x1b[49m\x1b[39m`
    : `[${text.trim()}]`;

const subtleBadge = (text: string, shouldColor: boolean): string =>
  shouldColor
    ? `\x1b[38;2;224;234;255m\x1b[48;2;38;49;65m${text}\x1b[49m\x1b[39m`
    : `[${text.trim()}]`;

const paintScreenLine = (line: string, width: number, shouldColor: boolean): string => {
  const padded = padRight(line, width);
  return shouldColor ? `\x1b[48;2;3;10;18m${padded}\x1b[49m` : padded;
};

const strong = (text: string, shouldColor: boolean): string =>
  shouldColor ? `\x1b[1m${fg(text, 238, 245, 255)}\x1b[22m` : text;
const bright = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 238, 245, 255) : text;
const muted = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 145, 154, 170) : text;
const dim = (text: string, shouldColor: boolean): string =>
  shouldColor && text.length > 0 ? `\x1b[2m${muted(text, shouldColor)}\x1b[22m` : text;
const success = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 88, 218, 112) : text;
const green = success;
const danger = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 255, 93, 102) : text;
const amber = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 244, 204, 89) : text;
const blue = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 83, 134, 255) : text;
const violet = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 182, 94, 255) : text;
const orange = amber;
const info = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 90, 230, 212) : text;
const border = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 48, 59, 76) : text;
const selectedBorder = (text: string, shouldColor: boolean): string =>
  shouldColor ? fg(text, 83, 134, 255) : text;

const fg = (text: string, red: number, greenValue: number, blueValue: number): string =>
  text.length > 0 ? `\x1b[38;2;${red};${greenValue};${blueValue}m${text}\x1b[39m` : text;
