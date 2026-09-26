import { useCallback } from "react";

import { toast } from "@/components/ui";
import {
  attachTrackerIssueStaveTask,
  refreshTrackerIssues,
} from "@/lib/tracker-issues/client-state";
import { buildTrackerIssueWorkspaceInformationUpdate } from "@/lib/tracker-issues/attach";
import type {
  TrackerSourceId,
  TrackerIssue,
  TrackerIssueKickoffResult,
} from "@/lib/tracker-issues/types";
import { useAppStore } from "@/store/app.store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";

export interface TrackerIssueActions {
  /** Files a ticket into the active workspace's Information panel. */
  attachToActiveWorkspace: (task: TrackerIssue) => void;
  /** Brings a bound Stave task to the front and leaves the Issues surface. */
  openStaveTask: (args: {
    workspaceId: string;
    taskId: string | null;
  }) => void;
  /** Finishes a kickoff: focuses the run, or stages the prompt in a new task. */
  completeKickoff: (args: {
    task: TrackerIssue;
    result: TrackerIssueKickoffResult;
    playbookChoice?: string | null;
  }) => Promise<void>;
  refresh: (source?: TrackerSourceId) => void;
}

export function useTrackerIssueActions(args: {
  /** Leaves the Issues surface once a run or draft is ready to work on. */
  closeSurface: () => void;
}): TrackerIssueActions {
  const { closeSurface } = args;

  const attachToActiveWorkspace = useCallback((task: TrackerIssue) => {
    const store = useAppStore.getState();
    if (!store.activeWorkspaceId) {
      toast.error("Open a workspace before attaching a ticket.");
      return;
    }
    let attached = false;
    store.updateWorkspaceInformation({
      updater: (current) => {
        const update = buildTrackerIssueWorkspaceInformationUpdate({
          current,
          task,
        });
        attached = update.changed;
        return update.information;
      },
    });
    toast.success(
      attached
        ? `Attached ${task.key} to this workspace`
        : `${task.key} is already attached`,
    );
  }, []);

  const openStaveTask = useCallback(
    (target: { workspaceId: string; taskId: string | null }) => {
      if (!target.taskId) {
        // A staged kickoff has a workspace but no task yet, so the useful move
        // is to open that workspace rather than fail silently.
        void (async () => {
          const store = useAppStore.getState();
          if (
            !store.workspaces.some(
              (workspace) => workspace.id === target.workspaceId,
            )
          ) {
            await store.refreshWorkspaces();
          }
          await useAppStore
            .getState()
            .switchWorkspace({ workspaceId: target.workspaceId });
          closeSurface();
        })()
          .catch(() => {
            toast.error("Could not open the workspace.");
          });
        return;
      }
      void useAppStore
        .getState()
        .focusTaskAttention({
          workspaceId: target.workspaceId,
          taskId: target.taskId,
          refreshFromPersistence: true,
        })
        .then(closeSurface)
        .catch(() => {
          toast.error("Could not open the Stave task.");
        });
    },
    [closeSurface],
  );

  const completeKickoff = useCallback(
    async (kickoff: {
      task: TrackerIssue;
      result: TrackerIssueKickoffResult;
      /** Set when the ticket becomes a mission, confirmed in the Start sheet. */
      playbookChoice?: string | null;
    }) => {
      const { result, task } = kickoff;
      const store = useAppStore.getState();

      if (!result.staged) {
        toast.success(`Started ${task.key} in Stave`, {
          action: result.taskId
            ? {
                label: "Open",
                onClick: () =>
                  openStaveTask({
                    workspaceId: result.workspaceId,
                    taskId: result.taskId,
                  }),
              }
            : undefined,
        });
        if (result.taskId) {
          openStaveTask({
            workspaceId: result.workspaceId,
            taskId: result.taskId,
          });
        }
        return;
      }

      // Staging is a composer draft, which only the renderer can create: main
      // hands back the title and prompt and the workspace it prepared.
      try {
        if (
          !store.workspaces.some(
            (workspace) => workspace.id === result.workspaceId,
          )
        ) {
          await store.refreshWorkspaces();
        }
        await useAppStore
          .getState()
          .switchWorkspace({ workspaceId: result.workspaceId });
      } catch {
        toast.error("Prepared the workspace, but could not open it.");
        return;
      }
      const afterSwitch = useAppStore.getState();
      const previousTaskId = afterSwitch.activeTaskId;
      afterSwitch.createTask({ title: result.staged.title });
      const taskId = useAppStore.getState().activeTaskId;
      if (!taskId || taskId === previousTaskId) {
        toast.error("Could not create the Stave task.");
        return;
      }
      useAppStore.getState().updatePromptDraft({
        taskId,
        patch: { text: result.staged.prompt },
      });
      // Best-effort: the draft is already on screen, so a failed link write is
      // a stale badge rather than lost work.
      void attachTrackerIssueStaveTask({
        kickoffId: result.kickoffId,
        taskId,
      }).catch(() => undefined);
      closeSurface();
      if (kickoff.playbookChoice) {
        usePlaybooksUiStore.getState().openStartSheet({
          workspaceId: result.workspaceId,
          taskId,
          playbookId: kickoff.playbookChoice,
          assignment: result.staged.prompt,
          fromComposerDraft: true,
        });
        return;
      }
      toast.success(`Staged ${task.key}`, {
        description: "Review the prompt, then send it.",
      });
    },
    [closeSurface, openStaveTask],
  );

  const refresh = useCallback((source?: TrackerSourceId) => {
    void refreshTrackerIssues(source).then((result) => {
      if (!result.ok) {
        toast.error("Could not refresh tickets", {
          description: result.message,
        });
      }
    });
  }, []);

  return { attachToActiveWorkspace, openStaveTask, completeKickoff, refresh };
}
