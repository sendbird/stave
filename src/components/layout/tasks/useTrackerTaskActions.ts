import { useCallback } from "react";

import { toast } from "@/components/ui";
import {
  attachTrackerTaskStaveTask,
  refreshTrackerTasks,
} from "@/lib/tracker-tasks/client-state";
import { buildTrackerTaskWorkspaceInformationUpdate } from "@/lib/tracker-tasks/attach";
import type {
  TrackerSourceId,
  TrackerTask,
  TrackerTaskKickoffResult,
} from "@/lib/tracker-tasks/types";
import { useAppStore } from "@/store/app.store";

export interface TrackerTaskActions {
  /** Files a ticket into the active workspace's Information panel. */
  attachToActiveWorkspace: (task: TrackerTask) => void;
  /** Brings a bound Stave task to the front and leaves the Tasks surface. */
  openStaveTask: (args: {
    workspaceId: string;
    taskId: string | null;
  }) => void;
  /** Finishes a kickoff: focuses the run, or stages the prompt in a new task. */
  completeKickoff: (args: {
    task: TrackerTask;
    result: TrackerTaskKickoffResult;
  }) => Promise<void>;
  refresh: (source?: TrackerSourceId) => void;
}

export function useTrackerTaskActions(args: {
  /** Leaves the Tasks surface once a run or draft is ready to work on. */
  closeSurface: () => void;
}): TrackerTaskActions {
  const { closeSurface } = args;

  const attachToActiveWorkspace = useCallback((task: TrackerTask) => {
    const store = useAppStore.getState();
    if (!store.activeWorkspaceId) {
      toast.error("Open a workspace before attaching a ticket.");
      return;
    }
    let attached = false;
    store.updateWorkspaceInformation({
      updater: (current) => {
        const update = buildTrackerTaskWorkspaceInformationUpdate({
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
        void useAppStore
          .getState()
          .switchWorkspace({ workspaceId: target.workspaceId })
          .then(closeSurface)
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
      task: TrackerTask;
      result: TrackerTaskKickoffResult;
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
        await store.switchWorkspace({ workspaceId: result.workspaceId });
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
      void attachTrackerTaskStaveTask({
        kickoffId: result.kickoffId,
        taskId,
      }).catch(() => undefined);
      closeSurface();
      toast.success(`Staged ${task.key}`, {
        description: "Review the prompt, then send it.",
      });
    },
    [closeSurface, openStaveTask],
  );

  const refresh = useCallback((source?: TrackerSourceId) => {
    void refreshTrackerTasks(source).then((result) => {
      if (!result.ok) {
        toast.error("Could not refresh tickets", {
          description: result.message,
        });
      }
    });
  }, []);

  return { attachToActiveWorkspace, openStaveTask, completeKickoff, refresh };
}
