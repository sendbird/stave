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
 * rewritten — and replaces only the host-owned fields above.
 *
 * `archivedAt` is deliberately taken from the *persisted* task row rather than
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
                // Renderer-owned lifecycle wins over the host's cached copy.
                archivedAt: task.archivedAt ?? args.task!.archivedAt ?? null,
              }
            : task,
        )
      : [...args.payload.tasks, args.task];

  return {
    ...args.payload,
    tasks: nextTasks,
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
