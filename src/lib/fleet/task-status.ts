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
  | "waiting-input"
  | "waiting-approval"
  | "error"
  | "running"
  | "idle";

export const FLEET_TASK_STATUS_PRIORITY: Record<FleetTaskStatus, number> = {
  "waiting-input": 0,
  "waiting-approval": 1,
  error: 2,
  running: 3,
  idle: 4,
};

type FleetTaskStatusTask = Pick<
  Task,
  "id" | "archivedAt" | "coliseumParentTaskId"
>;

type FleetRespondingTask = FleetTaskStatusTask & Pick<Task, "provider">;

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

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
  | "in-progress"
  | "in-review"
  | "backlog"
  | "done";

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
  tasks: FleetTaskStatusTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: ProviderTurnActivityByTask;
}) {
  let count = 0;

  for (const task of args.tasks) {
    const status = classifyTaskStatus({
      task,
      messages: args.messagesByTask[task.id] ?? EMPTY_MESSAGES,
      activeTurnId: args.activeTurnIdsByTask[task.id] ?? null,
      activity: args.providerTurnActivityByTask[task.id] ?? null,
    });
    if (hasFleetTaskAttentionStatus(status)) {
      count += 1;
    }
  }

  return count;
}
