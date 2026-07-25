import { useEffect, useMemo, useState } from "react";
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
  Workflow,
} from "lucide-react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { type TodoItem } from "@/components/ai-elements/todo";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import { resolvePlanViewerState } from "@/components/session/plan-viewer.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { findLatestTodoPart } from "@/components/session/todo-floater.utils";
import {
  promoteFirstPendingTodoForActiveTurn,
  resolveTurnActivitySummary,
  resolveTurnActivityVisibility,
  type TurnActivityRowStatus,
} from "@/components/session/turn-activity.utils";
import { Button } from "@/components/ui";
import {
  formatProviderTurnElapsedDuration,
  formatProviderTurnIdleDuration,
  clearProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
  type ProviderTurnWorkItem,
  type ProviderTurnWorkStatus,
} from "@/lib/providers/turn-status";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
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
  const todos = useMemo<TodoItem[]>(() => {
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
  const currentActivity =
    activity?.turnId === activeTurnId || hasRetainedFailure ? activity : null;
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

  if (!shouldShow) {
    return null;
  }

  return (
    <TurnActivitySurface
      key={`${taskId}:${activeTurnId}`}
      activeTurnId={activeTurnId ?? currentActivity?.turnId ?? ""}
      activity={currentActivity}
      isPlanPreparing={isPlanPreparing}
      workItems={workItems}
      todos={todos}
    />
  );
}

export function TurnActivitySurface(props: {
  activeTurnId: string;
  activity: ProviderTurnActivitySnapshot | null;
  isPlanPreparing: boolean;
  workItems: ProviderTurnWorkItem[];
  todos: TodoItem[];
}) {
  const [expanded, setExpanded] = useState(false);
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
  const featuredItem =
    activityItems.find((item) =>
      ["waiting", "failed", "running"].includes(item.status),
    ) ??
    activityItems[0] ??
    null;
  const remainingItems = featuredItem
    ? activityItems.filter((item) => item.id !== featuredItem.id)
    : [];
  const orbState = resolveTurnActivityOrbState({
    activity: props.activity,
    isPlanPreparing: props.isPlanPreparing,
    workItems: props.workItems,
  });
  const headline = featuredItem?.title ?? summary.label;
  const headlineDetail =
    featuredItem?.detail && featuredItem.detail !== featuredItem.title
      ? featuredItem.detail
      : null;
  const headlineElapsed =
    featuredItem?.elapsedSeconds != null
      ? formatElapsedSeconds(featuredItem.elapsedSeconds)
      : elapsedLabel;
  const canExpand = remainingItems.length > 0;

  return (
    <div
      data-testid="turn-activity-stack"
      className={cn(
        "relative mx-3 mb-1",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
        "motion-reduce:transition-none",
      )}
    >
      <section
        aria-label="Turn activity"
        data-testid="turn-activity"
        className={cn(
          "turn-activity-surface relative flex min-h-0 flex-col overflow-hidden rounded-xl bg-card",
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
          </p>
          {remainingItems.length > 0 ? (
            <span
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              aria-label={`${remainingItems.length} more activities`}
            >
              +{remainingItems.length}
            </span>
          ) : null}
          {headlineElapsed ? (
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              title={`Elapsed time: ${headlineElapsed}`}
            >
              {headlineElapsed}
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
              onClick={() => setExpanded((value) => !value)}
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
          <div className="max-h-[min(18rem,42vh)] min-h-0 overflow-y-auto overscroll-contain bg-muted/10 px-1.5 py-1.5">
            {remainingItems.map((item) => (
              <TurnActivityRow key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

interface TurnActivityListItem {
  id: string;
  status: TurnActivityRowStatus | ProviderTurnWorkStatus;
  title: string;
  detail?: string;
  elapsedSeconds?: number;
  completed?: boolean;
  icon: typeof Bot;
}

function resolveTodoStatus(todo: TodoItem): TurnActivityRowStatus {
  if (todo.status === "completed") {
    return "completed";
  }
  if (todo.status === "in_progress") {
    return "running";
  }
  return "pending";
}

function buildTurnActivityItems(args: {
  activity: ProviderTurnActivitySnapshot | null;
  idleLabel: string | null;
  isPlanPreparing: boolean;
  isStalled: boolean;
  todos: TodoItem[];
  workItems: ProviderTurnWorkItem[];
}): TurnActivityListItem[] {
  const items: TurnActivityListItem[] = [];
  if (args.activity?.turnError) {
    const isRecovering =
      args.activity.turnErrorRecoverable === true &&
      args.activity.completedAt == null;
    items.push({
      id: "turn-error",
      status: isRecovering ? "waiting" : "failed",
      title: isRecovering ? "Provider issue" : "Turn failed",
      detail: args.activity.turnError,
      icon: CircleAlert,
    });
  }
  if (args.activity?.pendingInteraction) {
    const needsApproval = args.activity.pendingInteraction === "approval";
    items.push({
      id: `interaction:${args.activity.pendingInteraction}`,
      status: "waiting",
      title: needsApproval ? "Approval needed" : "Input needed",
      detail: needsApproval ? "Review to continue" : "Reply to continue",
      icon: CirclePause,
    });
  } else if (args.isStalled) {
    items.push({
      id: "stalled",
      status: "waiting",
      title: "Activity paused",
      detail: args.idleLabel
        ? `No updates for ${args.idleLabel}`
        : "Waiting for the provider",
      icon: CirclePause,
    });
  }
  if (args.isPlanPreparing) {
    items.push({
      id: "plan",
      status: "running",
      title: "Preparing the plan",
      icon: ListChecks,
    });
  }
  for (const item of args.workItems) {
    items.push({
      id: `work:${item.id}`,
      status: item.status,
      title: item.title,
      detail: item.progressMessages.at(-1) ?? item.detail,
      elapsedSeconds: item.elapsedSeconds,
      completed: item.status === "completed",
      icon: item.kind === "subagent" ? Bot : Workflow,
    });
  }
  args.todos.forEach((todo, index) => {
    items.push({
      id: `todo:${todo.content}:${index}`,
      status: resolveTodoStatus(todo),
      title: todo.content,
      completed: todo.status === "completed",
      icon: ClipboardList,
    });
  });
  return items;
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

function TurnActivityRow({ item }: { item: TurnActivityListItem }) {
  const detail =
    item.detail && item.detail !== item.title ? item.detail : undefined;
  const title = detail ? `${item.title} · ${detail}` : item.title;
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5">
      <TurnActivityStatusIcon status={item.status} icon={item.icon} />
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-[0.8125rem] leading-5",
          item.completed && "text-muted-foreground",
        )}
        title={title}
      >
        <span className="font-medium">{item.title}</span>
        {detail ? (
          <span className="text-muted-foreground"> · {detail}</span>
        ) : null}
      </p>
      {item.elapsedSeconds != null ? (
        <span className="shrink-0 text-[11px] leading-4 tabular-nums text-muted-foreground">
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
  icon: Icon,
}: {
  status: TurnActivityRowStatus | ProviderTurnWorkStatus;
  icon: typeof Bot;
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
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      <span className="sr-only">Running</span>
    </span>
  );
}

function getStatusLabel(
  status: TurnActivityRowStatus | ProviderTurnWorkStatus,
) {
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
