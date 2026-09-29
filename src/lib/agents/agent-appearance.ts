import { AGENT_COLORS, type AgentColor, type AgentConfig } from "./schema";

/**
 * An agent's avatar identity, derived from its config. Pure so the disc's
 * colour and initials are decided and tested here, not in the component.
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
