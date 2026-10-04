import type { PendingApprovalQueueItem } from "@/components/session/chat-input-approval-queue";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import type { TurnActivityPlacement } from "@/store/app-settings";
import {
  resolveUsageLimitAutoResumeAt,
  type QueuePauseReason,
  type UsageLimitPauseByTask,
} from "@/store/task-work-pause";
import type { ChatMessage, PromptDraftQueuedTurn } from "@/types/chat";
import { buildAgentRunFixtures } from "../agent-run-preview/agent-run-fixtures";
import { createPreviewActivity } from "./fixtures";

/**
 * Composer shelf states for `?stavePreview=composer-frame&case=<id>`. Each case
 * seeds the real stores, so the preview renders the shelf the app renders —
 * `ComposerShelf` reads the turn, the agent run and the queue exactly as it does
 * in a task.
 */
export const SHELF_CASES = [
  { id: "idle", label: "Idle" },
  { id: "running", label: "Running" },
  { id: "queued", label: "Queued" },
  { id: "needs-input", label: "Needs input" },
  { id: "stalled", label: "Stalled" },
  { id: "steering", label: "Steering" },
  { id: "agent", label: "Agent run" },
  { id: "agent-staged", label: "Staged run" },
  { id: "agent-needs", label: "Run needs you" },
  { id: "limited", label: "Usage limit" },
  { id: "limited-armed", label: "Resume at reset" },
  { id: "restored", label: "Restored queue" },
] as const;

export type ShelfCaseId = (typeof SHELF_CASES)[number]["id"];

export function isShelfCaseId(value: string | null): value is ShelfCaseId {
  return SHELF_CASES.some((item) => item.id === value);
}

export const PREVIEW_TASK_ID = "preview-task";
export const PREVIEW_WORKSPACE_ID = "preview-workspace";
const PREVIEW_TURN_ID = "preview-turn";

const PREVIEW_TODOS = [
  { content: "Read the composer frame and the shelf hosts", status: "completed" },
  { content: "Map placement to where details open", status: "completed" },
  { content: "Fold the run bar into one run line", status: "completed" },
  { content: "Move the queue into the shelf", status: "in_progress" },
  { content: "Collapse the shelf by default", status: "pending" },
  { content: "Check every built-in theme", status: "pending" },
  { content: "Open the stacked PR", status: "pending" },
];

const APPROVAL_PART = {
  type: "approval" as const,
  toolName: "Bash",
  description: "Run `bun test tests/composer-frame.test.tsx`",
  input: JSON.stringify({ command: "bun test tests/composer-frame.test.tsx" }),
  requestId: "approval-preview",
  state: "approval-requested" as const,
};

export const PREVIEW_APPROVALS: readonly PendingApprovalQueueItem[] = [
  { messageId: "assistant-approval", part: APPROVAL_PART },
];

export const PREVIEW_QUEUE: readonly PromptDraftQueuedTurn[] = [
  {
    id: "queue-1",
    queuedAt: "2026-10-02T09:00:00.000Z",
    sourceTurnId: PREVIEW_TURN_ID,
    content: "Actually check the migration too, then rerun the focused tests",
    attachedFilePaths: [],
    attachments: [],
  },
  {
    id: "queue-2",
    queuedAt: "2026-10-02T09:01:00.000Z",
    sourceTurnId: PREVIEW_TURN_ID,
    content: "Then compare it with the screenshot I attached",
    attachedFilePaths: ["docs/screenshots/composer.png"],
    attachments: [],
    providerId: "codex",
    model: "gpt-5.5",
  },
  {
    id: "queue-3",
    queuedAt: "2026-10-02T09:02:00.000Z",
    sourceTurnId: PREVIEW_TURN_ID,
    content: "Write the PR body last",
    attachedFilePaths: [],
    attachments: [],
  },
];

function todoMessage(): ChatMessage {
  return {
    id: "assistant-todos",
    role: "assistant",
    model: "claude-opus-5-5",
    providerId: "claude-code",
    turnId: PREVIEW_TURN_ID,
    content: "",
    isStreaming: true,
    parts: [
      {
        type: "tool_use",
        toolUseId: "todo-1",
        toolName: "TodoWrite",
        input: JSON.stringify({ todos: PREVIEW_TODOS }),
        state: "output-available",
      },
    ],
  } as ChatMessage;
}

