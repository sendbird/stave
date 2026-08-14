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
import { ThinkingOrb } from "thinking-orbs";
import {
  ChildTaskParentBacklink,
  ChildTaskRows,
} from "@/components/session/ChildTaskRows";
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
  buildTurnActivityItems,
  countTurnActivityItems,
  describeRetainedTurnHeadline,
  formatTurnActivityCountsLabel,
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivityFeaturedItem,
  resolveTurnActivityHeadline,
  resolveTurnActivityHiddenSeverity,
  resolveTurnActivityOrbState,
  resolveTurnActivityReplay,
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
  type RetainedTurnOutcome,
} from "@/lib/providers/turn-status";
import { buildChildTaskExpectedIdentity } from "@/lib/runs/child-task-view";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";
import { cn } from "@/lib/utils";
import type { TurnActivityPlacement } from "@/store/app-settings";
import { useAppStore } from "@/store/app.store";
import type { TurnActivityFloatPosition } from "@/store/layout.utils";
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

/**
 * Which surface is asking to render the shelf. The container renders only
 * when the user's `turnActivityPlacement` setting matches, so exactly one
 * host shows the activity at a time:
 *
 * - `docked` — mounted by `ChatInput` above the composer (default).
 * - `floating` — mounted in `ChatArea`'s overlay as a draggable card.
 * - `panel` — mounted by the right rail's Activity panel.
 */
