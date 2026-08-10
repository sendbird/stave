/**
 * Renderer-side task heartbeat actions.
 *
 * The heartbeat itself lives entirely in the host process — see
 * `electron/host-service/task-supervisor-runtime.ts`. This module is only the
 * renderer's read model plus the four user gestures (refresh, add, pause /
 * resume, remove), so it deliberately owns no schedule math and no state
 * machine: it stores exactly the `TaskHeartbeatSummary` rows the host reports.
 *
 * Two surfaces read the summaries — Fleet's task execution summary and the
 * sidebar work queue — so the record is refreshed once at app level rather than
 * per component. Every mutation re-reads the full snapshot instead of patching
 * a row locally, because the host can change a heartbeat's state on the same
 * tick (an approval pauses it, a cap stops it) and a locally patched row would
 * claim otherwise.
 *
 * Nothing here throws: each action answers `{ ok, message? }` so a control can
 * show the failure inline next to the button the user just pressed.
 */
import type { StoreApi } from "zustand";
import type {
  TaskHeartbeatSummary,
  TaskHeartbeatUpsertInput,
} from "@/lib/automation/task-supervisor";
import type {
  AppState,
  TaskHeartbeatActionResult,
} from "@/store/app-store.types";

type TaskHeartbeatActionKey =
  | "refreshTaskHeartbeats"
  | "createTaskHeartbeat"
  | "setTaskHeartbeatPaused"
  | "removeTaskHeartbeat";

type TaskHeartbeatActions = Pick<AppState, TaskHeartbeatActionKey>;
type StoreSet = StoreApi<AppState>["setState"];

const HEARTBEATS_UNAVAILABLE =
  "Task heartbeats are not available in this build.";

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function summariesEqual(
  left: TaskHeartbeatSummary,
  right: TaskHeartbeatSummary,
) {
  return (
    left.heartbeatId === right.heartbeatId &&
    left.taskId === right.taskId &&
    left.state === right.state &&
    left.reason === right.reason &&
    left.nextRunAt === right.nextRunAt &&
    left.occurrenceCount === right.occurrenceCount &&
    left.skippedCount === right.skippedCount
  );
}

/**
 * The refresh loop runs every 15s whether or not anything moved. Comparing the
 * snapshot field by field keeps the record reference stable across those
 * no-op ticks, so components that subscribe to it (and the memos derived from
 * it) do not re-render on a timer.
 */
function heartbeatRecordsEqual(
  left: Record<string, TaskHeartbeatSummary>,
  right: Record<string, TaskHeartbeatSummary>,
) {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  return leftKeys.every((taskId) => {
    const rightSummary = right[taskId];
    const leftSummary = left[taskId];
    return (
      leftSummary !== undefined &&
      rightSummary !== undefined &&
      summariesEqual(leftSummary, rightSummary)
    );
  });
}

export function createTaskHeartbeatActions(args: {
  set: StoreSet;
}): TaskHeartbeatActions {
  const { set } = args;

  const refreshTaskHeartbeats: TaskHeartbeatActions["refreshTaskHeartbeats"] =
    async () => {
      const list = window.api?.taskHeartbeats?.list;
      if (!list) {
        return { ok: false, message: HEARTBEATS_UNAVAILABLE };
      }
      try {
        // Deliberately unscoped. The sidebar work queue spans every project, so
        // a workspace-scoped snapshot could not replace this record without
        // dropping the other workspaces' rows.
        const response = await list();
        if (!response?.ok) {
          return {
            ok: false,
            message: response?.message ?? "Could not read task heartbeats.",
          };
        }
        const next: Record<string, TaskHeartbeatSummary> = {};
        for (const summary of response.snapshot.summaries) {
          next[summary.taskId] = summary;
        }
        set((state) =>
          heartbeatRecordsEqual(state.taskHeartbeatSummariesByTaskId, next)
            ? state
            : { taskHeartbeatSummariesByTaskId: next },
        );
        return { ok: true };
      } catch (error) {
        return { ok: false, message: describeError(error) };
      }
    };

  return {
    refreshTaskHeartbeats,
    createTaskHeartbeat: async ({
      input,
    }: {
      input: TaskHeartbeatUpsertInput;
    }) => {
      const create = window.api?.taskHeartbeats?.create;
      if (!create) {
        return { ok: false, message: HEARTBEATS_UNAVAILABLE };
      }
      try {
        const response = await create({ input });
        if (!response?.ok || !response.heartbeat) {
          return {
            ok: false,
            message: response?.message ?? "Could not add this heartbeat.",
          };
        }
      } catch (error) {
        return { ok: false, message: describeError(error) };
      }
      await refreshTaskHeartbeats();
      return { ok: true };
    },
    setTaskHeartbeatPaused: async ({ id, paused }) => {
      const setPaused = window.api?.taskHeartbeats?.setPaused;
      if (!setPaused) {
        return { ok: false, message: HEARTBEATS_UNAVAILABLE };
      }
      try {
        const response = await setPaused({ id, paused });
        if (!response?.ok || !response.heartbeat) {
          return {
            ok: false,
            message:
              response?.message ??
              (paused
                ? "Could not pause this heartbeat."
                : "Could not resume this heartbeat."),
          };
        }
      } catch (error) {
        return { ok: false, message: describeError(error) };
      }
      await refreshTaskHeartbeats();
      return { ok: true };
    },
    removeTaskHeartbeat: async ({ id }) => {
      const remove = window.api?.taskHeartbeats?.remove;
      if (!remove) {
        return { ok: false, message: HEARTBEATS_UNAVAILABLE };
      }
      try {
        const response = await remove({ id });
        if (!response?.ok) {
          return {
            ok: false,
            message: response?.message ?? "Could not remove this heartbeat.",
          };
        }
      } catch (error) {
        return { ok: false, message: describeError(error) };
      }
      await refreshTaskHeartbeats();
      return { ok: true };
    },
  };
}
