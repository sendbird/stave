// ---------------------------------------------------------------------------
// Agent state colors
// ---------------------------------------------------------------------------

import {
  MUTED_TEXT_FLOOR,
  contrastRatio,
  deriveAdsSemanticRamp,
  parseCssColor,
  type Oklab,
} from "./contrast";

/**
 * The colors of agent work states, one per agent run badge. Failed keeps the
 * destructive role, so it has no token of its own. A theme may set any of
 * them; `deriveStateColors` fills in the rest from the theme's own colors.
 */
export const STATE_COLOR_TOKEN_NAMES = [
  "state-running",
  "state-needs-answer",
  "state-paused",
  "state-halted",
  "state-completed",
  "state-stopped",
] as const;

export type StateColorTokenName = (typeof STATE_COLOR_TOKEN_NAMES)[number];

/**
 * The OKLab distance (ΔEOK) under which two state colors read as the same
 * color at glyph size. Hue alone is not enough: several ported themes paint
 * their primary, warning and success colors within this distance.
 */
export const STATE_COLOR_MIN_DISTANCE = 0.1;

/** A state glyph is a graphic: 3:1 against the card it sits on (WCAG 1.4.11). */
export const STATE_GLYPH_CONTRAST_FLOOR = 3;

/** OKLCH chroma under which a color reads as grey, the paused and stopped look. */
const RUNNING_MIN_CHROMA = 0.04;

/**
 * States that mean different things and so must not share a color: running
 * against the states a reader acts on or reads as an outcome, and needing an
 * answer against completed. `destructive` stands for failed.
 */
export const DISTINCT_STATE_COLOR_PAIRS = [
  ["state-running", "state-needs-answer"],
  ["state-running", "state-completed"],
  ["state-running", "destructive"],
  ["state-needs-answer", "state-completed"],
] as const satisfies readonly (readonly [StateColorTokenName, StateColorTokenName | "destructive"])[];

/** Where running looks first: the theme's action color, then its other hues. */
const RUNNING_SOURCES = ["primary", "info", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

type TokenMap = Readonly<Record<string, string | undefined>>;

function colorDistance(a: Oklab, b: Oklab) {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function readsDistinct(candidate: Oklab, others: readonly (Oklab | null)[]) {
  return others.every((other) => !other || colorDistance(candidate, other) >= STATE_COLOR_MIN_DISTANCE);
}

/**
 * The six state colors for a theme. A value the theme sets is kept. Otherwise
 * needs-answer and halted take the warning color, completed the success
 * color, paused and stopped the muted text color, and running the first of
 * primary, info and the chart colors that is not grey, stays apart from those
 * states and from failed, and has glyph contrast on the card. When nothing
 * qualifies, running keeps primary and `checkStateColors` reports the theme.
 *
 * Colors Stave cannot parse (anything but hex and `oklch()`) are passed
 * through unchecked.
 */
export function deriveStateColors(tokens: TokenMap): Record<StateColorTokenName, string> {
  const needsAnswer = tokens["state-needs-answer"] ?? tokens.warning ?? "";
  const completed = tokens["state-completed"] ?? tokens.success ?? "";
  const paused = tokens["state-paused"] ?? tokens["muted-foreground"] ?? "";
  return {
    "state-running": tokens["state-running"] ?? deriveRunning({ tokens, needsAnswer, completed }),
    "state-needs-answer": needsAnswer,
    "state-paused": paused,
    "state-halted": tokens["state-halted"] ?? needsAnswer,
    "state-completed": completed,
    "state-stopped": tokens["state-stopped"] ?? paused,
  };
}

function deriveRunning(args: { tokens: TokenMap; needsAnswer: string; completed: string }) {
  const card = parseCssColor(args.tokens.card ?? "");
  const others = [
    parseCssColor(args.needsAnswer),
    parseCssColor(args.completed),
    parseCssColor(args.tokens.destructive ?? ""),
  ];
  for (const source of RUNNING_SOURCES) {
    const value = args.tokens[source];
    const color = value ? parseCssColor(value) : null;
    if (!value || !color) continue;
    const visible = !card || contrastRatio(color, card) >= STATE_GLYPH_CONTRAST_FLOOR;
    const hued = Math.hypot(color.a, color.b) >= RUNNING_MIN_CHROMA;
    if (visible && hued && readsDistinct(color, others)) return value;
  }
  return args.tokens.primary ?? "";
}

export interface StateColorProblem {
  kind: "too-close" | "glyph-contrast" | "label-contrast";
  tokens: readonly string[];
  /** The measured distance (ΔEOK) or contrast ratio. */
  value: number;
}

/**
 * What keeps a theme's state colors from reading apart: pairs from
 * `DISTINCT_STATE_COLOR_PAIRS` closer than `STATE_COLOR_MIN_DISTANCE`, glyphs
 * under 3:1 on the card, and state text (the same foreground mix ADS uses for
 * semantic text) under 4.5:1. Values that do not parse are skipped.
 */
export function checkStateColors(tokens: TokenMap): StateColorProblem[] {
  const colors: TokenMap = { ...tokens, ...deriveStateColors(tokens) };
  const parse = (name: string) => parseCssColor(colors[name] ?? "");
  const problems: StateColorProblem[] = [];
  for (const [first, second] of DISTINCT_STATE_COLOR_PAIRS) {
    const a = parse(first);
    const b = parse(second);
    if (!a || !b) continue;
    const distance = colorDistance(a, b);
    if (distance < STATE_COLOR_MIN_DISTANCE) problems.push({ kind: "too-close", tokens: [first, second], value: distance });
  }
  const card = parse("card");
  const foreground = parse("foreground");
  if (!card) return problems;
  for (const name of STATE_COLOR_TOKEN_NAMES) {
    const fill = parse(name);
    if (!fill) continue;
    const glyph = contrastRatio(fill, card);
    if (glyph < STATE_GLYPH_CONTRAST_FLOOR) problems.push({ kind: "glyph-contrast", tokens: [name, "card"], value: glyph });
    if (!foreground) continue;
    const text = contrastRatio(deriveAdsSemanticRamp({ fill, foreground, card }).text, card);
    if (text < MUTED_TEXT_FLOOR) problems.push({ kind: "label-contrast", tokens: [name, "card"], value: text });
  }
  return problems;
}
