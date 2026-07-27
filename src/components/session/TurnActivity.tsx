import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleAlert,
  CirclePause,
  ClipboardList,
  ListChecks,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { findLatestTodoPart } from "@/components/session/todo-floater.utils";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  formatTurnActivityCountsLabel,
  partitionTurnActivityItems,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
  type TurnActivityIconKey,
  type TurnActivityItem,
  type TurnActivityRowStatus,
  type TurnActivityTodo,
} from "@/components/session/turn-activity.utils";
import { Button } from "@/components/ui";
import {
  formatProviderTurnElapsedDuration,
  formatProviderTurnIdleDuration,
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
  type ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import { resolvePromptDraftRuntimeState } from "@/store/prompt-draft-runtime";
import type { ChatMessage, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const TURN_ACTIVITY_FAILURE_LINGER_MS = 5_000;
/** Matches the exit animation below so the shelf collapses instead of popping. */
const TURN_ACTIVITY_EXIT_MS = 180;

const TURN_ACTIVITY_ICONS: Record<TurnActivityIconKey, LucideIcon> = {
  alert: CircleAlert,
  pause: CirclePause,
  plan: ListChecks,
  subagent: Bot,
  todo: ClipboardList,
  tool: Wrench,
};

function useTurnClock(activeTurnId: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeTurnId) {
      return;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeTurnId]);

  return now;
}

function getCurrentTurnWorkItems(args: {
  activity: ProviderTurnActivitySnapshot | null;
  activeTurnId: string | null;
}) {
  if (!args.activity || args.activity.turnId !== args.activeTurnId) {
    return [];
  }
  return args.activity.orderedWorkItemIds.flatMap((id) => {
    const item = args.activity?.workItemsById[id];
    return item ? [item] : [];
  });
}

function getLatestPlanMessages(messages: ChatMessage[]) {
  const lastMessage = messages.at(-1) ?? null;
  let latestPlanMessage: ChatMessage | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message?.role === "assistant" &&
      message.isPlanResponse &&
      message.planText?.trim()
    ) {
      latestPlanMessage = message;
      break;
    }
  }
  return { latestPlanMessage, lastMessage };
}

