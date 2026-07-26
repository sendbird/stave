import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildFleetAttentionProjection,
  type FleetLiveWorkspaceInput,
  type FleetPrWorkspaceInput,
} from "@/lib/fleet/attention-projection";
import { useAppStore } from "@/store/app.store";

interface FleetWorkspaceIdentity {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
}

export function useFleetAttentionProjection() {
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    recentProjects,
    activeWorkspaceId,
    activeTasks,
    activeMessagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    workspaceRuntimeCacheById,
    workspacePrInfoById,
    notifications,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.recentProjects,
          state.activeWorkspaceId,
          state.tasks,
          state.messagesByTask,
          state.activeTurnIdsByTask,
          state.providerTurnActivityByTask,
          state.workspaceRuntimeCacheById,
          state.workspacePrInfoById,
          state.notifications,
        ] as const,
    ),
  );

  return useMemo(() => {
    const identityByWorkspaceId = new Map<string, FleetWorkspaceIdentity>();

    for (const project of recentProjects) {
      for (const workspace of project.workspaces) {
        identityByWorkspaceId.set(workspace.id, {
          projectPath: project.projectPath,
          projectName: project.projectName,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        });
      }
    }

    if (currentProjectPath) {
      for (const workspace of workspaces) {
        identityByWorkspaceId.set(workspace.id, {
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        });
      }
    }

    const liveWorkspaces: FleetLiveWorkspaceInput[] = [];
    const prWorkspaces: FleetPrWorkspaceInput[] = [];
    const coveredWorkspaceIds = new Set<string>();

    for (const identity of identityByWorkspaceId.values()) {
      const isActive =
        identity.projectPath === currentProjectPath &&
        identity.workspaceId === activeWorkspaceId;
      const runtimeState = isActive
        ? {
            tasks: activeTasks,
            messagesByTask: activeMessagesByTask,
            activeTurnIdsByTask,
          }
        : workspaceRuntimeCacheById[identity.workspaceId];

      if (runtimeState) {
        coveredWorkspaceIds.add(identity.workspaceId);
        liveWorkspaces.push({
          ...identity,
          tasks: runtimeState.tasks,
          messagesByTask: runtimeState.messagesByTask,
          activeTurnIdsByTask: runtimeState.activeTurnIdsByTask,
          providerTurnActivityByTask,
        });
      }

      const prInfo = workspacePrInfoById[identity.workspaceId];
      if (prInfo) {
        coveredWorkspaceIds.add(identity.workspaceId);
        prWorkspaces.push({
          ...identity,
          status: prInfo.derived,
          url: prInfo.pr?.url,
          updatedAt: Number.isFinite(prInfo.lastFetched)
            ? new Date(prInfo.lastFetched).toISOString()
            : new Date(0).toISOString(),
        });
      }
    }

    const projection = buildFleetAttentionProjection({
      notifications,
      liveWorkspaces,
      prWorkspaces,
    });

    for (const item of projection.items) {
      coveredWorkspaceIds.add(item.workspaceId);
    }

    return {
      ...projection,
      coveredWorkspaceIds,
      workspaceCount: identityByWorkspaceId.size,
    };
  }, [
    activeMessagesByTask,
    activeTasks,
    activeTurnIdsByTask,
    activeWorkspaceId,
    currentProjectName,
    currentProjectPath,
    notifications,
    providerTurnActivityByTask,
    recentProjects,
    workspacePrInfoById,
    workspaceRuntimeCacheById,
    workspaces,
  ]);
}
