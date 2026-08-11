import {
  AlertTriangle,
  ArrowRight,
  CircleDashed,
  Cpu,
  GitBranch,
  Moon,
  Radio,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { Badge, Button } from "@/components/ui";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
} from "@/lib/fleet/attention-projection";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  type FleetDisplayStatus,
} from "@/lib/fleet/task-status";
import {
  classifyFleetWorkspaceActivity,
  hasFleetLiveTask,
  isPhantomDefaultWorkspace,
  matchesFleetBoardFilter,
  resolveFleetWorkspaceActivityAt,
  selectFleetOpenTasks,
  type FleetBoardFilter,
  type FleetWorkspaceActivity,
} from "@/lib/fleet/workspace-activity";
import {
  PR_STATUS_VISUAL,
  PR_TONE_BADGE_CLASS,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import {
  resolveWorkspaceTodoStatus,
  type WorkspaceTodoItem,
} from "@/lib/workspace-information";
import { useAppStore } from "@/store/app.store";
import { isDefaultWorkspaceName } from "@/store/project.utils";
import type { ChatMessage, Task } from "@/types/chat";

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_MESSAGE_COUNT_BY_TASK: Record<string, number> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_TODOS: WorkspaceTodoItem[] = [];

/** How many task chips a card shows before folding the rest away. */
const FLEET_CARD_TASK_LIMIT = 3;

export type FleetWorkspaceCardView = {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
};

export type FleetWorkspaceCardVisibility = {
  visible: boolean;
  /** Suppressed as a fabricated default row rather than filtered out. */
  isPhantom: boolean;
  activity: FleetWorkspaceActivity;
  activityAt: string | null;
  taskKeys: string[];
};

type FleetCardTaskView = {
  task: Task;
  status: FleetDisplayStatus;
  updatedLabel: string;
};

export function getFleetWorkspaceKey(projectPath: string, workspaceId: string) {
  return JSON.stringify([projectPath, workspaceId]);
}

export function getFleetTaskKey(
  projectPath: string,
  workspaceId: string,
  taskId: string,
) {
  return JSON.stringify([projectPath, workspaceId, taskId]);
}

export function formatFleetWorkspaceName(name: string, branch?: string) {
  if (isDefaultWorkspaceName(name)) {
    const branchLabel = formatBranchLabel(branch);
    return branchLabel ? `Default · ${branchLabel}` : "Default";
  }
  return name;
}

const FLEET_UNKNOWN_STATUS_PRIORITY = 5;

function getStatusPriority(status: FleetDisplayStatus) {
  return status === "unknown"
    ? FLEET_UNKNOWN_STATUS_PRIORITY
    : compareFleetTaskStatus(status, "waiting-input");
}

const FLEET_STATUS_VISUAL: Record<
  FleetDisplayStatus,
  { label: string; icon: ReactNode; text: string; rail: string }
> = {
  "waiting-input": {
    label: "Awaiting input",
    icon: <UserRound className="size-3" aria-hidden="true" />,
    text: "text-warning",
    rail: "before:bg-warning",
  },
  "waiting-approval": {
    label: "Awaiting approval",
    icon: <ShieldCheck className="size-3" aria-hidden="true" />,
    text: "text-warning",
    rail: "before:bg-warning",
  },
  error: {
    label: "Error",
    icon: <AlertTriangle className="size-3" aria-hidden="true" />,
    text: "text-destructive",
    rail: "before:bg-destructive",
  },
  running: {
    label: "Running",
    icon: <Radio className="size-3" aria-hidden="true" />,
    text: "text-primary",
    rail: "before:bg-primary",
  },
  idle: {
    label: "Idle",
    icon: <CircleDashed className="size-3" aria-hidden="true" />,
    text: "text-muted-foreground",
    rail: "before:bg-border",
  },
  unknown: {
    label: "Not loaded",
    icon: <CircleDashed className="size-3" aria-hidden="true" />,
    text: "text-muted-foreground",
    rail: "before:bg-muted-foreground/35",
  },
};

function FleetProviderIcon({ provider }: { provider: Task["provider"] }) {
  const Icon = provider === "codex" ? Cpu : Sparkles;
  const label = provider === "codex" ? "Codex" : "Claude";
  return (
    <span
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center",
        provider === "codex" ? "text-provider-codex" : "text-provider-claude",
      )}
      title={`${label} provider`}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="sr-only">{label} provider</span>
    </span>
  );
}

