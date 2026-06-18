import {
  resolveProviderTurnDisplayState,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
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
