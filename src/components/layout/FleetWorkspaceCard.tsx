import { i18n, useTranslation } from "@/i18n";
import { formatTimeAgo } from "@/i18n/format";
import { FleetAgentRunStrip, useFleetActiveAgentRun } from "@/components/agent-runs/FleetAgentRunStrip";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { agentRunDecisionOfMessages, describeAgentRunStatus, formatAgentRunBadge } from "@/lib/agent-runs/agent-run-status";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { ArrowRight, GitBranch, Moon } from "lucide-react";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { StateMark } from "@/components/ads/components/StateMark";
import { memo, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FleetTaskActivityLine } from "@/components/layout/FleetTaskActivityLine";
import { FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import { FLEET_TASK_WORK_STATE } from "@/components/layout/fleet-attention-marks";
import {
  FleetTaskControlPanel,
  type FleetTaskControlTarget,
} from "@/components/layout/FleetTaskControlPanel";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { prToneBadgeStyles } from "@/components/layout/pr-status.styles";
import { ProviderMark } from "@/components/system/ProviderMark";
import { Badge } from "@/components/ads/components/Badge";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { useAgentAssignmentsStore } from "@/store/agent-assignments-store";
import { useFleetWorkspaceShell } from "@/store/fleet-workspace-shells-store";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Button } from "@/components/ui";
import { cardStyles as styles } from "./fleet-workspace-card.styles";
import {
  normalizeFleetSearchQuery,
  orderFleetCardTaskRows,
  splitFleetSearchMatch,
} from "@/lib/fleet/card-task-rows";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { WorkspaceShellSummary } from "@/lib/db/workspaces.db";
import {
  getFleetAttentionTier,
  type FleetAttentionItem,
  type FleetAttentionKind,
} from "@/lib/fleet/attention-projection";
import { orderByWorkAttention, rankWorkAttention } from "@/lib/fleet/work-attention-order";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  type FleetDisplayStatus,
  type FleetTaskStatus,
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
import { PR_STATUS_VISUAL, type WorkspacePrStatus } from "@/lib/pr-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import { ActivityTimestamp } from "@/components/system/ActivityTimestamp";
import {
  resolveWorkspaceTodoStatus,
  type WorkspaceTodoItem,
} from "@/lib/workspace-information";
import { useAppStore } from "@/store/app.store";
import { isDefaultWorkspaceName } from "@/store/repository.utils";
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
  /**
   * The most urgent known status among the card's open tasks (null when none
   * has runtime state yet). The board orders cards with it through the shared
   * Work queue rule.
   */
  leadingStatus: FleetTaskStatus | null;
  taskKeys: string[];
};

type FleetCardTaskView = {
  task: Task;
  status: FleetDisplayStatus;
  updatedLabel: string;
};

export function getFleetWorkspaceKey(repositoryPath: string, workspaceId: string) {
  return JSON.stringify([repositoryPath, workspaceId]);
}

export function getFleetTaskKey(
  repositoryPath: string,
  workspaceId: string,
  taskId: string,
) {
  return JSON.stringify([repositoryPath, workspaceId, taskId]);
}

export function formatFleetWorkspaceName(name: string, branch?: string) {
  if (isDefaultWorkspaceName(name)) {
    const branchLabel = formatBranchLabel(branch);
    return branchLabel ? i18n.t("fleet:fleetWorkspaceCard.defaultValue", { branchLabel: branchLabel }) : i18n.t("fleet:fleetWorkspaceCard.default");
  }
  return name;
}

/** The task's provider mark, named on hover and to assistive tech. */
export function FleetProviderIcon({ provider }: { provider: Task["provider"] }) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const label = getProviderLabel({ providerId: provider });
  return (
    <span className={sx(styles.providerMark)}>
      <ProviderMark
        providerId={provider}
        size="sm"
        xstyle={styles.providerIcon}
        label={tI18n("fleet:fleetWorkspaceCard.valueProvider", { label })}
      />
    </span>
  );
}

