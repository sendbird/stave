import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Cpu,
  FolderTree,
  LoaderCircle,
  Minus,
  Radar,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  memo,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { FleetNeedsInbox } from "@/components/layout/FleetNeedsInbox";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { useFleetAttentionProjection } from "@/components/layout/useFleetAttentionProjection";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
} from "@/components/ui";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import type { FleetNeedItem } from "@/lib/fleet/attention-projection";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  deriveFleetLifecycleStatus,
  FLEET_LIFECYCLE_LABEL,
  groupFleetWorkspacesByLane,
  isFleetTaskFilterActive,
  matchesFleetTaskFilter,
  type FleetDisplayStatus,
  type FleetLifecycleStatus,
  type FleetTaskFilter,
} from "@/lib/fleet/task-status";
import {
  PR_STATUS_VISUAL,
  PR_TONE_BADGE_CLASS,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import {
  formatTaskUpdatedAt,
  isLegacyBranchTask,
  isTaskArchived,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import {
  resolveWorkspaceTodoStatus,
  type WorkspaceTodoItem,
} from "@/lib/workspace-information";
import { useAppStore } from "@/store/app.store";
import { isDefaultWorkspaceName } from "@/store/project.utils";
import type { ChatMessage, Task } from "@/types/chat";

type FleetProjectView = {
  projectPath: string;
  projectName: string;
  isCurrent: boolean;
  workspaces: FleetWorkspaceView[];
};

type FleetWorkspaceView = {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
};

type FleetTaskRowView = {
  task: Task;
  status: FleetDisplayStatus;
  messageCount: number;
  updatedLabel: string;
};

type FleetTaskNavigationDirection = "up" | "down" | "first" | "last";

type FleetWorkspaceVisibility = {
  visible: boolean;
  matchedTaskCount: number;
  renderedTaskIds: string[];
};

type FleetLaneCollapseState = Record<
  string,
  Partial<Record<FleetLifecycleStatus, boolean>>
>;

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_MESSAGE_COUNT_BY_TASK: Record<string, number> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_TODOS: WorkspaceTodoItem[] = [];
const EMPTY_WORKSPACE_VISIBILITY: Record<string, FleetWorkspaceVisibility> = {};
const FLEET_UNKNOWN_STATUS_PRIORITY = 5;

const FLEET_FILTER_OPTIONS: Array<{
  value: FleetTaskFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs me" },
  { value: "running", label: "Running" },
  { value: "error", label: "Error" },
  { value: "idle", label: "Idle" },
];

function formatWorkspaceName(name: string, branch?: string) {
  if (isDefaultWorkspaceName(name)) {
    return branch ? `Default · ${branch}` : "Default";
  }
  return name;
}

function getFleetDisplayStatusPriority(status: FleetDisplayStatus) {
  return status === "unknown"
    ? FLEET_UNKNOWN_STATUS_PRIORITY
    : compareFleetTaskStatus(status, "waiting-input");
}

function compareFleetDisplayStatus(
  left: FleetDisplayStatus,
  right: FleetDisplayStatus,
) {
  if (left === "unknown" || right === "unknown") {
    return (
      getFleetDisplayStatusPriority(left) - getFleetDisplayStatusPriority(right)
    );
  }
  return compareFleetTaskStatus(left, right);
}

function formatMessageCount(count: number) {
  return `${count} message${count === 1 ? "" : "s"}`;
}

function formatTaskTitle(task: Task) {
  return task.title || "Untitled Task";
}

function getFleetWorkspaceKey(projectPath: string, workspaceId: string) {
  return JSON.stringify([projectPath, workspaceId]);
}

function getFleetTaskKey(
  projectPath: string,
  workspaceId: string,
  taskId: string,
) {
  return JSON.stringify([projectPath, workspaceId, taskId]);
}

function formatFleetStatusLabel(status: FleetDisplayStatus) {
  switch (status) {
    case "waiting-input":
      return "Needs input";
    case "waiting-approval":
      return "Needs approval";
    case "unknown":
      return "Not loaded";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function FleetProviderIcon({ provider }: { provider: Task["provider"] }) {
  const Icon = provider === "codex" ? Cpu : Sparkles;
  const label = provider === "codex" ? "Codex" : "Claude";

  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center",
        provider === "codex" ? "text-provider-codex" : "text-provider-claude",
      )}
      title={`${label} provider`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{label} provider</span>
    </span>
  );
}

function useFleetProjects() {
  const [
    currentProjectPath,
    currentProjectName,
    workspaces,
    recentProjects,
    workspaceDefaultById,
    workspaceBranchById,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.projectName,
          state.workspaces,
          state.recentProjects,
          state.workspaceDefaultById,
          state.workspaceBranchById,
        ] as const,
    ),
  );

  return useMemo(() => {
    const currentProject = currentProjectPath
      ? ({
          projectPath: currentProjectPath,
          projectName: currentProjectName ?? "project",
          isCurrent: true,
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(workspaceDefaultById[workspace.id]),
            branch: workspaceBranchById[workspace.id],
          })),
        } satisfies FleetProjectView)
      : null;

    const rememberedProjects = recentProjects.map(
      (project) =>
        ({
          projectPath: project.projectPath,
          projectName: project.projectName,
          isCurrent: project.projectPath === currentProjectPath,
          workspaces: project.workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
            branch: project.workspaceBranchById[workspace.id],
          })),
        }) satisfies FleetProjectView,
    );

    if (!currentProject) {
      return rememberedProjects;
    }

    const hasCurrentProject = rememberedProjects.some(
      (project) => project.projectPath === currentProjectPath,
    );
    if (!hasCurrentProject) {
      return [...rememberedProjects, currentProject];
    }

    return rememberedProjects.map((project) =>
      project.projectPath === currentProjectPath ? currentProject : project,
    );
  }, [
    currentProjectName,
    currentProjectPath,
    recentProjects,
    workspaceBranchById,
    workspaceDefaultById,
    workspaces,
  ]);
}

