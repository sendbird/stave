import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/app.store";
import { selectNewTarsOpenRequests, type TarsOpenAction } from "@/lib/tars/open";
import type { TarsActionReceipt } from "@/lib/tars/conversation";
import type { TarsResponsibility } from "@/lib/tars/types";

/** Resolve UI destinations again against the current mirror; no caller-supplied paths. */
export async function navigateTarsOpen(action: TarsOpenAction, rows: readonly TarsResponsibility[], openActivity: () => void) {
  const store = useAppStore.getState();
  if (action.target === "activity") { openActivity(); return; }
  if (action.target === "fleet") { store.openFleetView(); return; }
  if (action.target === "task") {
    const matches = rows.filter(row => row.taskId === action.id);
    if (matches.length !== 1) throw new Error("Navigation target unavailable");
    const row = matches[0]!;
    await store.focusTaskAttention({ taskId: action.id!, workspaceId: row.executionWorkspaceId ?? row.workspaceId,
      repositoryPath: row.repositoryPath, refreshFromPersistence: true });
    if (!useAppStore.getState().tasks.some(task => task.id === action.id)) throw new Error("Navigation target unavailable");
    store.exitToWorkspace("tars");
    return;
  }
  const matches = store.recentRepositories.filter(repository => repository.workspaces.some(workspace => workspace.id === action.id));
  if (matches.length !== 1) throw new Error("Navigation target unavailable");
  if (store.repositoryPath !== matches[0]!.repositoryPath) await store.openRepository({ repositoryPath: matches[0]!.repositoryPath });
  await useAppStore.getState().refreshWorkspaces();
  if (!useAppStore.getState().workspaces.some(workspace => workspace.id === action.id)) throw new Error("Navigation target unavailable");
  await useAppStore.getState().switchWorkspace({ workspaceId: action.id! });
  if (useAppStore.getState().activeWorkspaceId !== action.id) throw new Error("Navigation target unavailable");
  store.exitToWorkspace("tars");
}

export function useTarsOpenRequests(receipts: readonly TarsActionReceipt[] | undefined, rows: readonly TarsResponsibility[], ready: boolean,
  openActivity: () => void, onError: () => void) {
  const seen = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!receipts || seen.current && !ready) return;
    const next = selectNewTarsOpenRequests(receipts, seen.current);
    seen.current = next.seen;
    const action = next.requests.at(-1);
    if (action) void navigateTarsOpen(action, rows, openActivity).catch(onError);
  }, [receipts, rows, ready, openActivity, onError]);
}
