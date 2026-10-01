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
  blue: "Blue",
  orange: "Orange",
  green: "Green",
  violet: "Violet",
  amber: "Amber",
  red: "Red",
  purple: "Purple",
  cyan: "Cyan",
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
 * light on a dark one. At these shares every named hue holds at least 4.5:1 in
 * the light, dark and high-contrast themes (`tests/agent-appearance.test.tsx`).
 */
export const AGENT_AVATAR_FILL_SHARE = 18;
export const AGENT_AVATAR_INK_SHARE = 55;

/** The soft fill and readable ink an agent's avatar paints, as CSS colours. */
export function agentAvatarTone(agent: Pick<AgentConfig, "id" | "appearance">): { fill: string; ink: string } {
  const hue = agentColorToken(agent);
  return {
    fill: `color-mix(in oklab, ${hue} ${AGENT_AVATAR_FILL_SHARE}%, var(--ads-color-surface))`,
    ink: `color-mix(in oklab, ${hue} ${AGENT_AVATAR_INK_SHARE}%, var(--ads-color-text))`,
  };
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