function approvalMessage(): ChatMessage {
  return {
    id: "assistant-approval",
    role: "assistant",
    model: "claude-opus-5-5",
    providerId: "claude-code",
    turnId: PREVIEW_TURN_ID,
    content: "",
    isStreaming: true,
    parts: [APPROVAL_PART],
  } as ChatMessage;
}

function activityFor(caseId: ShelfCaseId): ProviderTurnActivitySnapshot {
  const activity = createPreviewActivity();
  if (caseId === "needs-input") {
    return { ...activity, pendingInteraction: "approval" };
  }
  if (caseId === "stalled") {
    const lastEventAt = Date.now() - 2 * 60_000 - 14_000;
    return { ...activity, lastEventAt, stalledAt: lastEventAt + 90_000 };
  }
  return { ...activity, lastEventAt: Date.now() };
}

function agentRunFor(caseId: ShelfCaseId): AgentRunDetail | null {
  const runs = buildAgentRunFixtures(new Date(Date.now() - 4 * 60_000));
  switch (caseId) {
    case "agent":
      return runs.working;
    case "agent-staged":
      return runs.workflow;
    case "agent-needs":
      return runs.needsYou;
    default:
      return null;
  }
}

/** Puts the stores in the case's state. Idle clears the turn, the agent run and the queue. */
export function seedShelfCase(args: {
  caseId: ShelfCaseId;
  placement: TurnActivityPlacement;
  detailsOpen: boolean;
}) {
  const { caseId } = args;
  const turnLive = isShelfCaseTurnLive(caseId);
  const messages = turnLive
    ? caseId === "needs-input"
      ? [todoMessage(), approvalMessage()]
      : [todoMessage()]
    : [];
  useAppStore.setState((state) => ({
    activeTaskId: PREVIEW_TASK_ID,
    activeWorkspaceId: PREVIEW_WORKSPACE_ID,
    activeTurnIdsByTask: turnLive ? { [PREVIEW_TASK_ID]: PREVIEW_TURN_ID } : {},
    providerTurnActivityByTask: turnLive ? { [PREVIEW_TASK_ID]: activityFor(caseId) } : {},
    retainedTurnActivityByTask: {},
    messagesByTask: { [PREVIEW_TASK_ID]: messages },
    usageLimitPauseByTask: usageLimitPauseFor(caseId),
    restoredQueueReleasedByTask: {},
    settings: {
      ...state.settings,
      turnActivityPlacement: args.placement,
      turnActivityExpandedByDefault: args.detailsOpen,
    },
  }));
  const agentRun = agentRunFor(caseId);
  const key = agentRunTaskKey(PREVIEW_WORKSPACE_ID, PREVIEW_TASK_ID);
  useAgentRunsStore.setState({
    workspaceId: PREVIEW_WORKSPACE_ID,
    loadedWorkspaceId: PREVIEW_WORKSPACE_ID,
    agentRunIdByTask: agentRun ? { [key]: agentRun.agentRun.id } : {},
    details: agentRun ? { [agentRun.agentRun.id]: agentRun } : {},
  });
}

const IDLE_CASES: readonly ShelfCaseId[] = ["idle", "agent-needs", "limited", "limited-armed", "restored"];

export function isShelfCaseTurnLive(caseId: ShelfCaseId) {
  return !IDLE_CASES.includes(caseId);
}

function usageLimitPauseFor(caseId: ShelfCaseId): UsageLimitPauseByTask {
  if (caseId !== "limited" && caseId !== "limited-armed") {
    return {};
  }
  const resetsAt = Date.now() + 67 * 60_000;
  return {
    [PREVIEW_TASK_ID]: {
      workspaceId: PREVIEW_WORKSPACE_ID,
      providerId: "claude-code",
      stoppedTurn: true,
      pausedAt: Date.now() - 3 * 60_000,
      resetsAt,
      windowLabel: "Session",
      ...(caseId === "limited-armed"
        ? { autoResumeAt: resolveUsageLimitAutoResumeAt({ resetsAt, now: Date.now() }) ?? undefined }
        : {}),
    },
  };
}

export function caseHasQueue(caseId: ShelfCaseId) {
  return (
    caseId === "queued" ||
    caseId === "steering" ||
    caseId === "limited" ||
    caseId === "limited-armed" ||
    caseId === "restored"
  );
}

export function queuePauseFor(caseId: ShelfCaseId): QueuePauseReason | null {
  if (caseId === "limited" || caseId === "limited-armed") {
    return "usage-limit";
  }
  return caseId === "restored" ? "restart" : null;
}
