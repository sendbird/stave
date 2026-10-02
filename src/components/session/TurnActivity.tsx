import { ActivityDetailDialog, type ActivityDetailSelection } from "./ActivityDetailDialog";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleSlash,
  GripHorizontal,
  X,
} from "lucide-react";
import {
  DelegatedTaskParentBacklink,
  DelegatedTaskRowActions,
  useDelegatedTaskRowController,
} from "@/components/session/DelegatedTaskRows";
import { DelegationsBlock } from "@/components/delegation/DelegationsBlock";
import { isRoutedDecision, RouteTrace } from "@/components/auto-routing";
import { isDelegatedTaskInTurn } from "@/lib/work-graph/delegated-task-scope";
import type { AutoRoutingDecisionRecord } from "@/lib/routing/auto-routing";
import {
  selectDelegationExchanges,
  type DelegationActionId,
  type DelegationExchange,
} from "@/lib/delegation/exchange";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import {
  resolvePlanViewerState,
  SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
} from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  useDelegatedTasks,
  type DelegatedTaskListingSource,
} from "@/components/session/useDelegatedTasks";
import { findLatestTodoPart } from "@/components/session/turn-todo.utils";
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
  mergeTurnActivityCounts,
  resolveTurnActivityRowActivation,
  describeRetainedTurnHeadline,
  formatTurnActivityElapsedSeconds,
  formatTurnActivityCountsLabel,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityHeadline,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivityLoaderVariant,
  resolveTurnActivityReplay,
  resolveTurnActivityRestMark,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
  type TurnActivityItem,
  type TurnActivityTodo,
} from "@/components/session/turn-activity.utils";
import { Badge, Button, Loader } from "@/components/ui";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { cx, sx } from "../ads/utils/stylex";
import { focusRing } from "../ads/recipes/focus-ring";
import { surfaceChrome } from "../ads/recipes/surface-chrome";
import { transition } from "../ads/recipes/transition";
import { toProviderWaveToneClass } from "@/components/ai-elements/provider-wave-tone.styles";
import { turnActivityStyles as styles } from "./turn-activity.styles";
import { TaskExecutionSummarySurface } from "@/components/layout/TaskExecutionSummarySurface";
import { useThrottledValue } from "@/hooks/use-throttled-value";
import {
  buildTaskExecutionSummary,
  type TaskExecutionSummary,
} from "@/lib/fleet/task-execution-summary";
import type {
  ProviderId,
  ProviderWorkGraphCapabilities,
} from "@/lib/providers/provider.types";
import {
  formatProviderTurnElapsedDuration,
  formatProviderTurnIdleDuration,
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
  type ProviderTurnWorkItem,
  type RetainedTurnOutcome,
} from "@/lib/providers/turn-status";
import { buildDelegatedTaskExpectedIdentity } from "@/lib/runs/delegated-task-view";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import type { TurnActivityPlacement } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import type { TurnActivityFloatPosition } from "@/store/layout.utils";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import { resolvePromptDraftRuntimeState } from "@/store/prompt-draft-runtime";
import type { ChatMessage, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { useShelfDetail } from "./composer-shelf/use-shelf-detail";

const EMPTY_MESSAGES: ChatMessage[] = [];
const DELEGATED_TASKS_UNAVAILABLE = {
  ok: false as const,
  error: "Delegated task controls are unavailable on this surface.",
};
/** Stable no-op source for surfaces rendered without a delegated-task listing. */
const EMPTY_CHILD_SOURCE: DelegatedTaskListingSource = {
  children: [],
  actions: {
    followUp: async () => DELEGATED_TASKS_UNAVAILABLE,
    retry: async () => DELEGATED_TASKS_UNAVAILABLE,
    stop: async () => DELEGATED_TASKS_UNAVAILABLE,
    detach: async () => DELEGATED_TASKS_UNAVAILABLE,
    refresh: () => {},
  },
};
const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const TURN_ACTIVITY_FAILURE_LINGER_MS = 5_000;
/** Matches the exit animation below so the shelf collapses instead of popping. */
const TURN_ACTIVITY_EXIT_MS = 180;
/** Send-time decision vs. first provider event: allow the clock to disagree a little. */
const ROUTE_RECORD_SKEW_MS = 5_000;
/**
 * Provider events can flush up to 20 times per second, so row content would
 * still rebuild too often. Rows are prose a human has to read — coalescing them
 * to ~8 updates/second loses nothing and stops the list from repainting every
 * frame.
 */
const TURN_ACTIVITY_CONTENT_THROTTLE_MS = 120;

/** A one-second clock that runs only while the turn it names is live. */
export function useTurnClock(activeTurnId: string | null) {
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

/**
 * The detail hosts of a turn. Its one-line status is the composer shelf's run
 * line (`ComposerShelf`), whatever `settings.turnActivityPlacement` says; the
 * placement only picks where the details open:
 *
 * - `floating` — `ChatArea`'s overlay shows a draggable card while the shelf's
 *   toggle has it open.
 * - `panel` — the Task panel's Activity tab, which always lists the turn (the
 *   live one, or the last one once it ends) so the shelf's panel button never
 *   leads to an empty tab.
 *
 * The inline (`docked`) list is drawn by the shelf itself.
 */
export function TurnActivity(props: { host: "floating" | "panel" }) {
  return props.host === "panel" ? (
    <PanelTurnActivity />
  ) : (
    <FloatingTurnActivity />
  );
}

function PanelTurnActivity() {
  const model = useTurnActivityModel({ host: "panel", detail: true });
  if (!model.props) {
    return (
      <div
        data-testid="turn-activity-panel-idle"
        className={sx(styles.panelIdle)}
      >
        Activity appears here while a turn is running.
      </div>
    );
  }
  // A live turn already has its status line over the composer, so the panel
  // lists what it is doing without repeating it. A finished turn keeps its
  // header: nothing else on screen says which turn this was or how it ended.
  return (
    <TurnActivitySurface
      key={model.surfaceKey}
      {...model.props}
      isLeaving={model.isLeaving}
      variant="panel"
      chrome={model.props.replayOutcome ? "header" : "list"}
    />
  );
}

function FloatingTurnActivity() {
  const taskId = useScopedTaskId();
  const placement = useAppStore(
    (state) => state.settings.turnActivityPlacement,
  );
  const { open, setOpen } = useShelfDetail(taskId);
  // Gate before the model: a closed card must not rebuild the transcript
  // summary or list delegated tasks.
  if (placement !== "floating" || !open) {
    return null;
  }
  return <FloatingTurnActivityCard onClose={() => setOpen(false)} />;
}

function FloatingTurnActivityCard(props: { onClose: () => void }) {
  const model = useTurnActivityModel({ host: "floating", detail: true });
  if (!model.props) {
    return null;
  }
  const visibleProps = model.props;
  return (
    <TurnActivityFloatingShell>
      {(dragHandleProps) => (
        <TurnActivitySurface
          key={model.surfaceKey}
          {...visibleProps}
          isLeaving={model.isLeaving}
          variant="floating"
          chrome="list"
          dragHandleProps={dragHandleProps}
          onClose={props.onClose}
        />
      )}
    </TurnActivityFloatingShell>
  );
}

export interface TurnActivityModel {
  /** What the surface shows, the leaving snapshot included; null when nothing does. */
  props: TurnActivitySurfaceProps | null;
  isLeaving: boolean;
  surfaceKey: string;
}

/**
 * Everything a turn surface reads, for one host. `detail` is whether that
 * host is showing the list right now: the execution summary rebuilds from the
 * whole transcript on every provider flush, so the shelf's one-line summary
 * asks for it only while its own list is open.
 */
export function useTurnActivityModel(args: {
  host: TurnActivityPlacement;
  detail: boolean;
}): TurnActivityModel {
  const host = args.host;
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
    retainedActivity,
    expandedByDefault,
    verification,
    rateLimits,
    activeWorkspaceId,
    repositoryPath,
    runtimeCapabilities,
    autoRoutingRecord,
    budgetStepDownAt,
    providerAvailability,
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
      state.retainedTurnActivityByTask[taskId] ?? null,
      state.settings.turnActivityExpandedByDefault,
      state.turnVerificationByWorkspace[state.activeWorkspaceId] ?? null,
      state.rateLimitsSnapshot,
      state.activeWorkspaceId,
      state.repositoryPath,
      state.providerRuntimeCapabilities,
      state.autoRoutingDecisionByTask[taskId] ?? null,
      state.settings.autoRoutingProfile.budgetGuard.stepDownAt,
      state.providerAvailability,
    ]),
  );
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  // A row names a tool call the transcript already renders in full. Without
  // this the only way from "that grep looks wrong" to its output was scrolling
  // the conversation by hand.
  const handleSelectTool = useCallback(
    (toolUseId: string) => {
      focusTranscriptTool({ taskId, toolUseId });
    },
    [focusTranscriptTool, taskId],
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
  const hasRetainedFailure = Boolean(
    !activeTurnId && activity?.turnError && activity.completedAt,
  );
  // The last finished turn, shown once the live one is gone. A turn in flight
  // always wins; replay is what fills the panel between turns.
  //
  // It also covers the failure-linger window, where the live snapshot survives
  // its turn for a few seconds: that snapshot no longer matches an active turn
  // id, so the row list reads as empty, and the panel would show a bare "Turn
  // failed" until the linger expired and the replay filled it back in.
  const replay = resolveTurnActivityReplay({
    placement: host,
    isTurnActive: Boolean(activeTurnId),
    retained: retainedActivity,
  });
  const workItems = useMemo(
    () =>
      getCurrentTurnWorkItems({
        activity: replay?.snapshot ?? activity,
        activeTurnId: replay ? replay.snapshot.turnId : activeTurnId,
      }),
    [activeTurnId, activity, replay],
  );
  const hasPendingInteractionCard = useMemo(
    () => findLatestPendingToolInteraction({ messages }) != null,
    [messages],
  );
  const currentActivity =
    replay?.snapshot ??
    (activity?.turnId === activeTurnId || hasRetainedFailure ? activity : null);
  const wantsDetail = args.detail;
  const executionSummary = useMemo(
    () =>
      wantsDetail
        ? buildTaskExecutionSummary({
            taskId,
            providerId: activeProvider,
            messages,
            activity: currentActivity,
            verification,
            rateLimits,
          })
        : undefined,
    [
      activeProvider,
      currentActivity,
      messages,
      rateLimits,
      taskId,
      verification,
      wantsDetail,
    ],
  );
  const shouldShow = resolveTurnActivityVisibility({
    isTurnActive: Boolean(activeTurnId),
    isPlanPending,
    hasRetainedFailure,
    hasReplay: replay != null,
  });

  // Read once here rather than inside the rows: the same listing has to reach
  // both the delegated task rows and the turn's graph, and two subscriptions to one
  // ledger would double every refetch and let the two views disagree mid-flight.
  const delegatedTasks = useDelegatedTasks({
    parentTaskId: taskId,
    parentWorkspaceId: activeWorkspaceId,
    repositoryPath,
    enabled: shouldShow,
  });
  const { children: delegatedTaskRows } = delegatedTasks;
  // Only the rows and the controls travel down, and they travel as their own
  // object: the hook's result is rebuilt on every render, and its `loading`
  // flag flips twice per refetch, so passing the whole thing would defeat the
  // shelf's memo and re-render every row on a listing nothing read.
  const delegatedTaskSource = useMemo(
    () => ({ children: delegatedTaskRows, actions: delegatedTasks.actions }),
    [delegatedTaskRows, delegatedTasks.actions],
  );
  const syncDelegatedTasksIntoTurnGraph = useAppStore(
    (state) => state.syncDelegatedTasksIntoTurnGraph,
  );
  useEffect(() => {
    if (!taskId) {
      return;
    }
    syncDelegatedTasksIntoTurnGraph({ taskId, children: delegatedTaskRows });
  }, [delegatedTaskRows, syncDelegatedTasksIntoTurnGraph, taskId]);

  // A refusal is the expected outcome here, not the exception: the coordinator
  // re-checks the identity this control was prepared against, which is the
  // whole point of Stage F's freeze. So every path out of the stop says
  // something — a control that fails silently is indistinguishable from one
  // that worked, and from one that is broken.
  const [controlErrorByNodeKey, setControlErrorByNodeKey] = useState<
    Record<string, string>
  >({});
  const setControlError = useCallback(
    (nodeKey: string, error: string | null) => {
      setControlErrorByNodeKey((current) => {
        if (!error) {
          if (!(nodeKey in current)) {
            return current;
          }
          const next = { ...current };
          delete next[nodeKey];
          return next;
        }
        return current[nodeKey] === error
          ? current
          : { ...current, [nodeKey]: error };
      });
    },
    [],
  );
  const delegatedTaskActions = delegatedTasks.actions;
  const handleWorkGraphControl = useCallback(
    (request: WorkGraphControlRequest) => {
      const { node } = request;
      if (request.control !== "stop") {
        setControlError(
          node.key,
          "Only Stop is wired up for agents in this turn so far.",
        );
        return;
      }
      if (!node.delegationKey) {
        setControlError(
          node.key,
          "Only a delegated task can be stopped from this row.",
        );
        return;
      }
      const child = delegatedTaskRows.find(
        (row) => row.delegationKey === node.delegationKey,
      );
      // The graph learns about a delegation from the turn's own tool call,
      // which lands before the ledger listing catches up. Stop needs the
      // ledger's identity, so there is a real window where it cannot be sent.
      if (!child) {
        setControlError(
          node.key,
          "This delegated task is still being recorded. Try again in a moment.",
        );
        return;
      }
      setControlError(node.key, null);
      void delegatedTaskActions
        .stop({
          delegationKey: child.delegationKey,
          expected: buildDelegatedTaskExpectedIdentity(child),
        })
        .then((result) => {
          if (!result.ok) {
            setControlError(
              node.key,
              result.error ?? "This delegated task could not be stopped.",
            );
          }
        });
    },
    [delegatedTaskActions, delegatedTaskRows, setControlError],
  );

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
  // The graph is rebuilt by the same visual flush as the work items, and the
  // tree re-derives its rows from the graph's identity, so it rides the same
  // throttle rather than reading straight off the live snapshot.
  const throttledWorkGraph = useThrottledValue(
    currentActivity?.workGraph ?? null,
    TURN_ACTIVITY_CONTENT_THROTTLE_MS,
  );
  // The task keeps only its latest decision. A retained turn replayed after a
  // newer send would otherwise show the newer route, so the record has to
  // predate the turn it is drawn under.
  const turnAutoRouting = useMemo<AutoRoutingDecisionRecord | null>(() => {
    if (!isRoutedDecision(autoRoutingRecord)) {
      return null;
    }
    const startedAt = currentActivity?.startedAt;
    if (typeof startedAt !== "number") {
      return autoRoutingRecord;
    }
    const resolvedAt = Date.parse(autoRoutingRecord.resolvedAt);
    return Number.isFinite(resolvedAt) && resolvedAt <= startedAt + ROUTE_RECORD_SKEW_MS
      ? autoRoutingRecord
      : null;
  }, [autoRoutingRecord, currentActivity?.startedAt]);

  const surfaceProps = useMemo<TurnActivitySurfaceProps | null>(() => {
    if (!shouldShow) {
      return null;
    }
    return {
      autoRouting: turnAutoRouting,
      autoRoutingBudgetStepDownAt: budgetStepDownAt,
      providerAvailability,
      activeTurnId: activeTurnId ?? currentActivity?.turnId ?? "",
      activity: currentActivity,
      isPlanPreparing,
      workItems: throttledWorkItems,
      todos: throttledTodos,
      workGraph: throttledWorkGraph,
      // A finished turn's agents cannot be stopped, so replay shows the tree
      // without controls rather than buttons that can only report a refusal.
      workGraphCapabilities: replay
        ? NO_WORK_GRAPH_CAPABILITIES
        : runtimeCapabilities[activeProvider].workGraph,
      ...(replay ? {} : { onWorkGraphControl: handleWorkGraphControl }),
      workGraphControlErrorByNodeKey: controlErrorByNodeKey,
      delegatedTasks: delegatedTaskSource,
      expandedByDefault,
      hasPendingInteractionCard,
      executionSummary,
      onSelectTool: handleSelectTool,
      taskId,
      workspaceId: activeWorkspaceId,
      repositoryPath,
      ...(replay ? { replayOutcome: replay.outcome } : {}),
    };
  }, [
    activeProvider,
    activeTurnId,
    activeWorkspaceId,
    budgetStepDownAt,
    providerAvailability,
    turnAutoRouting,
    delegatedTaskSource,
    controlErrorByNodeKey,
    currentActivity,
    expandedByDefault,
    executionSummary,
    handleSelectTool,
    handleWorkGraphControl,
    hasPendingInteractionCard,
    isPlanPreparing,
    repositoryPath,
    replay,
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
  return {
    props: visibleProps,
    isLeaving: leavingProps != null,
    surfaceKey: `${taskId}:${visibleProps?.activeTurnId ?? ""}`,
  };
}

interface FloatingDragState {
  pointerId: number;
  startMouseX: number;
  startMouseY: number;
  startPosX: number;
  startPosY: number;
  containerWidth: number;
  containerHeight: number;
  cardWidth: number;
  cardHeight: number;
  /** True once movement exceeds the activation threshold. */
  active: boolean;
}

const TURN_ACTIVITY_FLOAT_DEFAULT_TOP_PX = 12;
const TURN_ACTIVITY_FLOAT_DEFAULT_RIGHT_PX = 16;

/**
 * Draggable wrapper for the floating placement. Lives inside `ChatArea`'s
 * `pointer-events-none absolute inset-0` overlay, so positions are pixels
 * from the message pane's top-left. The card anchors top-right until the
 * user drags it; the dropped position persists via `layout.turnActivityFloatPos`.
 */
function TurnActivityFloatingShell(props: {
  children: (dragHandleProps: HTMLAttributes<HTMLDivElement>) => ReactNode;
}) {
  const [storedPos, setLayout] = useAppStore(
    useShallow(
      (state) => [state.layout.turnActivityFloatPos, state.setLayout] as const,
    ),
  );
  const [dragPos, setDragPos] = useState<TurnActivityFloatPosition | null>(
    null,
  );
  const outerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<FloatingDragState | null>(null);
  const lastDragPosRef = useRef<TurnActivityFloatPosition | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || dragRef.current !== null) {
      return;
    }
    const outer = outerRef.current;
    const containerRect = outer?.parentElement?.getBoundingClientRect();
    if (!outer || !containerRect) {
      return;
    }
    const outerRect = outer.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPosX: outerRect.left - containerRect.left,
      startPosY: outerRect.top - containerRect.top,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      cardWidth: outer.offsetWidth,
      cardHeight: outer.offsetHeight,
      active: false,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) {
      return;
    }
    const dx = e.clientX - state.startMouseX;
    const dy = e.clientY - state.startMouseY;
    // Activate only after a small movement threshold so header buttons keep
    // receiving plain clicks.
    if (!state.active) {
      if (Math.abs(dx) + Math.abs(dy) < 4) {
        return;
      }
      state.active = true;
      e.currentTarget.setPointerCapture(state.pointerId);
    }
    const next: TurnActivityFloatPosition = {
      x: Math.max(
        0,
        Math.min(state.containerWidth - state.cardWidth, state.startPosX + dx),
      ),
      y: Math.max(
        0,
        Math.min(
          state.containerHeight - state.cardHeight,
          state.startPosY + dy,
        ),
      ),
    };
    lastDragPosRef.current = next;
    setDragPos(next);
  }, []);

  const onPointerUp = useCallback(() => {
    const state = dragRef.current;
    dragRef.current = null;
    if (state?.active && lastDragPosRef.current) {
      setLayout({ patch: { turnActivityFloatPos: lastDragPosRef.current } });
    }
  }, [setLayout]);

  const pos = dragPos ?? storedPos;
  // A stored position can outlive the window size it was dragged in, so the
  // CSS `min()` keeps at least the drag handle reachable after a resize.
  const wrapperStyle: CSSProperties = pos
    ? {
        top: `min(${pos.y}px, calc(100% - 3rem))`,
        left: `min(${pos.x}px, calc(100% - 8rem))`,
      }
    : {
        top: TURN_ACTIVITY_FLOAT_DEFAULT_TOP_PX,
        right: TURN_ACTIVITY_FLOAT_DEFAULT_RIGHT_PX,
      };

  return (
    <div
      ref={outerRef}
      data-testid="turn-activity-floating-shell"
      className={SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME}
      style={wrapperStyle}
    >
      <div className={sx(styles.floatInner)}>
        {props.children({
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
        })}
      </div>
    </div>
  );
}

