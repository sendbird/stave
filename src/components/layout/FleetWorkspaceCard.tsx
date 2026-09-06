import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  AlertTriangle,
  ArrowRight,
  CircleDashed,
  GitBranch,
  Moon,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { Button, Loader } from "@/components/ui";
import { cardStyles as styles } from "./fleet-workspace-card.styles";
import { getProviderLabel } from "@/lib/providers/model-catalog";
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
  type PrStatusTone,
  type WorkspacePrStatus,
} from "@/lib/pr-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import { formatTaskUpdatedAt } from "@/lib/tasks";
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
  { label: string; icon: ReactNode; tone: StyleXValue; rail: StyleXValue }
> = {
  "waiting-input": {
    label: "Awaiting input",
    icon: <UserRound className={sx(styles.statusIcon)} aria-hidden="true" />,
    tone: styles.toneWarning,
    rail: styles.railWarning,
  },
  "waiting-approval": {
    label: "Awaiting approval",
    icon: <ShieldCheck className={sx(styles.statusIcon)} aria-hidden="true" />,
    tone: styles.toneWarning,
    rail: styles.railWarning,
  },
  error: {
    label: "Error",
    icon: <AlertTriangle className={sx(styles.statusIcon)} aria-hidden="true" />,
    tone: styles.toneDanger,
    rail: styles.railDanger,
  },
  running: {
    label: "Running",
    // A live turn gets the canonical activity mark, not a static glyph: the
    // row already names the state, so the loader carries the "still moving"
    // half of it.
    icon: <Loader aria-hidden="true" size="xs" variant="pulse" />,
    tone: styles.toneAccent,
    rail: styles.railAccent,
  },
  idle: {
    label: "Idle",
    icon: <CircleDashed className={sx(styles.statusIcon)} aria-hidden="true" />,
    tone: styles.toneMuted,
    rail: styles.railNeutral,
  },
  unknown: {
    label: "Not loaded",
    icon: <CircleDashed className={sx(styles.statusIcon)} aria-hidden="true" />,
    tone: styles.toneMuted,
    rail: styles.railUnknown,
  },
};

/** PR tones are published as semantics; the Badge owns their colors. */
const PR_BADGE_TONE: Record<PrStatusTone, BadgeTone> = {
  neutral: "neutral",
  open: "success",
  attention: "warning",
  danger: "danger",
  done: "accent",
  closed: "danger",
};

function FleetProviderIcon({ provider }: { provider: Task["provider"] }) {
  const label = getProviderLabel({ providerId: provider });
  return (
    <span className={sx(styles.providerMark)} title={`${label} provider`}>
      <ModelIcon providerId={provider} className={sx(styles.providerIcon)} />
      <VisuallyHidden>{label} provider</VisuallyHidden>
    </span>
  );
}

