import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildFleetAttentionProjection,
  getFleetAttentionTaskKey,
  type FleetLiveWorkspaceInput,
  type FleetAgentRunInput,
  type FleetPrWorkspaceInput,
} from "@/lib/fleet/attention-projection";
import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import type { Task } from "@/types/chat";
import { hasDurableResultReviewStore } from "@/lib/reviews/result-review-client";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { useFleetAttentionSnoozes } from "@/lib/fleet/useFleetAttentionSnoozes";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";

interface FleetWorkspaceIdentity {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
}

const EMPTY_CLOSED_TASK_KEYS: ReadonlySet<string> = new Set();
const shellTaskLoadByWorkspaceId = new Map<
  string,
  Promise<readonly Task[] | null>
>();

function loadColdWorkspaceTasks(workspaceId: string) {
  const existing = shellTaskLoadByWorkspaceId.get(workspaceId);
  if (existing) {
    return existing;
  }
  const pending = loadWorkspaceShellSummary({ workspaceId })
    .then((summary) => summary?.tasks ?? null)
    .finally(() => {
      if (shellTaskLoadByWorkspaceId.get(workspaceId) === pending) {
        shellTaskLoadByWorkspaceId.delete(workspaceId);
      }
    });
  shellTaskLoadByWorkspaceId.set(workspaceId, pending);
  return pending;
}

