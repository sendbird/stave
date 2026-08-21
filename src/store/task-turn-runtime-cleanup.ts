import type { AdvisorExchangeByTask } from "@/lib/providers/advisor-activity";
import type { AdvisorConsultLogByTask } from "@/lib/providers/advisor-consult-log";
import type {
  ProviderTurnActivitySnapshot,
  RetainedTurnActivityByTask,
} from "@/lib/providers/turn-status";

/**
 * Per-task turn runtime maps that must be shed when a task leaves the app
 * (archive, workspace close, project removal).
 *
 * An error-terminated turn intentionally keeps its full activity snapshot
 * while the task is live so the surface can show what failed; these entries
 * are removed only once the task itself goes away, otherwise every dead task
 * strands its Stage G work graph (up to hundreds of KB) until restart.
 */
export interface TaskTurnRuntimeEntries {
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  /**
   * The replayable copy of the last finished turn. It is bounded on its own,
   * but a task that has left the app has nothing left to replay, so it is shed
   * here too rather than occupying one of the few retained slots.
   */
  retainedTurnActivityByTask: RetainedTurnActivityByTask;
  advisorExchangeByTask: AdvisorExchangeByTask;
  /**
   * The task's archived consults. Shed with the task, unlike
   * `advisorVerdictTallyByModel`, which is keyed by advisor model rather than
   * by task and so has nothing to drop here.
   */
  advisorConsultLogByTask: AdvisorConsultLogByTask;
  hostOwnedTurnIdsByTask: Record<string, string | undefined>;
}

/**
 * Removes `keys` from `map`, returning `null` when nothing was present so the
 * caller can keep the existing reference (and skip the store patch) untouched.
 */
export function removeRecordEntries<V>(
  map: Record<string, V>,
  keys: readonly string[],
): Record<string, V> | null {
  let next: Record<string, V> | null = null;
  for (const key of keys) {
    if (!(key in map)) {
      continue;
    }
    if (!next) {
      next = { ...map };
    }
    delete next[key];
  }
  return next;
}

/**
 * Drops the given tasks' entries from every per-task turn runtime map.
 * Returns only the maps that actually changed, so spreading the result into a
 * `set()` patch never replaces an untouched map reference.
 */
export function removeTaskTurnRuntimeEntries(args: {
  state: TaskTurnRuntimeEntries;
  taskIds: readonly string[];
}): Partial<TaskTurnRuntimeEntries> {
  const patch: Partial<TaskTurnRuntimeEntries> = {};
  const providerTurnActivityByTask = removeRecordEntries(
    args.state.providerTurnActivityByTask,
    args.taskIds,
  );
  if (providerTurnActivityByTask) {
    patch.providerTurnActivityByTask = providerTurnActivityByTask;
  }
  const retainedTurnActivityByTask = removeRecordEntries(
    args.state.retainedTurnActivityByTask,
    args.taskIds,
  );
  if (retainedTurnActivityByTask) {
    patch.retainedTurnActivityByTask = retainedTurnActivityByTask;
  }
  const advisorExchangeByTask = removeRecordEntries(
    args.state.advisorExchangeByTask,
    args.taskIds,
  );
  if (advisorExchangeByTask) {
    patch.advisorExchangeByTask = advisorExchangeByTask;
  }
  const advisorConsultLogByTask = removeRecordEntries(
    args.state.advisorConsultLogByTask,
    args.taskIds,
  );
  if (advisorConsultLogByTask) {
    patch.advisorConsultLogByTask = advisorConsultLogByTask;
  }
  const hostOwnedTurnIdsByTask = removeRecordEntries(
    args.state.hostOwnedTurnIdsByTask,
    args.taskIds,
  );
  if (hostOwnedTurnIdsByTask) {
    patch.hostOwnedTurnIdsByTask = hostOwnedTurnIdsByTask;
  }
  return patch;
}

/** Task ids owned by any of the given workspaces, per `taskWorkspaceIdById`. */
export function listTaskIdsForWorkspaces(args: {
  taskWorkspaceIdById: Record<string, string>;
  workspaceIds: readonly string[];
}): string[] {
  const workspaceIdSet = new Set(args.workspaceIds);
  const taskIds: string[] = [];
  for (const [taskId, workspaceId] of Object.entries(
    args.taskWorkspaceIdById,
  )) {
    if (workspaceIdSet.has(workspaceId)) {
      taskIds.push(taskId);
    }
  }
  return taskIds;
}
