import { useCallback, useEffect, useMemo, useState } from "react";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: ChatMessage[] = [];
const PAGE_SIZE = 100;

interface TaskMessagesState {
  activeWorkspaceId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  taskWorkspaceIdById: Record<string, string>;
  workspaceRuntimeCacheById: Record<string, { messagesByTask: Record<string, ChatMessage[]> } | undefined>;
}

/**
 * A task's messages as the store holds them: the open workspace's, else the
 * cached runtime of the task's workspace. Returns the store's own array (or
 * one shared empty array), never a fresh one, so it is safe as a Zustand
 * selector.
 */
export function selectTaskMessages(
  state: TaskMessagesState,
  taskId: string,
  workspaceId?: string,
): ChatMessage[] {
  const owner = workspaceId ?? state.taskWorkspaceIdById[taskId];
  if (!owner || owner === state.activeWorkspaceId) {
    return state.messagesByTask[taskId] ?? NO_MESSAGES;
  }
  return state.workspaceRuntimeCacheById[owner]?.messagesByTask[taskId] ?? state.messagesByTask[taskId] ?? NO_MESSAGES;
}

/**
 * The saved pages around the store's live copy: saved messages older than
 * the first one the store holds go before it, saved ones newer than its last
 * go after it, and the store's copy wins wherever both hold a message. Both
 * lists are oldest first, so nothing changes place when a page arrives.
 */
export function mergeTaskMessages(saved: readonly ChatMessage[], live: readonly ChatMessage[]): ChatMessage[] {
  if (saved.length === 0) return [...live];
  if (live.length === 0) return [...saved];
  const liveIds = new Set(live.map((message) => message.id));
  const first = saved.findIndex((message) => liveIds.has(message.id));
  if (first === -1) return [...saved, ...live];
  const last = saved.findLastIndex((message) => liveIds.has(message.id));
  return [
    ...saved.slice(0, first),
    ...live,
    ...saved.slice(last + 1).filter((message) => !liveIds.has(message.id)),
  ];
}

/**
 * A task's messages for its progress view: the store's live copy merged over
 * the newest saved page, with older pages on request. `refreshKey` reloads
 * the saved pages, for example when the agent settles.
 */
export function useTaskMessages(args: {
  taskId: string | undefined;
  workspaceId: string | undefined;
  enabled?: boolean;
  refreshKey?: string;
}) {
  const enabled = (args.enabled ?? true) && Boolean(args.taskId);
  const live = useAppStore((state) =>
    enabled && args.taskId ? selectTaskMessages(state, args.taskId, args.workspaceId) : NO_MESSAGES,
  );
  const ownerWorkspaceId = useAppStore((state) =>
    args.taskId ? args.workspaceId ?? state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId : undefined,
  );
  const [saved, setSaved] = useState<ChatMessage[]>(NO_MESSAGES);
  const [pages, setPages] = useState(1);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${ownerWorkspaceId ?? ""}:${args.taskId ?? ""}`;

  useEffect(() => {
    setSaved(NO_MESSAGES);
    setPages(1);
    setHasOlder(false);
    setError(null);
  }, [key]);

  useEffect(() => {
    if (!enabled || !args.taskId || !ownerWorkspaceId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const pagesRead: ChatMessage[][] = [];
      let more = false;
      for (let page = 0; page < pages; page += 1) {
        const read = await loadTaskMessagesPage({
          workspaceId: ownerWorkspaceId,
          taskId: args.taskId!,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          preserveStreaming: true,
        });
        if (cancelled) return;
        pagesRead.unshift(read.messages);
        more = read.hasMoreOlder;
        if (!read.hasMoreOlder) break;
      }
      setSaved(pagesRead.flat());
      setHasOlder(more);
      setError(null);
    })()
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, args.taskId, ownerWorkspaceId, pages, args.refreshKey]);

  const messages = useMemo(() => mergeTaskMessages(saved, live), [saved, live]);
  const loadOlder = useCallback(() => setPages((count) => count + 1), []);
  return { messages, loading, error, hasOlder, loadOlder, workspaceId: ownerWorkspaceId };
}