function FleetStatusBadge({ status }: { status: FleetDisplayStatus }) {
  const config: Record<
    FleetDisplayStatus,
    {
      label: string;
      icon: ReactNode;
      className: string;
    }
  > = {
    "waiting-input": {
      label: "Needs input",
      icon: <UserRound className="size-3" />,
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    "waiting-approval": {
      label: "Needs approval",
      icon: <ShieldCheck className="size-3" />,
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    error: {
      label: "Error",
      icon: <AlertTriangle className="size-3" />,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    },
    running: {
      label: "Running",
      icon: <Radio className="size-3" />,
      className: "border-primary/30 bg-primary/10 text-primary",
    },
    idle: {
      label: "Idle",
      icon: <CircleDashed className="size-3" />,
      className: "border-border bg-muted/40 text-muted-foreground",
    },
    unknown: {
      label: "Not loaded",
      icon: <Minus className="size-3" />,
      className: "border-border/60 bg-muted/20 text-muted-foreground",
    },
  };
  const item = config[status];
  const isUnknown = status === "unknown";

  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm", item.className)}
      title={
        isUnknown
          ? "Status unavailable until the workspace is opened"
          : item.label
      }
      aria-label={
        isUnknown
          ? "Status unavailable until the workspace is opened"
          : undefined
      }
    >
      {item.icon}
      {item.label}
    </Badge>
  );
}

function WorkspacePrBadge({ status }: { status: WorkspacePrStatus | null }) {
  if (!status || status === "no_pr") {
    return null;
  }

  const visual = PR_STATUS_VISUAL[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-0 items-center gap-1.5 rounded-sm border px-2 text-[11px] font-medium",
        PR_TONE_BADGE_CLASS[visual.tone],
      )}
    >
      <PrStatusIcon status={status} />
      <span className="truncate">{visual.label}</span>
    </span>
  );
}

function FleetTaskRow(args: {
  projectPath: string;
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  row: FleetTaskRowView;
  tabIndex: number;
  taskKey: string;
  isFocused: boolean;
  onFocus: (taskKey: string) => void;
  onMoveFocus: (
    taskKey: string,
    direction: FleetTaskNavigationDirection,
  ) => void;
  onOpenTask: (target: {
    projectPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
}) {
  const taskTitle = formatTaskTitle(args.row.task);
  const statusLabel = formatFleetStatusLabel(args.row.status);
  const statusRailClassName: Record<FleetDisplayStatus, string> = {
    "waiting-input": "before:bg-warning",
    "waiting-approval": "before:bg-warning",
    error: "before:bg-destructive",
    running: "before:bg-primary",
    idle: "before:bg-border",
    unknown: "before:bg-muted-foreground/35",
  };

  return (
    <button
      type="button"
      data-fleet-task-row="true"
      data-task-key={args.taskKey}
      className={cn(
        "group relative grid min-h-15 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/45 px-4 py-2.5 pl-5 text-left transition-[background-color,color] duration-150 before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-r-full hover:bg-accent/20 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55",
        statusRailClassName[args.row.status],
        args.isFocused && "bg-accent/15",
      )}
      tabIndex={args.tabIndex}
      aria-label={`Open ${taskTitle}, ${statusLabel}`}
      onFocus={() => args.onFocus(args.taskKey)}
      onClick={() =>
        args.onOpenTask({
          projectPath: args.projectPath,
          workspaceId: args.workspaceId,
          taskId: args.row.task.id,
        })
      }
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return;
        }
        const key = event.key.toLowerCase();
        const direction =
          event.key === "ArrowUp" || key === "k"
            ? "up"
            : event.key === "ArrowDown" || key === "j"
              ? "down"
              : event.key === "Home"
                ? "first"
                : event.key === "End"
                  ? "last"
                  : null;
        if (!direction) {
          return;
        }
        event.preventDefault();
        args.onMoveFocus(args.taskKey, direction);
      }}
    >
      <span className="min-w-0 space-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <FleetProviderIcon provider={args.row.task.provider} />
          <span className="truncate text-sm font-medium text-foreground">
            {taskTitle}
          </span>
          <FleetStatusBadge status={args.row.status} />
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">
            {formatWorkspaceName(args.workspaceName, args.branch)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{args.row.updatedLabel}</span>
          {args.row.messageCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatMessageCount(args.row.messageCount)}</span>
            </>
          ) : null}
        </span>
      </span>
      <span className="inline-flex h-8 items-center gap-1 px-2 text-sm text-muted-foreground transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Open</span>
      </span>
    </button>
  );
}

const MemoizedFleetTaskRow = memo(FleetTaskRow);

