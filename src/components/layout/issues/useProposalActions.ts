import { useCallback } from "react";

import { toast } from "@/components/ui";
import { playbookChoiceForId } from "@/lib/missions/start-sheet";
import type { ProposedMission } from "@/lib/missions/proposed";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import type { TrackerIssueListItem } from "@/lib/tracker-issues/types";
import { useAppStore } from "@/store/app.store";
import { usePlaybooksUiStore, type StartMissionRequest } from "@/store/playbooks-ui-store";
import { useProposalsStore } from "@/store/proposals-store";
import type { ProposalStartTarget } from "./ProposedMissionsPanel";

type AppState = ReturnType<typeof useAppStore.getState>;

/** Why Start could not open a proposal's workspace, naming where it looked. */
export function describeMissingWorkspace(proposal: ProposedMission): { title: string; description: string } {
  const name = proposal.workspaceName || "the workspace for this mission";
  const repository = proposal.repositoryPath?.split(/[\\/]/).filter(Boolean).pop();
  return repository
    ? {
        title: `Could not find ${name} in ${repository}.`,
        description: "It may have been removed. Dismiss the proposal, or start the mission from another workspace.",
      }
    : {
        title: `Could not find ${name} in the open repository.`,
        description: "Open the repository it belongs to and try again, or dismiss the proposal.",
      };
}

/** A task with nothing in it yet: no messages and no draft. */
function isEmptyTask(state: AppState, taskId: string): boolean {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.archivedAt) return false;
  const messages = Math.max(state.messageCountByTask[taskId] ?? 0, state.messagesByTask[taskId]?.length ?? 0);
  return messages === 0 && !state.promptDraftByTask[taskId]?.text?.trim();
}

/** The empty task auto-start left behind when it failed, or a new one; null when neither could be had. */
function takeTaskFor(proposal: ProposedMission): string | null {
  const state = useAppStore.getState();
  if (proposal.taskId && isEmptyTask(state, proposal.taskId)) {
    state.selectTask({ taskId: proposal.taskId });
    if (useAppStore.getState().activeTaskId === proposal.taskId) return proposal.taskId;
  }
  const previous = useAppStore.getState().activeTaskId;
  useAppStore.getState().createTask({ title: proposal.title.slice(0, 80) });
  const taskId = useAppStore.getState().activeTaskId;
  return taskId && taskId !== previous ? taskId : null;
}

/** Archives the task once the Start sheet closes without a mission, if it is still empty. */
function discardIfCancelled(request: StartMissionRequest, wasStarted: () => boolean) {
  const unsubscribe = usePlaybooksUiStore.subscribe((state) => {
    if (state.startSheet === request) return;
    unsubscribe();
    const app = useAppStore.getState();
    if (!wasStarted() && isEmptyTask(app, request.taskId)) app.archiveTask({ taskId: request.taskId });
  });
}

/** The loaded ticket a proposal came from, when Issues still lists it. */
export function findProposalIssueKey(proposal: ProposedMission, items: readonly TrackerIssueListItem[]): string | null {
  const issue = proposal.issue;
  if (!issue) return null;
  const item = items.find((candidate) => candidate.task.source === issue.source && candidate.task.key === issue.key);
  return item ? trackerIssueKey(item.task.source, item.task.ref) : null;
}

/**
 * Where Start takes a proposal: an issue's kickoff (a workspace for the
 * ticket), the workspace its trigger named, or the one open now.
 */
export function describeProposalStart(
  proposal: ProposedMission,
  context: { issueListed: boolean; activeWorkspaceName: string | null },
): ProposalStartTarget {
  if (context.issueListed) return { label: "Kick off", where: null, disabledReason: null };
  if (proposal.workspaceId) return { label: "Start", where: `in ${proposal.workspaceName || "its workspace"}`, disabledReason: null };
  if (context.activeWorkspaceName) return { label: "Start", where: `in ${context.activeWorkspaceName}`, disabledReason: null };
  return { label: "Start", where: null, disabledReason: "Open a workspace to start this mission in." };
}

