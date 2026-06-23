import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleDashed,
  FolderTree,
  LoaderCircle,
  Radio,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { Badge, Button, Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  deriveFleetLifecycleStatus,
  FLEET_LIFECYCLE_LABEL,
  groupFleetWorkspacesByLane,
  hasFleetTaskAttentionStatus,
  type FleetLifecycleStatus,
  type FleetTaskStatus,
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

type FleetDisplayStatus = FleetTaskStatus | "unknown";

type FleetAttentionTarget = {
  projectPath: string;
  workspaceId: string;
  workspaceName: string;
  taskId: string;
  taskTitle: string;
  status: FleetTaskStatus;
};

type FleetTaskRowView = {
  task: Task;
  status: FleetDisplayStatus;
  messageCount: number;
  updatedLabel: string;
};

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_MESSAGE_COUNT_BY_TASK: Record<string, number> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_TODOS: WorkspaceTodoItem[] = [];
const FLEET_UNKNOWN_STATUS_PRIORITY = 5;

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
      label: "Input",
      icon: <UserRound className="size-3" />,
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    "waiting-approval": {
      label: "Approval",
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
      label: "Unknown",
      icon: <CircleDashed className="size-3" />,
      className: "border-border bg-muted/30 text-muted-foreground",
    },
  };
  const item = config[status];

  return (
    <Badge variant="outline" className={cn("rounded-sm", item.className)}>
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
  onOpenTask: (target: {
    projectPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 px-4 py-2.5 transition-colors hover:bg-muted/25">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <FleetStatusBadge status={args.row.status} />
          <span className="truncate text-sm font-medium text-foreground">
            {args.row.task.title || "Untitled Task"}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 rounded-sm px-2"
        onClick={() =>
          args.onOpenTask({
            projectPath: args.projectPath,
            workspaceId: args.workspaceId,
            taskId: args.row.task.id,
          })
        }
      >
        <ArrowRight className="size-4" />
        Open
      </Button>
    </div>
  );
}

const MemoizedFleetTaskRow = memo(FleetTaskRow);

function FleetWorkspaceSection(args: {
  projectPath: string;
  workspace: FleetWorkspaceView;
  onOpenTask: (target: {
    projectPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
  onAttentionTargetChange: (
    workspaceId: string,
    target: FleetAttentionTarget | null,
  ) => void;
  onLifecycleChange: (
    workspaceId: string,
    status: FleetLifecycleStatus | null,
  ) => void;
}) {
  const [
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
          state.activeWorkspaceId,
          state.activeWorkspaceId === args.workspace.id
            ? state.tasks
            : EMPTY_TASKS,
          state.activeWorkspaceId === args.workspace.id
            ? state.messagesByTask
            : EMPTY_MESSAGES_BY_TASK,
          state.activeWorkspaceId === args.workspace.id
            ? state.messageCountByTask
            : EMPTY_MESSAGE_COUNT_BY_TASK,
          state.activeWorkspaceId === args.workspace.id
            ? state.activeTurnIdsByTask
            : EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          state.providerTurnActivityByTask,
          state.workspaceRuntimeCacheById[args.workspace.id] ?? null,
          state.workspacePrInfoById[args.workspace.id]?.derived ?? null,
          state.activeWorkspaceId === args.workspace.id
            ? state.workspaceInformation.todos
            : EMPTY_TODOS,
        ] as const,
    ),
  );
  const [loadedShell, setLoadedShell] = useState<
    WorkspaceShellSummary | null | undefined
  >(undefined);
  const [isShellLoading, setIsShellLoading] = useState(false);
  const [didShellLoadFail, setDidShellLoadFail] = useState(false);
  const hasRuntimeState =
    activeWorkspaceId === args.workspace.id || Boolean(runtimeState);

  useEffect(() => {
    if (
      hasRuntimeState ||
      loadedShell !== undefined ||
      isShellLoading ||
      didShellLoadFail
    ) {
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
  }, [
    args.workspace.id,
    didShellLoadFail,
    hasRuntimeState,
    isShellLoading,
    loadedShell,
  ]);

  const taskState = useMemo(() => {
    if (activeWorkspaceId === args.workspace.id) {
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
    activeWorkspaceId,
    args.workspace.id,
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
        const statusOrder = compareFleetDisplayStatus(left.status, right.status);
        if (statusOrder !== 0) {
          return statusOrder;
        }
        return right.task.updatedAt.localeCompare(left.task.updatedAt);
      });
  }, [providerTurnActivityByTask, taskState]);

  const todoProgress = useMemo(() => {
    const total = activeTodos.length;
    const completed = activeTodos.filter(
      (todo) => resolveWorkspaceTodoStatus(todo) === "completed",
    ).length;
    return { completed, total };
  }, [activeTodos]);

  const firstAttentionTarget = useMemo(() => {
    const row = rows.find(
      (candidate) =>
        candidate.status !== "unknown" &&
        hasFleetTaskAttentionStatus(candidate.status),
    );
    if (!row || row.status === "unknown") {
      return null;
    }

    return {
      projectPath: args.projectPath,
      workspaceId: args.workspace.id,
      workspaceName: args.workspace.name,
      taskId: row.task.id,
      taskTitle: row.task.title,
      status: row.status,
    } satisfies FleetAttentionTarget;
  }, [args.projectPath, args.workspace.id, args.workspace.name, rows]);

  useEffect(() => {
    args.onAttentionTargetChange(args.workspace.id, firstAttentionTarget);
    return () => args.onAttentionTargetChange(args.workspace.id, null);
  }, [args.onAttentionTargetChange, args.workspace.id, firstAttentionTarget]);

  const lifecycle = useMemo<FleetLifecycleStatus>(
    () =>
      deriveFleetLifecycleStatus({
        prStatus,
        hasRunningTask: rows.some(
          (row) => row.status !== "unknown" && row.status !== "idle",
        ),
        hasRecentActivity: rows.some((row) => row.messageCount > 0),
      }),
    [prStatus, rows],
  );

  useEffect(() => {
    args.onLifecycleChange(args.workspace.id, lifecycle);
    return () => args.onLifecycleChange(args.workspace.id, null);
  }, [args.onLifecycleChange, args.workspace.id, lifecycle]);

  return (
    <section className="border-b border-border/70">
      <div className="flex min-h-12 items-center justify-between gap-3 bg-card/60 px-4 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {formatWorkspaceName(args.workspace.name, args.workspace.branch)}
            </span>
            {args.workspace.isDefault ? (
              <Badge variant="secondary" className="rounded-sm text-[10px]">
                Default
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {rows.length === 0
              ? isShellLoading
                ? "Loading tasks..."
                : didShellLoadFail
                  ? "Tasks unavailable"
                  : "No active tasks"
              : `${rows.length} task${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {todoProgress.total > 0 ? (
            <span
              className="inline-flex items-center gap-1.5"
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
        </div>
      </div>
      {rows.map((row) => (
        <MemoizedFleetTaskRow
          key={row.task.id}
          projectPath={args.projectPath}
          workspaceId={args.workspace.id}
          workspaceName={args.workspace.name}
          branch={args.workspace.branch}
          row={row}
          onOpenTask={args.onOpenTask}
        />
      ))}
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

function FleetLaneHeader(args: { lane: FleetLifecycleStatus; count: number }) {
  return (
    <div className="flex items-center gap-2 border-t border-border/60 bg-background/80 px-4 py-1.5">
      <span
        className={cn("size-1.5 rounded-full", FLEET_LIFECYCLE_DOT[args.lane])}
      />
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {FLEET_LIFECYCLE_LABEL[args.lane]}
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {args.count}
      </span>
    </div>
  );
}

export function FleetView() {
  const projects = useFleetProjects();
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const closeFleetView = useAppStore((state) => state.closeFleetView);
  const [attentionTargetsByWorkspaceId, setAttentionTargetsByWorkspaceId] =
    useState<Record<string, FleetAttentionTarget>>({});
  const [lifecycleByWorkspaceId, setLifecycleByWorkspaceId] = useState<
    Record<string, FleetLifecycleStatus>
  >({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      closeFleetView();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeFleetView]);

  const handleAttentionTargetChange = useCallback(
    (workspaceId: string, target: FleetAttentionTarget | null) => {
      setAttentionTargetsByWorkspaceId((current) => {
        const existing = current[workspaceId] ?? null;
        if (
          existing?.taskId === target?.taskId &&
          existing?.status === target?.status
        ) {
          return current;
        }

        const next = { ...current };
        if (target) {
          next[workspaceId] = target;
        } else {
          delete next[workspaceId];
        }
        return next;
      });
    },
    [],
  );

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

  const nextAttentionTarget = useMemo(() => {
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        const target = attentionTargetsByWorkspaceId[workspace.id];
        if (target) {
          return target;
        }
      }
    }
    return null;
  }, [attentionTargetsByWorkspaceId, projects]);

  const handleOpenTask = useCallback(
    (target: { projectPath: string; workspaceId: string; taskId: string }) => {
      void focusTaskAttention(target);
    },
    [focusTaskAttention],
  );

  const totalWorkspaceCount = projects.reduce(
    (count, project) => count + project.workspaces.length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/80 bg-card px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Bot className="size-4 shrink-0 text-muted-foreground" />
            <h1 className="truncate text-sm font-semibold text-foreground">
              Fleet View
            </h1>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
            {totalWorkspaceCount} workspace
            {totalWorkspaceCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-sm"
            disabled={!nextAttentionTarget}
            onClick={() => {
              if (nextAttentionTarget) {
                void focusTaskAttention(nextAttentionTarget);
              }
            }}
          >
            <ArrowRight className="size-4" />
            Next Needs Input
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            aria-label="close-fleet-view"
            title="Close Fleet View"
            onClick={closeFleetView}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderTree />
              </EmptyMedia>
              <EmptyTitle>No Workspaces</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="mx-auto flex w-full max-w-6xl flex-col">
            {projects.map((project) => (
              <section key={project.projectPath} className="border-b border-border/80">
                <div className="flex min-h-12 items-center gap-2 bg-muted/25 px-4 py-2">
                  <FolderTree className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">
                      {project.projectName}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {project.projectPath}
                    </p>
                  </div>
                  {project.isCurrent ? (
                    <Badge variant="outline" className="rounded-sm">
                      Current
                    </Badge>
                  ) : null}
                </div>
                {project.workspaces.length === 0 ? (
                  <div className="flex h-14 items-center px-4 text-sm text-muted-foreground">
                    No workspaces
                  </div>
                ) : (
                  (() => {
                    const laneGroups = groupFleetWorkspacesByLane({
                      workspaces: project.workspaces,
                      lifecycleByWorkspaceId,
                    });
                    // Only label lanes once a project actually spans more than
                    // one — a single-lane project stays as clean as before.
                    const showLanes = laneGroups.length > 1;
                    const elements: ReactNode[] = [];
                    for (const group of laneGroups) {
                      if (showLanes) {
                        elements.push(
                          <FleetLaneHeader
                            key={`lane:${group.lane}`}
                            lane={group.lane}
                            count={group.workspaces.length}
                          />,
                        );
                      }
                      for (const workspace of group.workspaces) {
                        elements.push(
                          <MemoizedFleetWorkspaceSection
                            key={workspace.id}
                            projectPath={project.projectPath}
                            workspace={workspace}
                            onOpenTask={handleOpenTask}
                            onAttentionTargetChange={handleAttentionTargetChange}
                            onLifecycleChange={handleLifecycleChange}
                          />,
                        );
                      }
                    }
                    return elements;
                  })()
                )}
              </section>
            ))}
          </div>
        )}
      </div>
      {nextAttentionTarget ? (
        <div className="border-t border-border/80 bg-card/80 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {nextAttentionTarget.taskTitle || "Untitled Task"}
          </span>{" "}
          needs{" "}
          {nextAttentionTarget.status === "waiting-input"
            ? "input"
            : "approval"}
          .
        </div>
      ) : null}
      {projects.length > 0 && totalWorkspaceCount === 0 ? (
        <div className="pointer-events-none absolute right-4 top-4 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
        </div>
      ) : null}
    </div>
  );
}
