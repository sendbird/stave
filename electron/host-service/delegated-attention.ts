/**
 * Interaction notifications for delegated tasks.
 *
 * A delegated child is created externally managed, yet nothing outside Stave
 * watches it: the person who owns the delegating task is the only one who can
 * answer, and an unanswered approval auto-denies. So a child's approval or
 * question is published like an interactive task's. The notification keeps the
 * child's identity — the child owns the request, and answering, reconciliation
 * and Fleet all key on it — and its payload names the root of the delegation
 * chain, the task the person is actually working in.
 *
 * A task driven by a real external controller has no parent and stays
 * unpublished, exactly as before.
 *
 * Used by `electron/host-service/local-mcp-runtime.ts`.
 */
import {
  DELEGATED_TASK_DETACHED_REASON,
  DELEGATED_TASK_LIST_LIMIT,
  toDelegatedTaskSummary,
} from "../../src/lib/runs/delegated-task";
import {
  getTaskControlMode,
  getTaskControlOwner,
  isExternallyManagedTask,
} from "../../src/lib/tasks";
import type { RecentRepositoryState } from "../../src/store/repository.utils";
import type { Task } from "../../src/types/chat";
import { ensureHostServicePersistenceReady } from "./persistence";

/** Bounds the ledger walk; real delegation chains are a few levels deep. */
const MAX_DELEGATION_DEPTH = 8;

export function publishesInteractionNotifications(
  task: Pick<Task, "controlMode" | "controlOwner" | "parentTaskId">,
) {
  return !isExternallyManagedTask(task) || Boolean(task.parentTaskId?.trim());
}

/**
 * The delegation chain above a child, nearest first and the root last. Each
 * step reads the ancestor's own delegation from the run ledger, which stays the
 * source of truth for `parentTaskId`, until a task no delegation owns. A
 * detached delegation ends the chain: that child carries on as its own root.
 */
function resolveAncestorTaskIds(parentTaskId: string) {
  const store = ensureHostServicePersistenceReady();
  const chain = [parentTaskId];
  while (chain.length < MAX_DELEGATION_DEPTH) {
    const taskId = chain[chain.length - 1]!;
    const owner = store
      .listRunAggregatesByOwnedTask({ taskId, limit: DELEGATED_TASK_LIST_LIMIT })
      .map((aggregate) => toDelegatedTaskSummary(aggregate))
      .find(
        (summary) =>
          summary?.delegatedTaskId === taskId &&
          summary.reason !== DELEGATED_TASK_DETACHED_REASON,
      );
    if (!owner || chain.includes(owner.parentTaskId)) {
      break;
    }
    chain.push(owner.parentTaskId);
  }
  return chain;
}

/** Same-workspace delegation is the common case, so the child's session is read first. */
function findRootTask(args: {
  rootTaskId: string;
  workspaceId: string;
  sessionTasks: readonly Pick<Task, "id" | "title">[];
  repository: RecentRepositoryState | null;
}) {
  const store = ensureHostServicePersistenceReady();
  const workspaces = [...(args.repository?.workspaces ?? [])].sort(
    (left, right) =>
      Number(right.id === args.workspaceId) - Number(left.id === args.workspaceId),
  );
  for (const workspace of workspaces) {
    const tasks =
      workspace.id === args.workspaceId
        ? args.sessionTasks
        : store.listWorkspaceTasks({ workspaceId: workspace.id });
    const task = tasks.find((candidate) => candidate.id === args.rootTaskId);
    if (task) {
      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        taskTitle: task.title.trim() || null,
      };
    }
  }
  return null;
}

/**
 * The control fields every interaction notification carries, plus the root
 * attribution for a delegated child. `title` is the root task's title when it
 * could be found, for the notification headline.
 */
export function describeInteractionAttribution(args: {
  task: Task;
  workspaceId: string;
  sessionTasks: readonly Task[];
  repository: RecentRepositoryState | null;
}) {
  const control = {
    controlMode: getTaskControlMode(args.task),
    controlOwner: getTaskControlOwner(args.task),
  };
  const parentTaskId = args.task.parentTaskId?.trim() || null;
  if (!parentTaskId) {
    return { title: null, payload: { ...control, parentTaskId: null } };
  }
  let ancestorTaskIds = [parentTaskId];
  let root: ReturnType<typeof findRootTask> = null;
  try {
    ancestorTaskIds = resolveAncestorTaskIds(parentTaskId);
    root = findRootTask({ ...args, rootTaskId: ancestorTaskIds[ancestorTaskIds.length - 1]! });
  } catch (error) {
    // Attribution is best effort; the request itself must still be published.
    console.warn("[stave-mcp] delegated attention root lookup failed", error, {
      taskId: args.task.id,
      parentTaskId,
    });
  }
  return {
    title: root?.taskTitle ?? null,
    payload: {
      ...control,
      parentTaskId,
      // Every task above the child, so each of them can answer it.
      ancestorTaskIds,
      rootTaskId: ancestorTaskIds[ancestorTaskIds.length - 1]!,
      rootWorkspaceId: root?.workspaceId ?? null,
      rootWorkspaceName: root?.workspaceName ?? null,
      rootTaskTitle: root?.taskTitle ?? null,
    },
  };
}
