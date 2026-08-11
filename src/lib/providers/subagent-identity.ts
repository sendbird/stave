import { isStaveToolName, toStaveToolDisplayName } from "@/lib/tool-display-name";

/**
 * How a tool call reads as a unit of work: is it a subagent, what is it called,
 * and what flavor of agent is it.
 *
 * This lives on its own because two surfaces answer those questions about the
 * same event stream — the flat turn activity shelf
 * (`src/lib/providers/turn-status.ts`) and the work graph
 * (`src/lib/work-graph/`). If each kept its own copy of "is this a subagent",
 * the shelf and the tree would eventually disagree about what the turn is
 * doing, and the disagreement would look like a graph bug rather than a
 * drifted predicate.
 *
 * Everything here is pure and string-in/string-out: no provider imports, no
 * clock, no state.
 */

/** Longest text any work row shows before it is elided. */
export const PROVIDER_TURN_WORK_TEXT_LIMIT = 240;

export function truncateWorkText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= PROVIDER_TURN_WORK_TEXT_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, PROVIDER_TURN_WORK_TEXT_LIMIT - 1).trimEnd()}…`;
}

export function parseToolInput(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether a tool call spawns a subagent. Name-based on purpose: it is the one
 * classification that must give the same answer for a provider that reports a
 * real agent identity and one that reports nothing but a tool name.
 */
export function isSubagentToolName(toolName: string) {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized === "agent" ||
    normalized === "task" ||
    normalized.endsWith("spawnagent")
  );
}

/** `mcp__server__do_thing` / `collaboration.spawn_agent` → action-oriented copy. */
export function formatToolDisplayName(toolName: string) {
  if (!toolName.trim()) {
    return undefined;
  }
  if (isStaveToolName(toolName)) {
    return truncateWorkText(toStaveToolDisplayName(toolName));
  }
  const segments = toolName.trim().split(/__|\./).filter(Boolean);
  const lastSegment = segments.at(-1) ?? toolName;
  return truncateWorkText(lastSegment.replace(/_/g, " "));
}

export function resolveToolTitle(
  toolName: string,
  input: string,
  currentTitle?: string,
) {
  const parsed = parseToolInput(input);
  const title =
    truncateWorkText(parsed?.description) ??
    truncateWorkText(parsed?.task_name) ??
    truncateWorkText(parsed?.name);
  return (
    title ??
    currentTitle ??
    formatToolDisplayName(toolName) ??
    "Background work"
  );
}

/** Subagent flavor (`Explore`, `Plan`, …) surfaced as a row badge. */
export function resolveSubagentBadge(input: string) {
  const parsed = parseToolInput(input);
  return (
    truncateWorkText(parsed?.subagent_type) ??
    truncateWorkText(parsed?.subagentType) ??
    truncateWorkText(parsed?.agentType) ??
    truncateWorkText(parsed?.agent_type)
  );
}
