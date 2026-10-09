import { i18n } from "@/i18n/runtime";
import {
  classifyProviderTurnStopReason,
  resolveProviderTurnDisplayState,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import type { ProviderId } from "@/lib/providers/provider.types";
import { getRespondingProviderId, isTaskArchived } from "@/lib/tasks";
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

type FleetTaskStatusTask = Pick<Task, "id" | "archivedAt" | "updatedAt">;

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

function isProviderErrorSystemPart(part: ChatMessage["parts"][number]) {
  return (
    part.type === "system_event" &&
    part.content.trimStart().toLowerCase().startsWith(ERROR_SYSTEM_EVENT_PREFIX)
  );
}

/**
 * A later part that shows the turn kept working. Another failed tool does not:
 * the run is still sitting on a failure.
 */
function turnContinuedAfterError(parts: ChatMessage["parts"], errorIndex: number) {
  return parts.slice(errorIndex + 1).some((part) => {
    switch (part.type) {
      case "text":
      case "thinking":
        return part.text.trim().length > 0;
      case "tool_use":
        return part.state !== "output-error";
      case "code_diff":
      case "approval":
      case "user_input":
        return true;
      default:
        return false;
    }
  });
}

/**
 * Whether the latest assistant row still represents a failure a person needs
 * to see.
 *
 * An error event stays in the transcript for the whole turn. That history is
 * not the task's current state once the turn keeps going, or once it finishes
 * without a failure stop. A turn that ends on the error, or that stops for a
 * failure, still needs the alert.
 */
function latestAssistantFailureNeedsAttention(messages: ChatMessage[]) {
  const latestMessage = messages.at(-1);
  if (latestMessage?.role !== "assistant") {
    return false;
  }

  if (latestMessage.terminalReceipt?.completedAt) {
    return latestMessage.terminalReceipt.outcome === "failed";
  }

  let lastErrorIndex = -1;
  latestMessage.parts.forEach((part, index) => {
    if (isProviderErrorSystemPart(part)) {
      lastErrorIndex = index;
    }
  });
  if (lastErrorIndex < 0) {
    return false;
  }

  const stopReason = latestMessage.terminalStopReason?.trim();
  if (stopReason) {
    const outcome = classifyProviderTurnStopReason(stopReason);
    if (outcome === "failed") {
      return true;
    }
    if (outcome === "cancelled") {
      return false;
    }
  }

  if (turnContinuedAfterError(latestMessage.parts, lastErrorIndex)) {
    return false;
  }

  return true;
}

export function classifyTaskStatus(args: {
  task: FleetTaskStatusTask;
  messages?: ChatMessage[];
  activeTurnId?: string | null;
  activity?: ProviderTurnActivitySnapshot | null;
}): FleetTaskStatus {
  if (isTaskArchived(args.task)) {
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
  if (turnState === "stalled" || latestAssistantFailureNeedsAttention(messages)) {
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
  repositoryName: string;
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

  return [args.taskTitle, args.workspaceName, args.repositoryName].some((value) =>
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
