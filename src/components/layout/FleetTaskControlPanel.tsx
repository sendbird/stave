import {
  ArrowRight,
  CornerDownRight,
  HeartPulse,
  ListPlus,
  LoaderCircle,
  Pause,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
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
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/ui";
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
import {
  applyRoutineCadencePreset,
  formatRoutineSchedule,
  ROUTINE_CADENCE_PRESENTATION,
  type RoutineCadencePreset,
  type RoutineSchedule,
} from "@/lib/routines";
import { isTaskManaged } from "@/lib/tasks";
import { cn } from "@/lib/utils";
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
  | "approval"
  | "user-input"
  | "steer"
  | "queue"
  | "stop"
  | "heartbeat";

/**
 * The cadence choices a heartbeat offers, drawn from the routine presets so the
 * two automation surfaces stay one vocabulary. `manual` is excluded because a
 * heartbeat has no Run now — a schedule is the whole trigger — and `custom` is
 * excluded because the raw every/unit/weekday editor belongs to the routine
 * form, not to a per-task control strip.
 */
const HEARTBEAT_CADENCE_PRESETS = [
  "every-15-minutes",
  "hourly",
  "daily",
  "weekdays",
] as const satisfies readonly RoutineCadencePreset[];

type HeartbeatCadencePreset = (typeof HEARTBEAT_CADENCE_PRESETS)[number];

/** Seed the preset resolver; every preset above replaces it outright. */
const HEARTBEAT_BASE_SCHEDULE: RoutineSchedule = { every: 1, unit: "hours" };

function resolveHeartbeatSchedule(preset: HeartbeatCadencePreset) {
  return applyRoutineCadencePreset({
    preset,
    schedule: HEARTBEAT_BASE_SCHEDULE,
    enabled: true,
  }).schedule;
}

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
      return { tone: "success" as const, text: "Reply steered into the active turn." };
    case "queued":
      return { tone: "success" as const, text: "Reply queued for the next turn." };
    case "started":
      return { tone: "success" as const, text: "A new turn started with this reply." };
    case "steer-unavailable":
    case "steer-delivery-unknown":
      return { tone: "error" as const, text: result.message };
    case "blocked":
      return {
        tone: "error" as const,
        text: "The task changed before the reply could be sent.",
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
    heartbeat,
    createTaskHeartbeat,
    setTaskHeartbeatPaused,
    removeTaskHeartbeat,
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
          state.taskHeartbeatSummariesByTaskId[args.target.taskId] ?? null,
          state.createTaskHeartbeat,
          state.setTaskHeartbeatPaused,
          state.removeTaskHeartbeat,
        ] as const,
    ),
  );
  const [reply, setReply] = useState("");
  const [heartbeatFormOpen, setHeartbeatFormOpen] = useState(false);
  const [heartbeatPrompt, setHeartbeatPrompt] = useState("");
  const [heartbeatCadence, setHeartbeatCadence] =
    useState<HeartbeatCadencePreset>("hourly");
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
  const summary = useMemo(
    () =>
      buildTaskExecutionSummary({
        taskId: args.target.taskId,
        providerId: task?.provider ?? "claude-code",
        messages,
        activity,
        verification,
        rateLimits,
        heartbeat,
      }),
    [
      activity,
      args.target.taskId,
      heartbeat,
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
    providerSupportsMidTurnSteering({ providerId: task?.provider ?? "claude-code" });
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

  /**
   * Every heartbeat gesture goes through here: the store actions answer with
   * `{ ok, message }` rather than throwing, so a refused pause or a host that
   * never loaded the supervisor reports itself in the same status line the
   * turn controls above already use.
   */
  const runHeartbeatAction = async (input: {
    run: () => Promise<{ ok: boolean; message?: string }>;
    pending: string;
    success: string;
    onSuccess?: () => void;
  }) => {
    if (busyAction) {
      return;
    }
    setBusyAction("heartbeat");
    setStatus({ tone: "neutral", text: input.pending });
    const result = await input.run();
    setBusyAction(null);
    if (!result.ok) {
      setStatus({
        tone: "error",
        text: result.message ?? "The heartbeat could not be updated.",
      });
      return;
    }
    input.onSuccess?.();
    setStatus({ tone: "success", text: input.success });
  };

  const addHeartbeat = () => {
    const prompt = heartbeatPrompt.trim();
    if (!prompt) {
      return;
    }
    void runHeartbeatAction({
      pending: "Adding heartbeat…",
      success: "Heartbeat added.",
      onSuccess: () => {
        setHeartbeatFormOpen(false);
        setHeartbeatPrompt("");
      },
      run: () =>
        createTaskHeartbeat({
          input: {
            workspaceId: args.target.workspaceId,
            taskId: args.target.taskId,
            prompt,
            trigger: {
              kind: "schedule",
              schedule: resolveHeartbeatSchedule(heartbeatCadence),
            },
            // No cap and no expiry from this control: both are limits the user
            // would have to be able to see and edit later, and this strip only
            // adds, pauses, and removes.
            maxOccurrences: null,
            expiresAt: null,
          },
        }),
    });
  };

  const toggleHeartbeatPaused = () => {
    if (!heartbeat) {
      return;
    }
    const paused = heartbeat.state !== "paused";
    void runHeartbeatAction({
      pending: paused ? "Pausing heartbeat…" : "Resuming heartbeat…",
      success: paused ? "Heartbeat paused." : "Heartbeat resumed.",
      run: () =>
        setTaskHeartbeatPaused({ id: heartbeat.heartbeatId, paused }),
    });
  };

  const dropHeartbeat = () => {
    if (!heartbeat) {
      return;
    }
    void runHeartbeatAction({
      pending: "Removing heartbeat…",
      success: "Heartbeat removed.",
      run: () => removeTaskHeartbeat({ id: heartbeat.heartbeatId }),
    });
  };

  return (
    <section
      ref={panelRef}
      id={panelId}
      className="border-t border-border/60 bg-surface/35 px-4 py-3 focus:outline-none"
      aria-label={`Controls for ${task?.title || args.target.taskTitle || "task"}`}
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {task?.title || args.target.taskTitle || "Task controls"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Review activity, answer requests, or direct the running agent.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            onClick={() => args.onOpenTask(args.target)}
          >
            Open task
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="min-h-9 min-w-9"
            aria-label="Close task controls"
            onClick={closePanel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <TaskExecutionSummarySurface summary={summary} className="mt-3" />

      <div className="mt-3 rounded-md border border-border/60 bg-background/55 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <HeartPulse className="size-3.5 shrink-0" aria-hidden="true" />
              Heartbeat
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {heartbeat
                ? heartbeat.state === "scheduled"
                  ? `Wakes this task on its own · ${heartbeat.occurrenceCount} occurrence${heartbeat.occurrenceCount === 1 ? "" : "s"}`
                  : `Not running · ${heartbeat.occurrenceCount} occurrence${heartbeat.occurrenceCount === 1 ? "" : "s"} so far`
                : "Wake this task on a schedule without opening it."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {heartbeat ? (
              <>
                {/* A stopped heartbeat is terminal — the host refuses to resume
                    it — so only Remove is offered once it has ended. */}
                {heartbeat.state === "stopped" ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    disabled={busyAction != null}
                    onClick={toggleHeartbeatPaused}
                  >
                    {busyAction === "heartbeat" ? (
                      <LoaderCircle
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : heartbeat.state === "paused" ? (
                      <Play className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Pause className="size-3.5" aria-hidden="true" />
                    )}
                    {heartbeat.state === "paused" ? "Resume" : "Pause"}
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="min-h-9 min-w-9"
                  aria-label="Remove heartbeat"
                  title="Remove heartbeat"
                  disabled={busyAction != null}
                  onClick={dropHeartbeat}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                disabled={busyAction != null}
                onClick={() => setHeartbeatFormOpen((open) => !open)}
              >
                {heartbeatFormOpen ? "Cancel" : "Add heartbeat"}
              </Button>
            )}
          </div>
        </div>

        {/* The reason sentence is the point of a non-running heartbeat: it is
            the only place the supervisor explains why it stopped waking. */}
        {heartbeat && heartbeat.state !== "scheduled" ? (
          <p
            className="mt-2 rounded-md border border-warning/35 bg-warning/8 px-3 py-2 text-[11px] text-warning"
            role="status"
          >
            {heartbeat.state === "paused" ? "Paused" : "Stopped"}
            {heartbeat.reason ? ` · ${heartbeat.reason}` : ""}
          </p>
        ) : null}

        {!heartbeat && heartbeatFormOpen ? (
          <div className="mt-3 border-t border-border/55 pt-3">
            <label
              htmlFor={`${panelId}-heartbeat-prompt`}
              className="text-xs font-medium text-foreground"
            >
              Standing instruction
            </label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Sent to this task on every wake, in the same session.
            </p>
            <Textarea
              id={`${panelId}-heartbeat-prompt`}
              value={heartbeatPrompt}
              disabled={busyAction != null}
              className="mt-2 min-h-16 resize-y bg-background"
              placeholder="Re-check CI and report only on a change…"
              onChange={(event) => setHeartbeatPrompt(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={heartbeatCadence}
                disabled={busyAction != null}
                onValueChange={(value) =>
                  setHeartbeatCadence(value as HeartbeatCadencePreset)
                }
              >
                <SelectTrigger
                  id={`${panelId}-heartbeat-cadence`}
                  aria-label="Heartbeat cadence"
                  className="h-9 w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEARTBEAT_CADENCE_PRESETS.map((preset) => (
                    <SelectItem key={preset} value={preset}>
                      {ROUTINE_CADENCE_PRESENTATION[preset].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="min-h-9"
                disabled={!heartbeatPrompt.trim() || busyAction != null}
                onClick={addHeartbeat}
              >
                {busyAction === "heartbeat" ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <HeartPulse className="size-3.5" aria-hidden="true" />
                )}
                Add
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {formatRoutineSchedule(resolveHeartbeatSchedule(heartbeatCadence))}
              {" · "}
              {ROUTINE_CADENCE_PRESENTATION[heartbeatCadence].detail}
            </p>
          </div>
        ) : null}
      </div>

      {hasStaleExpectedInteraction ? (
        <div
          className="mt-3 rounded-md border border-warning/35 bg-warning/8 px-3 py-2 text-xs text-warning"
          role="status"
        >
          This request was already answered or expired. Open the task to review
          its latest state.
        </div>
      ) : null}

      {pendingPart?.type === "approval" ? (
        <div className="mt-3">
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
        <div className="mt-3">
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
        <div className="mt-3 rounded-md border border-border/60 bg-background/55 p-3">
          <label
            htmlFor={`${panelId}-quick-reply`}
            className="text-xs font-medium text-foreground"
          >
            Quick reply
          </label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Steer changes the active turn now; queue waits for the next turn.
          </p>
          <Textarea
            id={`${panelId}-quick-reply`}
            value={reply}
            disabled={busyAction != null}
            className="mt-2 min-h-20 resize-y bg-background"
            placeholder="Add a correction, constraint, or next step…"
            onChange={(event) => setReply(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-9"
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
                <LoaderCircle
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <CornerDownRight className="size-3.5" aria-hidden="true" />
              )}
              Steer now
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-9"
              disabled={!reply.trim() || busyAction != null}
              onClick={() => void sendQuickReply("queue")}
            >
              {busyAction === "queue" ? (
                <LoaderCircle
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ListPlus className="size-3.5" aria-hidden="true" />
              )}
              Queue next
            </Button>
          </div>
        </div>
      ) : managed && activeTurnId && !pendingPart ? (
        <p className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          This task is externally managed. Open it to attach before sending a
          reply.
        </p>
      ) : null}

      {activeTurnId ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/55 pt-3">
          <p className="min-w-0 text-[11px] text-muted-foreground">
            Turn <span className="font-mono">{activeTurnId.slice(0, 8)}</span>{" "}
            is active.
          </p>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="min-h-9"
            disabled={busyAction != null}
            onClick={stopTurn}
          >
            <Square className="size-3.5 fill-current" aria-hidden="true" />
            Stop
          </Button>
        </div>
      ) : null}

      <p
        className={cn(
          "mt-2 min-h-4 text-[11px]",
          status?.tone === "error"
            ? "text-destructive"
            : status?.tone === "success"
              ? "text-success"
              : "text-muted-foreground",
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
