import type { BridgeEvent } from "./types";

/**
 * Codex's `turn/plan/updated` notification (sent after its `update_plan`
 * tool) as the to-do list every surface reads: a `TodoWrite` tool event, the
 * shape Claude's own to-do tool has. One id per turn, so each update replaces
 * the turn's list instead of adding another.
 *
 * Schema (codex app-server v2): `{ threadId, turnId, explanation?, plan:
 * [{ step, status: "pending" | "inProgress" | "completed" }] }`.
 */
export function mapCodexTurnPlanToTodoEvent(params: Record<string, unknown>): BridgeEvent | null {
  if (!Array.isArray(params.plan)) return null;
  const todos: Array<{ content: string; status: "pending" | "in_progress" | "completed" }> = [];
  for (const raw of params.plan) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { step?: unknown; status?: unknown };
    const content = typeof entry.step === "string" ? entry.step.trim() : "";
    if (!content) continue;
    const status = entry.status === "completed" ? "completed" : entry.status === "inProgress" ? "in_progress" : "pending";
    todos.push({ content, status });
  }
  if (todos.length === 0) return null;
  const turnId = typeof params.turnId === "string" && params.turnId.trim() ? params.turnId.trim() : null;
  return {
    type: "tool",
    ...(turnId ? { toolUseId: `plan:${turnId}` } : {}),
    toolName: "TodoWrite",
    input: JSON.stringify({ todos }),
    state: "output-available",
  };
}
