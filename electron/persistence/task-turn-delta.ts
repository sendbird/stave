import { appendOpenTaskTabForHostCreatedTask } from "../../src/lib/tasks";
import type {
  PersistedWorkspaceShellPayload,
  PersistenceWorkspaceSnapshot,
} from "./types";

/**
 * Fields of the persisted workspace shell that host-service is allowed to
 * write. Everything else belongs to the renderer.
 *
 * Kept as an explicit list so the ownership boundary is reviewable in one
 * place, and so `mergeTaskTurnDeltaPayload` can be tested against it directly.
 */
export const HOST_OWNED_WORKSPACE_SHELL_FIELDS = [
  "tasks",
  "activeTaskId",
  "providerSessionByTask",
  "messageCountByTask",
] as const satisfies ReadonlyArray<keyof PersistedWorkspaceShellPayload>;

export type PersistenceTaskRow = PersistenceWorkspaceSnapshot["tasks"][number];

/**
 * Apply one task's turn progress to a persisted workspace payload.
 *
 * The result keeps every renderer-owned field byte-identical to the persisted
 * input — including `editorTabs` and its artifact pointers, so no artifact is
 * rewritten — and replaces only the host-owned fields above. Creating a new
 * top-level task is the one exception: its id is appended to `openTaskTabIds`
 * so the pane shows a tab instead of stranding the row in Task History.
 *
 * Title fields and `archivedAt` are taken from the *persisted* task row rather than
 * the caller's copy: task archival is renderer-owned, and the host's cached
 * session can be stale enough to revive a task the user just archived.
 */
export function mergeTaskTurnDeltaPayload(args: {
  payload: PersistedWorkspaceShellPayload;
  taskId: string;
  task?: PersistenceTaskRow;
  activeTaskId?: string;
  providerSession?: unknown;
  messageCount: number;
}): PersistedWorkspaceShellPayload {
  const existingTask = args.task
    ? (args.payload.tasks.find((task) => task.id === args.task!.id) ?? null)
    : null;

  const nextTasks = !args.task
    ? args.payload.tasks
    : existingTask
      ? args.payload.tasks.map((task) =>
          task.id === args.task!.id
            ? {
                ...task,
                ...args.task!,
                // Names belong to the renderer; turn progress cannot rename an existing task.
                title: task.title,
                titleManuallySet: task.titleManuallySet,
                // Renderer-owned lifecycle wins over the host's cached copy.
                archivedAt: task.archivedAt ?? args.task!.archivedAt ?? null,
              }
            : task,
        )
      : [...args.payload.tasks, args.task];

  const nextOpenTaskTabIds =
    args.task && !existingTask
      ? appendOpenTaskTabForHostCreatedTask({
          openTaskTabIds: args.payload.openTaskTabIds,
          task: args.task,
        })
      : args.payload.openTaskTabIds;

  return {
    ...args.payload,
    tasks: nextTasks,
    ...(nextOpenTaskTabIds !== args.payload.openTaskTabIds
      ? { openTaskTabIds: nextOpenTaskTabIds }
      : {}),
    ...(args.activeTaskId ? { activeTaskId: args.activeTaskId } : {}),
    ...(args.providerSession
      ? {
          providerSessionByTask: {
            ...(args.payload.providerSessionByTask ?? {}),
            [args.taskId]: args.providerSession,
          },
        }
      : {}),
    messageCountByTask: {
      ...(args.payload.messageCountByTask ?? {}),
      [args.taskId]: args.messageCount,
    },
  } as PersistedWorkspaceShellPayload;
}

/**
 * Renderer-owned shell fields that host-service's whole-snapshot write has no
 * copy of, so it must carry them over from disk instead of omitting them.
 */
export type HostSnapshotCarriedShellFields = Pick<
  PersistedWorkspaceShellPayload,
  | "reviewCommentsByTask"
  | "openTaskTabIds"
  | "lensTabs"
  | "paneTabMeta"
  | "dockLayout"
>;

/**
 * Carry renderer-owned pane fields into host-service's whole-snapshot write.
 *
 * Host-service still writes a whole snapshot when no task turn scopes the
 * write (Information edits, idle-task creation, managed stop, approval
 * answers, delegation release) or when `persistTaskTurnDelta` declines. That
 * snapshot used to omit these fields. A missing `openTaskTabIds` reads as a
 * legacy snapshot, which opens every live task, so a task the user had closed
 * (a managed run included) came back as a tab the next time the workspace
 * opened; a missing `reviewCommentsByTask` was saved as empty.
 *
 * The persisted shell is the source of truth for these fields. A top-level
 * task the host adds in this same write still gets a tab, as in
 * `mergeTaskTurnDeltaPayload`. Without a persisted shell there is nothing to
 * carry, and the fields stay omitted.
 */
export function carryRendererOwnedShellFields(args: {
  persistedShell:
    | (HostSnapshotCarriedShellFields & { tasks: Array<{ id: string }> })
    | null;
  tasks: ReadonlyArray<PersistenceTaskRow>;
}): HostSnapshotCarriedShellFields {
  const shell = args.persistedShell;
  if (!shell) {
    return {};
  }
  const persistedTaskIds = new Set(shell.tasks.map((task) => task.id));
  let openTaskTabIds = shell.openTaskTabIds;
  for (const task of args.tasks) {
    if (!persistedTaskIds.has(task.id)) {
      openTaskTabIds = appendOpenTaskTabForHostCreatedTask({
        openTaskTabIds,
        task,
      });
    }
  }
  return {
    reviewCommentsByTask: shell.reviewCommentsByTask,
    openTaskTabIds,
    lensTabs: shell.lensTabs,
    paneTabMeta: shell.paneTabMeta,
    dockLayout: shell.dockLayout,
  };
}

/**
 * The subset of a payload needed to rebuild the `workspace_meta` lite and
 * summary projections after a delta write.
 */
export function toWorkspaceShellMetaSource(
  payload: PersistedWorkspaceShellPayload,
) {
  return {
    activeTaskId: payload.activeTaskId,
    tasks: payload.tasks,
    promptDraftByTask: payload.promptDraftByTask ?? {},
    reviewCommentsByTask: payload.reviewCommentsByTask ?? {},
    providerSessionByTask: payload.providerSessionByTask ?? {},
    messageCountByTask: payload.messageCountByTask ?? {},
    terminalTabs: payload.terminalTabs ?? [],
    cliSessionTabs: payload.cliSessionTabs ?? [],
    openTaskTabIds: payload.openTaskTabIds,
  };
}