export interface TurnActivitySurfaceProps {
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
  workGraphControlErrorByNodeKey?: Readonly<Record<string, string>>;
  /**
   * The parent's delegations, already loaded upstream. Handed down rather than
   * re-read here so the rows and the tree describe the same listing.
   */
  delegatedTasks?: DelegatedTaskListingSource;
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
  /**
   * Reveal a row's tool call in the transcript. Rows without a `toolUseId`
   * stay inert, so this never turns a todo or a status row into a dead button.
   */
  onSelectTool?: (toolUseId: string) => void;
  /**
   * The routing decision that picked this turn's model, when Auto made one.
   * Drawn as the Route block so the shelf says who is running and why before
   * it lists what they are doing.
   */
  autoRouting?: AutoRoutingDecisionRecord | null;
  /** Usage percent at which the budget guard steps down; marks the chip. */
  autoRoutingBudgetStepDownAt?: number;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  /** Identity of the task this shelf belongs to, used by the delegated-task rows. */
  taskId?: string;
  workspaceId?: string | null;
  repositoryPath?: string | null;
  /**
   * Which host chrome to render: the docked shelf tucked under the composer
   * (default), a bordered floating card, or a full-height panel body.
   */
  variant?: TurnActivityPlacement;
  /**
   * `header` draws the surface's own status header. `list` draws the rows
   * only, for hosts whose status is already on screen: the composer shelf's
   * run line heads every live turn, so the inline list, the floating card and
   * the live panel must not say it again. A floating card keeps a grip so it
   * can still be dragged and closed.
   */
  chrome?: "header" | "list";
  /** Closes the floating card (list chrome). */
  onClose?: () => void;
  /**
   * Set when the surface is replaying a turn that has already ended. Everything
   * else about the surface already reads `activity.completedAt` and freezes
   * itself (the clock stops, the orb pauses, the elapsed label holds); this only
   * has to say *why* it is frozen, because "finished" and "hung" look identical
   * otherwise.
   */
  replayOutcome?: RetainedTurnOutcome;
  /** Pointer handlers that make the header a drag handle (floating variant). */
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  /**
   * When the shelf sits in the composer frame's top slot, the frame owns the
   * tuck under the raised card. Drop the standalone docked inset and use the
   * shared peek surface so all four bars share one edge treatment.
   */
  frameInset?: boolean;
}