export function TurnActivity() {
  const taskId = useScopedTaskId();
  const [
    activeTask,
    draftProvider,
    promptDraft,
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    codexPlanMode,
    messages,
    activeTurnId,
    activity,
    expandedByDefault,
  ] = useAppStore(
    useShallow((state) => [
      state.tasks.find((task) => task.id === taskId) ?? null,
      state.draftProvider,
      state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT,
      state.settings.claudePermissionMode,
      state.settings.claudePermissionModeBeforePlan,
      state.settings.codexPlanMode,
      state.messagesByTask[taskId] ?? EMPTY_MESSAGES,
      state.activeTurnIdsByTask[taskId] ?? null,
      state.providerTurnActivityByTask[taskId] ?? null,
      state.settings.turnActivityExpandedByDefault,
    ]),
  );
  const activeProvider = activeTask?.provider ?? draftProvider;
  const taskRuntimeState = resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
    },
  });
  const { latestPlanMessage, lastMessage } = useMemo(
    () => getLatestPlanMessages(messages),
    [messages],
  );
  const { isPlanPreparing, isPlanPending } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: taskRuntimeState.claudePermissionMode,
    codexPlanMode: taskRuntimeState.codexPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive: Boolean(activeTurnId),
  });
  const todoPart = useMemo(
    () => findLatestTodoPart(messages, activeTurnId),
    [activeTurnId, messages],
  );
  const todos = useMemo<TurnActivityTodo[]>(() => {
    const derivedTodos = todoPart
      ? deriveTodoTraceItems({
          input: todoPart.input,
          state: todoPart.state,
        })
      : [];
    return activeTurnId
      ? promoteFirstPendingTodoForActiveTurn(derivedTodos)
      : derivedTodos;
  }, [activeTurnId, todoPart]);
  const workItems = useMemo(
    () =>
      getCurrentTurnWorkItems({
        activity,
        activeTurnId,
      }),
    [activeTurnId, activity],
  );
  const hasRetainedFailure = Boolean(
    !activeTurnId && activity?.turnError && activity.completedAt,
  );
  const hasPendingInteractionCard = useMemo(
    () => findLatestPendingToolInteraction({ messages }) != null,
    [messages],
  );
  const currentActivity =
    activity?.turnId === activeTurnId || hasRetainedFailure ? activity : null;
  const shouldShow = resolveTurnActivityVisibility({
    isTurnActive: Boolean(activeTurnId),
    isPlanPending,
    hasRetainedFailure,
    hasPendingInteractionCard,
  });

  useEffect(() => {
    if (activeTurnId || !activity?.turnError || activity.completedAt == null) {
      return;
    }
    const remainingMs = Math.max(
      0,
      TURN_ACTIVITY_FAILURE_LINGER_MS - (Date.now() - activity.completedAt),
    );
    const failedTurnId = activity.turnId;
    const timer = window.setTimeout(() => {
      useAppStore.setState((state) => {
        const current = state.providerTurnActivityByTask[taskId];
        if (
          current?.turnId !== failedTurnId ||
          current.completedAt !== activity.completedAt
        ) {
          return state;
        }
        return {
          providerTurnActivityByTask: clearProviderTurnActivity({
            activityByTask: state.providerTurnActivityByTask,
            taskId,
          }),
        };
      });
    }, remainingMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeTurnId,
    activity?.completedAt,
    activity?.turnError,
    activity?.turnId,
    taskId,
  ]);

  const surfaceProps = useMemo<TurnActivitySurfaceProps | null>(() => {
    if (!shouldShow) {
      return null;
    }
    return {
      activeTurnId: activeTurnId ?? currentActivity?.turnId ?? "",
      activity: currentActivity,
      isPlanPreparing,
      workItems,
      todos,
      expandedByDefault,
    };
  }, [
    activeTurnId,
    currentActivity,
    expandedByDefault,
    isPlanPreparing,
    shouldShow,
    todos,
    workItems,
  ]);
  // Keep the last visible snapshot around for one exit animation so the shelf
  // shrinks away instead of yanking the composer down when a turn ends.
  const lastVisiblePropsRef = useRef<TurnActivitySurfaceProps | null>(null);
  const [, forceExitRender] = useReducer((value: number) => value + 1, 0);
  if (surfaceProps) {
    lastVisiblePropsRef.current = surfaceProps;
  }
  const leavingProps = surfaceProps ? null : lastVisiblePropsRef.current;

  useEffect(() => {
    if (surfaceProps || !lastVisiblePropsRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      lastVisiblePropsRef.current = null;
      forceExitRender();
    }, TURN_ACTIVITY_EXIT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [surfaceProps]);

  const visibleProps = surfaceProps ?? leavingProps;
  if (!visibleProps) {
    return null;
  }

  return (
    <TurnActivitySurface
      key={`${taskId}:${visibleProps.activeTurnId}`}
      {...visibleProps}
      isLeaving={leavingProps != null}
    />
  );
}

interface TurnActivitySurfaceProps {
  activeTurnId: string;
  activity: ProviderTurnActivitySnapshot | null;
  isPlanPreparing: boolean;
  workItems: ProviderTurnWorkItem[];
  todos: TurnActivityTodo[];
  /**
   * Setting-backed default for the expanded list. A manual toggle overrides it
   * for the rest of the turn; the surface is keyed per turn, so the next turn
   * falls back to the setting again.
   */
  expandedByDefault?: boolean;
  /** Renders the exit animation while the shelf is being torn down. */
  isLeaving?: boolean;
}

export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const expandedByDefault = props.expandedByDefault ?? true;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const expanded = expandedOverride ?? expandedByDefault;
  const now = useTurnClock(
    props.activity?.completedAt == null ? props.activeTurnId : null,
  );
  const isStalled =
    props.activity?.stalledAt != null &&
    props.activity.completedAt == null &&
    props.activity.pendingInteraction == null;
  const summary = resolveTurnActivitySummary({
    pendingInteraction: props.activity?.pendingInteraction ?? null,
    isStalled,
    isPlanPreparing: props.isPlanPreparing,
    workItems: props.workItems,
    todos: props.todos,
  });
  const elapsedLabel = formatProviderTurnElapsedDuration({
    activity: props.activity,
    now: props.activity?.completedAt ?? now,
  });
  const idleLabel = formatProviderTurnIdleDuration({
    activity: props.activity,
    now,
  });
  const activityItems = buildTurnActivityItems({
    activity: props.activity,
    idleLabel,
    isPlanPreparing: props.isPlanPreparing,
    isStalled,
    todos: props.todos,
    workItems: props.workItems,
  });
  const counts = countTurnActivityItems(activityItems);
  const { active: activeItems, completed: completedItems } =
    partitionTurnActivityItems(activityItems);
  const featuredItem = activityItems[0] ?? null;
  const hiddenItems = activityItems.slice(1);
  const hiddenSeverity = resolveTurnActivityHiddenSeverity(hiddenItems);
  const orbState = resolveTurnActivityOrbState({
    activity: props.activity,
    isPlanPreparing: props.isPlanPreparing,
    workItems: props.workItems,
  });
  // Attention states name themselves better than any count can, so they keep
  // the summary label even while the list is open.
  const needsAttention =
    props.activity?.pendingInteraction != null ||
    isStalled ||
    props.activity?.turnError != null;
  const countsLabel = formatTurnActivityCountsLabel(counts);
  const headline = expanded
    ? needsAttention
      ? summary.label
      : (countsLabel ?? summary.label)
    : (featuredItem?.title ?? summary.label);
  const headlineDetail =
    !expanded && featuredItem?.detail && featuredItem.detail !== headline
      ? featuredItem.detail
      : null;
  const canExpand = activityItems.length > 0;
  // `0/4` says nothing, so the ratio only appears once work has landed.
  const showProgress = counts.totalCount > 1 && counts.completedCount > 0;

  return (
    <div
      data-testid="turn-activity-stack"
      className={cn(
        // The shelf slides under the prompt input: `-mb-3` pulls the composer
        // up over the surface's extra `pb-3`, so the squared bottom edge reads
        // as tucked behind the composer instead of floating above it.
        "relative z-0 mx-3 -mb-3",
        props.isLeaving
          ? "pointer-events-none motion-safe:animate-out motion-safe:fade-out motion-safe:slide-out-to-bottom-2 motion-safe:fill-mode-forwards"
          : "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        "motion-reduce:transition-none",
      )}
    >
      <section
        aria-label="Turn activity"
        data-testid="turn-activity"
        className={cn(
          "turn-activity-surface relative flex min-h-0 flex-col overflow-hidden rounded-t-xl rounded-b-none bg-card pb-3",
          "transition-[box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none",
        )}
      >
        <div
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2.5 px-3 py-2",
            expanded && canExpand && "border-b border-border/50 bg-muted/10",
          )}
        >
          <span
            data-testid="turn-activity-orb"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/55"
          >
            <ThinkingOrb
              state={orbState}
              size={20}
              speed={0.82}
              paused={
                isStalled ||
                props.activity?.pendingInteraction != null ||
                props.activity?.completedAt != null
              }
              theme="auto"
              aria-hidden="true"
              className="size-5"
            />
          </span>
          <h2 className="sr-only">Turn activity</h2>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate text-[0.8125rem] leading-5"
            title={
              headlineDetail ? `${headline} · ${headlineDetail}` : headline
            }
          >
            <span className="font-medium text-foreground">{headline}</span>
            {headlineDetail ? (
              <span className="text-muted-foreground"> · {headlineDetail}</span>
            ) : null}
          </p>
          {showProgress ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              data-testid="turn-activity-progress"
            >
              <span className="sr-only">
                {counts.completedCount} of {counts.totalCount} activities done
              </span>
              <span aria-hidden="true">
                {counts.completedCount}/{counts.totalCount}
              </span>
            </span>
          ) : null}
          {!expanded && hiddenItems.length > 0 ? (
            <span
              className={cn(
                "shrink-0 text-[11px] font-medium tabular-nums",
                hiddenSeverity === "failed"
                  ? "text-destructive"
                  : hiddenSeverity === "waiting"
                    ? "text-warning"
                    : "text-muted-foreground",
              )}
              aria-label={`${hiddenItems.length} more activities`}
            >
              +{hiddenItems.length}
            </span>
          ) : null}
          {elapsedLabel ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              title={`Elapsed time: ${elapsedLabel}`}
            >
              <span className="sr-only">Turn elapsed </span>
              {elapsedLabel}
            </span>
          ) : null}
          {canExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-expanded={expanded}
              aria-label={
                expanded ? "Minimize turn activity" : "Expand turn activity"
              }
              onClick={() => setExpandedOverride(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronUp className="size-3.5" />
              )}
            </Button>
          ) : null}
        </div>

        {expanded && canExpand ? (
          <div className="max-h-[min(12rem,28vh)] min-h-0 overflow-y-auto overscroll-contain bg-muted/10 px-1.5 py-1.5">
            {activeItems.map((item) => (
              <TurnActivityRow key={item.id} item={item} />
            ))}
            {completedItems.length > 0 ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={showCompleted}
                  className="h-7 w-full justify-start gap-2 px-2 text-[11px] font-normal text-muted-foreground"
                  onClick={() => setShowCompleted((value) => !value)}
                >
                  <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                  <span>Completed ({completedItems.length})</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto size-3.5 transition-transform motion-reduce:transition-none",
                      showCompleted && "rotate-180",
                    )}
                    aria-hidden
                  />
                </Button>
                {showCompleted
                  ? completedItems.map((item) => (
                      <TurnActivityRow key={item.id} item={item} />
                    ))
                  : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function resolveTurnActivityOrbState(args: {
  activity: ProviderTurnActivitySnapshot | null;
  isPlanPreparing: boolean;
  workItems: ProviderTurnWorkItem[];
}): OrbState {
  if (args.activity?.pendingInteraction) {
    return "listening";
  }
  if (args.isPlanPreparing) {
    return "shaping";
  }
  if (
    args.workItems.some(
      (item) => item.kind === "subagent" && item.status === "running",
    )
  ) {
    return "searching";
  }
  return "working";
}

function TurnActivityRow({ item }: { item: TurnActivityItem }) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const isCompleted = item.status === "completed";
  return (
    <div
      className="flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5"
      title={detail ? `${item.title} · ${detail}` : item.title}
    >
      <span className="flex h-5 shrink-0 items-center">
        <TurnActivityStatusIcon status={item.status} iconKey={item.iconKey} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[0.8125rem] leading-5",
            isCompleted && "text-muted-foreground",
          )}
        >
          <span className="truncate font-medium">{item.title}</span>
          {item.badge ? (
            <span className="shrink-0 rounded border border-border/60 px-1 text-[10px] leading-4 font-medium tracking-wide text-muted-foreground">
              {item.badge}
            </span>
          ) : null}
        </p>
        {detail ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
      {item.elapsedSeconds != null ? (
        <span className="shrink-0 pt-0.5 text-[11px] leading-4 tabular-nums text-muted-foreground">
          <span className="sr-only">
            {getStatusLabel(item.status)},{" "}
            {formatElapsedSeconds(item.elapsedSeconds)} elapsed
          </span>
          <span aria-hidden="true">
            {formatElapsedSeconds(item.elapsedSeconds)}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function TurnActivityStatusIcon({
  status,
  iconKey,
}: {
  status: TurnActivityRowStatus;
  iconKey: TurnActivityIconKey;
}) {
  if (status === "completed") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CheckCircle2 className="size-4 text-success" aria-hidden />
        <span className="sr-only">Done</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CircleAlert className="size-4 text-destructive" aria-hidden />
        <span className="sr-only">Failed</span>
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <CirclePause className="size-4 text-warning" aria-hidden />
        <span className="sr-only">Waiting</span>
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <Circle className="size-3.5 text-muted-foreground/45" aria-hidden />
        <span className="sr-only">Queued</span>
      </span>
    );
  }
  const Icon = TURN_ACTIVITY_ICONS[iconKey];
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">Running</span>
    </span>
  );
}

function getStatusLabel(status: TurnActivityRowStatus) {
  if (status === "completed") {
    return "Done";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "waiting") {
    return "Waiting";
  }
  if (status === "pending") {
    return "Queued";
  }
  return "Running";
}

function formatElapsedSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
