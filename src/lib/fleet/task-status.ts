import {
  resolveProviderTurnDisplayState,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  getRespondingProviderId,
  isLegacyBranchTask,
  isTaskArchived,
} from "@/lib/tasks";
import {
  findLatestPendingApproval,
  findLatestPendingUserInput,
} from "@/store/provider-message.utils";
import type { ChatMessage, Task } from "@/types/chat";

export type FleetTaskStatus =
  "waiting-input" | "waiting-approval" | "error" | "running" | "idle";

export type FleetDisplayStatus = FleetTaskStatus | "unknown";

export type FleetTaskFilter =
  "all" | "attention" | "running" | "error" | "idle";

export const FLEET_TASK_STATUS_PRIORITY: Record<FleetTaskStatus, number> = {
  "waiting-input": 0,
  "waiting-approval": 1,
  error: 2,
  running: 3,
  idle: 4,
};

type FleetTaskStatusTask = Pick<
  Task,
  "id" | "archivedAt" | "coliseumParentTaskId" | "updatedAt"
>;

type FleetRespondingTask = FleetTaskStatusTask & Pick<Task, "provider">;

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

export type FleetTaskStatusSession = {
  tasks: readonly FleetTaskStatusTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
};

export type FleetAttentionTask = {
  taskId: string;
  status: Extract<FleetTaskStatus, "waiting-input" | "waiting-approval">;
  updatedAt: string;
};

const EMPTY_MESSAGES: ChatMessage[] = [];
const ERROR_SYSTEM_EVENT_PREFIX = "[error]";

function latestAssistantMessageHasError(args: { messages: ChatMessage[] }) {
  const latestMessage = args.messages.at(-1);
  if (latestMessage?.role !== "assistant") {
    return false;
  }

  return latestMessage.parts.some(
    (part) =>
      part.type === "system_event" &&
      part.content
        .trimStart()
        .toLowerCase()
        .startsWith(ERROR_SYSTEM_EVENT_PREFIX),
  );
}

export function classifyTaskStatus(args: {
  task: FleetTaskStatusTask;
  messages?: ChatMessage[];
  activeTurnId?: string | null;
  activity?: ProviderTurnActivitySnapshot | null;
}): FleetTaskStatus {
  if (isTaskArchived(args.task) || isLegacyBranchTask(args.task)) {
    return "idle";
  }

  const messages = args.messages ?? EMPTY_MESSAGES;
  const pendingUserInput = findLatestPendingUserInput({ messages });
  if (pendingUserInput) {
    return "waiting-input";
  }

  const pendingApproval = findLatestPendingApproval({ messages });
  if (pendingApproval) {
    return "waiting-approval";
  }

  const turnState = resolveProviderTurnDisplayState({
    activeTurnId: args.activeTurnId ?? null,
    activity: args.activity ?? null,
  });
  if (turnState === "stalled" || latestAssistantMessageHasError({ messages })) {
    return "error";
  }
  if (turnState === "responding") {
    return "running";
  }

  return "idle";
}

export function hasFleetTaskAttentionStatus(status: FleetTaskStatus) {
  return status === "waiting-input" || status === "waiting-approval";
}

export function compareFleetTaskStatus(
  left: FleetTaskStatus,
  right: FleetTaskStatus,
) {
  return FLEET_TASK_STATUS_PRIORITY[left] - FLEET_TASK_STATUS_PRIORITY[right];
}