export function useProposalActions(args: {
  items: readonly TrackerIssueListItem[];
  closeSurface: () => void;
  /** Opens the kickoff sheet for the proposal's ticket, with its playbook chosen. */
  openKickoff: (itemKey: string, proposal: ProposedMission) => void;
  openStaveTask: (target: { workspaceId: string; taskId: string | null }) => void;
}) {
  const { items, closeSurface, openKickoff, openStaveTask } = args;
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeWorkspaceName = useAppStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
  );

  const startTarget = useCallback(
    (proposal: ProposedMission) =>
      describeProposalStart(proposal, {
        issueListed: findProposalIssueKey(proposal, items) !== null,
        activeWorkspaceName: activeWorkspaceId ? (activeWorkspaceName ?? "this workspace") : null,
      }),
    [activeWorkspaceId, activeWorkspaceName, items],
  );

  /**
   * Opens the workspace — its repository first, when another one is open —
   * then the Start sheet on an empty task with the proposal filled in.
   */
  const startInWorkspace = useCallback(
    async (proposal: ProposedMission, workspaceId: string) => {
      const ownWorkspace = proposal.workspaceId === workspaceId;
      try {
        const repositoryPath = ownWorkspace ? proposal.repositoryPath : null;
        if (repositoryPath && repositoryPath !== useAppStore.getState().repositoryPath) {
          await useAppStore.getState().openRepository({ repositoryPath });
        }
        const store = useAppStore.getState();
        if (!store.workspaces.some((workspace) => workspace.id === workspaceId)) await store.refreshWorkspaces();
        if (useAppStore.getState().activeWorkspaceId !== workspaceId) {
          await useAppStore.getState().switchWorkspace({ workspaceId });
        }
      } catch {
        toast.error("Could not open the workspace for this mission.");
        return;
      }
      if (useAppStore.getState().activeWorkspaceId !== workspaceId) {
        const { title, description } = describeMissingWorkspace(proposal);
        toast.error(title, { description });
        return;
      }
      const taskId = takeTaskFor(ownWorkspace ? proposal : { ...proposal, taskId: null });
      if (!taskId) {
        toast.error("Could not create a task for this mission.");
        return;
      }
      closeSurface();
      let started = false;
      const request: StartMissionRequest = {
        workspaceId,
        taskId,
        playbookId: playbookChoiceForId(proposal.playbookId),
        assignment: proposal.assignment,
        onMissionStarted: (missionId) => {
          started = true;
          void useProposalsStore.getState().markStarted(proposal.id, missionId);
        },
      };
      usePlaybooksUiStore.getState().openStartSheet(request);
      discardIfCancelled(request, () => started);
    },
    [closeSurface],
  );

  const start = useCallback(
    (proposal: ProposedMission) => {
      const issueKey = findProposalIssueKey(proposal, items);
      if (issueKey) {
        openKickoff(issueKey, proposal);
        return;
      }
      const workspaceId = proposal.workspaceId ?? activeWorkspaceId;
      if (workspaceId) void startInWorkspace(proposal, workspaceId);
    },
    [activeWorkspaceId, items, openKickoff, startInWorkspace],
  );

  const dismiss = useCallback((proposal: ProposedMission) => {
    void useProposalsStore
      .getState()
      .dismiss(proposal.id)
      .then((response) => {
        if (!response.ok) toast.error("Could not dismiss the proposal", { description: response.message });
      });
  }, []);

  const openMission = useCallback(
    (proposal: ProposedMission) => {
      const get = window.api?.missions?.get;
      if (!proposal.missionId || !get) return;
      void get({ missionId: proposal.missionId })
        .then((response) => {
          if (!response.ok || !response.mission) throw new Error("gone");
          openStaveTask({ workspaceId: response.mission.mission.workspaceId, taskId: response.mission.mission.leadTaskId });
        })
        .catch(() => toast.error("That mission is no longer available."));
    },
    [openStaveTask],
  );

  return { startTarget, start, dismiss, openMission };
}
