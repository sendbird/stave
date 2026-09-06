import { useCallback, useEffect, useRef, useState } from "react";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import {
  COLLABORATION_HISTORY_PAGE_SIZE,
  projectCollaborationHistoryPage,
  resolveNewerCollaborationHistoryOffset,
  resolveOlderCollaborationHistoryOffset,
  type CollaborationHistoryPage,
} from "@/lib/collaboration/history";

export interface CollaborationHistoryState {
  page: CollaborationHistoryPage | null;
  loading: boolean;
  error: string | null;
  loadOlder: () => void;
  loadNewer: () => void;
  retry: () => void;
}

interface StoredHistoryState {
  scopeKey: string;
  page: CollaborationHistoryPage | null;
  loading: boolean;
  error: string | null;
}

function historyScopeKey(args: {
  workspaceId: string;
  taskId: string;
}): string {
  return `${args.workspaceId}\u0000${args.taskId}`;
}

/** Reads one persisted page at a time and retains only collaboration projections. */
export function useCollaborationHistory(args: {
  workspaceId: string;
  taskId: string;
}): CollaborationHistoryState {
  const scopeKey = historyScopeKey(args);
  const [state, setState] = useState<StoredHistoryState>(() => ({
    scopeKey,
    page: null,
    loading: true,
    error: null,
  }));
  const requestIdRef = useRef(0);
  const currentOffsetRef = useRef({ scopeKey, offset: 0 });

  const load = useCallback(
    async (offset: number) => {
      const requestId = ++requestIdRef.current;
      currentOffsetRef.current = { scopeKey, offset };
      setState((current) =>
        current.scopeKey === scopeKey
          ? { ...current, loading: true, error: null }
          : { scopeKey, page: null, loading: true, error: null },
      );
      try {
        const loaded = await loadTaskMessagesPage({
          workspaceId: args.workspaceId,
          taskId: args.taskId,
          limit: COLLABORATION_HISTORY_PAGE_SIZE,
          offset,
        });
        if (requestId !== requestIdRef.current) return;
        setState({
          scopeKey,
          page: projectCollaborationHistoryPage(loaded),
          loading: false,
          error: null,
        });
      } catch {
        if (requestId !== requestIdRef.current) return;
        setState((current) => ({
          scopeKey,
          // Keep a successfully loaded page visible if a later page request
          // fails, but never carry a page into a different task/workspace.
          page: current.scopeKey === scopeKey ? current.page : null,
          loading: false,
          error: "Saved collaboration history could not be loaded.",
        }));
      }
    },
    [args.taskId, args.workspaceId, scopeKey],
  );

  useEffect(() => {
    void load(0);
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  // Effects run after paint. Do not show a completed page from the old task in
  // that gap when a caller reuses this component for a different workspace.
  const isCurrentScope = state.scopeKey === scopeKey;
  const page = isCurrentScope ? state.page : null;
  const loading = isCurrentScope ? state.loading : true;
  const error = isCurrentScope ? state.error : null;

  return {
    page,
    loading,
    error,
    loadOlder: () => {
      if (!page || loading) return;
      const offset = resolveOlderCollaborationHistoryOffset(page);
      if (offset !== null) void load(offset);
    },
    loadNewer: () => {
      if (!page || loading) return;
      const offset = resolveNewerCollaborationHistoryOffset(page);
      if (offset !== null) void load(offset);
    },
    retry: () =>
      void load(
        currentOffsetRef.current.scopeKey === scopeKey
          ? currentOffsetRef.current.offset
          : 0,
      ),
  };
}
