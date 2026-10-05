import { i18n } from "@/i18n/runtime";
import { contrastRatio, formatOklch, mixOklab, parseCssColor, type Oklab } from "@/lib/themes/contrast";
import { AGENT_COLORS, type AgentColor, type AgentConfig } from "./schema";

/**
 * An agent's avatar identity, derived from its config. Pure so the disc's
 * colour and initials are decided and tested here, not in the component.
 *
 * The avatar is a rounded square with a soft tint of the hue and readable ink
 * (people and models stay round, so an agent reads as one at a glance).
 *
 * Colours are named hues (`AgentColor`); each maps to an existing
 * `--ads-chart-*` token in `AGENT_COLOR_CHART_INDEX`, so a theme moves avatar
 * hues with the rest of its palette and no new colour token is introduced.
 * An agent with no chosen colour gets a stable one derived from its id, so it
 * keeps the same hue on every load and two agents rarely share one.
 */

/** The chart token slot (`--ads-chart-N`) each named hue paints with. */
export const AGENT_COLOR_CHART_INDEX: Readonly<Record<AgentColor, number>> = {
  blue: 1,
  orange: 2,
  green: 3,
  violet: 4,
  amber: 5,
  red: 6,
  purple: 7,
  cyan: 8,
};

export const AGENT_COLOR_LABELS: Readonly<Record<AgentColor, string>> = {
  get blue() { return i18n.t("agents:agentAppearance.blue"); },
  get orange() { return i18n.t("agents:agentAppearance.orange"); },
  get green() { return i18n.t("agents:agentAppearance.green"); },
  get violet() { return i18n.t("agents:agentAppearance.violet"); },
  get amber() { return i18n.t("agents:agentAppearance.amber"); },
  get red() { return i18n.t("agents:agentAppearance.red"); },
  get purple() { return i18n.t("agents:agentAppearance.purple"); },
  get cyan() { return i18n.t("agents:agentAppearance.cyan"); },
};

/** A small, stable, order-independent hash of a string (FNV-1a, 32-bit). */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The colour an id falls back to when none is chosen. Stable per id. */
export function derivedAgentColor(id: string): AgentColor {
  return AGENT_COLORS[hashString(id) % AGENT_COLORS.length] ?? "blue";
}

/** The colour an agent shows: its chosen one, otherwise a stable derived one. */
export function agentColor(agent: Pick<AgentConfig, "id" | "appearance">): AgentColor {
  return agent.appearance?.color ?? derivedAgentColor(agent.id);
}

/**
 * How much of the hue goes into the avatar's soft fill (over the surface) and
 * into its ink (over the body text colour). Mixing in oklab keeps each hue's
 * lightness where the mix puts it, so the ink stays dark on a light surface and
 * light on a dark one.
 *
 * The shares alone do not hold contrast: a theme's own body ink can sit close
 * to its surface (Everforest Light measured 2.35-3.40:1 at these shares), so
 * `agentAvatarPalette` measures the ink against the actual fill and pushes it
 * towards the far pole until it clears `AGENT_AVATAR_INK_FLOOR`.
 */
export const AGENT_AVATAR_FILL_SHARE = 18;
export const AGENT_AVATAR_INK_SHARE = 55;
export const AGENT_AVATAR_INK_FLOOR = 4.5;
/** Aimed at above the floor so oklch rounding and gamut mapping cannot dip below it. */
const AGENT_AVATAR_INK_TARGET = AGENT_AVATAR_INK_FLOOR + 0.1;

export interface AgentAvatarTone {
  fill: string;
  ink: string;
}

/**
 * The soft fill and readable ink as CSS `color-mix` expressions. This is the
 * fallback used before the theme can be read (server render, tests, a theme
 * value in a notation `parseCssColor` cannot read); it carries the hue but no
 * contrast guarantee.
 */
export function agentAvatarTone(agent: Pick<AgentConfig, "id" | "appearance">): AgentAvatarTone {
  const hue = agentColorToken(agent);
  return {
    fill: `color-mix(in oklab, ${hue} ${AGENT_AVATAR_FILL_SHARE}%, var(--ads-color-surface))`,
    ink: `color-mix(in oklab, ${hue} ${AGENT_AVATAR_INK_SHARE}%, var(--ads-color-text))`,
  };
}

/**
 * The ink for a fill, at least `AGENT_AVATAR_INK_TARGET`:1 against it. Starts
 * from the hue-tinted body ink and, only when that falls short, mixes it
 * towards black (or white, when the body ink is the lighter of the two) by the
 * smallest step that clears the target. Mixing towards a neutral pole lowers
 * chroma with lightness, so the result stays in sRGB and keeps its hue.
 */
export function clampAvatarInk(ink: Oklab, fill: Oklab, text: Oklab): Oklab {
  if (contrastRatio(ink, fill) >= AGENT_AVATAR_INK_TARGET) return ink;
  const pole: Oklab = { l: text.l < fill.l ? 0 : 1, a: 0, b: 0, alpha: 1 };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixOklab(ink, pole, middle), fill) >= AGENT_AVATAR_INK_TARGET) high = middle;
    else low = middle;
  }
  return mixOklab(ink, pole, high);
}

/**
 * Every hue's fill and ink for one theme, as concrete oklch colours. `surface`
 * and `text` are the theme's resolved surface and body ink; `hues` maps each
 * chart slot to its colour. Returns null when any value cannot be parsed, so
 * the caller falls back to `agentAvatarTone`.
 */
export function agentAvatarPalette(args: {
  surface: string;
  text: string;
  hues: (index: number) => string;
}): Record<AgentColor, AgentAvatarTone> | null {
  const surface = parseCssColor(args.surface);
  const text = parseCssColor(args.text);
  if (!surface || !text) return null;
  const palette = {} as Record<AgentColor, AgentAvatarTone>;
  for (const color of AGENT_COLORS) {
    const hue = parseCssColor(args.hues(AGENT_COLOR_CHART_INDEX[color]));
    if (!hue) return null;
    const fill = mixOklab(surface, hue, AGENT_AVATAR_FILL_SHARE / 100);
    const ink = clampAvatarInk(mixOklab(text, hue, AGENT_AVATAR_INK_SHARE / 100), fill, text);
    palette[color] = { fill: formatOklch(fill), ink: formatOklch(ink) };
  }
  return palette;
}

/** The chart token that paints an agent's avatar. */
export function agentColorToken(agent: Pick<AgentConfig, "id" | "appearance">): string {
  return `var(--ads-chart-${AGENT_COLOR_CHART_INDEX[agentColor(agent)]})`;
}

/**
 * Up to two initials for the disc: the first letter of the first two words, or
 * the first two letters of a single word. Falls back to "?" for an empty name.
 */
export function agentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0] ?? "";
  if (words.length === 1) return first.slice(0, 2).toUpperCase() || "?";
  const second = words[1] ?? "";
  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase() || "?";
}