export function useFleetAttentionProjection() {
  const [
    currentRepositoryPath,
    currentRepositoryName,
    workspaces,
    recentRepositories,
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
          state.repositoryPath,
          state.repositoryName,
          state.workspaces,
          state.recentRepositories,
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

  const agentRunDetails = useFleetAgentRunsStore((state) => state.details);
  const reviewWorkspaceIds = useMemo(() => Array.from(new Set([
    ...workspaces.map((workspace) => workspace.id),
    ...recentRepositories.flatMap((repository) => repository.workspaces.map((workspace) => workspace.id)),
  ])).sort(), [workspaces, recentRepositories]);
  const reviews = useResultReviews({ pendingOnly: true, limit: 200, workspaceIds: reviewWorkspaceIds, includeEvidence: false });
  /**
   * Handing `resultReviews` to the projection makes durable results own
   * `result-ready` / `run-failed` attention outright, so a reviewed result stays
   * cleared even while its notification is unread. That trade only holds where a
   * durable store actually keeps those rows: in a browser session the reads fall
   * back to a best-effort localStorage mirror, and suppressing the notification
   * tier against it would drop every finished turn that was never mirrored.
   * Notifications stay the record there, exactly as before durable results.
   */
  const durableResultStore = hasDurableResultReviewStore();
  const snoozes = useFleetAttentionSnoozes();

  const coldNotificationWorkspaceIds = useMemo(() => {
    const knownWorkspaceIds = new Set(
      recentRepositories.flatMap((repository) =>
        repository.workspaces.map((workspace) => workspace.id),
      ),
    );
    for (const workspace of workspaces) {
      knownWorkspaceIds.add(workspace.id);
    }

    return Array.from(
      new Set(
        [...notifications, ...reviews.page.results]
          .map((notification) => notification.workspaceId?.trim())
          .filter((workspaceId): workspaceId is string => Boolean(workspaceId)),
      ),
    ).filter(
      (workspaceId) =>
        knownWorkspaceIds.has(workspaceId) &&
        !(currentRepositoryPath && workspaceId === activeWorkspaceId) &&
        !workspaceRuntimeCacheById[workspaceId],
    );
  }, [
    activeWorkspaceId,
    currentRepositoryPath,
    notifications,
    reviews.page.results,
    recentRepositories,
    workspaceRuntimeCacheById,
    workspaces,
  ]);
  const [closedTaskKeysFromShell, setClosedTaskKeysFromShell] = useState<
    ReadonlySet<string>
  >(EMPTY_CLOSED_TASK_KEYS);

  useEffect(() => {
    if (coldNotificationWorkspaceIds.length === 0) {
      setClosedTaskKeysFromShell(EMPTY_CLOSED_TASK_KEYS);
      return;
    }
    let cancelled = false;
    void Promise.all(
      coldNotificationWorkspaceIds.map(async (workspaceId) => ({
        workspaceId,
        tasks: await loadColdWorkspaceTasks(workspaceId),
      })),
    ).then((workspacesWithTasks) => {
      if (cancelled) {
        return;
      }
      const closedTaskKeys = new Set<string>();
      for (const { workspaceId, tasks } of workspacesWithTasks) {
        for (const task of tasks ?? []) {
          if (isTaskArchived(task)) {
            closedTaskKeys.add(getFleetAttentionTaskKey(workspaceId, task.id));
          }
        }
      }
      setClosedTaskKeysFromShell(
        closedTaskKeys.size > 0 ? closedTaskKeys : EMPTY_CLOSED_TASK_KEYS,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [coldNotificationWorkspaceIds]);

  return useMemo(() => {
    const identityByWorkspaceId = new Map<string, FleetWorkspaceIdentity>();

    for (const repository of recentRepositories) {
      for (const workspace of repository.workspaces) {
        identityByWorkspaceId.set(workspace.id, {
          repositoryPath: repository.repositoryPath,
          repositoryName: repository.repositoryName,
          workspaceId: workspace.id,
          workspaceName: workspace.name,
        });
      }
    }

    if (currentRepositoryPath) {
      for (const workspace of workspaces) {
        identityByWorkspaceId.set(workspace.id, {
          repositoryPath: currentRepositoryPath,
          repositoryName: currentRepositoryName ?? "project",
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
        identity.repositoryPath === currentRepositoryPath &&
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

    const agentRuns: FleetAgentRunInput[] = [];
    for (const detail of Object.values(agentRunDetails)) {
      const identity = identityByWorkspaceId.get(detail.agentRun.workspaceId);
      if (!identity) continue;
      const tasks =
        identity.workspaceId === activeWorkspaceId
          ? activeTasks
          : workspaceRuntimeCacheById[identity.workspaceId]?.tasks;
      agentRuns.push({
        ...identity,
        detail,
        taskTitle: tasks?.find((task) => task.id === detail.agentRun.leadTaskId)?.title,
      });
    }

    const projection = buildFleetAttentionProjection({
      agentRuns,
      notifications,
      resultReviews: durableResultStore ? reviews.page.results : undefined,
      liveWorkspaces,
      prWorkspaces,
      knownWorkspaceIds: new Set(identityByWorkspaceId.keys()),
      closedTaskKeys: closedTaskKeysFromShell,
      snoozedAttentionIds: snoozes.activeIds,
    });

    for (const item of projection.items) {
      coveredWorkspaceIds.add(item.workspaceId);
    }

    return {
      ...projection,
      coveredWorkspaceIds,
      workspaceCount: identityByWorkspaceId.size,
      resultReviewError: reviews.error,
      resultReviewTotal: reviews.page.total,
      resultReviewHasMore: reviews.page.hasMore,
      refreshResultReviews: reviews.refresh,
      snoozeError: snoozes.error,
      refreshSnoozes: snoozes.refresh,
    };
  }, [
    activeMessagesByTask,
    activeTasks,
    activeTurnIdsByTask,
    activeWorkspaceId,
    closedTaskKeysFromShell,
    currentRepositoryName,
    currentRepositoryPath,
    durableResultStore,
    notifications,
    providerTurnActivityByTask,
    recentRepositories,
    workspacePrInfoById,
    workspaceRuntimeCacheById,
    workspaces,
    reviews.page,
    reviews.error,
    reviews.refresh,
    snoozes.activeIds,
    snoozes.error,
    snoozes.refresh,
    agentRunDetails,
  ]);
}
