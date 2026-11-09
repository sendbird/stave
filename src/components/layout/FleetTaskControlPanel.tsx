import { i18n, useTranslation, Trans } from "@/i18n";
import { ArrowRight, CornerDownRight, ListPlus, Pause, Square, UserRoundCheck, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { UserInputCard } from "@/components/ai-elements/user-input-card";
import { TaskExecutionSummarySurface } from "@/components/layout/TaskExecutionSummarySurface";
import {
  DelegatedTaskParentBacklink,
  DelegatedTaskRows,
} from "@/components/session/DelegatedTaskRows";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
import {
  APPROVAL_DELIVERY_GUARD_MS,
  ToolApprovalCard,
} from "@/components/session/ToolApprovalCard";
import { Button, Loader, Textarea } from "@/components/ui";
import { Tooltip } from "@/components/aui/components/Tooltip";
import {
  resolveFleetCurrentTaskControlState,
  validateFleetInteractionAction,
  validateFleetQueueAction,
  validateFleetTurnAction,
  type FleetInteractionControlIdentity,
  type FleetTaskControlIdentity,
} from "@/lib/fleet/control-plane";
import {
  isOtherRepositoryInteraction,
  loadFleetInteraction,
} from "@/lib/fleet/interaction-load";
import { fleetInteractionOutlivesTurn } from "@/lib/fleet/interaction-respond";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { providerSupportsMidTurnSteering } from "@/lib/providers/model-catalog";
import { isTaskManaged } from "@/lib/tasks";
import { resolveApprovalRequesterName } from "@/lib/approvals/approval-requester";
import { sx } from "@/components/aui/utils/stylex";
import { controlPanelStyles as styles } from "./fleet-task-control-panel.styles";
import { useAppStore } from "@/store/app.store";
import {
  findLatestPendingToolInteraction,
  findPendingApprovalMessageByRequestId,
  findPendingUserInputMessageByRequestId,
} from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";
import { TarsOwnerBadge } from "@/components/tars/TarsOwnerBadge";
import { useTarsOwner, useTarsSnapshotRefresh } from "@/store/tars-snapshot-store";
import { routeTarsOwnedIntent, tarsOwnedOutcomeMessage, tarsStopEndsTurn, type TarsOwnedControlOutcome } from "@/store/tars-owned-control";
import { findActiveTaskRun, isRecordedUserTurn, tarsTaskTarget, type TarsOwnedIntent } from "@/lib/tars/ownership";
import { useFleetTaskRun } from "@/components/tars/fleet-tars-owner";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";

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
  "approval" | "user-input" | "steer" | "queue" | "stop" | "takeover";

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

/** The panel's status once Tars settled a stop or take-over: what changed, or the translated refusal. */
export function describeFleetTarsOutcome(outcome: Exclude<TarsOwnedControlOutcome, { kind: "direct" | "held" }>) {
  const message = tarsOwnedOutcomeMessage(outcome);
  return { tone: message.tone, text: i18n.t(message.key) };
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
  const { t: tI18n } = useTranslation(["fleet", "shell"]);
  const panelId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
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
  // A host-owned turn answers through the host, like a managed task.
  const hostOwnedTurn = useAppStore(
    (state) =>
      activeTurnId != null &&
      state.hostOwnedTurnIdsByTask[args.target.taskId] === activeTurnId,
  );
  const answersThroughHost = managed || hostOwnedTurn;
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
  // As in the row: a question that did not pause its turn outlives it.
  const outlivesTurn = fleetInteractionOutlivesTurn(pendingInteraction?.part);
  const interactionTurnMatches =
    outlivesTurn ||
    (!args.interactionOnly && managed) ||
    (Boolean(activeTurnId) &&
      (!expectedTurnId || activeTurnId === expectedTurnId));
  const interactionMessageMatches = !args.expectedInteraction?.messageId || pendingInteraction?.messageId === args.expectedInteraction.messageId;
  const pendingPart = interactionTurnMatches && interactionMessageMatches
    ? (pendingInteraction?.part ?? null)
    : null;
  const pendingRequester =
    pendingPart?.type === "approval" && pendingPart.ownerAgentId
      ? resolveApprovalRequesterName({
          parts: messages.find((message) => message.id === pendingInteraction?.messageId)?.parts,
          ownerAgentId: pendingPart.ownerAgentId,
        })
      : null;
  // A request in a workspace nobody has opened yet is not "answered": its task
  // is read on demand (open repository only) before anything is judged stale.
  const taskLoaded = Boolean(task) && messagesByTask[args.target.taskId] !== undefined;
  const otherRepository = isOtherRepositoryInteraction(args.target, {
    repositoryPath: activeRepositoryPath,
  });
  const expectedIdentity = useMemo(
    () =>
      args.expectedInteraction
        ? {
            repositoryPath: args.target.repositoryPath,
            workspaceId: args.target.workspaceId,
            taskId: args.target.taskId,
            turnId: args.target.turnId ?? null,
            kind: args.expectedInteraction.kind,
            requestId: args.expectedInteraction.requestId,
            messageId: args.expectedInteraction.messageId ?? null,
          }
        : null,
    [
      args.expectedInteraction,
      args.target.repositoryPath,
      args.target.taskId,
      args.target.turnId,
      args.target.workspaceId,
    ],
  );
  const [requestLoad, setRequestLoad] = useState<{
    status: "idle" | "loading" | "failed";
    error?: string;
  }>({ status: "idle" });
  const needsRequestLoad = Boolean(expectedIdentity) && !taskLoaded && !otherRepository;
  useEffect(() => {
    if (!needsRequestLoad || !expectedIdentity) {
      return;
    }
    let active = true;
    setRequestLoad({ status: "loading" });
    loadFleetInteraction(expectedIdentity).then(
      () => {
        if (active) setRequestLoad({ status: "idle" });
      },
      (cause: unknown) => {
        if (!active) return;
        setRequestLoad({
          status: "failed",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      },
    );
    return () => {
      active = false;
    };
  }, [expectedIdentity, needsRequestLoad]);
  const hasStaleExpectedInteraction =
    Boolean(args.expectedInteraction) &&
    taskLoaded &&
    (!pendingInteraction || !interactionTurnMatches || !interactionMessageMatches);
  const requestNotice = !args.expectedInteraction || taskLoaded
    ? null
    : otherRepository
      ? { tone: "neutral" as const, text: tI18n("fleet:inlineAnswer.otherRepository") }
      : requestLoad.status === "failed"
        ? { tone: "error" as const, text: requestLoad.error ?? tI18n("fleet:inlineAnswer.loadFailed") }
        : { tone: "neutral" as const, text: tI18n("fleet:inlineAnswer.loading") };
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
    () => ({ children: delegatedTaskRows, actions: delegatedTasks.actions, error: delegatedTasks.error }),
    [delegatedTaskRows, delegatedTasks.actions, delegatedTasks.error, i18n.resolvedLanguage],
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
  // Work an active Tars responsibility holds: its stop and take-over go through
  // Tars, so the responsibility follows and the conversation records them.
  // Judged by the task's own active run, as the task view does: a run you started there is never Tars's.
  const fleetRun = useFleetTaskRun(args.target.workspaceId, args.target.taskId);
  const tarsOwner = useTarsOwner(tarsTaskTarget(args.target.taskId, args.target.workspaceId, fleetRun));
  useTarsSnapshotRefresh(!args.interactionOnly);
  // Once Tars paused it there is nothing to pause; Stop then ends only your own turn.
  const tarsPauses = tarsOwner !== null && tarsOwner.state !== "paused";

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

  // A sent answer keeps the controls busy until the request leaves pending —
  // its recorded state says how it ended — or the delivery guard passes, so a
  // delivery that failed silently can be retried.
  const [sentRequestId, setSentRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!sentRequestId) {
      return;
    }
    if (pendingInteraction?.part.requestId === sentRequestId) {
      const timer = window.setTimeout(() => {
        setSentRequestId(null);
        setBusyAction(null);
        setStatus({
          tone: "neutral",
          text: tI18n("fleet:fleetTaskControlPanel.theProviderIsStillProcessingThisResponse"),
        });
      }, APPROVAL_DELIVERY_GUARD_MS);
      return () => window.clearTimeout(timer);
    }
    const recorded = messages
      .flatMap((message) => message.parts)
      .find(
        (part) =>
          (part.type === "approval" || part.type === "user_input") &&
          part.requestId === sentRequestId,
      );
    const interrupted =
      recorded?.type === "approval"
        ? recorded.state === "approval-interrupted"
        : recorded?.type === "user_input"
          ? recorded.state === "input-interrupted"
          : true;
    setSentRequestId(null);
    setBusyAction(null);
    setStatus(
      interrupted
        ? {
            tone: "neutral",
            text: tI18n("fleet:fleetTaskControlPanel.theRequestChangedDeliveryCannotBeConfirmed"),
          }
        : {
            tone: "success",
            text: tI18n("fleet:fleetTaskControlPanel.responseDeliveredTheTaskCanContinue"),
          },
    );
  }, [messages, pendingInteraction, sentRequestId, tI18n]);

  const runInteractionAction = (input: {
    kind: "approval" | "user-input";
    approved?: boolean;
    scope?: "once" | "always";
    answers?: Record<string, string>;
    denied?: boolean;
  }) => {
    if (!pendingInteraction || busyAction) {
      return;
    }
    const expected: FleetInteractionControlIdentity = {
      ...args.target,
      turnId: fleetInteractionOutlivesTurn(pendingInteraction.part)
        ? null
        : args.interactionOnly
          ? expectedTurnId
          : managed
            ? activeTurnId
            : expectedTurnId,
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
        ...(input.approved && input.scope === "always"
          ? { scope: "always" as const }
          : {}),
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
    setSentRequestId(expected.requestId);
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

  /**
   * Stop and take over. Work Tars holds goes through Tars's control path
   * (a stop pauses it; a take-over never cancels its run), and a stop then
   * ends only the in-flight turn. Other work stops its active turn as before,
   * after the same fresh identity check.
   */
  const runOwnershipControl = async (intent: TarsOwnedIntent) => {
    if (busyAction) {
      return;
    }
    const turnId = intent === "pause" ? activeTurnId : null;
    const expected = { ...args.target, turnId };
    if (turnId) {
      const validation = validateFleetTurnAction({ expected, current: getFreshCurrentState() });
      if (!validation.ok) {
        setStatus({ tone: "error", text: validation.reason });
        return;
      }
    }
    setBusyAction(intent === "pause" ? "stop" : "takeover");
    const runs = useFleetAgentRunsStore.getState();
    const run = findActiveTaskRun(runs.details, args.target.workspaceId, args.target.taskId) ?? (runs.loaded ? null : undefined);
    const outcome = await routeTarsOwnedIntent({
      target: tarsTaskTarget(args.target.taskId, args.target.workspaceId, run),
      intent,
      source: "fleet",
    });
    if (outcome.kind === "direct" && !turnId) {
      setStatus({ tone: "neutral", text: i18n.t("shell:tars.owner.notHeld") });
      setBusyAction(null);
      return;
    }
    // The ownership read took a moment: the turn must still be the one shown.
    const validation = turnId ? validateFleetTurnAction({ expected, current: getFreshCurrentState() }) : null;
    // A pause Tars refused or could not send leaves the run going: only your own turn stops then.
    if (validation?.ok && tarsStopEndsTurn(outcome, isRecordedUserTurn(run?.events, turnId))) {
      // Tars already settled the run, so only the turn stops; the store never cancels Tars's run either.
      abortTaskTurn({ taskId: args.target.taskId, keepAgentRun: outcome.kind !== "direct" });
    }
    if (outcome.kind === "held") {
      setStatus(turnId
        ? { tone: "success", text: i18n.t("shell:tars.owner.turnOnly") }
        : { tone: "neutral", text: i18n.t("shell:tars.controlReasons.alreadyPaused") });
    } else if (outcome.kind !== "direct") {
      setStatus(describeFleetTarsOutcome(outcome));
    } else if (validation?.ok) {
      setStatus({ tone: "success", text: tI18n("fleet:fleetTaskControlPanel.stopRequestedForTheActiveTurn") });
    } else if (validation) {
      setStatus({ tone: "error", text: validation.reason });
    }
    setBusyAction(null);
  };

  const stopTurn = () => {
    if (!activeTurnId && !tarsPauses) {
      return;
    }
    void runOwnershipControl("pause");
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
          {tarsOwner ? <TarsOwnerBadge /> : null}
          {!args.interactionOnly ? <Button
            type="button"
            size="sm"
            variant="outline"
            xstyle={styles.action}
            onClick={() => args.onOpenTask(args.target)}
          >
            {tI18n("fleet:fleetTaskControlPanel.openTask")}<ArrowRight className={sx(styles.actionIcon)} aria-hidden="true" />
          </Button> : null}
          <Tooltip content={args.interactionOnly ? tI18n("fleet:fleetTaskControlPanel.closeRequest") : tI18n("fleet:fleetTaskControlPanel.closeTaskControls")}>
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
          </Tooltip>
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

      {requestNotice ? (
        <div
          className={sx(
            styles.staleNotice,
            requestNotice.tone === "error" && styles.statusError,
          )}
          role={requestNotice.tone === "error" ? "alert" : "status"}
        >
          {requestNotice.text}
        </div>
      ) : null}

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
          {/* A managed task or a host-owned turn answers through the host,
              which keeps no standing grant, so it is not offered "Always
              allow" (the same rule as the transcript and the composer). */}
          <ToolApprovalCard
            allowAlways={!answersThroughHost}
            busy={busyAction === "approval"}
            density="compact"
            disabled={busyAction != null}
            note={
              busyAction != null && busyAction !== "approval" ? (
                <span className={sx(styles.replyHint)}>
                  {i18n.t("fleet:additionalCopy.message4")}
                </span>
              ) : undefined
            }
            onDecide={(decision) =>
              runInteractionAction({
                kind: "approval",
                approved: decision.approved,
                scope: decision.scope,
              })
            }
            part={pendingPart}
            requestedBy={pendingRequester ?? undefined}
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

      {(activeTurnId || tarsOwner) && !args.interactionOnly ? (
        <div className={sx(styles.turnFooter)}>
          <div className={sx(styles.headerText)}>
            {tarsOwner ? <p className={sx(styles.turnText)}>{tI18n("shell:tars.owner.fleetHint")}</p> : null}
            {activeTurnId ? <p className={sx(styles.turnText)}>
              <Trans t={tI18n} i18nKey="fleet:fleetTaskControlPanel.activeTurn" values={{ id: activeTurnId.slice(0, 8) }} components={{ turn: <span className={sx(styles.turnId)} /> }} />
            </p> : null}
          </div>
          <div className={sx(styles.headerActions)}>
            {tarsOwner ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                xstyle={styles.action}
                disabled={busyAction != null}
                onClick={() => void runOwnershipControl("takeover")}
              >
                <UserRoundCheck className={sx(styles.actionIcon)} aria-hidden="true" />
                {tI18n("shell:tars.takeOver")}</Button>
            ) : null}
            {tarsPauses ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                xstyle={styles.action}
                disabled={busyAction != null}
                onClick={stopTurn}
              >
                <Pause className={sx(styles.actionIcon)} aria-hidden="true" />
                {tI18n("shell:tars.pause")}</Button>
            ) : activeTurnId ? (
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
            ) : null}
          </div>
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
