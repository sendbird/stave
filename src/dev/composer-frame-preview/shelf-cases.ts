import type { PendingApprovalQueueItem } from "@/components/session/chat-input-approval-queue";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { buildReviewRecheckPrompt, parseReviewFindings } from "@/lib/reviews/review-findings";
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
  { id: "reviews", label: "Reviews" },
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
      {
        type: "thinking",
        text: "**Checking the shelf**\n\nThe run line already names the tool, so only the newest thought goes under it, held to two lines.",
        isStreaming: true,
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
    messagesByTask: {
      [PREVIEW_TASK_ID]: messages,
      ...(caseId === "reviews" ? previewReviewMessages() : {}),
    },
    usageLimitPauseByTask: usageLimitPauseFor(caseId),
    restoredQueueReleasedByTask: {},
    settings: {
      ...state.settings,
      turnActivityPlacement: args.placement,
      turnActivityExpandedByDefault: args.detailsOpen,
    },
  }));
  seedPreviewReviews(caseId);
  const agentRun = agentRunFor(caseId);
  const key = agentRunTaskKey(PREVIEW_WORKSPACE_ID, PREVIEW_TASK_ID);
  useAgentRunsStore.setState({
    workspaceId: PREVIEW_WORKSPACE_ID,
    loadedWorkspaceId: PREVIEW_WORKSPACE_ID,
    agentRunIdByTask: agentRun ? { [key]: agentRun.agentRun.id } : {},
    details: agentRun ? { [agentRun.agentRun.id]: agentRun } : {},
  });
}

const IDLE_CASES: readonly ShelfCaseId[] = [
  "idle",
  "agent-needs",
  "limited",
  "limited-armed",
  "restored",
  "reviews",
];

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
      accountProfileId: "system-default",
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

// ── Reviews ────────────────────────────────────────────────────────────────
// The shelf reads reviews from the delegation ledger over the desktop bridge.
// The browser preview has no bridge, so the case installs a listing-only stand-in.

function previewReview(args: {
  key: string;
  providerId: DelegatedTaskSummary["providerId"];
  model: string;
  phase: DelegatedTaskSummary["phase"];
  startedMsAgo: number;
  settledMsAgo?: number;
  reason?: string;
}): DelegatedTaskSummary {
  const now = Date.now();
  const createdAt = new Date(now - args.startedMsAgo).toISOString();
  const settledAt =
    args.settledMsAgo === undefined ? null : new Date(now - args.settledMsAgo).toISOString();
  return {
    runId: `run-${args.key}`,
    stepId: `step-${args.key}`,
    parentTaskId: PREVIEW_TASK_ID,
    delegationKey: args.key,
    delegatedTaskId: `task-${args.key}`,
    delegatedWorkspaceId: PREVIEW_WORKSPACE_ID,
    delegatedTurnId: null,
    providerId: args.providerId,
    requestedModel: args.model,
    lifecycle: "one-turn",
    phase: args.phase,
    reason: args.reason ?? null,
    attempt: 1,
    createdAt,
    updatedAt: settledAt ?? createdAt,
    completedAt: settledAt,
  };
}

const reviewListeners = new Set<(payload: { parentTaskId: string }) => void>();
let previewReviews: DelegatedTaskSummary[] = [];
let previewReviewsInstalled = false;

