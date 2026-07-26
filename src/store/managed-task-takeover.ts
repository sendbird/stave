import { loadWorkspaceShellLite } from "@/lib/db/workspaces.db";
import { canTakeOverTask } from "@/lib/tasks";
import type { Task, TaskSourceContext } from "@/types/chat";

export async function requestManagedTaskTakeover(args: {
  taskId: string;
  state: {
    tasks: Task[];
    activeTurnIdsByTask: Record<string, string | undefined>;
    taskWorkspaceIdById: Record<string, string | undefined>;
    activeWorkspaceId: string;
  };
}): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      workspaceId: string;
      sourceContexts?: TaskSourceContext[];
      craneReceiptPending?: boolean;
    }
> {
  const task =
    args.state.tasks.find((candidate) => candidate.id === args.taskId) ??
    null;
  if (
    !task ||
    !canTakeOverTask({
      task,
      activeTurnId: args.state.activeTurnIdsByTask[args.taskId],
    })
  ) {
    return { ok: false, message: "The managed run is still active." };
  }
  const workspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ??
    args.state.activeWorkspaceId;
  const takeOver = window.api?.taskControl?.takeOver;
  if (!workspaceId || !takeOver) {
    return {
      ok: false,
      message: "Managed task controls are unavailable.",
    };
  }
  let result: Awaited<ReturnType<typeof takeOver>>;
  try {
    result = await takeOver({ workspaceId, taskId: args.taskId });
  } catch {
    return {
      ok: false,
      message: "Could not take over the managed task.",
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      message: result.message ?? "Could not take over the managed task.",
    };
  }
  const persistedTask = await loadWorkspaceShellLite({ workspaceId })
    .then(
      (shell) =>
        shell?.tasks.find((candidate) => candidate.id === args.taskId) ??
        null,
    )
    .catch(() => null);
  return {
    ok: true,
    workspaceId,
    ...(persistedTask?.sourceContexts
      ? { sourceContexts: persistedTask.sourceContexts }
      : {}),
    ...(result.craneReceiptPending
      ? { craneReceiptPending: true }
      : {}),
  };
}

export function applyManagedTaskTakeover(args: {
  tasks: Task[];
  taskId: string;
  sourceContexts?: TaskSourceContext[];
  updatedAt: string;
}) {
  return args.tasks.map((task) =>
    task.id === args.taskId
      ? {
          ...task,
          ...(args.sourceContexts
            ? { sourceContexts: args.sourceContexts }
            : {}),
          controlMode: "interactive" as const,
          controlOwner: "stave" as const,
          updatedAt: args.updatedAt,
        }
      : task,
  );
}
