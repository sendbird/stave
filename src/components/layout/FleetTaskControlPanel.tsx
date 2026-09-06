import { ArrowRight, CornerDownRight, ListPlus, Square, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { ConfirmationCompact } from "@/components/ai-elements/confirmation";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { TaskExecutionSummarySurface } from "@/components/layout/TaskExecutionSummarySurface";
import {
  ChildTaskParentBacklink,
  ChildTaskRows,
} from "@/components/session/ChildTaskRows";
import { useChildTasks } from "@/components/session/useChildTasks";
import { Button, Loader, Textarea } from "@/components/ui";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  validateFleetQueueAction,
  validateFleetTurnAction,
  type FleetInteractionControlIdentity,
  type FleetTaskControlIdentity,
} from "@/lib/fleet/control-plane";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { providerSupportsMidTurnSteering } from "@/lib/providers/model-catalog";
import { isTaskManaged } from "@/lib/tasks";
import { sx } from "@/components/ads/utils/stylex";
import { controlPanelStyles as styles } from "./fleet-task-control-panel.styles";
import { useAppStore } from "@/store/app.store";
import {
  findLatestPendingToolInteraction,
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: ChatMessage[] = [];

export interface FleetTaskControlTarget extends FleetTaskControlIdentity {
  taskTitle?: string;
}

export interface FleetTaskExpectedInteraction {
  kind: "approval" | "user-input";
  requestId: string;
  messageId?: string | null;
}

type FleetControlAction =
  "approval" | "user-input" | "steer" | "queue" | "stop";

function restoreTriggerFocus(elementId?: string) {
  if (!elementId) {
    return;
  }
  window.requestAnimationFrame(() => {
    document.getElementById(elementId)?.focus();
  });
}

function resolveActionStatus(
  result: Awaited<
    ReturnType<ReturnType<typeof useAppStore.getState>["sendUserMessage"]>
  >,
) {
  switch (result.status) {
    case "steered":
      return {
        tone: "success" as const,
        text: "Reply steered into the active turn.",
      };
    case "queued":
      return {
        tone: "success" as const,
        text: "Reply queued for the next turn.",
      };
    case "started":
      return {
        tone: "success" as const,
        text: "A new turn started with this reply.",
      };
    case "steer-unavailable":
    case "steer-delivery-unknown":
    case "send-failed":
      return { tone: "error" as const, text: result.message };
    case "blocked":
      return {
        tone: "error" as const,
        text:
          result.message ??
          "The task changed before the reply could be sent.",
      };
  }
}

export function FleetTaskControlPanel(args: {
  target: FleetTaskControlTarget;
  expectedInteraction?: FleetTaskExpectedInteraction;
  returnFocusElementId?: string;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onClose: () => void;
}) {
  const panelId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [
    activeProjectPath,
    activeWorkspaceId,
    activeTasks,
    activeMessagesByTask,
    activeWorkspaceTurnIdsByTask,
    runtimeState,
    activity,
    verification,
    rateLimits,
    midTurnSteeringEnabled,
    resolveApproval,
    resolveUserInput,
    sendUserMessage,
    abortTaskTurn,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.activeWorkspaceId,
          state.projectPath === args.target.projectPath &&
          state.activeWorkspaceId === args.target.workspaceId
            ? state.tasks
            : null,
          state.projectPath === args.target.projectPath &&
          state.activeWorkspaceId === args.target.workspaceId
            ? state.messagesByTask
            : null,
          state.projectPath === args.target.projectPath &&
          state.activeWorkspaceId === args.target.workspaceId
            ? state.activeTurnIdsByTask
            : null,
          state.workspaceRuntimeCacheById[args.target.workspaceId] ?? null,
          state.providerTurnActivityByTask[args.target.taskId] ?? null,
          state.turnVerificationByWorkspace[args.target.workspaceId] ?? null,
          state.rateLimitsSnapshot,
          state.settings.midTurnSteeringEnabled,
          state.resolveApproval,
          state.resolveUserInput,
          state.sendUserMessage,
          state.abortTaskTurn,
        ] as const,
    ),
  );
  const [reply, setReply] = useState("");
  const [busyAction, setBusyAction] = useState<FleetControlAction | null>(null);
  const [status, setStatus] = useState<{
    tone: "neutral" | "success" | "error";
    text: string;
  } | null>(null);
  const isActiveWorkspace =
    activeProjectPath === args.target.projectPath &&
    activeWorkspaceId === args.target.workspaceId;
  const tasks = isActiveWorkspace
    ? (activeTasks ?? [])
    : (runtimeState?.tasks ?? []);
  const messagesByTask = isActiveWorkspace
    ? (activeMessagesByTask ?? {})
    : (runtimeState?.messagesByTask ?? {});
  const currentTurnIdsByTask = isActiveWorkspace
    ? (activeWorkspaceTurnIdsByTask ?? {})
    : (runtimeState?.activeTurnIdsByTask ?? {});
  const task =
    tasks.find((candidate) => candidate.id === args.target.taskId) ?? null;
  const messages = messagesByTask[args.target.taskId] ?? EMPTY_MESSAGES;
  const activeTurnId = currentTurnIdsByTask[args.target.taskId] ?? null;
  const expectedTurnId = args.target.turnId ?? activeTurnId;
  const managed = isTaskManaged(task);
  const pendingInteraction = useMemo(() => {
    if (args.expectedInteraction?.kind === "approval") {
      return findPendingApprovalMessageByRequestId({
        messages,
        requestId: args.expectedInteraction.requestId,
      });
    }
    if (args.expectedInteraction?.kind === "user-input") {
      return findPendingUserInputMessageByRequestId({
        messages,
        requestId: args.expectedInteraction.requestId,
      });
    }
    return findLatestPendingToolInteraction({ messages });
  }, [args.expectedInteraction, messages]);
  const interactionTurnMatches =
    managed ||
    (Boolean(activeTurnId) &&
      (!expectedTurnId || activeTurnId === expectedTurnId));
  const pendingPart = interactionTurnMatches
    ? (pendingInteraction?.part ?? null)
    : null;
  const hasStaleExpectedInteraction =
    Boolean(args.expectedInteraction) &&
    (!pendingInteraction || !interactionTurnMatches);
  // The panel's agent count and its child rows must describe the same listing.
  // The count comes from the turn's work graph, and ledger-owned children only
  // reach that graph through this merge — previously it ran only when the Turn
  // Activity shelf was mounted, so a panel opened from Fleet could count fewer
  // agents than the rows it draws directly underneath.
  const childTasks = useChildTasks({
    parentTaskId: args.target.taskId,
    parentWorkspaceId: args.target.workspaceId,
    projectPath: args.target.projectPath,
  });
  const { children: childTaskRows } = childTasks;
  const childTaskSource = useMemo(
    () => ({ children: childTaskRows, actions: childTasks.actions }),
    [childTaskRows, childTasks.actions],
  );
  const syncChildTasksIntoTurnGraph = useAppStore(
    (state) => state.syncChildTasksIntoTurnGraph,
  );
  useEffect(() => {
    syncChildTasksIntoTurnGraph({
      taskId: args.target.taskId,
      children: childTaskRows,
    });
  }, [args.target.taskId, childTaskRows, syncChildTasksIntoTurnGraph]);
  const summary = useMemo(
    () =>
      buildTaskExecutionSummary({
        taskId: args.target.taskId,
        providerId: task?.provider ?? "claude-code",
        messages,
        activity,
        verification,
        rateLimits,
      }),
    [
      activity,
      args.target.taskId,
      messages,
      rateLimits,
      task?.provider,
      verification,
    ],
  );
  const canSteer =
    Boolean(activeTurnId) &&
    Boolean(task) &&
    !managed &&
    midTurnSteeringEnabled &&
    providerSupportsMidTurnSteering({
      providerId: task?.provider ?? "claude-code",
    });
  const canQuickReply =
    Boolean(activeTurnId) && Boolean(task) && !managed && !pendingPart;

  useEffect(
    () => () => {
      if (completionTimerRef.current != null) {
        window.clearTimeout(completionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const closePanel = () => {
    args.onClose();
    restoreTriggerFocus(args.returnFocusElementId);
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  };

  const getFreshCurrentState = () =>
    resolveFleetCurrentTaskControlState({
      state: useAppStore.getState(),
      expected: args.target,
    });

  const scheduleInteractionCompletionCheck = (
    expected: FleetInteractionControlIdentity,
  ) => {
    if (completionTimerRef.current != null) {
      window.clearTimeout(completionTimerRef.current);
    }
    completionTimerRef.current = window.setTimeout(() => {
      const validation = validateFleetInteractionAction({
        expected,
        current: getFreshCurrentState(),
      });
      setBusyAction(null);
      setStatus(
        validation.ok
          ? {
              tone: "neutral",
              text: "The provider is still processing this response.",
            }
          : {
              tone: "success",
              text: "Response delivered. The task can continue.",
            },
      );
    }, 900);
  };

  const runInteractionAction = (input: {
    kind: "approval" | "user-input";
    approved?: boolean;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => {
    if (!pendingInteraction || busyAction) {
      return;
    }
    const expected: FleetInteractionControlIdentity = {
      ...args.target,
      turnId: managed ? activeTurnId : expectedTurnId,
      kind: input.kind,
      requestId: pendingInteraction.part.requestId,
      messageId: pendingInteraction.messageId,
    };
    const validation = validateFleetInteractionAction({
      expected,
      current: getFreshCurrentState(),
    });
    if (!validation.ok) {
      setStatus({ tone: "error", text: validation.reason });
      return;
    }
    if (!validation.messageId) {
      setStatus({
        tone: "error",
        text: "The pending request no longer has a valid message target.",
      });
      return;
    }
    setBusyAction(input.kind);
    setStatus({ tone: "neutral", text: "Sending response…" });
    if (input.kind === "approval") {
      resolveApproval({
        taskId: args.target.taskId,
        messageId: validation.messageId,
        requestId: expected.requestId,
        approved: Boolean(input.approved),
      });
    } else {
      resolveUserInput({
        taskId: args.target.taskId,
        messageId: validation.messageId,
        requestId: expected.requestId,
        answers: input.answers,
        denied: input.denied,
      });
    }
    scheduleInteractionCompletionCheck(expected);
  };

  const sendQuickReply = async (intent: "steer" | "queue") => {
    const content = reply.trim();
    if (!content || busyAction || !activeTurnId) {
      return;
    }
    const expected = {
      ...args.target,
      turnId: activeTurnId,
    };
    const current = getFreshCurrentState();
    const validation =
      intent === "steer"
        ? validateFleetTurnAction({ expected, current })
        : validateFleetQueueAction({ expected, current });
    if (!validation.ok) {
      setStatus({ tone: "error", text: validation.reason });
      return;
    }
    setBusyAction(intent);
    setStatus({
      tone: "neutral",
      text: intent === "steer" ? "Steering reply…" : "Queueing reply…",
    });
    const result = await sendUserMessage({
      taskId: args.target.taskId,
      content,
      submitIntent: intent,
      turnOrigin: "conversation",
      preservePromptDraft: true,
    });
    const nextStatus = resolveActionStatus(result);
    setStatus(nextStatus);
    setBusyAction(null);
    if (
      result.status === "steered" ||
      result.status === "queued" ||
      result.status === "started"
    ) {
      setReply("");
    }
  };

  const stopTurn = () => {
    if (!activeTurnId || busyAction) {
      return;
    }
    const expected = {
      ...args.target,
      turnId: activeTurnId,
    };
    const validation = validateFleetTurnAction({
      expected,
      current: getFreshCurrentState(),
    });
    if (!validation.ok) {
      setStatus({ tone: "error", text: validation.reason });
      return;
    }
    setBusyAction("stop");
    abortTaskTurn({ taskId: args.target.taskId });
    setStatus({ tone: "success", text: "Stop requested for the active turn." });
    setBusyAction(null);
  };

  return (
    <section
      ref={panelRef}
      id={panelId}
      className={sx(styles.panel)}
      aria-label={`Controls for ${task?.title || args.target.taskTitle || "task"}`}
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerText)}>
          <h3 className={sx(styles.title)}>
            {task?.title || args.target.taskTitle || "Task controls"}
          </h3>
          <p className={sx(styles.subtitle)}>
            Review activity, answer requests, or direct the running agent.
          </p>
        </div>
        <div className={sx(styles.headerActions)}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.action}
            onClick={() => args.onOpenTask(args.target)}
          >
            Open task
            <ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            xstyle={styles.closeAction}
            aria-label="Close task controls"
            onClick={closePanel}
          >
            <X className={sx(styles.closeIcon)} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <TaskExecutionSummarySurface summary={summary} xstyle={styles.section} />

      <ChildTaskParentBacklink
        taskId={args.target.taskId}
        projectPath={args.target.projectPath}
        className={sx(styles.section)}
      />
      <ChildTaskRows
        parentTaskId={args.target.taskId}
        parentWorkspaceId={args.target.workspaceId}
        projectPath={args.target.projectPath}
        source={childTaskSource}
        className={sx(styles.section)}
      />

      {hasStaleExpectedInteraction ? (
        <div
          className={sx(styles.staleNotice)}
          role="status"
        >
          This request was already answered or expired. Open the task to review
          its latest state.
        </div>
      ) : null}

      {pendingPart?.type === "approval" ? (
        <div className={sx(styles.section)}>
          <ConfirmationCompact
            toolName={pendingPart.toolName}
            description={pendingPart.description}
            state={pendingPart.state}
            disabled={busyAction != null}
            disabledReason={
              busyAction ? "A response is being delivered." : undefined
            }
            comfortableActions
            showShortcutHint={false}
            truncateDescription={false}
            onApprove={() =>
              runInteractionAction({ kind: "approval", approved: true })
            }
            onReject={() =>
              runInteractionAction({ kind: "approval", approved: false })
            }
          />
        </div>
      ) : null}

      {pendingPart?.type === "user_input" ? (
        <div className={sx(styles.section)}>
          <UserInputCard
            toolName={pendingPart.toolName}
            questions={pendingPart.questions}
            state={pendingPart.state}
            answers={pendingPart.answers}
            disabled={busyAction != null}
            disabledReason={
              busyAction ? "A response is being delivered." : undefined
            }
            onSubmit={(answers) =>
              runInteractionAction({ kind: "user-input", answers })
            }
            onDeny={() =>
              runInteractionAction({ kind: "user-input", denied: true })
            }
          />
        </div>
      ) : null}

      {canQuickReply ? (
        <div className={sx(styles.replyCard)}>
          <label
            htmlFor={`${panelId}-quick-reply`}
            className={sx(styles.replyLabel)}
          >
            Quick reply
          </label>
          <p className={sx(styles.replyHint)}>
            Steer changes the active turn now; queue waits for the next turn.
          </p>
          <Textarea
            id={`${panelId}-quick-reply`}
            value={reply}
            disabled={busyAction != null}
            xstyle={styles.replyInput}
            placeholder="Add a correction, constraint, or next step…"
            onChange={(event) => setReply(event.target.value)}
          />
          <div className={sx(styles.replyActions)}>
            <Button
              type="button"
              size="sm"
              xstyle={styles.action}
              disabled={!reply.trim() || busyAction != null || !canSteer}
              title={
                canSteer
                  ? "Send into the active turn"
                  : midTurnSteeringEnabled
                    ? "This provider cannot steer the active turn"
                    : "Enable mid-turn steering in Settings → Chat"
              }
              onClick={() => void sendQuickReply("steer")}
            >
              {busyAction === "steer" ? (
                <Loader aria-hidden="true" size="xs" variant="parallel" />
              ) : (
                <CornerDownRight
                  className={sx(styles.actionIcon)}
                  aria-hidden="true"
                />
              )}
              Steer now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={styles.action}
              disabled={!reply.trim() || busyAction != null}
              onClick={() => void sendQuickReply("queue")}
            >
              {busyAction === "queue" ? (
                <Loader aria-hidden="true" size="xs" variant="parallel" />
              ) : (
                <ListPlus className={sx(styles.actionIcon)} aria-hidden="true" />
              )}
              Queue next
            </Button>
          </div>
        </div>
      ) : managed && activeTurnId && !pendingPart ? (
        <p className={sx(styles.managedNotice)}>
          This task is externally managed. Open it to attach before sending a
          reply.
        </p>
      ) : null}

      {activeTurnId ? (
        <div className={sx(styles.turnFooter)}>
          <p className={sx(styles.turnText)}>
            Turn{" "}
            <span className={sx(styles.turnId)}>{activeTurnId.slice(0, 8)}</span>{" "}
            is active.
          </p>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            xstyle={styles.action}
            disabled={busyAction != null}
            onClick={stopTurn}
          >
            <Square className={sx(styles.stopIcon)} aria-hidden="true" />
            Stop
          </Button>
        </div>
      ) : null}

      <p
        className={sx(
          styles.status,
          status?.tone === "error"
            ? styles.statusError
            : status?.tone === "success"
              ? styles.statusSuccess
              : styles.statusNeutral,
        )}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status?.text ?? ""}
      </p>
    </section>
  );
}