function seedPreviewReviews(caseId: ShelfCaseId) {
  previewReviews =
    caseId === "reviews"
      ? [
          previewReview({
            key: "stave-review-preview-running",
            providerId: "codex",
            model: "gpt-5.5",
            phase: "running",
            startedMsAgo: 75_000,
          }),
          previewReview({
            key: "stave-review-preview-ready",
            providerId: "claude-code",
            model: "claude-opus-5-5",
            phase: "completed",
            startedMsAgo: 6 * 60_000,
            settledMsAgo: 40_000,
          }),
          previewReview({
            key: "stave-review-preview-failed",
            providerId: "codex",
            model: "gpt-5.5",
            phase: "failed",
            startedMsAgo: 9 * 60_000,
            settledMsAgo: 2 * 60_000,
            reason: "The workspace HEAD moved before the review started.",
          }),
        ]
      : [];
  // The desktop app has a real bridge; the stand-in is for the browser only.
  if (
    typeof window === "undefined" ||
    (window.api?.runs?.delegateTask && !previewReviewsInstalled)
  ) {
    return;
  }
  // Only the Reviews case installs the stand-in; later cases just empty it.
  if (caseId !== "reviews" && !previewReviewsInstalled) {
    return;
  }
  previewReviewsInstalled = true;
  const api = (window.api ?? {}) as NonNullable<typeof window.api>;
  window.api = {
    ...api,
    runs: {
      ...api.runs,
      listDelegatedTasks: async () => previewReviews,
      getReviewRevision: async () => {
        const state = new URLSearchParams(window.location.search).get("revision");
        if (state === "unknown") return {
          source: { status: "unknown", reason: "unavailable" },
          completed: { status: "unknown", reason: "unavailable" },
          current: { status: "known", revision: "preview-current" },
        };
        return {
          source: { status: "known", revision: "preview-source" },
          completed: { status: "known", revision: state === "during" ? "preview-completed" : "preview-source" },
          current: { status: "known", revision: state === "changed" ? "preview-current" : state === "during" ? "preview-completed" : "preview-source" },
        };
      },
      delegateTask: async () => ({
        accepted: false,
        duplicate: false,
        reason: null,
        message: "The preview cannot start reviews.",
        child: null,
      }),
      onDelegatedTasksChanged: (callback) => {
        reviewListeners.add(callback);
        return () => reviewListeners.delete(callback);
      },
    },
  } as typeof window.api;
  for (const listener of reviewListeners) {
    listener({ parentTaskId: PREVIEW_TASK_ID });
  }
}

/** What the finished review task holds, so View shows a real transcript. */
function previewReviewMessages(): Record<string, ChatMessage[]> {
  const taskId = "task-stave-review-preview-ready";
  const messages = {
    [taskId]: [
      {
        id: "review-request",
        role: "user",
        model: "",
        providerId: "user",
        content: "Review only the current uncommitted working tree before it is committed or pushed.",
        parts: [],
      },
      {
        id: "review-answer",
        role: "assistant",
        model: "claude-opus-5-5",
        providerId: "claude-code",
        content: [
          "**Findings**",
          "",
          "1. High: `use-shelf-reviews.ts` keeps a dismissed review only for the session.",
          "2. Medium: the composer test does not cover a queued attachment.",
          "",
          "Residual risk: the live provider path was not exercised.",
          "",
          "```stave-review-findings",
          JSON.stringify({
            verdict: "request-changes",
            findings: [
              {
                id: "F1",
                severity: "critical",
                title: "Dismissed reviews return after a restart",
                file: "src/components/session/composer-shelf/use-shelf-reviews.ts",
                line: 45,
                detail: "Dismissal is held in session memory only.",
                fix: "Persist dismissed keys per task.",
              },
              {
                id: "F2",
                severity: "major",
                title: "Queued attachment is not covered",
                file: "tests/composer-shelf.test.ts",
                line: null,
                detail: "No test queues a message carrying a review chip.",
              },
              { id: "F3", severity: "minor", title: "Tooltip copy is long", file: null, line: null },
            ],
          }),
          "```",
        ].join("\n"),
        parts: [
          {
            type: "tool_use",
            toolUseId: "review-diff",
            toolName: "Bash",
            input: JSON.stringify({ command: "git diff --stat" }),
            output: " src/components/session/composer-shelf/ShelfReviews.tsx | 40 +++++",
            state: "output-available",
          },
          {
            type: "tool_use",
            toolUseId: "review-read",
            toolName: "Read",
            input: JSON.stringify({ file_path: "src/components/session/composer-shelf/use-shelf-reviews.ts" }),
            output: "export function useShelfReviews(taskId: string) {",
            state: "output-available",
          },
        ],
      },
    ] as ChatMessage[],
  };
  if (new URLSearchParams(window.location.search).get("recheck") === "incomplete") {
    const [prompt, answer] = messages[taskId]!;
    const findings = parseReviewFindings(answer!.content);
    if (findings.ok) {
      prompt!.content = buildReviewRecheckPrompt({ originalPrompt: prompt!.content, report: findings.report });
      answer!.content = "```stave-review-findings\n" + JSON.stringify({
        verdict: "approve", findings: [],
        previous: [{ id: "F1", status: "resolved" }, { id: "F2", status: "outdated" }],
      }) + "\n```";
    }
  }
  return messages;
}