/**
 * What the header's leading slot holds once the turn is over: the outcome, as
 * a static glyph, in the place the cadence mark ran. A paused loader keeps
 * whichever animation frame it stopped on, so "finished" was drawn as a
 * half-complete stride — the same reason a reasoning block swaps its loader
 * for a `Brain` when it stops streaming.
 */
export function TurnRestMark({ outcome }: { outcome: RetainedTurnOutcome }) {
  if (outcome === "failed") {
    return (
      <CircleAlert
        aria-hidden
        className={sx(styles.restMark, styles.restMarkDanger)}
      />
    );
  }
  if (outcome === "stopped") {
    return (
      <CircleSlash
        aria-hidden
        className={sx(styles.restMark, styles.restMarkMuted)}
      />
    );
  }
  if (outcome === "unknown") {
    return <Circle aria-hidden className={sx(styles.restMark, styles.restMarkMuted)} />;
  }
  return (
    <CheckCircle2
      aria-hidden
      className={sx(styles.restMark, styles.restMarkSuccess)}
    />
  );
}

export const TurnActivitySurface = memo(function TurnActivitySurface(
  props: TurnActivitySurfaceProps,
) {
  const [detailSelection, setDetailSelection] = useState<ActivityDetailSelection | null>(null);

  const variant = props.variant ?? "docked";
  const chrome = props.chrome ?? "header";
  // A list-only host opened the list on purpose; only the header chrome folds.
  const listOnly = chrome === "list";
  const expandedByDefault = props.expandedByDefault ?? true;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const interactionCardOwnsFocus = Boolean(
    !listOnly &&
    props.hasPendingInteractionCard &&
    props.activity?.pendingInteraction != null,
  );
  const expanded = interactionCardOwnsFocus
    ? false
    : variant === "panel" || listOnly
      ? true
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
  const activityStartedAt = props.activity?.startedAt ?? null;
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
        turnStartedAt: activityStartedAt,
        hasPendingInteractionCard: props.hasPendingInteractionCard,
      }),
    [
      activityCompletedAt,
      activityPendingInteraction,
      activityStartedAt,
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
  const graphSummary = useMemo(
    () => (props.workGraph ? summarizeWorkGraph(props.workGraph) : null),
    [props.workGraph],
  );
  const hasWorkGraphRows = (graphSummary?.totalCount ?? 0) > 0;

  // ── Agents block: every delegation of this turn as exchange rows ──────
  const childController = useDelegatedTaskRowController({
    source: props.delegatedTasks ?? EMPTY_CHILD_SOURCE,
    repositoryPath: props.repositoryPath,
  });
  const delegationExchanges = useMemo(
    () =>
      selectDelegationExchanges({
        delegatedTasks: childController.children.filter((child) => isDelegatedTaskInTurn(child, props.workGraph)),
        childBlockedByDelegationKey: childController.blockedByDelegationKey,
      }).map((exchange) =>
        // The shared delegated-task action row renders the real controls.
        exchange.kind === "delegated-task"
          ? { ...exchange, actions: [] }
          : exchange,
      ),
    [
      childController.blockedByDelegationKey,
      childController.children,
      props.workGraph,
    ],
  );
  const hasDelegationRows = delegationExchanges.length > 0;
  const onSelectTool = props.onSelectTool;
  const handleDelegationAction = useCallback(
    (action: DelegationActionId, exchange: DelegationExchange) => {
      switch (action) {
        case "show-in-conversation":
          if (exchange.ref.toolUseId) {
            onSelectTool?.(exchange.ref.toolUseId);
          }
          return;
        default:
          return;
      }
    },
    [onSelectTool],
  );
  const renderDelegationExtraActions = useCallback(
    (exchange: DelegationExchange) => {
      if (exchange.kind !== "delegated-task" || !exchange.ref.delegationKey) {
        return null;
      }
      const child = childController.children.find(
        (row) => row.delegationKey === exchange.ref.delegationKey,
      );
      if (!child) {
        return null;
      }
      return (
        <DelegatedTaskRowActions
          child={child}
          busy={childController.busyDelegationKey === child.delegationKey}
          onOpen={childController.onOpen}
          onFollowUp={childController.onFollowUp}
          onRetry={childController.onRetry}
          onStop={childController.onStop}
          onDetach={childController.onDetach}
        />
      );
    },
    [childController],
  );
  const delegationStatusNoteFor = useCallback(
    (exchange: DelegationExchange) =>
      exchange.ref.delegationKey
        ? childController.errorByDelegationKey[exchange.ref.delegationKey]
        : undefined,
    [childController.errorByDelegationKey],
  );
  // Subagents the tree already renders leave the flat list.
  const visibleActivityItems = useMemo(
    () =>
      activityItems.filter((item) => !(hasWorkGraphRows && item.iconKey === "subagent")),
    [activityItems, hasWorkGraphRows],
  );
  const flatCounts = useMemo(
    () => countTurnActivityItems(activityItems),
    [activityItems],
  );
  const counts = useMemo(
    () => mergeTurnActivityCounts(flatCounts, graphSummary),
    [flatCounts, graphSummary],
  );
  const featuredItem = useMemo(
    () => resolveTurnActivityFeaturedItem(activityItems),
    [activityItems],
  );
  const hiddenItems = useMemo(
    () => activityItems.filter((item) => item !== featuredItem),
    [activityItems, featuredItem],
  );
  const hiddenItemCount = hasWorkGraphRows
    ? Math.max(0, counts.totalCount - 1)
    : hiddenItems.length;
  const hiddenSeverity = hasWorkGraphRows
    ? counts.failedCount > 0
      ? "failed"
      : counts.waitingCount > 0
        ? "waiting"
        : "default"
    : resolveTurnActivityHiddenSeverity(hiddenItems);
  const loaderVariant = resolveTurnActivityLoaderVariant({
    activity: props.activity,
    isStalled,
    isPlanPreparing: props.isPlanPreparing,
    workItems: props.workItems,
  });
  // A turn that has ended rests on its outcome glyph instead of a frozen
  // cadence frame.
  const restMark = resolveTurnActivityRestMark({
    replayOutcome: props.replayOutcome,
    activity: props.activity,
  });
  // Attention states name themselves better than any count can, so they keep
  // the summary label even while the list is open.
  const needsAttention =
    props.activity?.pendingInteraction != null ||
    isStalled ||
    props.activity?.turnError != null;
  const countsLabel = formatTurnActivityCountsLabel(counts);
  const headline = props.replayOutcome
    ? describeRetainedTurnHeadline(props.replayOutcome)
    : resolveTurnActivityHeadline({
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
    !(counts.hasGraphSubagentCounts && counts.subagentRunningCount >= 2) &&
    featuredItem?.detail &&
    featuredItem.detail !== headline
      ? featuredItem.detail
      : null;
  // A turn can delegate before it reports a single work item, and the tree is
  // the only thing that would say so — without this the list stays shut and the
  // agents are invisible until unrelated activity opens it. The same goes for
  // the route: Auto has picked the model before the first event arrives.
  const canExpand =
    (activityItems.length > 0 ||
      hasWorkGraphRows ||
      hasDelegationRows ||
      props.autoRouting != null ||
      props.executionSummary != null) &&
    !interactionCardOwnsFocus;
  // `0/4` says nothing, so the ratio only appears once work has landed.
  const showProgress =
    !interactionCardOwnsFocus &&
    counts.totalCount > 1 &&
    counts.completedCount > 0;
  const isListOpen = expanded && canExpand;
  // Inside the composer shelf the list is a section of the shelf's own
  // surface: no tuck, no surface of its own, and it fades in rather than
  // sliding, because the shelf around it is already on screen.
  const inline = listOnly && variant === "docked";

  return (
    <div
      data-testid="turn-activity-stack"
      data-variant={variant}
      data-chrome={chrome}
      className={sx(
        // Standalone docked pulls the composer up over its extra bottom
        // padding; the composer frame owns that tuck when frame-inset.
        variant === "docked" &&
          !inline &&
          (props.frameInset
            ? styles.stackDocked
            : styles.stackDockedStandalone),
        variant === "floating" && styles.stackFloating,
        variant === "panel" && styles.stackPanel,
        inline
          ? styles.stackInlineEnter
          : props.isLeaving
            ? styles.stackLeaving
            : styles.stackEnter,
      )}
    >
      <section
        aria-label={
          props.replayOutcome ? "Last turn activity" : "Turn activity"
        }
        data-testid="turn-activity"
        data-replay={props.replayOutcome}
        // A docked shelf takes its surface from the global
        // `.turn-activity-surface` class, which sits one step back from the
        // card surface; a floating or panelled one is a card in its own right.
        className={cx(
          variant === "docked" && !inline && "turn-activity-surface",
          sx(
            styles.surface,
            variant !== "docked" && styles.surfaceCard,
            variant === "docked" && !inline && styles.surfaceDocked,
            variant === "floating" && styles.surfaceFloating,
            variant === "panel" && styles.surfacePanel,
          ),
        )}
      >
        {listOnly && variant === "floating" ? (
          <TurnActivityFloatingGrip
            dragHandleProps={props.dragHandleProps}
            onClose={props.onClose}
          />
        ) : null}
        {listOnly ? null : (
        <div
          {...props.dragHandleProps}
          className={sx(
            styles.header,
            // Inside the frame this row is the shelf's visible box, and the
            // 0.75rem below it is spent on the tuck behind the card — so the
            // padding is symmetric at the tuck on both sides, matching the
            // status bar's mirrored padding.
            props.frameInset ? styles.headerInset : styles.headerStandard,
            expanded && canExpand && styles.headerExpanded,
            props.dragHandleProps && styles.headerGrab,
          )}
        >
          <span
            data-testid="turn-activity-loader"
            data-rest-mark={restMark ?? undefined}
            className={sx(styles.loaderSlot)}
          >
            {restMark ? (
              <TurnRestMark outcome={restMark} />
            ) : (
              <Loader
                aria-hidden
                cadence="reduced"
                className={
                  props.activity
                    ? toProviderWaveToneClass({
                        providerId: props.activity.providerId,
                      })
                    : sx(styles.loaderInk)
                }
                paused={isStalled || props.activity?.pendingInteraction != null}
                size="sm"
                variant={loaderVariant}
              />
            )}
          </span>
          <h2 className={sx(styles.srOnly)}>
            {props.replayOutcome ? "Last turn activity" : "Turn activity"}
          </h2>
          {props.replayOutcome ? (
            <span
              data-testid="turn-activity-replay-badge"
              className={sx(styles.replayBadge)}
            >
              Last turn
            </span>
          ) : null}
          <p
            aria-live="polite"
            className={sx(styles.headline)}
            title={
              headlineDetail ? `${headline} · ${headlineDetail}` : headline
            }
          >
            <span className={sx(styles.headlineTitle)}>{headline}</span>
            {headlineDetail ? (
              <span className={sx(styles.headlineDetail)}>
                {" "}
                · {headlineDetail}
              </span>
            ) : null}
          </p>
          {showProgress ? (
            <span
              className={sx(styles.progress)}
              data-testid="turn-activity-progress"
            >
              <VisuallyHidden>
                {counts.completedCount} of {counts.totalCount} activities done
              </VisuallyHidden>
              <span aria-hidden="true">
                {counts.completedCount}/{counts.totalCount}
              </span>
            </span>
          ) : null}
          {!expanded && !interactionCardOwnsFocus && hiddenItemCount > 0 ? (
            <span
              className={sx(
                styles.overflowCount,
                hiddenSeverity === "failed"
                  ? styles.overflowFailed
                  : hiddenSeverity === "waiting"
                    ? styles.overflowWaiting
                    : styles.overflowDefault,
              )}
              aria-label={`${hiddenItemCount} more activities`}
            >
              +{hiddenItemCount}
            </span>
          ) : null}
          {elapsedLabel ? (
            <span
              className={sx(styles.elapsed)}
              title={`Elapsed time: ${elapsedLabel}`}
            >
              <VisuallyHidden>Turn elapsed </VisuallyHidden>
              {elapsedLabel}
            </span>
          ) : null}
          {canExpand && variant !== "panel" ? (
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
                <ChevronDown className={sx(styles.chevron)} />
              ) : (
                <ChevronUp className={sx(styles.chevron)} />
              )}
            </Button>
          ) : null}
        </div>
        )}

        {isListOpen ? (
          <div
            data-testid="turn-activity-list"
            className={sx(
              styles.list,
              variant === "docked" && (inline ? styles.listInline : styles.listDocked),
              variant === "floating" && styles.listFloating,
              variant === "panel" && styles.listPanel,
            )}
          >
            <div className={sx(styles.listInner)}>
              {/* Where this turn sits: a delegated task says who delegated it before
                  it says what it is doing. */}
              <DelegatedTaskParentBacklink
                taskId={props.taskId}
                repositoryPath={props.repositoryPath}
                className={sx(styles.childBlockLead)}
              />
              {/* The model decision opens on demand so current activity stays visible. */}
              {props.autoRouting ? (
                <RouteTrace
                  record={props.autoRouting}
                  budgetStepDownAt={props.autoRoutingBudgetStepDownAt}
                  providerAvailability={props.providerAvailability}
                  defaultCollapsed
                  className={sx(styles.childBlock)}
                  data-testid="turn-activity-route"
                />
              ) : null}
              {visibleActivityItems.map((item) => (
                <TurnActivityRow
                  key={item.id}
                  item={item}
                  onSelectTool={props.onSelectTool}
                  onInspect={props.taskId ? () => setDetailSelection({ title: item.title, toolUseId: item.toolUseId, detail: [item.detail, item.providerDetail].filter(Boolean).join("\n") }) : undefined}
                  showStartOffset={variant === "panel"}
                  expandCopy={variant === "panel"}
                />
              ))}
              {/* One "Agents" block: the subagents this turn started and the
                  provider's own agent tree share a
                  header instead of stacking two lists that both say "agents". */}
              <DelegationsBlock
                exchanges={delegationExchanges}
                nowMs={props.activity?.completedAt ?? now}
                nested
                expandCopy={variant === "panel"}
                onAction={handleDelegationAction}
                onInspect={exchange => setDetailSelection({ title: exchange.title, exchange })}
                renderExtraActions={renderDelegationExtraActions}
                statusNoteFor={delegationStatusNoteFor}
                busyExchangeId={
                  childController.busyDelegationKey
                    ? `delegated-task:${childController.busyDelegationKey}`
                    : null
                }
                className={sx(styles.childBlock)}
              >
                {hasWorkGraphRows ? (
                  <WorkGraphTree
                    graph={props.workGraph}
                    now={props.activity?.completedAt ?? now}
                    capabilities={
                      props.workGraphCapabilities ?? NO_WORK_GRAPH_CAPABILITIES
                    }
                    onControl={props.onWorkGraphControl}
                    onSelectTool={props.onSelectTool}
                    onInspectAgent={node => setDetailSelection({ title: node.label, nodeKey: node.key })}
                    controlErrorByNodeKey={props.workGraphControlErrorByNodeKey}
                    className={sx(styles.childBlockNested)}
                    showHeading={!hasDelegationRows}
                    expandCopy={variant === "panel"}
                  />
                ) : null}
              </DelegationsBlock>
              {/* Docked and floating keep the tiles in the scrolling list.
                  The panel pins them to the rail floor below. */}
              {variant !== "panel" && props.executionSummary ? (
                <TaskExecutionSummarySurface
                  compact
                  summary={props.executionSummary}
                  showLatestActivity={false}
                  omitKeys={["elapsed", "agents"]}
                  className={sx(styles.childBlockPadded)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        {listOnly && !canExpand ? (
          <p className={sx(styles.listEmpty)}>
            The turn has not reported a step yet.
          </p>
        ) : null}
        {isListOpen && variant === "panel" && props.executionSummary ? (
          <div className={sx(styles.summaryPinned)}>
            <TaskExecutionSummarySurface compact layout="panel" summary={props.executionSummary}
              showLatestActivity={false} omitKeys={["elapsed", "agents", "usage", "account-limit", "headroom"]} />
            <details open data-testid="turn-activity-metrics">
              <summary className={sx(styles.metricsToggle)}>Usage and limits</summary>
              <TaskExecutionSummarySurface compact layout="panel" summary={props.executionSummary}
                showLatestActivity={false} omitKeys={["elapsed", "agents", "changes", "verification"]} />
            </details>
          </div>
        ) : null}
      </section>
      {detailSelection && props.taskId ? <ActivityDetailDialog
        key={detailSelection.nodeKey ?? detailSelection.exchange?.id ?? detailSelection.toolUseId ?? detailSelection.title}
        selection={detailSelection.exchange ? { ...detailSelection, exchange: delegationExchanges.find(exchange => exchange.id === detailSelection.exchange?.id) ?? detailSelection.exchange } : detailSelection}
        taskId={props.taskId} workspaceId={props.workspaceId ?? undefined} repositoryPath={props.repositoryPath ?? undefined}
        onAction={handleDelegationAction} renderExtraActions={renderDelegationExtraActions} statusNoteFor={delegationStatusNoteFor}
        graph={props.workGraph} onClose={() => setDetailSelection(null)} onShowInConversation={props.onSelectTool}
      /> : null}
    </div>
  );
});

/**
 * The floating card's grip: the drag handle and the close button, without the
 * status the composer shelf already shows.
 */
function TurnActivityFloatingGrip(props: {
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  onClose?: () => void;
}) {
  return (
    <div
      {...props.dragHandleProps}
      data-testid="turn-activity-floating-grip"
      className={sx(styles.floatingGrip, props.dragHandleProps && styles.headerGrab)}
    >
      <GripHorizontal aria-hidden className={sx(styles.floatingGripIcon)} />
      <h2 className={sx(styles.floatingGripTitle)}>Turn activity</h2>
      {props.onClose ? (
        <AdsButton
          variant="quiet"
          size="xs"
          iconOnly
          aria-label="Close the activity card"
          title="Close the activity card"
          onClick={props.onClose}
          xstyle={styles.floatingGripClose}
        >
          <X aria-hidden />
        </AdsButton>
      ) : null}
    </div>
  );
}

// Memoized so the shelf's per-second clock tick and the surrounding 60fps store
// churn do not re-render every row. Row objects are rebuilt only when their
// throttled source data actually changes.
const TurnActivityRow = memo(function TurnActivityRow({
  item,
  onSelectTool,
  onInspect,
  showStartOffset,
  expandCopy,
}: {
  item: TurnActivityItem;
  onSelectTool?: (toolUseId: string) => void;
  onInspect?: () => void;
  /**
   * Roomy placements also print where in the turn the row started. The docked
   * shelf is one composer-width line and cannot spare the column.
   */
  showStartOffset?: boolean;
  /**
   * The right-rail panel has height to spare, so titles and details wrap
   * instead of staying on one ellipsized line.
   */
  expandCopy?: boolean;
}) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const providerDetail =
    item.providerDetail && item.providerDetail !== item.title
      ? item.providerDetail
      : undefined;
  const isCompleted = item.status === "completed";
  const activation = resolveTurnActivityRowActivation(item);
  const handler = onInspect ? { onClick: onInspect, reveal: false } :
    activation?.kind === "tool" && onSelectTool
      ? { onClick: () => onSelectTool(activation.toolUseId), reveal: true }
      : null;
  const baseTitle = [item.title, detail, providerDetail]
    .filter((segment): segment is string => Boolean(segment))
    .join(" · ");
  const startOffsetLabel =
    showStartOffset && item.startOffsetSeconds != null
      ? formatStartOffsetSeconds(item.startOffsetSeconds)
      : null;
  const body = (
    <>
      <span className={sx(styles.rowStatusSlot)}>
        <TurnActivityStatusIcon status={item.status} iconKey={item.iconKey} />
      </span>
      <div className={sx(styles.rowBody)}>
        <p
          className={sx(
            styles.rowTitleLine,
            expandCopy && styles.rowTitleLineExpanded,
            isCompleted && styles.rowTitleLineDone,
          )}
        >
          <span
            className={sx(styles.rowTitle, expandCopy && styles.rowTitleExpanded)}
          >
            {item.title}
          </span>
          {item.badge ? (
            <Badge variant="outline" className={sx(styles.rowBadge)}>
              {item.badge}
            </Badge>
          ) : null}
        </p>
        {detail || providerDetail ? (
          // Docked keeps both halves on one ellipsized line. The panel wraps
          // them so a long path or command stays readable. They stay
          // typographically distinct: the provider half is monospaced, dimmer,
          // and fenced off by a hairline rule.
          <p
            className={sx(
              styles.rowDetailLine,
              expandCopy && styles.rowDetailLineExpanded,
            )}
          >
            {detail ? (
              <span
                className={sx(
                  styles.rowDetail,
                  expandCopy && styles.rowDetailExpanded,
                )}
              >
                {detail}
              </span>
            ) : null}
            {detail && providerDetail ? (
              <span aria-hidden className={sx(styles.rowDetailRule)} />
            ) : null}
            {providerDetail ? (
              <span
                className={sx(
                  styles.rowProviderDetail,
                  expandCopy && styles.rowProviderDetailExpanded,
                )}
              >
                {providerDetail}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {startOffsetLabel ? (
        <span className={sx(styles.rowStartOffset)}>
          <VisuallyHidden>
            Started {startOffsetLabel} into the turn
          </VisuallyHidden>
          <span aria-hidden="true">{startOffsetLabel}</span>
        </span>
      ) : null}
      {item.elapsedSeconds != null ? (
        <span className={sx(styles.rowElapsed)}>
          <VisuallyHidden>
            {getTurnActivityStatusLabel(item.status)},{" "}
            {formatTurnActivityElapsedSeconds(item.elapsedSeconds)} elapsed
          </VisuallyHidden>
          <span aria-hidden="true">
            {formatTurnActivityElapsedSeconds(item.elapsedSeconds)}
          </span>
        </span>
      ) : null}
    </>
  );
  if (!handler) {
    return (
      <div
        data-turn-activity-item-id={item.id}
        data-copy={expandCopy ? "expanded" : undefined}
        className={sx(styles.row, styles.rowMotion)}
        title={baseTitle}
      >
        {body}
      </div>
    );
  }

  return (
    <AdsButton
      layout="host"
      type="button"
      data-turn-activity-item-id={item.id}
      data-copy={expandCopy ? "expanded" : undefined}
      // `revealable` stays tool-only: it means "the transcript has this call".
      {...(handler.reveal
        ? { "data-turn-activity-revealable": "true" }
        : { "data-turn-activity-opens": "detail" })}
      xstyle={[
        surfaceChrome.quietIconButton,
        focusRing.ring,
        transition.control,
        styles.row,
        styles.rowMotion,
      ]}
      title={
        handler.reveal
          ? `${baseTitle} — show in conversation`
          : `${baseTitle} — details`
      }
      onClick={handler.onClick}
    >
      {body}
    </AdsButton>
  );
});

/** `+1m 4s` — how far into the turn a row's work began. */
function formatStartOffsetSeconds(value: number) {
  return `+${formatTurnActivityElapsedSeconds(value)}`;
}
