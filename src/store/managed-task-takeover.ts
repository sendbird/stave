import { loadWorkspaceShellLite } from "@/lib/db/workspaces.db";
import {
  canTakeOverTask,
  MANAGED_TASK_STOP_NOTICE,
} from "@/lib/tasks";
import {
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { interruptActiveTaskTurns } from "@/store/workspace-session-state";
import type { ChatMessage, Task, TaskSourceContext } from "@/types/chat";

interface ManagedTaskTurnState<TSession, TGoal> {
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  hostOwnedTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  providerSessionByTask: Record<string, TSession>;
  providerGoalByTask: Record<string, TGoal>;
  nativeSessionReadyByTask: Record<string, boolean>;
  workspaceSnapshotVersion: number;
}

export async function requestManagedTaskTakeover(args: {
  taskId: string;
  state: {
    tasks: Task[];
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
    args.state.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
  if (!task || !canTakeOverTask({ task })) {
    return { ok: false, message: "This task is not managed." };
  }
  const workspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ?? args.state.activeWorkspaceId;
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
        shell?.tasks.find((candidate) => candidate.id === args.taskId) ?? null,
    )
    .catch(() => null);
  return {
    ok: true,
    workspaceId,
    ...(persistedTask?.sourceContexts
      ? { sourceContexts: persistedTask.sourceContexts }
      : {}),
    ...(result.craneReceiptPending ? { craneReceiptPending: true } : {}),
  };
}

export async function requestManagedTaskStop(args: {
  taskId: string;
  state: {
    taskWorkspaceIdById: Record<string, string | undefined>;
    activeWorkspaceId: string;
  };
}) {
  const workspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ?? args.state.activeWorkspaceId;
  const stopManagedTask = window.api?.taskControl?.stop;
  if (!workspaceId || !stopManagedTask) {
    return false;
  }
  return stopManagedTask({ workspaceId, taskId: args.taskId })
    .then((result) => result.ok)
    .catch(() => false);
}

export function buildManagedTaskTurnInterruptionPatch<TSession, TGoal>(
  state: ManagedTaskTurnState<TSession, TGoal>,
  taskId: string,
) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task || !state.activeTurnIdsByTask[taskId]) {
    return {};
  }
  const interrupted = interruptActiveTaskTurns({
    tasks: [task],
    messagesByTask: state.messagesByTask,
    messageCountByTask: state.messageCountByTask,
    activeTurnIdsByTask: state.activeTurnIdsByTask,
    notice: MANAGED_TASK_STOP_NOTICE,
  });
  const { [taskId]: _providerSession, ...providerSessionByTask } =
    state.providerSessionByTask;
  const { [taskId]: _providerGoal, ...providerGoalByTask } =
    state.providerGoalByTask;
  return {
    messagesByTask: interrupted.messagesByTask,
    activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
    hostOwnedTurnIdsByTask: {
      ...state.hostOwnedTurnIdsByTask,
      [taskId]: undefined,
    },
    providerTurnActivityByTask: clearProviderTurnActivity({
      activityByTask: state.providerTurnActivityByTask,
      taskId,
    }),
    providerSessionByTask,
    providerGoalByTask,
    nativeSessionReadyByTask: {
      ...state.nativeSessionReadyByTask,
      [taskId]: false,
    },
    workspaceSnapshotVersion: state.workspaceSnapshotVersion + 1,
  };
}

export function buildManagedTaskTakeoverStatePatch<TSession, TGoal>(args: {
  state: ManagedTaskTurnState<TSession, TGoal>;
  taskId: string;
  sourceContexts?: TaskSourceContext[];
  updatedAt: string;
}) {
  return {
    ...buildManagedTaskTurnInterruptionPatch(args.state, args.taskId),
    tasks: applyManagedTaskTakeover({
      tasks: args.state.tasks,
      taskId: args.taskId,
      sourceContexts: args.sourceContexts,
      updatedAt: args.updatedAt,
    }),
    workspaceSnapshotVersion: args.state.workspaceSnapshotVersion + 1,
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
