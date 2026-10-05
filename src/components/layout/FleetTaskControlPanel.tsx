import { i18n, useTranslation, Trans } from "@/i18n";
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
  DelegatedTaskParentBacklink,
  DelegatedTaskRows,
} from "@/components/session/DelegatedTaskRows";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
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
        text: i18n.t("fleet:fleetTaskControlPanel.replySteeredIntoTheActiveTurn"),
      };
    case "queued":
      return {
        tone: "success" as const,
        text: i18n.t("fleet:fleetTaskControlPanel.replyQueuedForTheNextTurn"),
      };
    case "started":
      return {
        tone: "success" as const,
        text: i18n.t("fleet:fleetTaskControlPanel.aNewTurnStartedWithThisReply"),
      };
    case "run-started":
      return {
        tone: "success" as const,
        text: i18n.t("fleet:fleetTaskControlPanel.theAgentStartedARunWithThis"),
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
          i18n.t("fleet:fleetTaskControlPanel.theTaskChangedBeforeTheReplyCould"),
      };
  }
}

export function FleetTaskControlPanel(args: {
  target: FleetTaskControlTarget;
  expectedInteraction?: FleetTaskExpectedInteraction;
  /** Answer the pinned request without offering task navigation or execution controls. */
  interactionOnly?: boolean;
  returnFocusElementId?: string;
  onOpenTask: (target: FleetTaskControlTarget) => void;
  onClose: () => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const panelId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [
    activeRepositoryPath,
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
          state.repositoryPath,
          state.activeWorkspaceId,
          state.repositoryPath === args.target.repositoryPath &&
          state.activeWorkspaceId === args.target.workspaceId
            ? state.tasks
            : null,
          state.repositoryPath === args.target.repositoryPath &&
          state.activeWorkspaceId === args.target.workspaceId
            ? state.messagesByTask
            : null,
          state.repositoryPath === args.target.repositoryPath &&
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
    activeRepositoryPath === args.target.repositoryPath &&
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
  }, [args.expectedInteraction, messages, i18n.resolvedLanguage]);
  const interactionTurnMatches =
    (!args.interactionOnly && managed) ||
    (Boolean(activeTurnId) &&
      (!expectedTurnId || activeTurnId === expectedTurnId));
  const interactionMessageMatches = !args.expectedInteraction?.messageId || pendingInteraction?.messageId === args.expectedInteraction.messageId;
  const pendingPart = interactionTurnMatches && interactionMessageMatches
    ? (pendingInteraction?.part ?? null)
    : null;
  const hasStaleExpectedInteraction =
    Boolean(args.expectedInteraction) &&
    (!pendingInteraction || !interactionTurnMatches || !interactionMessageMatches);
  // The panel's agent count and its child rows must describe the same listing.
  // The count comes from the turn's work graph, and ledger-owned children only
  // reach that graph through this merge — previously it ran only when the Turn
  // Activity shelf was mounted, so a panel opened from Fleet could count fewer
  // agents than the rows it draws directly underneath.
  const delegatedTasks = useDelegatedTasks({
    parentTaskId: args.target.taskId,
    parentWorkspaceId: args.target.workspaceId,
    repositoryPath: args.target.repositoryPath,
    enabled: !args.interactionOnly,
  });
  const { children: delegatedTaskRows } = delegatedTasks;
  const delegatedTaskSource = useMemo(
    () => ({ children: delegatedTaskRows, actions: delegatedTasks.actions }),
    [delegatedTaskRows, delegatedTasks.actions, i18n.resolvedLanguage],
  );
  const syncDelegatedTasksIntoTurnGraph = useAppStore(
    (state) => state.syncDelegatedTasksIntoTurnGraph,
  );
  useEffect(() => {
    if (args.interactionOnly) return;
    syncDelegatedTasksIntoTurnGraph({
      taskId: args.target.taskId,
      children: delegatedTaskRows,
    });
  }, [args.interactionOnly, args.target.taskId, delegatedTaskRows, syncDelegatedTasksIntoTurnGraph]);
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
      verification, i18n.resolvedLanguage],
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
    !args.interactionOnly && Boolean(activeTurnId) && Boolean(task) && !managed && !pendingPart;

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
      const current = getFreshCurrentState();
      const validation = validateFleetInteractionAction({ expected, current });
      const identityChanged = args.interactionOnly && (current.turnId !== expected.turnId ||
        !current.messages.some(message => message.id === expected.messageId));
      setBusyAction(null);
      setStatus(
        identityChanged ? { tone: "neutral", text: tI18n("fleet:fleetTaskControlPanel.theRequestChangedDeliveryCannotBeConfirmed") } : validation.ok
          ? {
              tone: "neutral",
              text: tI18n("fleet:fleetTaskControlPanel.theProviderIsStillProcessingThisResponse"),
            }
          : {
              tone: "success",
              text: tI18n("fleet:fleetTaskControlPanel.responseDeliveredTheTaskCanContinue"),
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
      turnId: args.interactionOnly ? expectedTurnId : managed ? activeTurnId : expectedTurnId,
      kind: input.kind,
      requestId: pendingInteraction.part.requestId,
      messageId: args.expectedInteraction?.messageId ?? pendingInteraction.messageId,
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
        text: tI18n("fleet:fleetTaskControlPanel.thePendingRequestNoLongerHasA"),
      });
      return;
    }
    setBusyAction(input.kind);
    setStatus({ tone: "neutral", text: tI18n("fleet:fleetTaskControlPanel.sendingResponse") });
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
    const freshState = useAppStore.getState();
    const targetRuntimeOverrides =
      (freshState.activeWorkspaceId === args.target.workspaceId
        ? freshState.promptDraftByTask[args.target.taskId]
        : freshState.workspaceRuntimeCacheById[args.target.workspaceId]
            ?.promptDraftByTask[args.target.taskId]
      )?.runtimeOverrides;
    setBusyAction(intent);
    setStatus({
      tone: "neutral",
      text: intent === "steer" ? tI18n("fleet:fleetTaskControlPanel.steeringReply") : tI18n("fleet:fleetTaskControlPanel.queueingReply"),
    });
    const result = await sendUserMessage({
      taskId: args.target.taskId,
      content,
      submitIntent: intent,
      turnOrigin: "conversation",
      preservePromptDraft: true,
      runtimeOverrides: targetRuntimeOverrides,
    });
    const nextStatus = resolveActionStatus(result);
    setStatus(nextStatus);
    setBusyAction(null);
    if (
      result.status === "steered" ||
      result.status === "queued" ||
      result.status === "started" ||
      result.status === "run-started"
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
    setStatus({ tone: "success", text: tI18n("fleet:fleetTaskControlPanel.stopRequestedForTheActiveTurn") });
    setBusyAction(null);
  };

  return (
    <section
      ref={panelRef}
      id={panelId}
      className={sx(styles.panel)}
      aria-label={tI18n("fleet:fleetTaskControlPanel.controlsForValue", { value1: task?.title || args.target.taskTitle || "task" })}
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerText)}>
          <h3 className={sx(styles.title)}>
            {args.interactionOnly ? (args.expectedInteraction?.kind === "approval" ? tI18n("fleet:fleetTaskControlPanel.approvalRequested") : tI18n("fleet:fleetTaskControlPanel.question")) : task?.title || args.target.taskTitle || tI18n("fleet:fleetTaskControlPanel.taskControls")}
          </h3>
          {!args.interactionOnly ? <p className={sx(styles.subtitle)}>
            {tI18n("fleet:fleetTaskControlPanel.reviewActivityAnswerRequestsOrDirectThe")}</p> : null}
        </div>
        <div className={sx(styles.headerActions)}>
          {!args.interactionOnly ? <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.action}
            onClick={() => args.onOpenTask(args.target)}
          >
            {tI18n("fleet:fleetTaskControlPanel.openTask")}<ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
          </Button> : null}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            xstyle={styles.closeAction}
            aria-label={args.interactionOnly ? tI18n("fleet:fleetTaskControlPanel.closeRequest") : tI18n("fleet:fleetTaskControlPanel.closeTaskControls")}
            onClick={closePanel}
          >
            <X className={sx(styles.closeIcon)} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {!args.interactionOnly ? <><TaskExecutionSummarySurface summary={summary} xstyle={styles.section} />

      <DelegatedTaskParentBacklink
        taskId={args.target.taskId}
        repositoryPath={args.target.repositoryPath}
        className={sx(styles.section)}
      />
      <DelegatedTaskRows
        parentTaskId={args.target.taskId}
        parentWorkspaceId={args.target.workspaceId}
        repositoryPath={args.target.repositoryPath}
        source={delegatedTaskSource}
        className={sx(styles.section)}
      /></> : null}

      {hasStaleExpectedInteraction ? (
        <div
          className={sx(styles.staleNotice)}
          role="status"
        >
          {args.interactionOnly ? tI18n("fleet:fleetTaskControlPanel.thisRequestWasAnsweredExpiredOrBelongs") : tI18n("fleet:fleetTaskControlPanel.thisRequestWasAlreadyAnsweredOrExpired")}
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
              busyAction ? i18n.t("fleet:additionalCopy.message4") : undefined
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
              busyAction ? i18n.t("fleet:additionalCopy.message5") : undefined
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
            {tI18n("fleet:fleetTaskControlPanel.quickReply")}</label>
          <p className={sx(styles.replyHint)}>
            {tI18n("fleet:fleetTaskControlPanel.steerChangesTheActiveTurnNowQueue")}</p>
          <Textarea
            id={`${panelId}-quick-reply`}
            value={reply}
            disabled={busyAction != null}
            xstyle={styles.replyInput}
            placeholder={tI18n("fleet:fleetTaskControlPanel.addACorrectionConstraintOrNextStep")}
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
                  ? tI18n("fleet:fleetTaskControlPanel.sendIntoTheActiveTurn")
                  : midTurnSteeringEnabled
                    ? tI18n("fleet:fleetTaskControlPanel.thisProviderCannotSteerTheActiveTurn")
                    : tI18n("fleet:fleetTaskControlPanel.enableMidTurnSteeringInSettingsChat")
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
              {tI18n("fleet:fleetTaskControlPanel.steerNow")}</Button>
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
              {tI18n("fleet:fleetTaskControlPanel.queueNext")}</Button>
          </div>
        </div>
      ) : !args.interactionOnly && managed && activeTurnId && !pendingPart ? (
        <p className={sx(styles.managedNotice)}>
          {tI18n("fleet:fleetTaskControlPanel.thisTaskIsExternallyManagedOpenIt")}</p>
      ) : null}

      {activeTurnId && !args.interactionOnly ? (
        <div className={sx(styles.turnFooter)}>
          <p className={sx(styles.turnText)}>
          <Trans t={tI18n} i18nKey="fleet:fleetTaskControlPanel.activeTurn" values={{ id: activeTurnId.slice(0, 8) }} components={{ turn: <span className={sx(styles.turnId)} /> }} />
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
            {tI18n("fleet:fleetTaskControlPanel.stop")}</Button>
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
