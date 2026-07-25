import type { ChatMessage, ToolUsePart } from "@/types/chat";

export interface TodoFloaterProgressSnapshot {
  totalCount: number;
  hasPendingTodos: boolean;
  hasInProgressTodos: boolean;
}

/**
 * Scan messages in reverse to find the latest TodoWrite tool_use part from the
 * current turn only. A normal user message ends the scan so TodoWrite output
 * from a previous turn does not leak into a new turn. A user message steered
 * into the active turn is not a boundary because it continues the same turn.
 * Omitting activeTurnId preserves the original conservative behavior.
 */
export function findLatestTodoPart(
  messages: ChatMessage[],
  activeTurnId?: string | null,
): ToolUsePart | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      if (activeTurnId && message.steeredIntoTurnId === activeTurnId) {
        continue;
      }
      return null;
    }
    if (message.role !== "assistant") {
      continue;
    }
    for (let j = (message.parts?.length ?? 0) - 1; j >= 0; j -= 1) {
      const part = message.parts![j];
      if (
        part?.type === "tool_use" &&
        part.toolName.trim().toLowerCase() === "todowrite"
      ) {
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
    args.todoState === "input-streaming" ||
    args.todoState === "input-available";
  const hasActiveTodos =
    args.progress.totalCount > 0 &&
    (args.progress.hasPendingTodos || args.progress.hasInProgressTodos);
  const wantVisible =
    args.isTurnActive &&
    args.progress.totalCount > 0 &&
    (hasActiveTodos || isPartStillLive);

  return wantVisible || args.lingering;
}
