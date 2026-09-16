/**
 * Contrast helpers for theme tokens.
 *
 * Built-in themes are editor palettes reused as product UI. After ADS mapping,
 * `--muted-foreground` is secondary copy and must clear a WCAG AA floor on
 * every surface it actually sits on. These helpers stay notation-agnostic:
 * they parse the hex / oklch / color-mix values the theme files already use.
 */

export interface Oklab {
  l: number;
  a: number;
  b: number;
  alpha: number;
}

export interface Srgb {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const OKLAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
] as const;

const LMS_TO_LINEAR = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

const LINEAR_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;

const LMS_TO_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;

function multiply3(matrix: readonly (readonly number[])[], x: number, y: number, z: number) {
  return [
    matrix[0]![0]! * x + matrix[0]![1]! * y + matrix[0]![2]! * z,
    matrix[1]![0]! * x + matrix[1]![1]! * y + matrix[1]![2]! * z,
    matrix[2]![0]! * x + matrix[2]![1]! * y + matrix[2]![2]! * z,
  ] as const;
}

function srgbChannelToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

export function oklabToSrgb(color: Oklab): Srgb {
  const lms = multiply3(OKLAB_TO_LMS, color.l, color.a, color.b).map((value) => value ** 3);
  const linear = multiply3(LMS_TO_LINEAR, lms[0]!, lms[1]!, lms[2]!);
  return {
    r: linearToSrgbChannel(linear[0]!),
    g: linearToSrgbChannel(linear[1]!),
    b: linearToSrgbChannel(linear[2]!),
    alpha: color.alpha,
  };
}

export function srgbToOklab(color: Srgb): Oklab {
  const linear = [
    srgbChannelToLinear(color.r),
    srgbChannelToLinear(color.g),
    srgbChannelToLinear(color.b),
  ] as const;
  const lms = multiply3(LINEAR_TO_LMS, linear[0], linear[1], linear[2]).map((value) =>
    Math.cbrt(value),
  );
  const [l, a, b] = multiply3(LMS_TO_OKLAB, lms[0]!, lms[1]!, lms[2]!);
  return { l: l!, a: a!, b: b!, alpha: color.alpha };
}

export function oklchToOklab(l: number, c: number, h: number, alpha = 1): Oklab {
  const hue = (h * Math.PI) / 180;
  return {
    l,
    a: c * Math.cos(hue),
    b: c * Math.sin(hue),
    alpha,
  };
}

export function oklabToOklch(color: Oklab) {
  const c = Math.hypot(color.a, color.b);
  const h = c < 1e-8 ? 0 : ((Math.atan2(color.b, color.a) * 180) / Math.PI + 360) % 360;
  return { l: color.l, c, h, alpha: color.alpha };
}

function parseHex(value: string): Srgb | null {
  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) {
    return null;
  }
  const expand = hex.length <= 4;
  const channel = (index: number) => {
    if (expand) {
      const digit = hex[index] ?? "f";
      return Number.parseInt(digit + digit, 16) / 255;
    }
    return Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255;
  };
  const hasAlpha = hex.length === 4 || hex.length === 8;
  return {
    r: channel(0),
    g: channel(1),
    b: channel(2),
    alpha: hasAlpha ? channel(expand ? 3 : 3) : 1,
  };
}

function parseNumber(value: string) {
  return Number.parseFloat(value.trim());
}

export function parseCssColor(value: string): Oklab | null {
  const raw = value.trim();
  if (raw.startsWith("#")) {
    const srgb = parseHex(raw);
    return srgb ? srgbToOklab(srgb) : null;
  }

  const oklch = raw.match(
    /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s)]+))?\s*\)$/i,
  );
  if (oklch) {
    return oklchToOklab(
      parseNumber(oklch[1]!),
      parseNumber(oklch[2]!),
      parseNumber(oklch[3]!),
      oklch[4] ? parseNumber(oklch[4]) : 1,
    );
  }

  return null;
}

export function mixOklab(from: Oklab, to: Oklab, amount: number): Oklab {
  const t = Math.min(1, Math.max(0, amount));
  return {
    l: from.l + (to.l - from.l) * t,
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
    alpha: from.alpha + (to.alpha - from.alpha) * t,
  };
}

export function compositeOver(foreground: Oklab, background: Oklab): Oklab {
  if (foreground.alpha >= 1) {
    return { ...foreground, alpha: 1 };
  }
  const fg = oklabToSrgb(foreground);
  const bg = oklabToSrgb({ ...background, alpha: 1 });
  const alpha = fg.alpha + bg.alpha * (1 - fg.alpha);
  if (alpha <= 0) {
    return { ...background, alpha: 0 };
  }
  return srgbToOklab({
    r: (fg.r * fg.alpha + bg.r * bg.alpha * (1 - fg.alpha)) / alpha,
    g: (fg.g * fg.alpha + bg.g * bg.alpha * (1 - fg.alpha)) / alpha,
    b: (fg.b * fg.alpha + bg.b * bg.alpha * (1 - fg.alpha)) / alpha,
    alpha,
  });
}

function relativeLuminance(color: Srgb) {
  const r = srgbChannelToLinear(color.r);
  const g = srgbChannelToLinear(color.g);
  const b = srgbChannelToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: Oklab, background: Oklab) {
  const painted = compositeOver(foreground, background);
  const fg = relativeLuminance(oklabToSrgb({ ...painted, alpha: 1 }));
  const bg = relativeLuminance(oklabToSrgb({ ...background, alpha: 1 }));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function formatOklch(color: Oklab) {
  const { l, c, h, alpha } = oklabToOklch(color);
  const body = `oklch(${round(l)} ${round(c)} ${round(h, 3)})`;
  return alpha < 1 ? body.replace(/\)$/, ` / ${round(alpha)})`) : body;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** ADS maps muted copy onto these surfaces. */
export const MUTED_SURFACES = [
  "background",
  "card",
  "muted",
  "sidebar",
] as const;

export const BODY_SURFACES = ["background", "card", "popover"] as const;

export const MUTED_TEXT_FLOOR = 4.5;
export const SUBTLE_TEXT_FLOOR = 3;
export const PLACEHOLDER_TEXT_FLOOR = 4.5;

export function deriveAdsTextRamp(tokens: Record<string, string>) {
  const background = parseCssColor(tokens.background ?? "");
  const muted = parseCssColor(tokens["muted-foreground"] ?? "");
  if (!background || !muted) {
    return null;
  }
  return {
    muted,
    placeholder: mixOklab(muted, background, 0.05),
    subtle: mixOklab(muted, background, 0.23),
  };
}

/** Mirrors the 45% / 12% mixes in `ads-theme.ts`. */
export function deriveAdsSemanticRamp(args: {
  fill: Oklab;
  foreground: Oklab;
  card: Oklab;
}) {
  return {
    text: mixOklab(args.fill, args.foreground, 0.45),
    soft: mixOklab(args.card, args.fill, 0.12),
  };
}

export const CONTROL_LABEL_FLOOR = 3;
export const SEMANTIC_FILL_FLOOR = 3;
export const SELECTION_DISTINGUISH_FLOOR = 1.2;
