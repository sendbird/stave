import type { ChatMessage, ToolUsePart } from "@/types/chat";

export interface TodoFloaterProgressSnapshot {
  totalCount: number;
  hasPendingTodos: boolean;
  hasInProgressTodos: boolean;
}

/**
 * Scan messages in reverse to find the latest TodoWrite tool_use part from the
 * current turn only. The scan stops at the most recent user message so that
 * TodoWrite output from a previous turn does not leak into a new turn — once
 * the user sends a new prompt, only todos emitted after that prompt should
 * surface in the floater.
 */
export function findLatestTodoPart(messages: ChatMessage[]): ToolUsePart | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      return null;
    }
    if (message.role !== "assistant") {
      continue;
    }
    for (let j = (message.parts?.length ?? 0) - 1; j >= 0; j -= 1) {
      const part = message.parts![j];
      if (part?.type === "tool_use" && part.toolName.trim().toLowerCase() === "todowrite") {
        return part;
      }
    }
  }
  return null;
}

export function resolveTodoFloaterVisibility(args: {
  progress: TodoFloaterProgressSnapshot | null;
  todoState?: ToolUsePart["state"];
  isTurnActive: boolean;
  lingering: boolean;
  planViewerVisible: boolean;
}) {
  if (args.planViewerVisible || !args.progress) {
    return false;
  }

  const isPartStillLive =
    args.todoState === "input-streaming" || args.todoState === "input-available";
  const hasActiveTodos =
    args.progress.totalCount > 0
    && (args.progress.hasPendingTodos || args.progress.hasInProgressTodos);
  const wantVisible =
    args.isTurnActive
    && args.progress.totalCount > 0
    && (hasActiveTodos || isPartStillLive);

  return wantVisible || args.lingering;
}
