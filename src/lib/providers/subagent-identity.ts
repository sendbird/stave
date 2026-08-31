import {
  describeToolOperationLabel,
  isPlaceholderToolName,
} from "@/lib/providers/tool-activity";
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
    // ACP agents (Cursor, Kiro) name the delegation tool `Worker`. Without this
    // the row kept the plain-tool icon and the work graph never grew a node for
    // a delegation it was told about.
    normalized === "worker" ||
    normalized.endsWith("spawnagent")
  );
}

/** `mcp__server__do_thing` / `collaboration.spawn_agent` → action-oriented copy. */
export function formatToolDisplayName(toolName: string) {
  // A placeholder is what a runtime sends when the provider named no tool. It
  // is not a name, so it must not become a row reading "tool".
  if (!toolName.trim() || isPlaceholderToolName(toolName)) {
    return undefined;
  }
  if (isStaveToolName(toolName)) {
    return truncateWorkText(toStaveToolDisplayName(toolName));
  }
  // `:` splits alongside `__` and `.` because Codex namespaces MCP tools as
  // `server:tool` where Claude uses `mcp__server__tool`. Without it a Codex MCP
  // row read `ibis:ibis create page` against Claude's `ibis create page`.
  const segments = toolName.trim().split(/__|:|\./).filter(Boolean);
  const lastSegment = segments.at(-1) ?? toolName;
  return truncateWorkText(lastSegment.replace(/_/g, " "));
}

export function resolveToolTitle(
  toolName: string,
  input: string,
  currentTitle?: string,
  options?: {
    /**
     * Delegation rows may take their name from the delegated task. Plain tool
     * rows may not: `task_name` and `name` are ordinary argument keys for
     * third-party MCP tools, so honoring them there turned an argument value
     * into the row title with nothing marking it as such.
     */
    isSubagent?: boolean;
  },
) {
  const parsed = parseToolInput(input);
  const authored =
    truncateWorkText(parsed?.description) ??
    (options?.isSubagent
      ? (truncateWorkText(parsed?.task_name) ?? truncateWorkText(parsed?.name))
      : undefined);
  return (
    authored ??
    currentTitle ??
    // The normalized operation comes before the provider's own token, so one
    // shell call reads `Run command` whether the provider called it `Bash` or
    // `bash`. The token itself still reaches the row's provider-specific slot.
    describeToolOperationLabel(toolName) ??
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