function FleetCardPrBadge({ status }: { status: WorkspacePrStatus | null }) {
  if (!status || status === "no_pr") {
    return null;
  }
  const visual = PR_STATUS_VISUAL[status];
  return (
    <Badge
      className={sx(styles.chip)}
      title={`Pull request: ${visual.label}`}
      tone={PR_BADGE_TONE[visual.tone]}
    >
      <PrStatusIcon status={status} />
      {visual.label}
    </Badge>
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
      ? styles.accentLive
      : hasBlockingAttention
        ? styles.accentBlocking
        : activity === "dormant"
          ? styles.accentDormant
          : styles.accentQuiet;

  return (
    <article
      className={sx(
        styles.card,
        transition.colors,
        accent,
        activity === "dormant" && styles.cardDormant,
        expandedRow && styles.cardExpanded,
      )}
      aria-label={`${displayName} workspace in ${args.projectName}`}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerMain)}>
          <div className={sx(styles.titleRow)}>
            <span className={sx(styles.name)}>{displayName}</span>
            {args.workspace.isDefault ? (
              <Badge className={sx(styles.chip)}>Default</Badge>
            ) : null}
            {activity === "dormant" ? (
              <span
                className={sx(styles.dormantMark)}
                title="Dormant: no recorded activity recently"
              >
                <Moon className={sx(styles.dormantIcon)} aria-hidden="true" />
                <VisuallyHidden>Dormant workspace</VisuallyHidden>
              </span>
            ) : null}
          </div>
          <div className={sx(styles.metaRow)}>
            <span className={sx(styles.metaPart)}>{args.projectName}</span>
            {branchLabel ? (
              <>
                <span aria-hidden="true">·</span>
                <GitBranch className={sx(styles.metaIcon)} aria-hidden="true" />
                <span className={sx(styles.metaPart)}>{branchLabel}</span>
              </>
            ) : null}
          </div>
        </div>
        <FleetCardPrBadge status={prStatus} />
      </div>

      <div className={sx(styles.tasks)}>
        {rows.length === 0 ? (
          <p className={sx(styles.tasksEmpty)}>
            {taskState.hasRuntimeState || loadedShell !== undefined
              ? "No open tasks"
              : didShellLoadFail
                ? "Tasks unavailable"
                : "Loading tasks…"}
          </p>
        ) : (
          <ul className={sx(styles.list)}>
            {visibleRows.map((row) => {
              const visual = FLEET_STATUS_VISUAL[row.status];
              const taskKey = taskKeyFor(row.task.id);
              const isExpanded = args.expandedTaskKey === taskKey;
              const taskTitle = row.task.title || "Untitled Task";
              return (
                <li key={row.task.id} className={sx(styles.listItem)}>
                  <AdsButton
                    layout="host"
                    id={`fleet-task-trigger-${taskKey}`}
                    type="button"
                    data-fleet-task-row="true"
                    data-task-key={taskKey}
                    xstyle={[
                      styles.taskRow,
                      focusRing.ringInset,
                      visual.rail,
                      isExpanded && styles.taskRowExpanded,
                    ]}
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
                    <span className={sx(styles.taskTitle)}>{taskTitle}</span>
                    <span
                      className={sx(styles.taskStatus, visual.tone)}
                      title={`${visual.label} · updated ${row.updatedLabel}`}
                    >
                      {visual.icon}
                      <span className={sx(styles.statusLabel)}>
                        {visual.label}
                      </span>
                    </span>
                  </AdsButton>
                </li>
              );
            })}
            {hiddenTaskCount > 0 || showAllTasks ? (
              <li>
                <AdsButton
                  layout="host"
                  type="button"
                  xstyle={[styles.disclosure, focusRing.ringInset]}
                  aria-expanded={showAllTasks}
                  onClick={toggleTaskDisclosure}
                >
                  {showAllTasks
                    ? "Show fewer"
                    : `+${hiddenTaskCount} more task${hiddenTaskCount === 1 ? "" : "s"}`}
                </AdsButton>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {expandedRow ? (
        <div
          id={`fleet-task-controls-${taskKeyFor(expandedRow.task.id)}`}
          className={sx(styles.controls)}
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

      <div className={sx(styles.footer)}>
        {todoProgress.total > 0 ? (
          <span
            className={sx(styles.todo)}
            title={`${todoProgress.completed} of ${todoProgress.total} todos done`}
          >
            <span className={sx(styles.todoTrack)}>
              <span
                className={sx(styles.todoFill)}
                style={{
                  width: `${Math.round(
                    (todoProgress.completed / todoProgress.total) * 100,
                  )}%`,
                }}
              />
            </span>
            <span className={sx(styles.todoCount)}>
              {todoProgress.completed}/{todoProgress.total}
            </span>
          </span>
        ) : null}
        <span className={sx(styles.activity)}>
          {activityAt
            ? formatTaskUpdatedAt({ value: activityAt })
            : "No recorded activity"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          xstyle={styles.openAction}
          aria-label={`Open ${displayName} workspace`}
          onClick={() =>
            args.onOpenWorkspace({
              projectPath: args.projectPath,
              workspaceId: args.workspace.id,
            })
          }
        >
          Open
          <ArrowRight className={sx(styles.openIcon)} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

export const MemoizedFleetWorkspaceCard = memo(FleetWorkspaceCard);