export function compareFleetAttentionTasks(
  left: FleetAttentionTask,
  right: FleetAttentionTask,
) {
  const statusOrder = compareFleetTaskStatus(left.status, right.status);
  if (statusOrder !== 0) {
    return statusOrder;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function collectFleetAttentionTasks(args: {
  tasks: readonly FleetTaskStatusTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
}) {
  return args.tasks
    .map((task) => {
      const status = classifyTaskStatus({
        task,
        messages: args.messagesByTask[task.id] ?? EMPTY_MESSAGES,
        activeTurnId: args.activeTurnIdsByTask[task.id] ?? null,
        activity: args.providerTurnActivityByTask[task.id] ?? null,
      });
      if (!hasFleetTaskAttentionStatus(status)) {
        return null;
      }

      return {
        taskId: task.id,
        status,
        updatedAt: task.updatedAt,
      } satisfies FleetAttentionTask;
    })
    .filter((task): task is FleetAttentionTask => task !== null)
    .sort(compareFleetAttentionTasks);
}

export function matchesFleetTaskFilter(args: {
  status: FleetDisplayStatus;
  filter: FleetTaskFilter;
  query?: string;
  taskTitle: string;
  workspaceName: string;
  projectName: string;
}) {
  const filterMatches =
    args.filter === "all" ||
    (args.filter === "attention" &&
      (args.status === "waiting-input" ||
        args.status === "waiting-approval")) ||
    args.status === args.filter;
  if (!filterMatches) {
    return false;
  }

  const query = args.query?.trim().toLowerCase() ?? "";
  if (!query) {
    return true;
  }

  return [args.taskTitle, args.workspaceName, args.projectName].some((value) =>
    value.toLowerCase().includes(query),
  );
}

export function isFleetTaskFilterActive(args: {
  filter: FleetTaskFilter;
  query?: string;
}) {
  return args.filter !== "all" || Boolean(args.query?.trim());
}

export function summarizeFleetRespondingTasks(args: {
  tasks: FleetRespondingTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
}) {
  const providerIds = new Set<ProviderId>();
  let respondingTaskCount = 0;
  let hasWarningTask = false;

  for (const task of args.tasks) {
    const activeTurnId = args.activeTurnIdsByTask[task.id] ?? null;
    if (!activeTurnId) {
      continue;
    }

    const messages = args.messagesByTask[task.id] ?? EMPTY_MESSAGES;
    const status = classifyTaskStatus({
      task,
      messages,
      activeTurnId,
      activity: args.providerTurnActivityByTask[task.id] ?? null,
    });
    if (status === "idle") {
      continue;
    }

    respondingTaskCount += 1;
    if (status === "error") {
      hasWarningTask = true;
    }
    providerIds.add(
      getRespondingProviderId({
        fallbackProviderId: task.provider,
        messages,
      }),
    );
  }

  return {
    respondingTaskCount,
    respondingProviderIds: Array.from(providerIds),
    hasWarningTask,
  };
}

// ---------------------------------------------------------------------------
// Workspace lifecycle lanes — a *lifecycle* dimension (backlog → done) that is
// orthogonal to the per-task *runtime* status above. Derived (no schema
// change): a linked PR is the strongest signal, then live/recent work.
// ---------------------------------------------------------------------------

export type FleetLifecycleStatus =
  "in-progress" | "in-review" | "backlog" | "done";

/** Top-to-bottom lane order: live/actionable first, archived (done) last. */
export const FLEET_LIFECYCLE_DISPLAY_ORDER: readonly FleetLifecycleStatus[] = [
  "in-progress",
  "in-review",
  "backlog",
  "done",
];

export const FLEET_LIFECYCLE_LABEL: Record<FleetLifecycleStatus, string> = {
  "in-progress": "In progress",
  "in-review": "In review",
  backlog: "Backlog",
  done: "Done",
};

/**
 * Derive a workspace lifecycle lane from its linked-PR status and task
 * activity. Pure + deterministic. PR status wins (it is the clearest lifecycle
 * marker); absent a PR we fall back to whether work is live/recent.
 */
export function deriveFleetLifecycleStatus(args: {
  prStatus: WorkspacePrStatus | null;
  /** Any task currently running / waiting / errored (an active turn). */
  hasRunningTask: boolean;
  /** Any task has exchanged messages (work has started at some point). */
  hasRecentActivity: boolean;
}): FleetLifecycleStatus {
  if (args.prStatus === "merged" || args.prStatus === "closed_unmerged") {
    return "done";
  }
  if (args.prStatus && args.prStatus !== "no_pr") {
    // An open PR of any state means the work is up for review.
    return "in-review";
  }
  if (args.hasRunningTask || args.hasRecentActivity) {
    return "in-progress";
  }
  return "backlog";
}

/**
 * Group workspaces into lifecycle lanes in display order, dropping empty
 * lanes. Workspaces without a reported lifecycle default to `backlog`. Order
 * within a lane is preserved from the input. Generic so the renderer can pass
 * its own view-model type.
 */
export function groupFleetWorkspacesByLane<T extends { id: string }>(args: {
  workspaces: T[];
  lifecycleByWorkspaceId: Record<string, FleetLifecycleStatus | undefined>;
}): Array<{ lane: FleetLifecycleStatus; workspaces: T[] }> {
  const byLane = new Map<FleetLifecycleStatus, T[]>();
  for (const workspace of args.workspaces) {
    const lane = args.lifecycleByWorkspaceId[workspace.id] ?? "backlog";
    const bucket = byLane.get(lane);
    if (bucket) {
      bucket.push(workspace);
    } else {
      byLane.set(lane, [workspace]);
    }
  }
  const groups: Array<{ lane: FleetLifecycleStatus; workspaces: T[] }> = [];
  for (const lane of FLEET_LIFECYCLE_DISPLAY_ORDER) {
    const workspaces = byLane.get(lane);
    if (workspaces && workspaces.length > 0) {
      groups.push({ lane, workspaces });
    }
  }
  return groups;
}

export function countFleetAttentionTasks(args: {
  tasks: readonly FleetTaskStatusTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
}) {
  return collectFleetAttentionTasks(args).length;
}

/**
 * Count only runtime sessions that Fleet View can classify. Cold workspace
 * shell summaries intentionally remain out of this count because they do not
 * include messages or active-turn state.
 */
export function countFleetAttentionTasksAcrossWorkspaces(args: {
  workspaceIds: readonly string[];
  activeWorkspaceId?: string | null;
  activeSession?: FleetTaskStatusSession | null;
  runtimeSessionsByWorkspaceId: Record<
    string,
    FleetTaskStatusSession | undefined
  >;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
}) {
  let count = 0;

  for (const workspaceId of args.workspaceIds) {
    const session =
      workspaceId === args.activeWorkspaceId
        ? (args.activeSession ?? null)
        : (args.runtimeSessionsByWorkspaceId[workspaceId] ?? null);
    if (!session) {
      continue;
    }
    count += countFleetAttentionTasks({
      tasks: session.tasks,
      messagesByTask: session.messagesByTask,
      activeTurnIdsByTask: session.activeTurnIdsByTask,
      providerTurnActivityByTask: args.providerTurnActivityByTask,
    });
  }

  return count;
}