function FleetCardPrBadge({ status }: { status: WorkspacePrStatus | null }) {
  const { t: tI18n } = useTranslation(["fleet"]);
  if (!status || status === "no_pr") {
    return null;
  }
  const visual = PR_STATUS_VISUAL[status];
  return (
    <Badge
      xstyle={[styles.chip, prToneBadgeStyles[visual.tone]]}
      title={tI18n("fleet:fleetWorkspaceCard.pullRequestValue", { value1: visual.label })}
      tone="neutral"
    >
      <PrStatusIcon status={status} />
      {visual.label}
    </Badge>
  );
}

export function FleetWorkspaceCard(args: {
  repositoryPath: string;
  repositoryName: string;
  workspace: FleetWorkspaceCardView;
  isCurrentRepository: boolean;
  filter: FleetBoardFilter;
  searchQuery: string;
  nowMs: number;
  attentionItems: FleetAttentionItem[];
  expandedTaskKey: string | null;
  cardKey: string;
  onOpenTask: (target: {
    repositoryPath: string;
    workspaceId: string;
    taskId: string;
  }) => void;
  onOpenWorkspace: (target: {
    repositoryPath: string;
    workspaceId: string;
  }) => void;
  onToggleTaskControl: (target: FleetTaskControlTarget) => void;
  onVisibilityChange: (
    cardKey: string,
    visibility: FleetWorkspaceCardVisibility,
  ) => void;
}) {
  const { t: tI18n } = useTranslation(["fleet"]);
  const taskKeyFor = (taskId: string) =>
    getFleetTaskKey(args.repositoryPath, args.workspace.id, taskId);
  const [
    activeRepositoryPath,
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
        state.repositoryPath === args.repositoryPath &&
        state.activeWorkspaceId === args.workspace.id;
      return [
        state.repositoryPath,
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

  const [showAllTasks, setShowAllTasks] = useState(false);

  const isActiveWorkspace =
    activeRepositoryPath === args.repositoryPath &&
    activeWorkspaceId === args.workspace.id;
  const hasRuntimeState = isActiveWorkspace || Boolean(runtimeState);

  // An unopened workspace's task list comes from the shared Fleet read, the
  // same entry the task table uses.
  const shellEntry = useFleetWorkspaceShell(args.workspace.id, !hasRuntimeState);
  const loadedShell: WorkspaceShellSummary | null | undefined =
    shellEntry?.status === "loaded" ? shellEntry.shell : undefined;
  const didShellLoadFail = shellEntry?.status === "failed";

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
    runtimeState, i18n.resolvedLanguage]);

  const openTasks = useMemo(
    () =>
      selectFleetOpenTasks(taskState.tasks, {
        openTaskTabIds: taskState.openTaskTabIds,
        activeTurnIdsByTask: taskState.activeTurnIdsByTask,
      }),
    [taskState, i18n.resolvedLanguage],
  );

  // Task rows follow the shared Work queue rule (`work-attention-order.ts`),
  // with each task's own most urgent attention item as its reason.
  const rows = useMemo(() => {
    const attentionKindByTaskId = new Map<string, FleetAttentionKind>();
    for (const item of args.attentionItems) {
      if (item.taskId && !attentionKindByTaskId.has(item.taskId)) attentionKindByTaskId.set(item.taskId, item.kind);
    }
    const views = openTasks.map((task) => ({
      task,
      status: taskState.hasRuntimeState
        ? classifyTaskStatus({
            task,
            messages: taskState.messagesByTask[task.id] ?? EMPTY_MESSAGES,
            activeTurnId: taskState.activeTurnIdsByTask[task.id] ?? null,
            activity: providerTurnActivityByTask[task.id] ?? null,
          })
        : ("unknown" as const),
      updatedLabel: formatTimeAgo(task.updatedAt),
    })) satisfies FleetCardTaskView[];
    return orderByWorkAttention(views, (row) =>
      rankWorkAttention({
        attentionKind: attentionKindByTaskId.get(row.task.id),
        status: row.status === "unknown" ? undefined : row.status,
        activityAt: row.task.updatedAt,
      }),
    );
  }, [args.attentionItems, openTasks, providerTurnActivityByTask, taskState, i18n.resolvedLanguage]);

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
    [taskState.messageCountByTask, i18n.resolvedLanguage],
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
    [lastActiveAt, openTasks, i18n.resolvedLanguage],
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
    isCurrentRepository: args.isCurrentRepository,
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

  // A stored reference: the card re-renders only when an assignment changes.
  const taskAgents = useAgentAssignmentsStore((state) => state.byTaskId);
  // An agent run's strip names the agent and the badge for its lead task, so
  // that row shows neither: never twice, and never "Needs your answer" over "Idle".
  const activeAgentRun = useFleetActiveAgentRun(args.workspace.id);
  const runLeadTaskId = activeAgentRun && hasAgentOrigin(activeAgentRun.agentRun) ? activeAgentRun.agentRun.leadTaskId : null;
  // A question or an approval the lead task's messages hold unanswered: the
  // run needs your answer. The same derivation as the run's own surfaces.
  const runLeadDecision = activeAgentRun && taskState.hasRuntimeState
    ? agentRunDecisionOfMessages(taskState.messagesByTask[activeAgentRun.agentRun.leadTaskId])
    : null;
  const runLeadLabel =
    activeAgentRun && runLeadTaskId
      ? formatAgentRunBadge(describeAgentRunStatus(activeAgentRun, runLeadDecision))
      : null;
  const matchesFilter = matchesFleetBoardFilter({
    filter: args.filter,
    activity,
    hasBlockingAttention,
    query: args.searchQuery,
    searchableText: [
      displayName,
      args.repositoryName,
      args.workspace.branch ?? "",
      ...rows.map((row) => row.task.title),
      // Typing an agent's name finds the tasks it runs.
      ...rows.flatMap((row) => (taskAgents[row.task.id] ? [taskAgents[row.task.id]!.agentName] : [])),
    ],
  });
  const visible = matchesFilter && !isPhantom;

  // While searching, matching rows lead and all of them show without
  // expanding the card.
  const normalizedQuery = normalizeFleetSearchQuery(args.searchQuery);
  const taskRowOrder = orderFleetCardTaskRows({
    rows,
    limit: FLEET_CARD_TASK_LIMIT,
    query: args.searchQuery,
    searchableTextOf: (row) => [
      row.task.title,
      ...(taskAgents[row.task.id] ? [taskAgents[row.task.id]!.agentName] : []),
    ],
  });
  const visibleRows = showAllTasks
    ? taskRowOrder.orderedRows
    : taskRowOrder.orderedRows.slice(0, taskRowOrder.collapsedCount);
  const hiddenTaskCount = rows.length - visibleRows.length;
  const showSearchMatchNote =
    Boolean(normalizedQuery) && rows.length > 0 && taskRowOrder.noTaskMatched;
  const expandedRow = rows.find(
    (row) => taskKeyFor(row.task.id) === args.expandedTaskKey,
  );
  // The turn's own snapshot, only while that turn is the task's active one.
  const liveActivity = (row: FleetCardTaskView) => {
    const activeTurnId = taskState.activeTurnIdsByTask[row.task.id];
    const activity = activeTurnId ? providerTurnActivityByTask[row.task.id] : undefined;
    return activity?.turnId === activeTurnId && row.status !== "idle" && row.status !== "unknown"
      ? activity
      : undefined;
  };

  const toggleTaskDisclosure = () => {
    if (
      showAllTasks &&
      expandedRow &&
      taskRowOrder.orderedRows.indexOf(expandedRow) >= taskRowOrder.collapsedCount
    ) {
      args.onToggleTaskControl({
        repositoryPath: args.repositoryPath,
        workspaceId: args.workspace.id,
        taskId: expandedRow.task.id,
        taskTitle: expandedRow.task.title || tI18n("fleet:fleetWorkspaceCard.untitledTask"),
      });
    }
    setShowAllTasks((current) => !current);
  };

  const taskKeys = useMemo(
    () =>
      visible
        ? rows.map((row) =>
            getFleetTaskKey(args.repositoryPath, args.workspace.id, row.task.id),
          )
        : [],
    [args.repositoryPath, args.workspace.id, rows, visible, i18n.resolvedLanguage],
  );

  const leadingStatus = rows.reduce<FleetTaskStatus | null>(
    (best, row) =>
      row.status !== "unknown" && (best === null || compareFleetTaskStatus(row.status, best) < 0)
        ? row.status
        : best,
    null,
  );

  const { onVisibilityChange, cardKey } = args;
  useEffect(() => {
    onVisibilityChange(cardKey, {
      visible,
      isPhantom,
      activity,
      activityAt,
      leadingStatus,
      taskKeys,
    });
  }, [
    activity,
    activityAt,
    cardKey,
    isPhantom,
    leadingStatus,
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
  }, [activeTodos, i18n.resolvedLanguage]);

  if (!visible) {
    return null;
  }

  const branchLabel = formatBranchLabel(args.workspace.branch);

  return (
    <article
      className={sx(
        styles.card,
        transition.colors,
        activity === "dormant" && styles.cardDormant,
        expandedRow && styles.cardExpanded,
      )}
      aria-label={tI18n("fleet:fleetWorkspaceCard.valueWorkspaceInValue", { displayName: displayName, value1: args.repositoryName })}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerMain)}>
          <div className={sx(styles.titleRow)}>
            <span className={sx(styles.name)}>{displayName}</span>
            {args.workspace.isDefault ? (
              <Badge xstyle={styles.chip}>{tI18n("fleet:fleetWorkspaceCard.default")}</Badge>
            ) : null}
            {activity === "dormant" ? (
              <span
                className={sx(styles.dormantMark)}
                title={tI18n("fleet:fleetWorkspaceCard.dormantNoRecordedActivityRecently")}
              >
                <Moon className={sx(styles.dormantIcon)} aria-hidden="true" />
                <VisuallyHidden>{tI18n("fleet:fleetWorkspaceCard.dormantWorkspace")}</VisuallyHidden>
              </span>
            ) : null}
          </div>
          <div className={sx(styles.metaRow)}>
            <span className={sx(styles.metaPart)}>{args.repositoryName}</span>
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

      <FleetAgentRunStrip
        workspaceId={args.workspace.id}
        leadTaskDecision={runLeadDecision}
        onOpen={(taskId) =>
          args.onOpenTask({
            repositoryPath: args.repositoryPath,
            workspaceId: args.workspace.id,
            taskId,
          })
        }
      />

      <div className={sx(styles.tasks)}>
        {showSearchMatchNote ? (
          <p className={sx(styles.searchNote)}>
            {tI18n("fleet:fleetWorkspaceCard.searchMatchedWorkspaceNotTasks")}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className={sx(styles.tasksEmpty)}>
            {taskState.hasRuntimeState || loadedShell !== undefined
              ? tI18n("fleet:fleetWorkspaceCard.noOpenTasks")
              : didShellLoadFail
                ? tI18n("fleet:fleetWorkspaceCard.tasksUnavailable")
                : tI18n("fleet:fleetWorkspaceCard.loadingTasks")}
          </p>
        ) : (
          <ul className={sx(styles.list)}>
            {visibleRows.map((row) => {
              const state = FLEET_TASK_WORK_STATE[row.status];
              // A quiet turn borrows the stopped-short glyph, but its word is
              // the attention kind's: it has stopped reporting, not halted.
              const statusLabel =
                row.status === "stalled"
                  ? FLEET_ATTENTION_KIND_LABEL["turn-stalled"]
                  : WORK_STATE[state].label;
              const taskKey = taskKeyFor(row.task.id);
              const isExpanded = args.expandedTaskKey === taskKey;
              const taskTitle = row.task.title || tI18n("fleet:fleetWorkspaceCard.untitledTask");
              const runLead = row.task.id === runLeadTaskId;
              const taskAgent = runLead ? undefined : taskAgents[row.task.id];
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
                      isExpanded && styles.taskRowExpanded,
                    ]}
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? tI18n("fleet:fleetWorkspaceCard.hideControlsForTask", { taskTitle, status: runLead ? runLeadLabel : statusLabel })
                        : tI18n("fleet:fleetWorkspaceCard.showControlsForTask", { taskTitle, status: runLead ? runLeadLabel : statusLabel })
                    }
                    onClick={() =>
                      args.onToggleTaskControl({
                        repositoryPath: args.repositoryPath,
                        workspaceId: args.workspace.id,
                        taskId: row.task.id,
                        taskTitle,
                        turnId:
                          taskState.activeTurnIdsByTask[row.task.id] ?? null,
                      })
                    }
                  >
                    <FleetProviderIcon provider={row.task.provider} />
                    <span className={sx(styles.taskDetails)}>
                      <span className={sx(styles.taskTitle)}>
                        <FleetSearchHighlight text={taskTitle} normalizedQuery={normalizedQuery} />
                      </span>
                      {/* A task in a live turn says what it last did and for how
                          long; any other task keeps its last update. */}
                      {liveActivity(row) ? (
                        <FleetTaskActivityLine
                          activity={liveActivity(row)}
                          status={row.status}
                        />
                      ) : (
                        <ActivityTimestamp value={row.task.updatedAt} kind="updated" />
                      )}
                    </span>
                    {taskAgent ? (
                      <Badge xstyle={styles.chip} title={tI18n("fleet:fleetWorkspaceCard.runsAsTheValueAgent", { value1: taskAgent.agentName })}>
                        <AgentAvatar
                          agent={{ id: taskAgent.agentConfigId, name: taskAgent.agentName, appearance: taskAgent.agentAppearance }}
                          size="xs"
                          aria-label={null}
                        />
                        {taskAgent.agentName}
                      </Badge>
                    ) : null}
                    {runLead ? null : (
                      <StateMark
                        state={state}
                        size="xs"
                        showLabel
                        xstyle={styles.taskStatus}
                        labelXstyle={styles.statusLabel}
                        title={tI18n("fleet:fleetWorkspaceCard.statusUpdated", { status: statusLabel, time: row.updatedLabel })}
                        label={statusLabel}
                      />
                    )}
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
                    ? tI18n("fleet:fleetWorkspaceCard.showFewer")
                    : tI18n("fleet:fleetWorkspaceCard.valueMoreTaskvalue", { count: hiddenTaskCount })}
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
              repositoryPath: args.repositoryPath,
              workspaceId: args.workspace.id,
              taskId: expandedRow.task.id,
              taskTitle: expandedRow.task.title || tI18n("fleet:fleetWorkspaceCard.untitledTask"),
              turnId:
                taskState.activeTurnIdsByTask[expandedRow.task.id] ?? null,
            }}
            returnFocusElementId={`fleet-task-trigger-${taskKeyFor(expandedRow.task.id)}`}
            onOpenTask={args.onOpenTask}
            onClose={() =>
              args.onToggleTaskControl({
                repositoryPath: args.repositoryPath,
                workspaceId: args.workspace.id,
                taskId: expandedRow.task.id,
                taskTitle: expandedRow.task.title || tI18n("fleet:fleetWorkspaceCard.untitledTask"),
              })
            }
          />
        </div>
      ) : null}

      <div className={sx(styles.footer)}>
        {todoProgress.total > 0 ? (
          <span
            className={sx(styles.todo)}
            title={tI18n("fleet:fleetWorkspaceCard.valueOfValueTodosDone", { value1: todoProgress.completed, value2: todoProgress.total })}
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
            ? formatTimeAgo(activityAt)
            : tI18n("fleet:fleetWorkspaceCard.noRecordedActivity")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          xstyle={styles.openAction}
          aria-label={tI18n("fleet:fleetWorkspaceCard.openValueWorkspace", { displayName: displayName })}
          onClick={() =>
            args.onOpenWorkspace({
              repositoryPath: args.repositoryPath,
              workspaceId: args.workspace.id,
            })
          }
        >
          {tI18n("fleet:fleetWorkspaceCard.open")}<ArrowRight className={sx(styles.openIcon)} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

/** The task title with the active search match marked. */
function FleetSearchHighlight(props: { text: string; normalizedQuery: string }) {
  const parts = splitFleetSearchMatch(props.text, props.normalizedQuery);
  if (!parts) {
    return props.text;
  }
  return (
    <>
      {parts.before}
      <mark className={sx(styles.searchMatch)}>{parts.match}</mark>
      {parts.after}
    </>
  );
}

export const MemoizedFleetWorkspaceCard = memo(FleetWorkspaceCard);