function FleetTaskSkeleton() {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 px-4 py-2.5">
      <div className="space-y-2">
        <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded-sm bg-muted/70" />
      </div>
      <div className="h-8 w-14 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

function FleetWorkspaceSection(args: {
  projectPath: string;
  projectName: string;
  workspace: FleetWorkspaceView;
  filter: FleetTaskFilter;
  searchQuery: string;
  isFilterActive: boolean;
  isCollapsed: boolean;
  isHiddenByAncestor: boolean;
  focusedTaskKey: string | null;
  onFocusTask: (taskKey: string) => void;
  onMoveFocus: (
    taskKey: string,
    direction: FleetTaskNavigationDirection,
  ) => void;
  onToggleWorkspace: (workspaceId: string) => void;
  onOpenTask: (target: {
    projectPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
  onLifecycleChange: (
    workspaceId: string,
    status: FleetLifecycleStatus | null,
  ) => void;
  onVisibilityChange: (
    workspaceId: string,
    visibility: FleetWorkspaceVisibility,
  ) => void;
}) {
  const workspaceKey = getFleetWorkspaceKey(
    args.projectPath,
    args.workspace.id,
  );
  const [
    activeProjectPath,
    activeWorkspaceId,
    activeTasks,
    activeMessagesByTask,
    activeMessageCountByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
    runtimeState,
    prStatus,
    activeTodos,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.activeWorkspaceId,
          state.projectPath === args.projectPath &&
          state.activeWorkspaceId === args.workspace.id
            ? state.tasks
            : EMPTY_TASKS,
          state.projectPath === args.projectPath &&
          state.activeWorkspaceId === args.workspace.id
            ? state.messagesByTask
            : EMPTY_MESSAGES_BY_TASK,
          state.projectPath === args.projectPath &&
          state.activeWorkspaceId === args.workspace.id
            ? state.messageCountByTask
            : EMPTY_MESSAGE_COUNT_BY_TASK,
          state.projectPath === args.projectPath &&
          state.activeWorkspaceId === args.workspace.id
            ? state.activeTurnIdsByTask
            : EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          state.providerTurnActivityByTask,
          state.workspaceRuntimeCacheById[args.workspace.id] ?? null,
          state.workspacePrInfoById[args.workspace.id]?.derived ?? null,
          state.projectPath === args.projectPath &&
          state.activeWorkspaceId === args.workspace.id
            ? state.workspaceInformation.todos
            : (state.workspaceRuntimeCacheById[args.workspace.id]
                ?.workspaceInformation.todos ?? EMPTY_TODOS),
        ] as const,
    ),
  );
  const [loadedShell, setLoadedShell] = useState<
    WorkspaceShellSummary | null | undefined
  >(undefined);
  const [isShellLoading, setIsShellLoading] = useState(false);
  const [didShellLoadFail, setDidShellLoadFail] = useState(false);
  const isActiveWorkspace =
    activeProjectPath === args.projectPath &&
    activeWorkspaceId === args.workspace.id;
  const hasRuntimeState = isActiveWorkspace || Boolean(runtimeState);

  useEffect(() => {
    if (hasRuntimeState || loadedShell !== undefined || didShellLoadFail) {
      return;
    }

    let cancelled = false;
    setIsShellLoading(true);
    setDidShellLoadFail(false);
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
      })
      .finally(() => {
        if (!cancelled) {
          setIsShellLoading(false);
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
      };
    }

    if (runtimeState) {
      return {
        hasRuntimeState: true,
        tasks: runtimeState.tasks,
        messagesByTask: runtimeState.messagesByTask,
        messageCountByTask: runtimeState.messageCountByTask,
        activeTurnIdsByTask: runtimeState.activeTurnIdsByTask,
      };
    }

    return {
      hasRuntimeState: false,
      tasks: loadedShell?.tasks ?? EMPTY_TASKS,
      messagesByTask: EMPTY_MESSAGES_BY_TASK,
      messageCountByTask:
        loadedShell?.messageCountByTask ?? EMPTY_MESSAGE_COUNT_BY_TASK,
      activeTurnIdsByTask: EMPTY_ACTIVE_TURN_IDS_BY_TASK,
    };
  }, [
    activeMessageCountByTask,
    activeMessagesByTask,
    activeTasks,
    activeTurnIdsByTask,
    args.workspace.id,
    isActiveWorkspace,
    loadedShell,
    runtimeState,
  ]);

  const rows = useMemo(() => {
    return taskState.tasks
      .filter((task) => !isTaskArchived(task) && !isLegacyBranchTask(task))
      .map((task) => {
        const status = taskState.hasRuntimeState
          ? classifyTaskStatus({
              task,
              messages: taskState.messagesByTask[task.id] ?? EMPTY_MESSAGES,
              activeTurnId: taskState.activeTurnIdsByTask[task.id] ?? null,
              activity: providerTurnActivityByTask[task.id] ?? null,
            })
          : "unknown";
        return {
          task,
          status,
          messageCount: taskState.messageCountByTask[task.id] ?? 0,
          updatedLabel: formatTaskUpdatedAt({ value: task.updatedAt }),
        } satisfies FleetTaskRowView;
      })
      .sort((left, right) => {
        const statusOrder = compareFleetDisplayStatus(
          left.status,
          right.status,
        );
        if (statusOrder !== 0) {
          return statusOrder;
        }
        return right.task.updatedAt.localeCompare(left.task.updatedAt);
      });
  }, [providerTurnActivityByTask, taskState]);

  const displayWorkspaceName = formatWorkspaceName(
    args.workspace.name,
    args.workspace.branch,
  );
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesFleetTaskFilter({
          status: row.status,
          filter: args.filter,
          query: args.searchQuery,
          taskTitle: formatTaskTitle(row.task),
          workspaceName: displayWorkspaceName,
          projectName: args.projectName,
        }),
      ),
    [
      args.filter,
      args.projectName,
      args.searchQuery,
      displayWorkspaceName,
      rows,
    ],
  );
  const todoProgress = useMemo(() => {
    const total = activeTodos.length;
    const completed = activeTodos.filter(
      (todo) => resolveWorkspaceTodoStatus(todo) === "completed",
    ).length;
    return { completed, total };
  }, [activeTodos]);

  const lifecycle = useMemo<FleetLifecycleStatus | null>(() => {
    if (!hasRuntimeState && (loadedShell === undefined || didShellLoadFail)) {
      return null;
    }
    return deriveFleetLifecycleStatus({
      prStatus,
      hasRunningTask: rows.some(
        (row) => row.status !== "unknown" && row.status !== "idle",
      ),
      hasRecentActivity: rows.some((row) => row.messageCount > 0),
    });
  }, [didShellLoadFail, hasRuntimeState, loadedShell, prStatus, rows]);
  const isVisible = !args.isFilterActive || filteredRows.length > 0;
  const visibility = useMemo<FleetWorkspaceVisibility>(
    () => ({
      visible: isVisible,
      matchedTaskCount: filteredRows.length,
      renderedTaskIds:
        isVisible && !args.isCollapsed && !args.isHiddenByAncestor
          ? filteredRows.map((row) =>
              getFleetTaskKey(args.projectPath, args.workspace.id, row.task.id),
            )
          : [],
    }),
    [
      args.isCollapsed,
      args.isHiddenByAncestor,
      args.projectPath,
      args.workspace.id,
      filteredRows,
      isVisible,
    ],
  );

  useEffect(() => {
    args.onLifecycleChange(workspaceKey, lifecycle);
  }, [args.onLifecycleChange, lifecycle, workspaceKey]);

  useEffect(() => {
    args.onVisibilityChange(workspaceKey, visibility);
  }, [args.onVisibilityChange, visibility, workspaceKey]);

  if (!isVisible) {
    return null;
  }

  return (
    <section className="ml-3 border-l border-border/55">
      <button
        type="button"
        className="group flex min-h-12 w-full items-center justify-between gap-3 bg-surface/55 px-4 py-2 text-left transition-colors hover:bg-accent/20 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
        aria-expanded={!args.isCollapsed}
        aria-label={`${args.isCollapsed ? "Expand" : "Collapse"} ${displayWorkspaceName} workspace section`}
        onClick={() => args.onToggleWorkspace(workspaceKey)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {args.isCollapsed ? (
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {displayWorkspaceName}
              </span>
              {args.workspace.isDefault ? (
                <Badge variant="secondary" className="rounded-sm text-[10px]">
                  Default
                </Badge>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {rows.length === 0
                ? isShellLoading
                  ? "Loading tasks..."
                  : didShellLoadFail
                    ? "Tasks unavailable"
                    : "No active tasks"
                : args.isFilterActive && filteredRows.length !== rows.length
                  ? `${filteredRows.length} of ${rows.length} tasks shown`
                  : `${rows.length} task${rows.length === 1 ? "" : "s"}`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {taskState.hasRuntimeState && todoProgress.total > 0 ? (
            <span
              className="hidden items-center gap-1.5 sm:inline-flex"
              title={`${todoProgress.completed} of ${todoProgress.total} todos done`}
            >
              <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.round(
                      (todoProgress.completed / todoProgress.total) * 100,
                    )}%`,
                  }}
                />
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {todoProgress.completed}/{todoProgress.total}
              </span>
            </span>
          ) : null}
          <WorkspacePrBadge status={prStatus} />
        </span>
      </button>
      {!args.isCollapsed ? (
        <div>
          {isShellLoading && !hasRuntimeState && rows.length === 0 ? (
            <>
              <FleetTaskSkeleton />
              <FleetTaskSkeleton />
            </>
          ) : (
            filteredRows.map((row) => (
              <MemoizedFleetTaskRow
                key={row.task.id}
                projectPath={args.projectPath}
                workspaceId={args.workspace.id}
                workspaceName={args.workspace.name}
                branch={args.workspace.branch}
                row={row}
                taskKey={getFleetTaskKey(
                  args.projectPath,
                  args.workspace.id,
                  row.task.id,
                )}
                tabIndex={
                  args.focusedTaskKey ===
                  getFleetTaskKey(
                    args.projectPath,
                    args.workspace.id,
                    row.task.id,
                  )
                    ? 0
                    : -1
                }
                isFocused={
                  args.focusedTaskKey ===
                  getFleetTaskKey(
                    args.projectPath,
                    args.workspace.id,
                    row.task.id,
                  )
                }
                onFocus={args.onFocusTask}
                onMoveFocus={args.onMoveFocus}
                onOpenTask={args.onOpenTask}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

const MemoizedFleetWorkspaceSection = memo(FleetWorkspaceSection);

const FLEET_LIFECYCLE_DOT: Record<FleetLifecycleStatus, string> = {
  "in-progress": "bg-primary",
  "in-review": "bg-warning",
  backlog: "bg-muted-foreground/50",
  done: "bg-success",
};

function FleetLaneHeader(args: {
  lane: FleetLifecycleStatus;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-8 w-full items-center gap-2 border-t border-border/45 bg-background/70 px-4 py-1.5 text-left transition-colors hover:bg-accent/15 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
      aria-expanded={!args.isCollapsed}
      aria-label={`${args.isCollapsed ? "Expand" : "Collapse"} ${FLEET_LIFECYCLE_LABEL[args.lane]} lane`}
      onClick={args.onToggle}
    >
      {args.isCollapsed ? (
        <ChevronRight
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <ChevronDown
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <span
        className={cn("size-1.5 rounded-full", FLEET_LIFECYCLE_DOT[args.lane])}
        aria-hidden="true"
      />
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {FLEET_LIFECYCLE_LABEL[args.lane]}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {args.count}
      </span>
    </button>
  );
}

export function FleetView() {
  const projects = useFleetProjects();
  const [
    focusTaskAttention,
    closeFleetView,
    openProject,
    switchWorkspace,
    openNotificationContext,
    resolveNotificationApproval,
    markNotificationRead,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.focusTaskAttention,
          state.closeFleetView,
          state.openProject,
          state.switchWorkspace,
          state.openNotificationContext,
          state.resolveNotificationApproval,
          state.markNotificationRead,
        ] as const,
    ),
  );
  const {
    items: attentionTargets,
    coveredWorkspaceIds,
  } = useFleetAttentionProjection();
  const [lifecycleByWorkspaceId, setLifecycleByWorkspaceId] = useState<
    Record<string, FleetLifecycleStatus>
  >({});
  const [workspaceVisibilityById, setWorkspaceVisibilityById] = useState<
    Record<string, FleetWorkspaceVisibility>
  >(EMPTY_WORKSPACE_VISIBILITY);
  const [collapsedProjects, setCollapsedProjects] = useState<
    Record<string, boolean>
  >({});
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<
    Record<string, boolean>
  >({});
  const [collapsedLanes, setCollapsedLanes] = useState<FleetLaneCollapseState>(
    {},
  );
  const [statusFilter, setStatusFilter] =
    useState<FleetTaskFilter>("attention");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedTaskKey, setFocusedTaskKey] = useState<string | null>(null);
  const [selectedAttentionKey, setSelectedAttentionKey] =
    useState<string | null>(null);
  const [busyNeedId, setBusyNeedId] = useState<string | null>(null);
  const fleetRootRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const isFilterActive = isFleetTaskFilterActive({
    filter: statusFilter,
    query: searchQuery,
  });

  const allWorkspaceKeys = useMemo(() => {
    const keys: string[] = [];
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        keys.push(getFleetWorkspaceKey(project.projectPath, workspace.id));
      }
    }
    return keys;
  }, [projects]);
  const allWorkspaceKeySet = useMemo(
    () => new Set(allWorkspaceKeys),
    [allWorkspaceKeys],
  );

  useEffect(() => {
    if (
      selectedAttentionKey &&
      !attentionTargets.some((target) => target.id === selectedAttentionKey)
    ) {
      setSelectedAttentionKey(null);
    }
  }, [attentionTargets, selectedAttentionKey]);

  const handleLifecycleChange = useCallback(
    (workspaceId: string, status: FleetLifecycleStatus | null) => {
      setLifecycleByWorkspaceId((current) => {
        if ((current[workspaceId] ?? null) === status) {
          return current;
        }
        const next = { ...current };
        if (status) {
          next[workspaceId] = status;
        } else {
          delete next[workspaceId];
        }
        return next;
      });
    },
    [],
  );

  const handleVisibilityChange = useCallback(
    (workspaceId: string, visibility: FleetWorkspaceVisibility) => {
      setWorkspaceVisibilityById((current) => {
        const existing = current[workspaceId];
        const sameRows =
          existing?.renderedTaskIds.length ===
            visibility.renderedTaskIds.length &&
          existing?.renderedTaskIds.every(
            (taskId, index) => taskId === visibility.renderedTaskIds[index],
          );
        if (
          existing?.visible === visibility.visible &&
          existing?.matchedTaskCount === visibility.matchedTaskCount &&
          sameRows
        ) {
          return current;
        }
        return { ...current, [workspaceId]: visibility };
      });
    },
    [],
  );

  const handleOpenTask = useCallback(
    (target: { projectPath: string; workspaceId: string; taskId: string }) => {
      void focusTaskAttention(target);
    },
    [focusTaskAttention],
  );

  const handleFocusTask = useCallback((taskKey: string) => {
    setFocusedTaskKey(taskKey);
  }, []);

  const handleMoveFocus = useCallback(
    (taskKey: string, direction: FleetTaskNavigationDirection) => {
      const root = fleetRootRef.current;
      if (!root) {
        return;
      }
      const rows = Array.from(
        root.querySelectorAll<HTMLButtonElement>("[data-fleet-task-row]"),
      ).filter((row) => !row.closest("[hidden]"));
      if (rows.length === 0) {
        return;
      }
      const currentIndex = rows.findIndex(
        (row) => row.dataset.taskKey === taskKey,
      );
      const nextIndex =
        direction === "first"
          ? 0
          : direction === "last"
            ? rows.length - 1
            : Math.max(
                0,
                Math.min(
                  rows.length - 1,
                  currentIndex + (direction === "up" ? -1 : 1),
                ),
              );
      const nextRow = rows[nextIndex];
      if (!nextRow) {
        return;
      }
      setFocusedTaskKey(nextRow.dataset.taskKey ?? null);
      nextRow.focus();
    },
    [],
  );

  const visibleTaskKeys = useMemo(
    () =>
      allWorkspaceKeys.flatMap(
        (workspaceKey) =>
          workspaceVisibilityById[workspaceKey]?.renderedTaskIds ?? [],
      ),
    [allWorkspaceKeys, workspaceVisibilityById],
  );
  const matchedTaskCount = useMemo(
    () =>
      allWorkspaceKeys.reduce(
        (count, workspaceKey) =>
          count +
          (workspaceVisibilityById[workspaceKey]?.matchedTaskCount ?? 0),
        0,
      ),
    [allWorkspaceKeys, workspaceVisibilityById],
  );
  const filterStateSettled = allWorkspaceKeys.every(
    (workspaceKey) => workspaceKey in workspaceVisibilityById,
  );

  useEffect(() => {
    if (focusedTaskKey && visibleTaskKeys.includes(focusedTaskKey)) {
      return;
    }
    const firstVisibleRow = Array.from(
      fleetRootRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-fleet-task-row]",
      ) ?? [],
    ).find((row) => !row.closest("[hidden]"));
    setFocusedTaskKey(firstVisibleRow?.dataset.taskKey ?? null);
  }, [focusedTaskKey, visibleTaskKeys]);

  useEffect(() => {
    setLifecycleByWorkspaceId((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => allWorkspaceKeySet.has(key)),
      ) as Record<string, FleetLifecycleStatus>;
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
    setWorkspaceVisibilityById((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => allWorkspaceKeySet.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [allWorkspaceKeySet]);

  const toggleProject = useCallback((projectPath: string) => {
    setCollapsedProjects((current) => ({
      ...current,
      [projectPath]: !current[projectPath],
    }));
  }, []);

  const toggleWorkspace = useCallback((workspaceKey: string) => {
    setCollapsedWorkspaces((current) => ({
      ...current,
      [workspaceKey]: !current[workspaceKey],
    }));
  }, []);

  const toggleLane = useCallback(
    (projectPath: string, lane: FleetLifecycleStatus) => {
      setCollapsedLanes((current) => ({
        ...current,
        [projectPath]: {
          ...current[projectPath],
          [lane]: !(current[projectPath]?.[lane] ?? lane === "done"),
        },
      }));
    },
    [],
  );

  const openAttentionTarget = useCallback(
    (target: FleetNeedItem) => {
      setSelectedAttentionKey(target.id);
      setBusyNeedId(target.id);
      void (async () => {
        if (target.notificationId) {
          await openNotificationContext({
            notificationId: target.notificationId,
            targetSurface: "task",
          });
          return;
        }
        if (target.taskId) {
          await focusTaskAttention({
            projectPath: target.projectPath,
            workspaceId: target.workspaceId,
            taskId: target.taskId,
          });
          return;
        }
        if (useAppStore.getState().projectPath !== target.projectPath) {
          await openProject({ projectPath: target.projectPath });
        }
        if (useAppStore.getState().activeWorkspaceId !== target.workspaceId) {
          await switchWorkspace({ workspaceId: target.workspaceId });
        }
      })().finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [
      focusTaskAttention,
      openNotificationContext,
      openProject,
      switchWorkspace,
    ],
  );

  const resolveAttentionApproval = useCallback(
    (target: FleetNeedItem, approved: boolean) => {
      if (!target.notificationId) {
        openAttentionTarget(target);
        return;
      }
      setSelectedAttentionKey(target.id);
      setBusyNeedId(target.id);
      void resolveNotificationApproval({
        notificationId: target.notificationId,
        approved,
      }).finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [openAttentionTarget, resolveNotificationApproval],
  );

  const markAttentionRead = useCallback(
    (target: FleetNeedItem) => {
      if (!target.notificationId) {
        return;
      }
      setBusyNeedId(target.id);
      // Dismissing a question or approval settles the request itself, otherwise
      // the row would survive its own dismissal.
      const isInteraction =
        target.kind === "user-input" || target.kind === "approval";
      void markNotificationRead({
        id: target.notificationId,
        ...(isInteraction ? { resolvedAt: new Date().toISOString() } : {}),
      }).finally(() => {
        setBusyNeedId((current) => (current === target.id ? null : current));
      });
    },
    [markNotificationRead],
  );

  const openAttentionPr = useCallback((target: FleetNeedItem) => {
    if (!target.prUrl) {
      return;
    }
    void window.api?.shell?.openExternal?.({ url: target.prUrl });
  }, []);

  const openNextAttentionTarget = useCallback(() => {
    if (attentionTargets.length === 0) {
      return;
    }
    const selectedIndex = attentionTargets.findIndex(
      (target) => target.id === selectedAttentionKey,
    );
    const nextTarget =
      attentionTargets[
        selectedIndex >= 0 ? (selectedIndex + 1) % attentionTargets.length : 0
      ];
    if (nextTarget) {
      openAttentionTarget(nextTarget);
    }
  }, [attentionTargets, openAttentionTarget, selectedAttentionKey]);

  const clearFilters = useCallback(() => {
    setStatusFilter("all");
    setSearchQuery("");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      if (event.key === "Escape") {
        const filterInput = filterInputRef.current;
        if (
          document.activeElement === filterInput &&
          filterInput?.value.trim()
        ) {
          event.preventDefault();
          setSearchQuery("");
          return;
        }
        closeFleetView();
        return;
      }
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (!isTyping && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openNextAttentionTarget();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFleetView, openNextAttentionTarget]);

  const totalWorkspaceCount = projects.reduce(
    (count, project) => count + project.workspaces.length,
    0,
  );
  const attentionCoverageCount = projects.reduce(
    (count, project) =>
      count +
      project.workspaces.filter((workspace) =>
        coveredWorkspaceIds.has(workspace.id),
      ).length,
    0,
  );
  const uninspectedWorkspaceCount = Math.max(
    0,
    totalWorkspaceCount - attentionCoverageCount,
  );
  const attentionCoverageComplete =
    totalWorkspaceCount > 0 && uninspectedWorkspaceCount === 0;
  const lifecycleCounts = useMemo(() => {
    const counts: Record<FleetLifecycleStatus, number> = {
      "in-progress": 0,
      "in-review": 0,
      backlog: 0,
      done: 0,
    };
    for (const workspaceKey of allWorkspaceKeys) {
      const lifecycle = lifecycleByWorkspaceId[workspaceKey];
      if (lifecycle) {
        counts[lifecycle] += 1;
      }
    }
    return counts;
  }, [allWorkspaceKeys, lifecycleByWorkspaceId]);
  const unclassifiedWorkspaceCount = Math.max(
    0,
    totalWorkspaceCount - Object.keys(lifecycleByWorkspaceId).length,
  );
  const isFilterEmpty =
    isFilterActive &&
    filterStateSettled &&
    matchedTaskCount === 0 &&
    !(statusFilter === "attention" && attentionTargets.length > 0);

  return (
    <div
      ref={fleetRootRef}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <header className="flex min-h-18 items-center justify-between gap-4 border-b border-border/65 bg-[linear-gradient(110deg,color-mix(in_oklch,var(--surface)_92%,var(--background)),var(--background))] px-5 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Radar className="size-4.5 shrink-0 text-primary" />
            <h1 className="font-heading truncate text-base font-semibold tracking-[-0.01em] text-foreground">
              Fleet View
            </h1>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Action inbox for questions, approvals, failed runs, results, and PR
            blockers.
            {totalWorkspaceCount > 0
              ? ` ${attentionCoverageCount}/${totalWorkspaceCount} covered by live or durable signals.`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={attentionTargets.length > 0 ? "default" : "ghost"}
            className="h-8"
            disabled={attentionTargets.length === 0}
            onClick={openNextAttentionTarget}
          >
            {attentionTargets.length > 0 ? (
              <ArrowRight className="size-4" aria-hidden="true" />
            ) : attentionCoverageComplete ? (
              <ShieldCheck className="size-4" aria-hidden="true" />
            ) : (
              <CircleDashed className="size-4" aria-hidden="true" />
            )}
            {attentionTargets.length > 0
              ? "Open next item"
              : attentionCoverageComplete
                ? "All clear"
                : `${uninspectedWorkspaceCount} not inspected`}
            {attentionTargets.length > 0 ? (
              <kbd className="ml-1 rounded-[0.25rem] border border-primary-foreground/20 bg-primary-foreground/10 px-1 font-mono text-[9px]">
                N
              </kbd>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            aria-label="close-fleet-view"
            title="Close Fleet View"
            onClick={closeFleetView}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <section
        aria-label="Fleet summary"
        className="grid shrink-0 grid-cols-5 border-b border-border/65 bg-surface/35"
      >
        <button
          type="button"
          className={cn(
            "group min-w-0 border-r border-border/55 px-4 py-3 text-left transition-colors hover:bg-warning/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55",
            statusFilter === "attention" && "bg-warning/8",
          )}
          aria-pressed={statusFilter === "attention"}
          onClick={() =>
            setStatusFilter((current) =>
              current === "attention" ? "all" : "attention",
            )
          }
        >
          <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Needs me
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-warning">
              {attentionTargets.length}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {attentionCoverageComplete ? "item" : "known item"}
              {attentionTargets.length === 1 ? "" : "s"}
            </span>
          </span>
        </button>
        {(
          [
            ["in-progress", "In motion", "text-primary"],
            ["in-review", "In review", "text-info"],
            ["backlog", "Backlog", "text-muted-foreground"],
            ["done", "Done", "text-success"],
          ] as const
        ).map(([status, label, tone], index) => (
          <div
            key={status}
            className={cn(
              "min-w-0 px-4 py-3",
              index < 3 && "border-r border-border/55",
            )}
          >
            <span className="block text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {label}
            </span>
            <span
              className={cn(
                "mt-1 block text-xl font-semibold tabular-nums",
                tone,
              )}
            >
              {lifecycleCounts[status]}
            </span>
          </div>
        ))}
      </section>

      {unclassifiedWorkspaceCount > 0 ? (
        <div className="flex items-center gap-2 border-b border-border/55 bg-muted/25 px-4 py-1.5 text-[11px] text-muted-foreground">
          <CircleDashed className="size-3.5" aria-hidden="true" />
          {unclassifiedWorkspaceCount} workspace
          {unclassifiedWorkspaceCount === 1 ? "" : "s"} still loading or
          unavailable; summary counts are provisional.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2">
        <span className="mr-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Show
        </span>
        <div className="flex flex-wrap items-center gap-0.5 rounded-md bg-muted/45 p-0.5">
          {FLEET_FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={statusFilter === option.value ? "secondary" : "ghost"}
              className={cn(
                "h-6.5 px-2 text-[11px]",
                statusFilter === option.value &&
                  "border-border/55 bg-background/85 shadow-[0_1px_2px_oklch(0_0_0/0.08)]",
              )}
              aria-pressed={statusFilter === option.value}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full min-w-48 max-w-xs sm:w-64">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={filterInputRef}
            data-fleet-filter-input="true"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Find task, workspace, or project…"
            aria-label="Search tasks, workspaces, or projects"
            className="h-8 border-transparent bg-muted/35 pl-8 pr-8 text-xs hover:border-border/70"
          />
          {searchQuery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => setSearchQuery("")}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
        {isFilterActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={clearFilters}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <FleetNeedsInbox
        items={attentionTargets}
        selectedNeedId={selectedAttentionKey}
        busyNeedId={busyNeedId}
        onOpen={openAttentionTarget}
        onResolveApproval={resolveAttentionApproval}
        onMarkRead={markAttentionRead}
        onOpenPr={openAttentionPr}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderTree />
              </EmptyMedia>
              <EmptyTitle>No Workspaces</EmptyTitle>
              <EmptyDescription>
                Open a project or workspace to see agent activity here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {isFilterEmpty ? (
              <div className="border-b border-border/70 bg-background px-4 py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  No tasks match
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clear filters to see all tasks.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
            {projects.map((project) => {
              const projectWorkspaceKeys = new Map(
                project.workspaces.map((workspace) => [
                  workspace.id,
                  getFleetWorkspaceKey(project.projectPath, workspace.id),
                ]),
              );
              const projectHasVisibleWorkspace = project.workspaces.some(
                (workspace) => {
                  const workspaceKey = projectWorkspaceKeys.get(workspace.id);
                  return workspaceKey
                    ? (workspaceVisibilityById[workspaceKey]?.visible ?? true)
                    : true;
                },
              );
              const hideProject =
                isFilterActive &&
                filterStateSettled &&
                !projectHasVisibleWorkspace;
              const projectIsCollapsed = Boolean(
                collapsedProjects[project.projectPath],
              );
              const visibleProjectWorkspaces =
                isFilterActive && filterStateSettled
                  ? project.workspaces.filter((workspace) => {
                      const workspaceKey = projectWorkspaceKeys.get(
                        workspace.id,
                      );
                      return workspaceKey
                        ? workspaceVisibilityById[workspaceKey]?.visible
                        : false;
                    })
                  : project.workspaces;
              const projectLifecycleByWorkspaceId = Object.fromEntries(
                project.workspaces.flatMap((workspace) => {
                  const workspaceKey = projectWorkspaceKeys.get(workspace.id);
                  const lifecycle = workspaceKey
                    ? lifecycleByWorkspaceId[workspaceKey]
                    : undefined;
                  return lifecycle ? [[workspace.id, lifecycle]] : [];
                }),
              );
              const laneGroups = groupFleetWorkspacesByLane({
                workspaces: visibleProjectWorkspaces,
                lifecycleByWorkspaceId: projectLifecycleByWorkspaceId,
              });
              const projectCollapsedLanes = collapsedLanes[project.projectPath];
              const showLanes =
                laneGroups.length > 1 ||
                laneGroups.some(
                  (group) =>
                    group.lane === "done" &&
                    (projectCollapsedLanes?.done ?? true),
                );

              return (
                <section
                  key={project.projectPath}
                  className="border-b border-border/65"
                  hidden={hideProject}
                >
                  <button
                    type="button"
                    className="flex min-h-13 w-full items-center gap-2 bg-surface/35 px-4 py-2 text-left transition-colors hover:bg-accent/18 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
                    aria-expanded={!projectIsCollapsed}
                    aria-label={`${projectIsCollapsed ? "Expand" : "Collapse"} ${project.projectName} project section`}
                    onClick={() => toggleProject(project.projectPath)}
                  >
                    {projectIsCollapsed ? (
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <FolderTree
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {project.projectName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {project.projectPath}
                      </span>
                    </span>
                    {project.isCurrent ? (
                      <Badge variant="outline" className="rounded-sm">
                        Current
                      </Badge>
                    ) : null}
                  </button>
                  <div hidden={projectIsCollapsed}>
                    {project.workspaces.length === 0 ? (
                      <div className="flex h-14 items-center px-4 text-sm text-muted-foreground">
                        No workspaces
                      </div>
                    ) : (
                      laneGroups.flatMap((group) => {
                        const laneIsCollapsed =
                          projectCollapsedLanes?.[group.lane] ??
                          group.lane === "done";
                        return [
                          showLanes ? (
                            <Fragment
                              key={`lane:${project.projectPath}:${group.lane}`}
                            >
                              <FleetLaneHeader
                                lane={group.lane}
                                count={group.workspaces.length}
                                isCollapsed={laneIsCollapsed}
                                onToggle={() =>
                                  toggleLane(project.projectPath, group.lane)
                                }
                              />
                            </Fragment>
                          ) : null,
                          ...group.workspaces.map((workspace) => {
                            const workspaceKey = getFleetWorkspaceKey(
                              project.projectPath,
                              workspace.id,
                            );
                            const workspaceIsCollapsed = Boolean(
                              collapsedWorkspaces[workspaceKey],
                            );
                            return (
                              <div
                                key={`workspace:${workspaceKey}`}
                                hidden={laneIsCollapsed}
                              >
                                <MemoizedFleetWorkspaceSection
                                  projectPath={project.projectPath}
                                  projectName={project.projectName}
                                  workspace={workspace}
                                  filter={statusFilter}
                                  searchQuery={searchQuery}
                                  isFilterActive={isFilterActive}
                                  isCollapsed={workspaceIsCollapsed}
                                  isHiddenByAncestor={
                                    projectIsCollapsed || laneIsCollapsed
                                  }
                                  focusedTaskKey={focusedTaskKey}
                                  onFocusTask={handleFocusTask}
                                  onMoveFocus={handleMoveFocus}
                                  onToggleWorkspace={toggleWorkspace}
                                  onOpenTask={handleOpenTask}
                                  onLifecycleChange={handleLifecycleChange}
                                  onVisibilityChange={handleVisibilityChange}
                                />
                              </div>
                            );
                          }),
                        ];
                      })
                    )}
                  </div>
                </section>
              );
            })}
            {projects.length > 0 && totalWorkspaceCount === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Loading workspaces...
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
