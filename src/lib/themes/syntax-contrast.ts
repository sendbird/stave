import {
  contrastRatio,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  parseCssColor,
  type Oklab,
} from "./contrast";
import { syntaxColorVariable } from "../syntax-highlight-shared";
import type { ThemeModeName } from "./types";

/*
 * Syntax colors on a theme's code surface.
 *
 * Code blocks and diffs are highlighted with one light and one dark palette
 * (`src/lib/syntax-themes.ts`), but they are painted on the active theme's
 * `--editor`. Every color the highlighter emits is written as
 * `var(--stave-syntax-<mode>-<hex>, <hex>)`, so a theme whose code surface
 * would leave a token under 4.5:1 publishes a replacement for just that token:
 * the same hue at the nearest lightness that reaches the floor.
 */

export const SYNTAX_TEXT_FLOOR = 4.5;

/*
 * Fitted colors aim slightly above the floor: the browser paints the surface
 * as an 8-bit sRGB color, which can move a ratio computed from an oklch value
 * by a few hundredths.
 */
const FIT_TARGET = SYNTAX_TEXT_FLOOR + 0.05;

/** Every foreground the light and dark palettes can emit (lowercase hex). Kept in sync with `syntax-themes.ts` by a test. */
export const CODE_SYNTAX_COLORS: Record<ThemeModeName, readonly string[]> = {
  light: [
    "#005cc5",
    "#032f62",
    "#22863a",
    "#24292e",
    "#586069",
    "#6a737d",
    "#6f42c1",
    "#747576",
    "#747577",
    "#b31d28",
    "#bd5208",
    "#d13847",
  ],
  dark: [
    "#727b83",
    "#747a80",
    "#79b8ff",
    "#85e89d",
    "#8b949e",
    "#9ecbff",
    "#b392f0",
    "#d1d5da",
    "#dbedff",
    "#e1e4e8",
    "#f97583",
    "#fdaeb7",
    "#ffab70",
  ],
};

export { syntaxColorVariable };

function toHex(color: Oklab): string {
  const { r, g, b } = oklabToSrgb(color);
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * The color to paint `color` with on `surface`: unchanged when it already
 * reaches the floor, otherwise the same hue and chroma moved in lightness (away
 * from the surface) just far enough. The result is measured as the hex that is
 * actually painted.
 */
export function fitSyntaxColor(color: string, surface: Oklab, floor = FIT_TARGET): string {
  const parsed = parseCssColor(color);
  if (!parsed) return color;
  const passes = (candidate: string) => contrastRatio(parseCssColor(candidate)!, surface) >= floor;
  const original = toHex(parsed);
  if (passes(original)) return color.toLowerCase();

  const { l, c, h } = oklabToOklch(parsed);
  const black = contrastRatio(parseCssColor("#000000")!, surface);
  const white = contrastRatio(parseCssColor("#ffffff")!, surface);
  const darken = black >= white;
  const at = (lightness: number) => toHex(oklchToOklab(lightness, c, h));
  // Binary search for the lightness nearest the original that passes.
  let near = l;
  let far = darken ? 0 : 1;
  if (!passes(at(far))) return darken ? "#000000" : "#ffffff";
  for (let step = 0; step < 24; step += 1) {
    const mid = (near + far) / 2;
    if (passes(at(mid))) far = mid;
    else near = mid;
  }
  return at(far);
}

/**
 * Replacement declarations for a theme whose code surface is `editor`: one
 * `--stave-syntax-*` property per palette color that would fall under the
 * floor. Empty when the surface cannot be parsed or nothing needs to change.
 * User token overrides cannot change `--editor`, so a custom theme is the only
 * layer that moves the code surface.
 */
export function deriveSyntaxColorTokens(args: {
  mode: ThemeModeName;
  editor: string | undefined;
}): Record<string, string> {
  const surface = args.editor ? parseCssColor(args.editor) : null;
  if (!surface || surface.alpha < 1) return {};
  const tokens: Record<string, string> = {};
  for (const color of CODE_SYNTAX_COLORS[args.mode]) {
    const fitted = fitSyntaxColor(color, surface);
    if (fitted !== color) tokens[syntaxColorVariable(args.mode, color)] = fitted;
  }
  return tokens;
}
