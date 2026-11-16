import { findUnreadTurnNotificationIdsForTask } from "@/lib/notifications/attention-reconcile";
import { buildPanePanelId } from "@/lib/panes/types";
import { useAppStore } from "@/store/app.store";
import { useFleetWorkspaceShellsStore } from "@/store/fleet-workspace-shells-store";
import { loadWorkspaceSessionFromPersistence } from "@/store/app-store-workspace-hydration-actions";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import { flushPendingSnapshotPersists } from "@/store/workspace-session-state";
export interface FleetTaskTarget { repositoryPath: string; workspaceId: string; taskId: string }
const archiveVersions = new Map<string, string>();
export function fleetArchiveVersion(target: FleetTaskTarget) { return archiveVersions.get(JSON.stringify(target)); }
const loading = new Map<string, Promise<void>>();
/** Load live task state without changing the visible repository or workspace. */
export async function ensureFleetWorkspace(target: FleetTaskTarget): Promise<void> {
  const state = useAppStore.getState();
  if (state.activeWorkspaceId === target.workspaceId || state.workspaceRuntimeCacheById[target.workspaceId]) return;
  const pending = loading.get(target.workspaceId);
  if (pending) return pending;
  const request = (async () => {
    const loaded = await loadWorkspaceSessionFromPersistence({workspaceId:target.workspaceId});
    if (!loaded.shell) throw new Error("workspace-unavailable");
    useAppStore.setState(current => current.activeWorkspaceId === target.workspaceId || current.workspaceRuntimeCacheById[target.workspaceId] ? {} : {
      workspaceRuntimeCacheById: {...current.workspaceRuntimeCacheById,[target.workspaceId]:loaded.workspaceState},
      taskWorkspaceIdById: {...current.taskWorkspaceIdById,...Object.fromEntries(loaded.workspaceState.tasks.map(task=>[task.id,target.workspaceId]))},
    });
  })().finally(()=>loading.delete(target.workspaceId));
  loading.set(target.workspaceId,request);
  return request;
}
export async function archiveFleetTask(target: FleetTaskTarget, restore = false, expectedArchivedAt?: string): Promise<string | null> {
  await flushPendingSnapshotPersists(target.workspaceId);
  const archive = window.api?.taskControl?.archive;
  if (!archive) return "unavailable";
  const result = await archive({workspaceId:target.workspaceId,taskId:target.taskId,restore,expectedArchivedAt});
  if (!result.ok) return result.reason ?? "changed";
  const archivedAt = result.archivedAt ?? null;
  if (archivedAt) archiveVersions.set(JSON.stringify(target),archivedAt);
  const reconcile = <T extends Pick<WorkspaceSessionState, "tasks" | "activeTaskId"> & Partial<Pick<WorkspaceSessionState, "openTaskTabIds" | "activeSurface" | "terminalTabs" | "cliSessionTabs" | "paneTabMeta">>>(session: T): T => {
    const tasks = session.tasks.map(task => task.id === target.taskId ? {...task,archivedAt,updatedAt:archivedAt ?? new Date().toISOString(),...(!restore ? {unread:false} : {})} : task);
    if (restore) return {...session,tasks};
    let openTaskTabIds = session.openTaskTabIds?.filter(id => id !== target.taskId);
    const activeTaskId = session.activeTaskId === target.taskId ? tasks.find(task => !task.archivedAt)?.id ?? "" : session.activeTaskId;
    if (openTaskTabIds && activeTaskId && !openTaskTabIds.includes(activeTaskId)) openTaskTabIds = [...openTaskTabIds,activeTaskId];
    return {...session,tasks,activeTaskId,openTaskTabIds,
      ...(session.paneTabMeta ? {paneTabMeta:Object.fromEntries(Object.entries(session.paneTabMeta).filter(([id])=>id !== buildPanePanelId({kind:"task",taskId:target.taskId})))} : {}),
      ...(session.activeSurface?.kind === "task" && session.activeSurface.taskId === target.taskId ? {activeSurface:{kind:"task" as const,taskId:activeTaskId}} : {}),
      ...(session.terminalTabs ? {terminalTabs:session.terminalTabs.map(tab=>tab.linkedTaskId === target.taskId ? {...tab,linkedTaskId:null} : tab)} : {}),
      ...(session.cliSessionTabs ? {cliSessionTabs:session.cliSessionTabs.map(tab=>tab.linkedTaskId === target.taskId ? {...tab,linkedTaskId:null} : tab)} : {}),
    };
  };
  useAppStore.setState(state => {
    const current = state.activeWorkspaceId === target.workspaceId;
    const cached = state.workspaceRuntimeCacheById[target.workspaceId];
    return {
      ...(current ? {...reconcile(state),workspaceSnapshotVersion:state.workspaceSnapshotVersion+1} : {}),
      ...(cached ? {workspaceRuntimeCacheById:{...state.workspaceRuntimeCacheById,[target.workspaceId]:reconcile(cached)}} : {}),
    };
  });
  useFleetWorkspaceShellsStore.setState(state=>{
    const entry = state.byWorkspaceId[target.workspaceId];
    return entry?.status === "loaded" && entry.shell ? {byWorkspaceId:{...state.byWorkspaceId,[target.workspaceId]:{...entry,shell:reconcile(entry.shell)}}} : {};
  });
  if (!restore) {
    void window.api?.provider?.cleanupTask?.({taskId:target.taskId}).catch(() => {});
    const state = useAppStore.getState();
    for (const id of findUnreadTurnNotificationIdsForTask({notifications:state.notifications,taskId:target.taskId})) void state.markNotificationRead({id});
    const repository = state.repositoryPath === target.repositoryPath ? state : state.recentRepositories.find(item => item.repositoryPath === target.repositoryPath);
    const workspacePath = repository?.workspacePathById[target.workspaceId];
    const branch = repository?.workspaceBranchById[target.workspaceId];
    if (workspacePath && branch) {
      const task = (state.activeWorkspaceId === target.workspaceId ? state.tasks : state.workspaceRuntimeCacheById[target.workspaceId]?.tasks)?.find(item=>item.id === target.taskId);
      void window.api?.scripts?.runHook?.({workspaceId:target.workspaceId,repositoryPath:target.repositoryPath,workspacePath,branch,workspaceName:repository?.workspaces.find(item=>item.id === target.workspaceId)?.name ?? branch,trigger:"task.archiving",taskId:target.taskId,taskTitle:task?.title}).catch(()=>{});
    }
  }
  return null;
}
