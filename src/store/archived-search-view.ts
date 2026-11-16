import { create } from "zustand";
import type { StoreApi } from "zustand";
import type { AppState } from "./app-store.types";
import { loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { buildWorkspaceSessionStateFromShell } from "./workspace-session-state";
import { saveActiveWorkspaceRuntimeCacheWithLensCleanup } from "./workspace-runtime-state";
import { WORKSPACE_APP_SURFACE } from "./app-surface";

interface ArchivedSearchView { workspaceId: string; repositoryPath: string }
export const useArchivedSearchView = create<{ view: ArchivedSearchView | null; busy: boolean; failed: boolean }>(() => ({view:null,busy:false,failed:false}));

/** Mount retained history without adding the archived identity to the registry. */
export async function openArchivedSearchView(args: ArchivedSearchView & {taskId:string}, set:StoreApi<AppState>["setState"], get:StoreApi<AppState>["getState"]) {
  const origin=get();
  const shell = await loadWorkspaceShell({workspaceId:args.workspaceId});
  if (!shell?.tasks.some(task=>task.id===args.taskId)) return false;
  await get().flushActiveWorkspaceSnapshot();
  const state=get();
  if (state.activeWorkspaceId !== origin.activeWorkspaceId || state.repositoryPath !== origin.repositoryPath) return false;
  const session=buildWorkspaceSessionStateFromShell({shell});
  // The archive is immutable. This read-only projection prevents every task's
  // composer and send action while preserving the original persisted flags.
  session.tasks=session.tasks.map(task=>({...task,archivedAt:task.archivedAt ?? "1970-01-01T00:00:00.000Z"}));
  session.activeTaskId=args.taskId;
  session.activeSurface={kind:"task",taskId:args.taskId};
  session.openTaskTabIds=[args.taskId];
  session.dockLayout=null;
  useArchivedSearchView.setState({view:{workspaceId:args.workspaceId,repositoryPath:args.repositoryPath},busy:false,failed:false});
  set({
    ...session, activeWorkspaceId:args.workspaceId, activeAppSurface:WORKSPACE_APP_SURFACE,
    workspaceSnapshotVersion:0, promptDraftPersistenceVersion:0,
    workspaceRuntimeCacheById:saveActiveWorkspaceRuntimeCacheWithLensCleanup({state}),
    taskWorkspaceIdById:{...state.taskWorkspaceIdById,...Object.fromEntries(session.tasks.map(task=>[task.id,args.workspaceId]))},
    layout:{...state.layout,terminalDocked:false},repositoryFiles:[],
  });
  return true;
}

export async function restoreArchivedSearchView(taskId:string, set:StoreApi<AppState>["setState"], get:StoreApi<AppState>["getState"]) {
  const view=useArchivedSearchView.getState().view;
  if (!view || useArchivedSearchView.getState().busy) return;
  useArchivedSearchView.setState({busy:true,failed:false});
  try {
  const api=window.api?.workspaceCleanup;
  if (!api) throw new Error();
  const result=await api.act({action:"restore",workspaceId:view.workspaceId,repositoryPath:view.repositoryPath});
  if (!result.ok || result.readOnly) throw new Error();
  const {refreshWorkspaceCleanupRegistry}=await import("./workspace-cleanup-sync");
  const {notifyWorkspaceCleanupChanged}=await import("@/components/layout/workspace-cleanup-events");
  await refreshWorkspaceCleanupRegistry({getState:get,setState:set});
  if (useArchivedSearchView.getState().view !== view) return;
  useArchivedSearchView.setState({view:null});
  const state=get();
  if (state.activeWorkspaceId !== view.workspaceId) { notifyWorkspaceCleanupChanged(); return; }
  // Discard the synthetic read-only session before normal hydration/root setup.
  const cache={...state.workspaceRuntimeCacheById};delete cache[view.workspaceId];
  set({activeWorkspaceId:"",workspaceRuntimeCacheById:cache});
  await get().switchWorkspace({workspaceId:view.workspaceId});
  get().restoreTask({taskId});
  get().selectTask({taskId});
  notifyWorkspaceCleanupChanged();
  } catch {
    if (useArchivedSearchView.getState().view === view) useArchivedSearchView.setState({failed:true});
  } finally {
    if (!useArchivedSearchView.getState().view || useArchivedSearchView.getState().view === view) useArchivedSearchView.setState({busy:false});
  }
}
