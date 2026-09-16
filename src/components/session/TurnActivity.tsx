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
  ChevronDown,
  ChevronUp,
  PanelBottomClose,
  PanelRight,
  PictureInPicture2,
} from "lucide-react";
import {
  ChildTaskParentBacklink,
  ChildTaskRowActions,
  useChildTaskRowController,
} from "@/components/session/ChildTaskRows";
import { DelegationsBlock } from "@/components/delegation/DelegationsBlock";
import { isRoutedDecision, RouteTrace } from "@/components/auto-routing";
import type { AutoRoutingDecisionRecord } from "@/store/auto-routing";
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
  useChildTasks,
  type ChildTaskListingSource,
} from "@/components/session/useChildTasks";
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
import type { AdvisorExchangeSnapshot } from "@/lib/providers/advisor-activity";
import {
  selectAdvisorConsultLog,
  type AdvisorConsultLogEntry,
} from "@/lib/providers/advisor-consult-log";
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
import { buildChildTaskExpectedIdentity } from "@/lib/runs/child-task-view";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import type { TurnActivityPlacement } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import type { TurnActivityFloatPosition } from "@/store/layout.utils";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import { resolvePromptDraftRuntimeState } from "@/store/prompt-draft-runtime";
import type { ChatMessage, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_CONSULTS: readonly AdvisorConsultLogEntry[] = [];
const CHILD_TASKS_UNAVAILABLE = {
  ok: false as const,
  error: "Child task controls are unavailable on this surface.",
};
/** Stable no-op source for surfaces rendered without a child-task listing. */
const EMPTY_CHILD_SOURCE: ChildTaskListingSource = {
  children: [],
  actions: {
    followUp: async () => CHILD_TASKS_UNAVAILABLE,
    retry: async () => CHILD_TASKS_UNAVAILABLE,
    stop: async () => CHILD_TASKS_UNAVAILABLE,
    detach: async () => CHILD_TASKS_UNAVAILABLE,
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

/**
 * Which surface is asking to render the shelf. The container renders only
 * when the user's `turnActivityPlacement` setting matches, so exactly one
 * host shows the activity at a time:
 *
 * - `docked` — mounted by `ChatInput` in the composer frame's top slot (default).
 * - `floating` — mounted in `ChatArea`'s overlay as a draggable card.
 * - `panel` — mounted by the right rail's Activity panel.
 */
export function TurnActivity(props: {
  host?: TurnActivityPlacement;
  frameInset?: boolean;
}) {
  const host = props.host ?? "docked";
  const placement = useAppStore(
    (state) => state.settings.turnActivityPlacement,
  );
  if (placement !== host) return null;
  return <ActiveTurnActivity key={host} {...props} host={host} />;
}

// Gate before the subscriptions, projections and effects. An inactive host
// must not rebuild the transcript summary or synchronize an empty child list.
function ActiveTurnActivity(props: {
  host: TurnActivityPlacement;
  frameInset?: boolean;
}) {
  const host = props.host;
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
    advisorExchange,
    advisorConsults,
    expandedByDefault,
    verification,
    rateLimits,
    activeWorkspaceId,
    projectPath,
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
      state.advisorExchangeByTask[taskId] ?? null,
      // The stable per-task entry array: it changes a handful of times per
      // turn (once per consult step), and the shelf's Agents block needs every
      // consult of the turn, not only the latest snapshot.
      selectAdvisorConsultLog(state.advisorConsultLogByTask, taskId),
      state.settings.turnActivityExpandedByDefault,
      state.turnVerificationByWorkspace[state.activeWorkspaceId] ?? null,
      state.rateLimitsSnapshot,
      state.activeWorkspaceId,
      state.projectPath,
      state.providerRuntimeCapabilities,
      state.autoRoutingDecisionByTask[taskId] ?? null,
      state.settings.autoRoutingProfile.budgetGuard.stepDownAt,
      state.providerAvailability,
    ]),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLayout = useAppStore((state) => state.setLayout);
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
  const openAdvisorConsultLog = useAppStore(
    (state) => state.openAdvisorConsultLog,
  );
  const handleOpenAdvisorLog = useCallback(
    (entryKey?: string) => {
      openAdvisorConsultLog({ taskId, ...(entryKey ? { entryKey } : {}) });
    },
    [openAdvisorConsultLog, taskId],
  );
  const skipTaskAdvisor = useAppStore((state) => state.skipTaskAdvisor);
  const handleCancelAdvisorConsult = useCallback(() => {
    skipTaskAdvisor({ taskId });
  }, [skipTaskAdvisor, taskId]);
  const hasAdvisorConsultLog = advisorConsults.length > 0;
  const handlePlacementChange = useCallback(
    (next: TurnActivityPlacement) => {
      updateSettings({ patch: { turnActivityPlacement: next } });
      // Moving into the panel must also surface it, or the activity would
      // silently vanish until the user finds the rail icon.
      if (next === "panel") {
        setLayout({
          patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "activity" },
        });
      }
    },
    [setLayout, updateSettings],
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
    hasReplay: replay != null,
  });

  // Read once here rather than inside the rows: the same listing has to reach
  // both the child task rows and the turn's graph, and two subscriptions to one
  // ledger would double every refetch and let the two views disagree mid-flight.
  const childTasks = useChildTasks({
    parentTaskId: taskId,
    parentWorkspaceId: activeWorkspaceId,
    projectPath,
    enabled: shouldShow,
  });
  const { children: childTaskRows } = childTasks;
  // Only the rows and the controls travel down, and they travel as their own
  // object: the hook's result is rebuilt on every render, and its `loading`
  // flag flips twice per refetch, so passing the whole thing would defeat the
  // shelf's memo and re-render every row on a listing nothing read.
  const childTaskSource = useMemo(
    () => ({ children: childTaskRows, actions: childTasks.actions }),
    [childTaskRows, childTasks.actions],
  );
  const syncChildTasksIntoTurnGraph = useAppStore(
    (state) => state.syncChildTasksIntoTurnGraph,
  );
  useEffect(() => {
    if (!taskId) {
      return;
    }
    syncChildTasksIntoTurnGraph({ taskId, children: childTaskRows });
  }, [childTaskRows, syncChildTasksIntoTurnGraph, taskId]);

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
  const childTaskActions = childTasks.actions;
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
          "Only a delegated child task can be stopped from this row.",
        );
        return;
      }
      const child = childTaskRows.find(
        (row) => row.delegationKey === node.delegationKey,
      );
      // The graph learns about a delegation from the turn's own tool call,
      // which lands before the ledger listing catches up. Stop needs the
      // ledger's identity, so there is a real window where it cannot be sent.
      if (!child) {
        setControlError(
          node.key,
          "This child task is still being recorded. Try again in a moment.",
        );
        return;
      }
      setControlError(node.key, null);
      void childTaskActions
        .stop({
          delegationKey: child.delegationKey,
          expected: buildChildTaskExpectedIdentity(child),
        })
        .then((result) => {
          if (!result.ok) {
            setControlError(
              node.key,
              result.error ?? "This child task could not be stopped.",
            );
          }
        });
    },
    [childTaskActions, childTaskRows, setControlError],
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
  // Scoped to the turn this shelf is showing. The advisor slice keeps the last
  // turn's record until the next one starts, and attributing it to a new turn
  // would credit that turn with consults it never made. Not throttled: consults
  // arrive a handful of times per turn, not per frame.
  const turnAdvisorExchange = useMemo(() => {
    const shelfTurnId = activeTurnId ?? currentActivity?.turnId ?? null;
    if (!advisorExchange || !shelfTurnId) {
      return null;
    }
    return advisorExchange.turnId === shelfTurnId ? advisorExchange : null;
  }, [activeTurnId, advisorExchange, currentActivity?.turnId]);

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
      advisorExchange: turnAdvisorExchange,
      workGraph: throttledWorkGraph,
      // A finished turn's agents cannot be stopped, so replay shows the tree
      // without controls rather than buttons that can only report a refusal.
      workGraphCapabilities: replay
        ? NO_WORK_GRAPH_CAPABILITIES
        : runtimeCapabilities[activeProvider].workGraph,
      ...(replay ? {} : { onWorkGraphControl: handleWorkGraphControl }),
      workGraphControlErrorByNodeKey: controlErrorByNodeKey,
      childTasks: childTaskSource,
      expandedByDefault,
      hasPendingInteractionCard,
      executionSummary,
      onSelectTool: handleSelectTool,
      hasAdvisorConsultLog,
      advisorConsults,
      onOpenAdvisorLog: handleOpenAdvisorLog,
      ...(replay ? {} : { onCancelAdvisorConsult: handleCancelAdvisorConsult }),
      taskId,
      workspaceId: activeWorkspaceId,
      projectPath,
      ...(replay ? { replayOutcome: replay.outcome } : {}),
    };
  }, [
    activeProvider,
    activeTurnId,
    activeWorkspaceId,
    advisorConsults,
    budgetStepDownAt,
    providerAvailability,
    turnAutoRouting,
    childTaskSource,
    controlErrorByNodeKey,
    currentActivity,
    expandedByDefault,
    executionSummary,
    handleCancelAdvisorConsult,
    handleOpenAdvisorLog,
    handleSelectTool,
    handleWorkGraphControl,
    hasAdvisorConsultLog,
    hasPendingInteractionCard,
    isPlanPreparing,
    projectPath,
    replay,
    runtimeCapabilities,
    shouldShow,
    taskId,
    throttledTodos,
    throttledWorkGraph,
    throttledWorkItems,
    turnAdvisorExchange,
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
    if (host === "panel") {
      return (
        <div
          data-testid="turn-activity-panel-idle"
          className={sx(styles.panelIdle)}
        >
          Activity appears here while a turn is running.
        </div>
      );
    }
    return null;
  }

  const sharedProps = {
    ...visibleProps,
    isLeaving: leavingProps != null,
    placement: host,
    onPlacementChange: handlePlacementChange,
  };
  const surfaceKey = `${taskId}:${visibleProps.activeTurnId}`;

  if (host === "floating") {
    return (
      <TurnActivityFloatingShell>
        {(dragHandleProps) => (
          <TurnActivitySurface
            key={surfaceKey}
            {...sharedProps}
            variant="floating"
            dragHandleProps={dragHandleProps}
          />
        )}
      </TurnActivityFloatingShell>
    );
  }

  return (
    <TurnActivitySurface
      key={surfaceKey}
      {...sharedProps}
      variant={host}
      frameInset={props.frameInset}
    />
  );
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

