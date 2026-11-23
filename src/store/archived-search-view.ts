import { runWorkspaceCleanupAction } from "@/lib/workspace-cleanup-activity";
import { create } from "zustand";
import type { StoreApi } from "zustand";
import type { AppState } from "./app-store.types";
import { loadWorkspaceShell } from "@/lib/db/workspaces.db";
import { buildWorkspaceSessionStateFromShell } from "./workspace-session-state";
import { saveActiveWorkspaceRuntimeCacheWithLensCleanup } from "./workspace-runtime-state";
import { WORKSPACE_APP_SURFACE } from "./app-surface";

interface ArchivedSearchView { workspaceId: string; repositoryPath: string }
/** `archivedAt` is the workspace archive record's time, when the host has one. */
export const useArchivedSearchView = create<{ view: ArchivedSearchView | null; busy: boolean; failed: boolean; archivedAt: string | null }>(() => ({view:null,busy:false,failed:false,archivedAt:null}));
/** Marks tasks read-only in the projection; it is not a real archive time. */
export const ARCHIVED_SEARCH_VIEW_MARKER = "1970-01-01T00:00:00.000Z";

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
  session.tasks=session.tasks.map(task=>({...task,archivedAt:task.archivedAt ?? ARCHIVED_SEARCH_VIEW_MARKER}));
  session.activeTaskId=args.taskId;
  session.activeSurface={kind:"task",taskId:args.taskId};
  session.openTaskTabIds=[args.taskId];
  session.dockLayout=null;
  const view={workspaceId:args.workspaceId,repositoryPath:args.repositoryPath};
  useArchivedSearchView.setState({view,busy:false,failed:false,archivedAt:null});
  // The archive time only completes the banner copy; the view opens without it.
  void window.api?.workspaceCleanup?.listArchived?.().then(rows=>{
    const archivedAt=rows.find(row=>row.id===args.workspaceId && row.repositoryPath===args.repositoryPath)?.archivedAt ?? null;
    if (archivedAt && useArchivedSearchView.getState().view===view) useArchivedSearchView.setState({archivedAt});
  }).catch(()=>{});
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
  const result=await runWorkspaceCleanupAction(api, {action:"restore",workspaceId:view.workspaceId,repositoryPath:view.repositoryPath});
  if (!result.ok || result.readOnly) throw new Error();
  const {refreshWorkspaceCleanupRegistry}=await import("./workspace-cleanup-sync");
  const {notifyWorkspaceCleanupChanged}=await import("@/components/layout/workspace-cleanup-events");
  await refreshWorkspaceCleanupRegistry({getState:get,setState:set},{preserveActiveWorkspace:true});
  // Navigation can cache the read-only projection while restore is in flight.
  // Evict it even when the user has since selected another workspace or view.
  set(state=>{
    const cache={...state.workspaceRuntimeCacheById};delete cache[view.workspaceId];
    return {workspaceRuntimeCacheById:cache};
  });
  if (useArchivedSearchView.getState().view !== view) return;
  useArchivedSearchView.setState({view:null,archivedAt:null});
  const state=get();
  if (state.activeWorkspaceId !== view.workspaceId) { notifyWorkspaceCleanupChanged(); return; }
  // Discard the synthetic read-only session before normal hydration/root setup.
  const cache={...state.workspaceRuntimeCacheById};delete cache[view.workspaceId];
  set({activeWorkspaceId:"",workspaceRuntimeCacheById:cache});
  await get().switchWorkspace({workspaceId:view.workspaceId});
  get().selectTask({taskId,allowArchived:true});
  notifyWorkspaceCleanupChanged();
  } catch {
    if (useArchivedSearchView.getState().view === view) useArchivedSearchView.setState({failed:true});
  } finally {
    if (!useArchivedSearchView.getState().view || useArchivedSearchView.getState().view === view) useArchivedSearchView.setState({busy:false});
  }
}