function FleetCardPrBadge({ status }: { status: WorkspacePrStatus | null }) {
  if (!status || status === "no_pr") {
    return null;
  }
  const visual = PR_STATUS_VISUAL[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-[10px] font-medium",
        PR_TONE_BADGE_CLASS[visual.tone],
      )}
      title={`Pull request: ${visual.label}`}
    >
      <PrStatusIcon status={status} className="size-3" />
      <span className="truncate">{visual.label}</span>
    </span>
  );
}

export function FleetWorkspaceCard(args: {
  projectPath: string;
  projectName: string;
  workspace: FleetWorkspaceCardView;
  isCurrentProject: boolean;
  filter: FleetBoardFilter;
  searchQuery: string;
  nowMs: number;
  attentionItems: FleetAttentionItem[];
  expandedTaskKey: string | null;
  cardKey: string;
  onOpenTask: (target: {
    projectPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
  onOpenWorkspace: (target: {
    projectPath: string;
    workspaceId: string;
  }) => void;
  onToggleTaskControl: (target: FleetTaskControlTarget) => void;
  onVisibilityChange: (
    cardKey: string,
    visibility: FleetWorkspaceCardVisibility,
  ) => void;
}) {
  const taskKeyFor = (taskId: string) =>
    getFleetTaskKey(args.projectPath, args.workspace.id, taskId);
  const [
    activeProjectPath,
    activeWorkspaceId,
    activeTasks,
    activeMessagesByTask,
    activeMessageCountByTask,
    activeTurnIdsByTask,
    activeOpenTaskTabIds,
    providerTurnActivityByTask,
    runtimeState,
    prStatus,
    activeTodos,
    lastActiveAt,
  ] = useAppStore(
    useShallow((state) => {
      const isActive =
        state.projectPath === args.projectPath &&
        state.activeWorkspaceId === args.workspace.id;
      return [
        state.projectPath,
        state.activeWorkspaceId,
        isActive ? state.tasks : EMPTY_TASKS,
        isActive ? state.messagesByTask : EMPTY_MESSAGES_BY_TASK,
        isActive ? state.messageCountByTask : EMPTY_MESSAGE_COUNT_BY_TASK,
        isActive ? state.activeTurnIdsByTask : EMPTY_ACTIVE_TURN_IDS_BY_TASK,
        isActive ? state.openTaskTabIds : null,
        state.providerTurnActivityByTask,
        state.workspaceRuntimeCacheById[args.workspace.id] ?? null,
        state.workspacePrInfoById[args.workspace.id]?.derived ?? null,
        isActive
          ? state.workspaceInformation.todos
          : (state.workspaceRuntimeCacheById[args.workspace.id]
              ?.workspaceInformation.todos ?? EMPTY_TODOS),
        state.workspaceLastActiveAtById[args.workspace.id] ?? null,
      ] as const;
    }),
  );

  const [loadedShell, setLoadedShell] = useState<
    WorkspaceShellSummary | null | undefined
  >(undefined);
  const [didShellLoadFail, setDidShellLoadFail] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  const isActiveWorkspace =
    activeProjectPath === args.projectPath &&
    activeWorkspaceId === args.workspace.id;
  const hasRuntimeState = isActiveWorkspace || Boolean(runtimeState);

  useEffect(() => {
    if (hasRuntimeState || loadedShell !== undefined || didShellLoadFail) {
      return;
    }
    let cancelled = false;
    void loadWorkspaceShellSummary({ workspaceId: args.workspace.id })
      .then((shell) => {
        if (!cancelled) {
          setLoadedShell(shell);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDidShellLoadFail(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [args.workspace.id, didShellLoadFail, hasRuntimeState, loadedShell]);

  const taskState = useMemo(() => {
    if (isActiveWorkspace) {
      return {
        hasRuntimeState: true,
        tasks: activeTasks,
        messagesByTask: activeMessagesByTask,
        messageCountByTask: activeMessageCountByTask,
        activeTurnIdsByTask,
        openTaskTabIds: activeOpenTaskTabIds,
      };
    }
    if (runtimeState) {
      return {
        hasRuntimeState: true,
        tasks: runtimeState.tasks,
        messagesByTask: runtimeState.messagesByTask,
        messageCountByTask: runtimeState.messageCountByTask,
        activeTurnIdsByTask: runtimeState.activeTurnIdsByTask,
        openTaskTabIds: runtimeState.openTaskTabIds,
      };
    }
    return {
      hasRuntimeState: false,
      tasks: loadedShell?.tasks ?? EMPTY_TASKS,
      messagesByTask: EMPTY_MESSAGES_BY_TASK,
      messageCountByTask:
        loadedShell?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
      activeTurnIdsByTask: EMPTY_ACTIVE_TURN_IDS_BY_TASK,
      // Absent on summaries that predate the field: unknown pane state, not
      // "nothing open".
      openTaskTabIds: loadedShell?.openTaskTabIds ?? null,
    };
  }, [
    activeMessageCountByTask,
    activeMessagesByTask,
    activeOpenTaskTabIds,
    activeTasks,
    activeTurnIdsByTask,
    isActiveWorkspace,
    loadedShell,
    runtimeState,
  ]);

  const openTasks = useMemo(
    () =>
      selectFleetOpenTasks(taskState.tasks, {
        openTaskTabIds: taskState.openTaskTabIds,
        activeTurnIdsByTask: taskState.activeTurnIdsByTask,
      }),
    [taskState],
  );

  const rows = useMemo(
    () =>
      openTasks
        .map((task) => ({
          task,
          status: taskState.hasRuntimeState
            ? classifyTaskStatus({
                task,
                messages: taskState.messagesByTask[task.id] ?? EMPTY_MESSAGES,
                activeTurnId: taskState.activeTurnIdsByTask[task.id] ?? null,
                activity: providerTurnActivityByTask[task.id] ?? null,
              })
            : ("unknown" as const),
          updatedLabel: formatTaskUpdatedAt({ value: task.updatedAt }),
        }))
        .sort((left, right) => {
          const order =
            getStatusPriority(left.status) - getStatusPriority(right.status);
          return order !== 0
            ? order
            : right.task.updatedAt.localeCompare(left.task.updatedAt);
        }) satisfies FleetCardTaskView[],
    [openTasks, providerTurnActivityByTask, taskState],
  );

  // Counted across every task, archived included. This is evidence that real
  // work happened here, and a workspace whose tasks were all archived still has
  // a history worth keeping on the board. Summing only open tasks would make
  // this strictly weaker than the open-task count and therefore dead weight.
  const messageCount = useMemo(
    () =>
      Object.values(taskState.messageCountByTask).reduce(
        (total, count) => total + count,
        0,
      ),
    [taskState.messageCountByTask],
  );

  const hasLiveTask = hasFleetLiveTask({
    rows: rows.map((row) => ({ taskId: row.task.id, status: row.status })),
    activeTurnIdsByTask: taskState.activeTurnIdsByTask,
  });
  const hasBlockingAttention = args.attentionItems.some(
    (attentionItem) => getFleetAttentionTier(attentionItem.kind) === "blocking",
  );

  const activityAt = useMemo(
    () => resolveFleetWorkspaceActivityAt({ lastActiveAt, openTasks }),
    [lastActiveAt, openTasks],
  );
  const activity = classifyFleetWorkspaceActivity({
    activityAt,
    nowMs: args.nowMs,
    hasLiveTask,
    hasAttentionItems: args.attentionItems.length > 0,
    isActiveWorkspace,
  });

  const displayName = formatFleetWorkspaceName(
    args.workspace.name,
    args.workspace.branch,
  );

  const isPhantom = isPhantomDefaultWorkspace({
    isDefault: args.workspace.isDefault,
    isCurrentProject: args.isCurrentProject,
    isActiveWorkspace,
    openTaskCount: openTasks.length,
    messageCount,
    hasAttentionItems: args.attentionItems.length > 0,
    lastActiveAt,
    // `loadedShell === null` is a resolved answer ("no stored workspace"), which
    // is exactly the fabricated-row case. `undefined` (still loading) and a
    // failed read are not.
    hasResolvedState:
      taskState.hasRuntimeState ||
      (loadedShell !== undefined && !didShellLoadFail),
  });

  const matchesFilter = matchesFleetBoardFilter({
    filter: args.filter,
    activity,
    hasBlockingAttention,
    query: args.searchQuery,
    searchableText: [
      displayName,
      args.projectName,
      args.workspace.branch ?? "",
      ...rows.map((row) => row.task.title),
    ],
  });
  const visible = matchesFilter && !isPhantom;

  const visibleRows = showAllTasks
    ? rows
    : rows.slice(0, FLEET_CARD_TASK_LIMIT);
  const hiddenTaskCount = rows.length - visibleRows.length;
  const expandedRow = rows.find(
    (row) => taskKeyFor(row.task.id) === args.expandedTaskKey,
  );

  const toggleTaskDisclosure = () => {
    if (
      showAllTasks &&
      expandedRow &&
      rows.indexOf(expandedRow) >= FLEET_CARD_TASK_LIMIT
    ) {
      args.onToggleTaskControl({
        projectPath: args.projectPath,
        workspaceId: args.workspace.id,
        taskId: expandedRow.task.id,
        taskTitle: expandedRow.task.title || "Untitled Task",
      });
    }
    setShowAllTasks((current) => !current);
  };

  const taskKeys = useMemo(
    () =>
      visible
        ? rows.map((row) =>
            getFleetTaskKey(args.projectPath, args.workspace.id, row.task.id),
          )
        : [],
    [args.projectPath, args.workspace.id, rows, visible],
  );

  const { onVisibilityChange, cardKey } = args;
  useEffect(() => {
    onVisibilityChange(cardKey, {
      visible,
      isPhantom,
      activity,
      activityAt,
      taskKeys,
    });
  }, [
    activity,
    activityAt,
    cardKey,
    isPhantom,
    onVisibilityChange,
    taskKeys,
    visible,
  ]);

  const todoProgress = useMemo(() => {
    const total = activeTodos.length;
    const completed = activeTodos.filter(
      (todo) => resolveWorkspaceTodoStatus(todo) === "completed",
    ).length;
    return { completed, total };
  }, [activeTodos]);

  if (!visible) {
    return null;
  }

  const branchLabel = formatBranchLabel(args.workspace.branch);
  const accent =
    activity === "live"
      ? "before:bg-primary"
      : hasBlockingAttention
        ? "before:bg-warning"
        : activity === "dormant"
          ? "before:bg-border"
          : "before:bg-border/70";

  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-surface/40 transition-colors",
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5",
        accent,
        activity === "dormant" && "opacity-70 hover:opacity-100",
        expandedRow && "ring-1 ring-ring/40",
        "hover:border-border hover:bg-surface/70",
      )}
      aria-label={`${displayName} workspace in ${args.projectName}`}
    >
      <div className="flex min-w-0 items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {displayName}
            </span>
            {args.workspace.isDefault ? (
              <Badge
                variant="secondary"
                className="shrink-0 rounded-sm px-1 text-[9px] leading-4"
              >
                Default
              </Badge>
            ) : null}
            {activity === "dormant" ? (
              <span
                className="inline-flex shrink-0 items-center"
                title="Dormant: no recorded activity recently"
              >
                <Moon
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="sr-only">Dormant workspace</span>
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">{args.projectName}</span>
            {branchLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <GitBranch className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{branchLabel}</span>
              </>
            ) : null}
          </div>
        </div>
        <FleetCardPrBadge status={prStatus} />
      </div>

      <div className="min-w-0 border-t border-border/45">
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">
            {taskState.hasRuntimeState || loadedShell !== undefined
              ? "No open tasks"
              : didShellLoadFail
                ? "Tasks unavailable"
                : "Loading tasks…"}
          </p>
        ) : (
          <ul className="min-w-0">
            {visibleRows.map((row) => {
              const visual = FLEET_STATUS_VISUAL[row.status];
              const taskKey = taskKeyFor(row.task.id);
              const isExpanded = args.expandedTaskKey === taskKey;
              const taskTitle = row.task.title || "Untitled Task";
              return (
                <li key={row.task.id} className="min-w-0">
                  <button
                    id={`fleet-task-trigger-${taskKey}`}
                    type="button"
                    data-fleet-task-row="true"
                    data-task-key={taskKey}
                    className={cn(
                      "relative flex min-h-9 w-full min-w-0 items-center gap-2 py-1.5 pl-4 pr-3 text-left transition-colors",
                      "before:absolute before:inset-y-1.5 before:left-1.5 before:w-0.5 before:rounded-full",
                      visual.rail,
                      "before:content-['']",
                      "hover:bg-accent/20 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55",
                      isExpanded && "bg-accent/18",
                    )}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Hide" : "Show"} controls for ${taskTitle}, ${visual.label}`}
                    onClick={() =>
                      args.onToggleTaskControl({
                        projectPath: args.projectPath,
                        workspaceId: args.workspace.id,
                        taskId: row.task.id,
                        taskTitle,
                        turnId:
                          taskState.activeTurnIdsByTask[row.task.id] ?? null,
                      })
                    }
                  >
                    <FleetProviderIcon provider={row.task.provider} />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {taskTitle}
                    </span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
                        visual.text,
                      )}
                      title={`${visual.label} · updated ${row.updatedLabel}`}
                    >
                      {visual.icon}
                      <span className="hidden sm:inline">{visual.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {hiddenTaskCount > 0 || showAllTasks ? (
              <li>
                <button
                  type="button"
                  className="w-full px-4 py-1 text-left text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
                  aria-expanded={showAllTasks}
                  onClick={toggleTaskDisclosure}
                >
                  {showAllTasks
                    ? "Show fewer"
                    : `+${hiddenTaskCount} more task${hiddenTaskCount === 1 ? "" : "s"}`}
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {expandedRow ? (
        <div
          id={`fleet-task-controls-${taskKeyFor(expandedRow.task.id)}`}
          className="border-t border-border/45"
        >
          <FleetTaskControlPanel
            target={{
              projectPath: args.projectPath,
              workspaceId: args.workspace.id,
              taskId: expandedRow.task.id,
              taskTitle: expandedRow.task.title || "Untitled Task",
              turnId:
                taskState.activeTurnIdsByTask[expandedRow.task.id] ?? null,
            }}
            returnFocusElementId={`fleet-task-trigger-${taskKeyFor(expandedRow.task.id)}`}
            onOpenTask={args.onOpenTask}
            onClose={() =>
              args.onToggleTaskControl({
                projectPath: args.projectPath,
                workspaceId: args.workspace.id,
                taskId: expandedRow.task.id,
                taskTitle: expandedRow.task.title || "Untitled Task",
              })
            }
          />
        </div>
      ) : null}

      <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-border/45 px-3 py-1.5">
        {todoProgress.total > 0 ? (
          <span
            className="flex shrink-0 items-center gap-1.5"
            title={`${todoProgress.completed} of ${todoProgress.total} todos done`}
          >
            <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary"
                style={{
                  width: `${Math.round(
                    (todoProgress.completed / todoProgress.total) * 100,
                  )}%`,
                }}
              />
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {todoProgress.completed}/{todoProgress.total}
            </span>
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
          {activityAt
            ? formatTaskUpdatedAt({ value: activityAt })
            : "No recorded activity"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 shrink-0 px-2 text-[11px]"
          aria-label={`Open ${displayName} workspace`}
          onClick={() =>
            args.onOpenWorkspace({
              projectPath: args.projectPath,
              workspaceId: args.workspace.id,
            })
          }
        >
          Open
          <ArrowRight className="size-3" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

export const MemoizedFleetWorkspaceCard = memo(FleetWorkspaceCard);