interface TurnActivitySurfaceProps {
  activeTurnId: string;
  activity: ProviderTurnActivitySnapshot | null;
  isPlanPreparing: boolean;
  workItems: ProviderTurnWorkItem[];
  todos: TurnActivityTodo[];
  /**
   * This turn's Advisor grant, if one was minted. The shelf counts consults;
   * the floating exchange card still owns each consult's detail.
   */
  advisorExchange?: AdvisorExchangeSnapshot | null;
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
  childTasks?: ChildTaskListingSource;
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
   * The task has archived consults, so the advisor row opens the consult log.
   * Gated on the log rather than on this turn, so a turn that armed the Advisor
   * without consulting it still reaches earlier consults.
   */
  hasAdvisorConsultLog?: boolean;
  /**
   * The task's archived consults (stable store array). The Agents block shows
   * every consult of this turn as its own row, not only the latest snapshot.
   */
  advisorConsults?: readonly AdvisorConsultLogEntry[];
  /** Opens the session consult log, focused on one consult when given. */
  onOpenAdvisorLog?: (entryKey?: string) => void;
  /** Cancels the consult in flight; absent on replay, where nothing can be. */
  onCancelAdvisorConsult?: () => void;
  /**
   * The routing decision that picked this turn's model, when Auto made one.
   * Drawn as the Route block so the shelf says who is running and why before
   * it lists what they are doing.
   */
  autoRouting?: AutoRoutingDecisionRecord | null;
  /** Usage percent at which the budget guard steps down; marks the chip. */
  autoRoutingBudgetStepDownAt?: number;
  providerAvailability?: Partial<Record<ProviderId, boolean>>;
  /** Identity of the task this shelf belongs to, used by the child-task rows. */
  taskId?: string;
  workspaceId?: string | null;
  projectPath?: string | null;
  /**
   * Which host chrome to render: the docked shelf tucked under the composer
   * (default), a bordered floating card, or a full-height panel body.
   */
  variant?: TurnActivityPlacement;
  /** Current placement setting; drives which placement controls render. */
  placement?: TurnActivityPlacement;
  /** Renders placement-switch buttons in the header when provided. */
  onPlacementChange?: (placement: TurnActivityPlacement) => void;
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

export const TurnActivitySurface = memo(function TurnActivitySurface(
  props: TurnActivitySurfaceProps,
) {
  const variant = props.variant ?? "docked";
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
    : variant === "panel"
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
        advisor: props.advisorExchange ?? null,
        hasAdvisorConsultLog: props.hasAdvisorConsultLog ?? false,
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
      props.advisorExchange,
      props.hasAdvisorConsultLog,
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
  const childController = useChildTaskRowController({
    source: props.childTasks ?? EMPTY_CHILD_SOURCE,
    projectPath: props.projectPath,
  });
  const turnConsults = useMemo(
    () =>
      (props.advisorConsults ?? EMPTY_CONSULTS).filter(
        (entry) => entry.snapshot.turnId === props.activeTurnId,
      ),
    [props.activeTurnId, props.advisorConsults],
  );
  const advisorCanCancel =
    props.onCancelAdvisorConsult !== undefined &&
    props.advisorExchange?.outcome === "pending";
  const delegationExchanges = useMemo(
    () =>
      selectDelegationExchanges({
        consults: turnConsults,
        advisorSnapshot: props.advisorExchange ?? null,
        activeTurnId: props.activeTurnId,
        workerWorkItems: props.workItems,
        childTasks: childController.children,
        childBlockedByDelegationKey: childController.blockedByDelegationKey,
        advisorOptions: {
          canCancel: advisorCanCancel,
          hasConsultLog: props.hasAdvisorConsultLog,
        },
      }).map((exchange) =>
        // The shared child-task action row renders the real controls.
        exchange.kind === "child-task"
          ? { ...exchange, actions: [] }
          : exchange,
      ),
    [
      advisorCanCancel,
      childController.blockedByDelegationKey,
      childController.children,
      props.activeTurnId,
      props.advisorExchange,
      props.hasAdvisorConsultLog,
      props.workItems,
      turnConsults,
    ],
  );
  const hasDelegationRows = delegationExchanges.length > 0;
  const hasAdvisorExchangeRow = delegationExchanges.some(
    (exchange) => exchange.kind === "advisor",
  );
  const workerWorkItemIds = useMemo(
    () =>
      new Set(
        props.workItems
          .filter((item) => item.workerExecution)
          .map((item) => `work:${item.id}`),
      ),
    [props.workItems],
  );
  const onOpenAdvisorLog = props.onOpenAdvisorLog;
  const onCancelAdvisorConsult = props.onCancelAdvisorConsult;
  const onSelectTool = props.onSelectTool;
  const handleDelegationAction = useCallback(
    (action: DelegationActionId, exchange: DelegationExchange) => {
      switch (action) {
        case "cancel":
          onCancelAdvisorConsult?.();
          return;
        case "open-log":
          onOpenAdvisorLog?.(exchange.ref.entryKey);
          return;
        case "show-in-conversation":
          if (exchange.ref.toolUseId) {
            onSelectTool?.(exchange.ref.toolUseId);
          }
          return;
        default:
          return;
      }
    },
    [onCancelAdvisorConsult, onOpenAdvisorLog, onSelectTool],
  );
  const renderDelegationExtraActions = useCallback(
    (exchange: DelegationExchange) => {
      if (exchange.kind !== "child-task" || !exchange.ref.delegationKey) {
        return null;
      }
      const child = childController.children.find(
        (row) => row.delegationKey === exchange.ref.delegationKey,
      );
      if (!child) {
        return null;
      }
      return (
        <ChildTaskRowActions
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
  // A consult in flight opens expanded where there is room, so Cancel and the
  // deadline are one glance away — what the retired floating card offered.
  const defaultExpandedDelegationIds = useMemo(
    () =>
      new Set(
        variant === "docked"
          ? []
          : delegationExchanges
              .filter(
                (exchange) =>
                  exchange.kind === "advisor" &&
                  exchange.outcome.status === "running",
              )
              .map((exchange) => exchange.id),
      ),
    [delegationExchanges, variant],
  );

  // Rows the Agents block already renders leave the flat list: the advisor
  // consult row, worker runs, and (when the tree has rows) subagents.
  const visibleActivityItems = useMemo(
    () =>
      activityItems.filter((item) => {
        if (hasWorkGraphRows && item.iconKey === "subagent") {
          return false;
        }
        if (hasAdvisorExchangeRow && item.id === "advisor") {
          return false;
        }
        if (hasDelegationRows && workerWorkItemIds.has(item.id)) {
          return false;
        }
        return true;
      }),
    [
      activityItems,
      hasAdvisorExchangeRow,
      hasDelegationRows,
      hasWorkGraphRows,
      workerWorkItemIds,
    ],
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

  return (
    <div
      data-testid="turn-activity-stack"
      data-variant={variant}
      className={sx(
        // Standalone docked pulls the composer up over its extra bottom
        // padding; the composer frame owns that tuck when frame-inset.
        variant === "docked" &&
          (props.frameInset
            ? styles.stackDocked
            : styles.stackDockedStandalone),
        variant === "floating" && styles.stackFloating,
        variant === "panel" && styles.stackPanel,
        props.isLeaving ? styles.stackLeaving : styles.stackEnter,
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
          variant === "docked" && "turn-activity-surface",
          sx(
            styles.surface,
            variant !== "docked" && styles.surfaceCard,
            variant === "docked" && styles.surfaceDocked,
            variant === "floating" && styles.surfaceFloating,
            variant === "panel" && styles.surfacePanel,
          ),
        )}
      >
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
            className={sx(styles.loaderSlot)}
          >
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
              paused={
                isStalled ||
                props.activity?.pendingInteraction != null ||
                props.activity?.completedAt != null
              }
              size="sm"
              variant={loaderVariant}
            />
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
          {props.onPlacementChange ? (
            <TurnActivityPlacementControls
              placement={props.placement ?? variant}
              onPlacementChange={props.onPlacementChange}
            />
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

        {isListOpen ? (
          <div
            data-testid="turn-activity-list"
            className={sx(
              styles.list,
              variant === "docked" && styles.listDocked,
              variant === "floating" && styles.listFloating,
              variant === "panel" && styles.listPanel,
            )}
          >
            <div className={sx(styles.listInner)}>
              {/* Where this turn sits: a child task says who delegated it before
                  it says what it is doing. */}
              <ChildTaskParentBacklink
                taskId={props.taskId}
                projectPath={props.projectPath}
                className={sx(styles.childBlockLead)}
              />
              {/* Who runs this turn and why, before what they are doing. The
                  docked shelf is short, so it opens folded to the one-line
                  answer; the taller hosts show the chain. */}
              {props.autoRouting ? (
                <RouteTrace
                  record={props.autoRouting}
                  budgetStepDownAt={props.autoRoutingBudgetStepDownAt}
                  providerAvailability={props.providerAvailability}
                  defaultCollapsed={variant === "docked"}
                  className={sx(styles.childBlock)}
                  data-testid="turn-activity-route"
                />
              ) : null}
              {visibleActivityItems.map((item) => (
                <TurnActivityRow
                  key={item.id}
                  item={item}
                  onSelectTool={props.onSelectTool}
                  onOpenAdvisorLog={props.onOpenAdvisorLog}
                  showStartOffset={variant === "panel"}
                />
              ))}
              {/* One "Agents" block: delegations the user armed (advisor,
                  worker, child tasks) and the provider's own agent tree share a
                  header instead of stacking two lists that both say "agents". */}
              <DelegationsBlock
                exchanges={delegationExchanges}
                nowMs={props.activity?.completedAt ?? now}
                nested
                onAction={handleDelegationAction}
                renderExtraActions={renderDelegationExtraActions}
                statusNoteFor={delegationStatusNoteFor}
                busyExchangeId={
                  childController.busyDelegationKey
                    ? `child-task:${childController.busyDelegationKey}`
                    : null
                }
                defaultExpandedIds={defaultExpandedDelegationIds}
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
                    controlErrorByNodeKey={props.workGraphControlErrorByNodeKey}
                    className={sx(styles.childBlockNested)}
                    showHeading={!hasDelegationRows}
                  />
                ) : null}
              </DelegationsBlock>
              {/* Outcome facts last — changes, verification, usage, headroom.
                  Elapsed is already in the header and the agent count is the
                  block above, so neither tile repeats here. */}
              {props.executionSummary ? (
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
      </section>
    </div>
  );
});

const PLACEMENT_CONTROLS: Array<{
  placement: TurnActivityPlacement;
  label: string;
  Icon: typeof PanelBottomClose;
}> = [
  {
    placement: "docked",
    label: "Dock turn activity above the input",
    Icon: PanelBottomClose,
  },
  {
    placement: "floating",
    label: "Float turn activity over the chat",
    Icon: PictureInPicture2,
  },
  {
    placement: "panel",
    label: "Show turn activity in the side panel",
    Icon: PanelRight,
  },
];

function TurnActivityPlacementControls(props: {
  placement: TurnActivityPlacement;
  onPlacementChange: (placement: TurnActivityPlacement) => void;
}) {
  return (
    <span className={sx(styles.placementGroup)}>
      {PLACEMENT_CONTROLS.filter(
        (control) => control.placement !== props.placement,
      ).map(({ placement, label, Icon }) => (
        <Button
          key={placement}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          title={label}
          className={sx(styles.placementButton)}
          onClick={() => props.onPlacementChange(placement)}
        >
          <Icon className={sx(styles.chevron)} />
        </Button>
      ))}
    </span>
  );
}

// Memoized so the shelf's per-second clock tick and the surrounding 60fps store
// churn do not re-render every row. Row objects are rebuilt only when their
// throttled source data actually changes.
const TurnActivityRow = memo(function TurnActivityRow({
  item,
  onSelectTool,
  onOpenAdvisorLog,
  showStartOffset,
}: {
  item: TurnActivityItem;
  onSelectTool?: (toolUseId: string) => void;
  onOpenAdvisorLog?: (entryKey?: string) => void;
  /**
   * Roomy placements also print where in the turn the row started. The docked
   * shelf is one composer-width line and cannot spare the column.
   */
  showStartOffset?: boolean;
}) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const providerDetail =
    item.providerDetail && item.providerDetail !== item.title
      ? item.providerDetail
      : undefined;
  const isCompleted = item.status === "completed";
  const activation = resolveTurnActivityRowActivation(item);
  const handler =
    activation?.kind === "tool" && onSelectTool
      ? { onClick: () => onSelectTool(activation.toolUseId), reveal: true }
      : activation?.kind === "advisor-log" && onOpenAdvisorLog
        ? { onClick: () => onOpenAdvisorLog(), reveal: false }
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
            isCompleted && styles.rowTitleLineDone,
          )}
        >
          <span className={sx(styles.rowTitle)}>{item.title}</span>
          {item.badge ? (
            <Badge variant="outline" className={sx(styles.rowBadge)}>
              {item.badge}
            </Badge>
          ) : null}
        </p>
        {detail || providerDetail ? (
          // Normalized detail and raw provider detail share one line so a row
          // never grows past two, but they are typographically distinct: the
          // provider half is monospaced, dimmer, and fenced off by a hairline
          // rule, so it reads as the provider talking rather than as Stave's
          // own description of the step.
          <p className={sx(styles.rowDetailLine)}>
            {detail ? (
              <span className={sx(styles.rowDetail)}>{detail}</span>
            ) : null}
            {detail && providerDetail ? (
              <span aria-hidden className={sx(styles.rowDetailRule)} />
            ) : null}
            {providerDetail ? (
              <span className={sx(styles.rowProviderDetail)}>
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
      // `revealable` stays tool-only: it means "the transcript has this call".
      {...(handler.reveal
        ? { "data-turn-activity-revealable": "true" }
        : { "data-turn-activity-opens": "advisor-consult-log" })}
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
          : `${baseTitle} — view all consults`
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
