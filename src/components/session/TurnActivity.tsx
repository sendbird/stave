import { memo, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import {
  ChildTaskParentBacklink,
  ChildTaskRows,
} from "@/components/session/ChildTaskRows";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { findLatestTodoPart } from "@/components/session/todo-floater.utils";
import {
  getTurnActivityStatusLabel,
  TurnActivityStatusIcon,
} from "@/components/session/turn-activity-status-icon";
import {
  NO_WORK_GRAPH_CAPABILITIES,
  WorkGraphTree,
  type WorkGraphControlRequest,
} from "@/components/session/WorkGraphTree";
import {
  buildTurnActivityItems,
  countTurnActivityItems,
  formatTurnActivityCountsLabel,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityHeadline,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivityOrbState,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
  type TurnActivityItem,
  type TurnActivityTodo,
} from "@/components/session/turn-activity.utils";
import { Button } from "@/components/ui";
import { TaskExecutionSummarySurface } from "@/components/layout/TaskExecutionSummarySurface";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import {
  buildTaskExecutionSummary,
  type TaskExecutionSummary,
} from "@/lib/fleet/task-execution-summary";
import type { ProviderWorkGraphCapabilities } from "@/lib/providers/provider.types";
import {
  formatProviderTurnElapsedDuration,
  formatProviderTurnIdleDuration,
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
  type ProviderTurnWorkItem,
} from "@/lib/providers/turn-status";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
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
/**
 * Provider events flush once per animation frame, so row content would rebuild
 * ~60x/second. Rows are prose a human has to read — coalescing them to ~8
 * updates/second loses nothing and stops the list from repainting every frame.
 */
const TURN_ACTIVITY_CONTENT_THROTTLE_MS = 120;

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
    verification,
    rateLimits,
    activeWorkspaceId,
    projectPath,
    runtimeCapabilities,
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
      state.turnVerificationByWorkspace[state.activeWorkspaceId] ?? null,
      state.rateLimitsSnapshot,
      state.activeWorkspaceId,
      state.projectPath,
      state.providerRuntimeCapabilities,
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
  const executionSummary = useMemo(
    () =>
      buildTaskExecutionSummary({
        taskId,
        providerId: activeProvider,
        messages,
        activity: currentActivity,
        verification,
        rateLimits,
      }),
    [
      activeProvider,
      currentActivity,
      messages,
      rateLimits,
      taskId,
      verification,
    ],
  );
  const shouldShow = resolveTurnActivityVisibility({
    isTurnActive: Boolean(activeTurnId),
    isPlanPending,
    hasRetainedFailure,
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

  // Row content is throttled but turn-level state (visibility, elapsed time,
  // pending interaction) stays live — delaying those would make the shelf lag
  // behind the composer it sits under.
  const throttledWorkItems = useThrottledValue(
    workItems,
    TURN_ACTIVITY_CONTENT_THROTTLE_MS,
  );
  const throttledTodos = useThrottledValue(
    todos,
    TURN_ACTIVITY_CONTENT_THROTTLE_MS,
  );
  // The graph is rebuilt by the same per-frame flush as the work items, and the
  // tree re-derives its rows from the graph's identity, so it rides the same
  // throttle rather than reading straight off the live snapshot.
  const throttledWorkGraph = useThrottledValue(
    currentActivity?.workGraph ?? null,
    TURN_ACTIVITY_CONTENT_THROTTLE_MS,
  );

  const surfaceProps = useMemo<TurnActivitySurfaceProps | null>(() => {
    if (!shouldShow) {
      return null;
    }
    return {
      activeTurnId: activeTurnId ?? currentActivity?.turnId ?? "",
      activity: currentActivity,
      isPlanPreparing,
      workItems: throttledWorkItems,
      todos: throttledTodos,
      workGraph: throttledWorkGraph,
      workGraphCapabilities: runtimeCapabilities[activeProvider].workGraph,
      expandedByDefault,
      hasPendingInteractionCard,
      executionSummary,
      taskId,
      workspaceId: activeWorkspaceId,
      projectPath,
    };
  }, [
    activeProvider,
    activeTurnId,
    activeWorkspaceId,
    currentActivity,
    expandedByDefault,
    executionSummary,
    hasPendingInteractionCard,
    isPlanPreparing,
    projectPath,
    runtimeCapabilities,
    shouldShow,
    taskId,
    throttledTodos,
    throttledWorkGraph,
    throttledWorkItems,
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
   * The same turn seen as a tree. Passed separately from `activity` because the
   * shelf's turn-level state stays live while row content is throttled, and the
   * tree belongs to the throttled half.
   */
  workGraph?: WorkGraph | null;
  workGraphCapabilities?: ProviderWorkGraphCapabilities;
  onWorkGraphControl?: (request: WorkGraphControlRequest) => void;
  /**
   * Setting-backed default for the expanded list. A manual toggle overrides it
   * for the rest of the turn; the surface is keyed per turn, so the next turn
   * falls back to the setting again.
   */
  expandedByDefault?: boolean;
  /** Renders the exit animation while the shelf is being torn down. */
  isLeaving?: boolean;
  /**
   * A chat-level approval/user-input card is on screen. The shelf stays put
   * (unmounting it replayed the enter animation on every interaction) and drops
   * its own duplicate row instead.
   */
  hasPendingInteractionCard?: boolean;
  executionSummary?: TaskExecutionSummary;
  /** Identity of the task this shelf belongs to, used by the child-task rows. */
  taskId?: string;
  workspaceId?: string | null;
  projectPath?: string | null;
}

export const TurnActivitySurface = memo(function TurnActivitySurface(
  props: TurnActivitySurfaceProps,
) {
  const expandedByDefault = props.expandedByDefault ?? true;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const interactionCardOwnsFocus = Boolean(
    props.hasPendingInteractionCard &&
    props.activity?.pendingInteraction != null,
  );
  const expanded = interactionCardOwnsFocus
    ? false
    : (expandedOverride ?? expandedByDefault);
  const now = useTurnClock(
    props.activity?.completedAt == null ? props.activeTurnId : null,
  );
  const isStalled =
    props.activity?.stalledAt != null &&
    props.activity.completedAt == null &&
    props.activity.pendingInteraction == null;
  const summary = useMemo(
    () =>
      resolveTurnActivitySummary({
        pendingInteraction: props.activity?.pendingInteraction ?? null,
        isStalled,
        isPlanPreparing: props.isPlanPreparing,
        workItems: props.workItems,
        todos: props.todos,
      }),
    [
      isStalled,
      props.activity?.pendingInteraction,
      props.isPlanPreparing,
      props.todos,
      props.workItems,
    ],
  );
  const elapsedLabel = formatProviderTurnElapsedDuration({
    activity: props.activity,
    now: props.activity?.completedAt ?? now,
  });
  const idleLabel = formatProviderTurnIdleDuration({
    activity: props.activity,
    now,
  });
  // Rebuilt from primitives rather than the snapshot object: the snapshot gets a
  // fresh identity on every provider flush, so depending on it would defeat the
  // memo and hand the list new row objects ~60x/second.
  const activityCompletedAt = props.activity?.completedAt ?? null;
  const activityPendingInteraction = props.activity?.pendingInteraction ?? null;
  const activityTurnError = props.activity?.turnError ?? null;
  const activityTurnErrorRecoverable =
    props.activity?.turnErrorRecoverable ?? false;
  const hasActivity = props.activity != null;
  const stalledIdleLabel = isStalled ? idleLabel : null;
  const activityItems = useMemo(
    () =>
      buildTurnActivityItems({
        activity: hasActivity
          ? {
              completedAt: activityCompletedAt ?? undefined,
              pendingInteraction: activityPendingInteraction,
              turnError: activityTurnError ?? undefined,
              turnErrorRecoverable: activityTurnErrorRecoverable,
            }
          : null,
        idleLabel: stalledIdleLabel,
        isPlanPreparing: props.isPlanPreparing,
        isStalled,
        todos: props.todos,
        workItems: props.workItems,
        hasPendingInteractionCard: props.hasPendingInteractionCard,
      }),
    [
      activityCompletedAt,
      activityPendingInteraction,
      activityTurnError,
      activityTurnErrorRecoverable,
      hasActivity,
      isStalled,
      props.hasPendingInteractionCard,
      props.isPlanPreparing,
      props.todos,
      props.workItems,
      stalledIdleLabel,
    ],
  );
  const counts = useMemo(
    () => countTurnActivityItems(activityItems),
    [activityItems],
  );
  const featuredItem = useMemo(
    () => resolveTurnActivityFeaturedItem(activityItems),
    [activityItems],
  );
  const hiddenItems = useMemo(
    () => activityItems.filter((item) => item !== featuredItem),
    [activityItems, featuredItem],
  );
  const hiddenSeverity = resolveTurnActivityHiddenSeverity(hiddenItems);
  const orbState = resolveTurnActivityOrbState({
    activity: props.activity,
    isStalled,
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
  const headline = resolveTurnActivityHeadline({
    expanded,
    needsAttention,
    counts,
    countsLabel,
    featuredItem,
    summaryLabel: summary.label,
  });
  // An attention headline owns the whole line: pairing "Waiting for your input"
  // with a running tool's progress detail reads as one confused sentence.
  const headlineDetail =
    !expanded &&
    !needsAttention &&
    featuredItem?.detail &&
    featuredItem.detail !== headline
      ? featuredItem.detail
      : null;
  // A turn can delegate before it reports a single work item, and the tree is
  // the only thing that would say so — without this the list stays shut and the
  // agents are invisible until unrelated activity opens it.
  const hasWorkGraphRows = useMemo(
    () =>
      props.workGraph
        ? summarizeWorkGraph(props.workGraph).totalCount > 0
        : false,
    [props.workGraph],
  );
  const canExpand =
    (activityItems.length > 0 ||
      hasWorkGraphRows ||
      props.executionSummary != null) &&
    !interactionCardOwnsFocus;
  // `0/4` says nothing, so the ratio only appears once work has landed.
  const showProgress =
    !interactionCardOwnsFocus &&
    counts.totalCount > 1 &&
    counts.completedCount > 0;
  const isListOpen = expanded && canExpand;

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
            data-orb-state={orbState}
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
          {!expanded && !interactionCardOwnsFocus && hiddenItems.length > 0 ? (
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

        {isListOpen ? (
          <div
            data-testid="turn-activity-list"
            className="max-h-[min(12rem,28vh)] min-h-0 overflow-y-auto overscroll-contain bg-muted/10"
          >
            <div className="px-1.5 py-1.5">
              {activityItems.map((item) => (
                <TurnActivityRow key={item.id} item={item} />
              ))}
              <WorkGraphTree
                graph={props.workGraph}
                capabilities={
                  props.workGraphCapabilities ?? NO_WORK_GRAPH_CAPABILITIES
                }
                onControl={props.onWorkGraphControl}
                className="px-1.5 pt-2"
              />
              {props.executionSummary ? (
                <TaskExecutionSummarySurface
                  compact
                  summary={props.executionSummary}
                  showLatestActivity={false}
                  className="px-1.5 pb-1 pt-2"
                />
              ) : null}
              <ChildTaskParentBacklink
                taskId={props.taskId}
                projectPath={props.projectPath}
                className="px-1.5 pt-2"
              />
              <ChildTaskRows
                parentTaskId={props.taskId}
                parentWorkspaceId={props.workspaceId}
                projectPath={props.projectPath}
                className="px-1.5 pb-1 pt-2"
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
});

// Memoized so the shelf's per-second clock tick and the surrounding 60fps store
// churn do not re-render every row. Row objects are rebuilt only when their
// throttled source data actually changes.
const TurnActivityRow = memo(function TurnActivityRow({
  item,
}: {
  item: TurnActivityItem;
}) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const isCompleted = item.status === "completed";
  return (
    <div
      data-turn-activity-item-id={item.id}
      className={cn(
        "flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5",
        // Rows mount once and keep their slot, so this plays exactly when a new
        // activity appears instead of on every update.
        "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
      )}
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
            {getTurnActivityStatusLabel(item.status)},{" "}
            {formatElapsedSeconds(item.elapsedSeconds)} elapsed
          </span>
          <span aria-hidden="true">
            {formatElapsedSeconds(item.elapsedSeconds)}
          </span>
        </span>
      ) : null}
    </div>
  );
});

function formatElapsedSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
