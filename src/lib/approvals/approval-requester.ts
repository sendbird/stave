import {
  isSubagentToolName,
  resolveSubagentBadge,
  resolveToolTitle,
} from "@/lib/providers/subagent-identity";
import type { MessagePart, ToolUsePart } from "@/types/chat";

/**
 * The name of the subagent that asked, read from the call that started it in
 * the same message: its flavor (`Explore`) when the provider reported one,
 * otherwise the task it was given. `null` when the request came from the main
 * loop or the starting call is not in these parts; a caller that still knows
 * a subagent asked says so without a name, never with an invented one.
 */
export function resolveApprovalRequesterName(args: {
  parts: readonly MessagePart[] | undefined;
  ownerAgentId?: string;
}): string | null {
  const { ownerAgentId } = args;
  if (!ownerAgentId || !args.parts) {
    return null;
  }
  const spawn = args.parts.find(
    (part): part is ToolUsePart =>
      part.type === "tool_use" &&
      part.agentId === ownerAgentId &&
      isSubagentToolName(part.toolName),
  );
  if (!spawn) {
    return null;
  }
  return (
    resolveSubagentBadge(spawn.input) ??
    resolveToolTitle(spawn.toolName, spawn.input, undefined, { isSubagent: true })
  );
}
