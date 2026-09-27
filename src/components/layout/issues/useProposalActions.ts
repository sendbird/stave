import { useCallback } from "react";

import { toast } from "@/components/ui";
import { playbookChoiceForId } from "@/lib/missions/start-sheet";
import type { ProposedMission } from "@/lib/missions/proposed";
import { trackerIssueKey } from "@/lib/tracker-issues/client-store";
import type { TrackerIssueListItem } from "@/lib/tracker-issues/types";
import { useAppStore } from "@/store/app.store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";
import { useProposalsStore } from "@/store/proposals-store";
import type { ProposalStartTarget } from "./ProposedMissionsPanel";

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

  /** A new task in the workspace, then the Start sheet with the proposal filled in. */
  const startInWorkspace = useCallback(
    async (proposal: ProposedMission, workspaceId: string) => {
      try {
        const store = useAppStore.getState();
        if (!store.workspaces.some((workspace) => workspace.id === workspaceId)) await store.refreshWorkspaces();
        if (useAppStore.getState().activeWorkspaceId !== workspaceId) {
          await useAppStore.getState().switchWorkspace({ workspaceId });
        }
      } catch {
        toast.error("Could not open the workspace for this mission.");
        return;
      }
      const before = useAppStore.getState();
      if (before.activeWorkspaceId !== workspaceId) {
        toast.error("The workspace for this mission is gone.", { description: "Dismiss it, or start it from a workspace." });
        return;
      }
      before.createTask({ title: proposal.title.slice(0, 80) });
      const taskId = useAppStore.getState().activeTaskId;
      if (!taskId || taskId === before.activeTaskId) {
        toast.error("Could not create a task for this mission.");
        return;
      }
      closeSurface();
      usePlaybooksUiStore.getState().openStartSheet({
        workspaceId,
        taskId,
        playbookId: playbookChoiceForId(proposal.playbookId),
        assignment: proposal.assignment,
        onMissionStarted: (missionId) => void useProposalsStore.getState().markStarted(proposal.id, missionId),
      });
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
