import type { ChatMessage } from "@/types/chat";

interface ActivityMessageState {
  activeWorkspaceId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceRuntimeCacheById: Record<
    string,
    { messagesByTask: Record<string, ChatMessage[]> } | undefined
  >;
}

/**
 * Shared empty result. This selector runs inside a Zustand v5 store hook
 * (`useSyncExternalStore`), so every fallback must return the same reference;
 * a fresh `[]` per read looks like a changed snapshot and loops the render
 * until React aborts with error #185.
 */
const NO_MESSAGES: ChatMessage[] = [];

export function selectActivityMessages(args: {
  state: ActivityMessageState;
  parentTaskId: string;
  delegatedTaskId?: string;
  delegatedWorkspaceId?: string;
}): ChatMessage[] {
  if (!args.delegatedTaskId) {
    return args.state.messagesByTask[args.parentTaskId] ?? NO_MESSAGES;
  }
  const workspaceId = args.delegatedWorkspaceId ??
    args.state.taskWorkspaceIdById[args.delegatedTaskId];
  if (!workspaceId) return NO_MESSAGES;
  if (workspaceId === args.state.activeWorkspaceId) {
    return args.state.messagesByTask[args.delegatedTaskId] ?? NO_MESSAGES;
  }
  return args.state.workspaceRuntimeCacheById[workspaceId]
    ?.messagesByTask[args.delegatedTaskId] ?? NO_MESSAGES;
}