export function TurnActivity(props: { host?: TurnActivityPlacement }) {
  const host = props.host ?? "docked";
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
    expandedByDefault,
    verification,
    rateLimits,
    activeWorkspaceId,
    projectPath,
    runtimeCapabilities,
    placement,
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
      state.settings.turnActivityExpandedByDefault,
      state.turnVerificationByWorkspace[state.activeWorkspaceId] ?? null,
      state.rateLimitsSnapshot,
      state.activeWorkspaceId,
      state.projectPath,
      state.providerRuntimeCapabilities,
      state.settings.turnActivityPlacement,
    ]),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setLayout = useAppStore((state) => state.setLayout);
  const focusTranscriptTool = useAppStore((state) => state.focusTranscriptTool);
  const placementMatchesHost = placement === host;
  // A row names a tool call the transcript already renders in full. Without
  // this the only way from "that grep looks wrong" to its output was scrolling
  // the conversation by hand.
  const handleSelectTool = useCallback(
    (toolUseId: string) => {
      focusTranscriptTool({ taskId, toolUseId });
    },
    [focusTranscriptTool, taskId],
  );
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
    enabled: shouldShow && placementMatchesHost,
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
  const setControlError = useCallback((nodeKey: string, error: string | null) => {
    setControlErrorByNodeKey((current) => {
      if (!error) {
        if (!(nodeKey in current)) {
          return current;
        }
        const next = { ...current };
        delete next[nodeKey];
        return next;
      }
      return current[nodeKey] === error ? current : { ...current, [nodeKey]: error };
    });
  }, []);
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
  // The graph is rebuilt by the same per-frame flush as the work items, and the
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
      taskId,
      workspaceId: activeWorkspaceId,
      projectPath,
      ...(replay ? { replayOutcome: replay.outcome } : {}),
    };
  }, [
    activeProvider,
    activeTurnId,
    activeWorkspaceId,
    childTaskSource,
    controlErrorByNodeKey,
    currentActivity,
    expandedByDefault,
    executionSummary,
    handleSelectTool,
    handleWorkGraphControl,
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
  if (!placementMatchesHost) {
    return null;
  }
  if (!visibleProps) {
    if (host === "panel") {
      return (
        <div
          data-testid="turn-activity-panel-idle"
          className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground"
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
    placement,
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
    <TurnActivitySurface key={surfaceKey} {...sharedProps} variant={host} />
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

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
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
    },
    [],
  );

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
      <div className="pointer-events-auto w-[min(26rem,80vw)]">
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
      data-variant={variant}
      className={cn(
        variant === "docked" &&
          // The shelf slides under the prompt input: `-mb-3` pulls the composer
          // up over the surface's extra `pb-3`, so the squared bottom edge reads
          // as tucked behind the composer instead of floating above it.
          "relative z-0 mx-3 -mb-3",
        variant === "floating" && "relative",
        variant === "panel" && "flex h-full min-h-0 flex-col",
        props.isLeaving
          ? "pointer-events-none motion-safe:animate-out motion-safe:fade-out motion-safe:slide-out-to-bottom-2 motion-safe:fill-mode-forwards"
          : "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        "motion-reduce:transition-none",
      )}
    >
      <section
        aria-label={props.replayOutcome ? "Last turn activity" : "Turn activity"}
        data-testid="turn-activity"
        data-replay={props.replayOutcome}
        className={cn(
          "relative flex min-h-0 flex-col overflow-hidden bg-card",
          variant === "docked" &&
            "turn-activity-surface rounded-t-xl rounded-b-none pb-3",
          variant === "floating" &&
            "rounded-xl border border-border/80 pb-2 shadow-lg",
          variant === "panel" && "flex-1 pb-2",
          "transition-[box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none",
        )}
      >
        <div
          {...props.dragHandleProps}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2.5 px-3 py-2",
            expanded && canExpand && "border-b border-border/50 bg-muted/10",
            props.dragHandleProps && "cursor-grab select-none touch-none",
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
          <h2 className="sr-only">
            {props.replayOutcome ? "Last turn activity" : "Turn activity"}
          </h2>
          {props.replayOutcome ? (
            <span
              data-testid="turn-activity-replay-badge"
              className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Last turn
            </span>
          ) : null}
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
            className={cn(
              "min-h-0 overflow-y-auto overscroll-contain bg-muted/10",
              variant === "docked" && "max-h-[min(12rem,28vh)]",
              variant === "floating" && "max-h-[min(24rem,55vh)]",
              variant === "panel" && "flex-1",
            )}
          >
            <div className="px-1.5 py-1.5">
              {activityItems.map((item) => (
                <TurnActivityRow
                  key={item.id}
                  item={item}
                  onSelectTool={props.onSelectTool}
                  showStartOffset={variant === "panel"}
                />
              ))}
              <WorkGraphTree
                graph={props.workGraph}
                capabilities={
                  props.workGraphCapabilities ?? NO_WORK_GRAPH_CAPABILITIES
                }
                onControl={props.onWorkGraphControl}
                controlErrorByNodeKey={props.workGraphControlErrorByNodeKey}
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
                source={props.childTasks}
                className="px-1.5 pb-1 pt-2"
              />
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
    <span className="flex shrink-0 items-center gap-0.5">
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
          className="text-muted-foreground hover:text-foreground"
          onClick={() => props.onPlacementChange(placement)}
        >
          <Icon className="size-3.5" />
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
  showStartOffset,
}: {
  item: TurnActivityItem;
  onSelectTool?: (toolUseId: string) => void;
  /**
   * Roomy placements also print where in the turn the row started. The docked
   * shelf is one composer-width line and cannot spare the column.
   */
  showStartOffset?: boolean;
}) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const isCompleted = item.status === "completed";
  const toolUseId = item.toolUseId;
  const canReveal = Boolean(toolUseId && onSelectTool);
  const baseTitle = detail ? `${item.title} · ${detail}` : item.title;
  const startOffsetLabel =
    showStartOffset && item.startOffsetSeconds != null
      ? formatStartOffsetSeconds(item.startOffsetSeconds)
      : null;
  const body = (
    <>
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
      {startOffsetLabel ? (
        <span className="shrink-0 pt-0.5 text-[11px] leading-4 tabular-nums text-muted-foreground/70">
          <span className="sr-only">Started {startOffsetLabel} into the turn</span>
          <span aria-hidden="true">{startOffsetLabel}</span>
        </span>
      ) : null}
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
    </>
  );
  const layoutClassName = cn(
    "flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5 text-left",
    // Rows mount once and keep their slot, so this plays exactly when a new
    // activity appears instead of on every update.
    "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
  );

  if (!canReveal || !toolUseId || !onSelectTool) {
    return (
      <div
        data-turn-activity-item-id={item.id}
        className={layoutClassName}
        title={baseTitle}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-turn-activity-item-id={item.id}
      data-turn-activity-revealable="true"
      className={cn(
        layoutClassName,
        "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none",
      )}
      title={`${baseTitle} — show in conversation`}
      onClick={() => onSelectTool(toolUseId)}
    >
      {body}
    </button>
  );
});

/** `+1m 4s` — how far into the turn a row's work began. */
function formatStartOffsetSeconds(value: number) {
  return `+${formatElapsedSeconds(value)}`;
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
