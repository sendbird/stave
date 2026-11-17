import { TaskUnreadDot, TaskReadMenu, withUnreadName } from "@/components/session/TaskReadIndicator";
import { useTaskUnread, useUnreadTaskIds } from "@/lib/task-read-state-client";
import { ensureFleetWorkspace } from "@/lib/fleet/archive-client";
import { toast } from "@/lib/notifications/toast";
import { Pin, PinOff } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { Button as AuiButton } from "@/components/aui/components/Button";
import {
  TASK_DRAG_MIME,
  encodeTaskDragPayload,
} from "@/lib/task-context/attached-task-context";
import { memo, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildWorkspaceProgressTaskItems,
  selectCompactWorkspaceTaskRows,
  type WorkspaceProgressTaskItem,
} from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { StateMark } from "@/components/aui/components/StateMark";
import { Loader } from "@/components/ui";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { ProviderMark } from "@/components/system/ProviderMark";
import { sx } from "@/components/aui/utils/stylex";
import { fleetStatusToWorkState, type FleetTaskStatus } from "@/lib/fleet/task-status";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ChatMessage, Task } from "@/types/chat";
import { useFleetAttentionStore } from "@/store/fleet-attention-store";
import { useAppStore } from "@/store/app.store";
import { workspaceProgressTaskTreeStyles as styles } from "./workspace-progress-task-tree.styles";
import { TaskRunProgressMeta } from "./WorkspaceRunProgress";

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_OPEN_TASK_TAB_IDS: string[] = [];

const STATUS_LABEL: Record<FleetTaskStatus, string> = {
  get "waiting-input"() { return i18n.t("workspace:workspaceProgressTaskTree.awaitingInput"); },
  get "waiting-approval"() { return i18n.t("workspace:workspaceProgressTaskTree.awaitingApproval"); },
  get error() { return i18n.t("workspace:workspaceProgressTaskTree.error"); },
  get stalled() { return i18n.t("workspace:workspaceProgressTaskTree.stalled"); },
  get running() { return i18n.t("workspace:workspaceProgressTaskTree.running"); },
  get idle() { return i18n.t("workspace:workspaceProgressTaskTree.idle"); },
};

/** The task's provider: its mark, named on hover and to assistive tech. */
function TaskProviderMark(args: {
  providerId: WorkspaceProgressTaskItem["providerId"];
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const label = getProviderLabel({ providerId: args.providerId });
  return (
    <span className={sx(styles.providerMark)}>
      <ProviderMark
        providerId={args.providerId}
        size="sm"
        label={tI18n("workspace:workspaceProgressTaskTree.valueProvider", { label })}
      />
    </span>
  );
}

/**
 * Pin is the workspace's own preference: an unloaded workspace is read into the
 * runtime cache first, so pinning never needs to switch to it.
 */
function SidebarTaskPin(args: { taskId: string; title: string; workspaceId: string; pinned: boolean }) {
  useTranslation();
  const label = i18n.t(args.pinned ? "panes:taskHistoryDrawer.unpinTask" : "panes:taskHistoryDrawer.pinTask", { title: args.title });
  return <AuiButton layout="host" type="button" xstyle={styles.pinControl}
    title={label}
    aria-label={label}
    onClick={() => {
      void ensureFleetWorkspace({ workspaceId: args.workspaceId })
        .then(() => useAppStore.getState().pinTask({ taskId: args.taskId, workspaceId: args.workspaceId, pinned: !args.pinned }))
        .catch(() => toast(i18n.t("panes:taskHistoryDrawer.pinFailed")));
    }}>
    {args.pinned ? <PinOff className={sx(styles.pinIcon)} aria-hidden /> : <Pin className={sx(styles.pinIcon)} aria-hidden />}
  </AuiButton>;
}

/** One open task. Its name carries the unread state; its controls name the task. */
function WorkspaceProgressTaskRow(args: {
  item: WorkspaceProgressTaskItem;
  workspaceId?: string;
  showProgress?: boolean;
  onOpenTask: (taskId: string) => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  const { item, workspaceId } = args;
  const unread = useTaskUnread(workspaceId ?? "", item.taskId);
  const statusLabel = STATUS_LABEL[item.status];
  return (
    <li className={sx(styles.taskEntry)}>
      <AuiButton layout="host"
        type="button"
        data-workspace-progress-task={item.taskId}
        data-workspace-progress-status={item.status}
        xstyle={styles.row}
        aria-label={withUnreadName(`${item.title}, ${statusLabel}`, unread)}
        title={workspaceId ? tI18n("workspace:workspaceProgressTaskTree.openOrDragIntoAPromptTo") : undefined}
        onClick={() => args.onOpenTask(item.taskId)}
        draggable={Boolean(workspaceId)}
        onDragStart={(event) => {
          if (!workspaceId) {
            return;
          }
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            TASK_DRAG_MIME,
            encodeTaskDragPayload({
              taskId: item.taskId,
              workspaceId,
              title: item.title,
            }),
          );
        }}
      >
        <TaskProviderMark providerId={item.providerId} />
        <span className={sx(styles.titleWithUnread)}>
          {workspaceId ? <TaskUnreadDot workspaceId={workspaceId} taskId={item.taskId} decorative /> : null}
          <span className={sx(styles.rowTitle)}>{item.title}</span>
        </span>
        <span className={sx(styles.statusSlot)} title={statusLabel}>
          <StateMark state={fleetStatusToWorkState(item.status)} />
          <VisuallyHidden>{statusLabel}</VisuallyHidden>
        </span>
        {args.showProgress && workspaceId && (item.status === "running" || item.status === "stalled") ? (
          <TaskRunProgressMeta
            workspaceId={workspaceId}
            taskId={item.taskId}
            xstyle={styles.progress}
          />
        ) : null}
      </AuiButton>
      {workspaceId ? <SidebarTaskPin taskId={item.taskId} title={item.title} workspaceId={workspaceId} pinned={Boolean(item.pinned)} /> : null}
      {workspaceId ? <TaskReadMenu workspaceId={workspaceId} taskId={item.taskId} title={item.title} /> : null}
    </li>
  );
}

export function WorkspaceProgressTaskTreeView(args: {
  items: WorkspaceProgressTaskItem[];
  loading?: boolean;
  onOpenTask: (taskId: string) => void;
  /** Lets a row be dragged into a composer to attach the task as context. */
  workspaceId?: string;
  /**
   * A running task says what it is doing on a second line of its own row.
   * The workspace row above no longer speaks for one of its tasks, so the
   * words sit with the task they describe, each task with its own.
   */
  showProgress?: boolean;
  /** Open tasks folded behind "+N more"; 0 hides the disclosure. */
  hiddenCount?: number;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const { t: tI18n } = useTranslation(["workspace"]);
  if (!args.loading && args.items.length === 0) {
    return null;
  }

  let body: ReactNode;
  if (args.loading && args.items.length === 0) {
    body = (
      <li>
        <div
          className={sx(styles.loadingRow)}
          data-workspace-progress-loading="true"
        >
          <Loader
            aria-hidden
            className={sx(styles.accent)}
            size="xs"
            variant="pulse"
          />
          <span>{tI18n("workspace:workspaceProgressTaskTree.loadingTasks")}</span>
        </div>
      </li>
    );
  } else {
    body = args.items.map((item) => (
      <WorkspaceProgressTaskRow
        key={item.taskId}
        item={item}
        workspaceId={args.workspaceId}
        showProgress={args.showProgress}
        onOpenTask={args.onOpenTask}
      />
    ));
  }
  const disclosure = args.onToggleExpanded && (args.expanded || (args.hiddenCount ?? 0) > 0) ? (
    <li>
      <AuiButton layout="host" type="button" xstyle={styles.disclosure}
        aria-expanded={Boolean(args.expanded)}
        data-workspace-progress-disclosure="true"
        onClick={args.onToggleExpanded}>
        {args.expanded
          ? tI18n("workspace:workspaceProgressTaskTree.showFewer")
          : tI18n("workspace:workspaceProgressTaskTree.moreTasks", { count: args.hiddenCount ?? 0 })}
      </AuiButton>
    </li>
  ) : null;

  return (
    <ul
      data-testid="workspace-progress-tasks"
      className={sx(styles.list)}
      aria-label={tI18n("workspace:workspaceProgressTaskTree.openTasks")}
    >
      {body}
      {disclosure}
    </ul>
  );
}

export const WorkspaceProgressTaskTree = memo(
  function WorkspaceProgressTaskTree(args: {
    workspaceId: string;
    repositoryPath: string;
    showProgress?: boolean;
  }) {
    const [
      tasks,
      messagesByTask,
      activeTurnIdsByTask,
      providerTurnActivityByTask,
      openTaskTabIds,
      focusTaskAttention,
    ] = useAppStore(
      useShallow((state) => {
        if (state.activeWorkspaceId === args.workspaceId) {
          return [
            state.tasks,
            state.messagesByTask,
            state.activeTurnIdsByTask,
            state.providerTurnActivityByTask,
            state.openTaskTabIds,
            state.focusTaskAttention,
          ] as const;
        }
        const runtimeState = state.workspaceRuntimeCacheById[args.workspaceId];
        return [
          runtimeState?.tasks ?? EMPTY_TASKS,
          runtimeState?.messagesByTask ?? EMPTY_MESSAGES_BY_TASK,
          runtimeState?.activeTurnIdsByTask ?? EMPTY_ACTIVE_TURN_IDS_BY_TASK,
          state.providerTurnActivityByTask,
          runtimeState?.openTaskTabIds ?? EMPTY_OPEN_TASK_TAB_IDS,
          state.focusTaskAttention,
        ] as const;
      }),
    );

    const attentionItems = useFleetAttentionStore((state) => state.snapshot.attentionItemsByWorkspaceId[args.workspaceId]);
    const items = useMemo(
      () =>
        buildWorkspaceProgressTaskItems({
          tasks,
          messagesByTask,
          activeTurnIdsByTask,
          providerTurnActivityByTask,
          openTaskTabIds,
          attentionItems,
        }),
      [
        attentionItems,
        activeTurnIdsByTask,
        messagesByTask,
        openTaskTabIds,
        providerTurnActivityByTask,
        tasks, i18n.resolvedLanguage],
    );

    const [expanded, setExpanded] = useState(false);
    const unreadTaskIds = useUnreadTaskIds(args.workspaceId, items.map((item) => item.taskId));
    const compact = selectCompactWorkspaceTaskRows({ items, unreadTaskIds, expanded });

    if (compact.rows.length === 0) {
      return null;
    }

    return (
      <WorkspaceProgressTaskTreeView
        items={compact.rows}
        hiddenCount={compact.hiddenCount}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
        workspaceId={args.workspaceId}
        showProgress={args.showProgress}
        onOpenTask={(taskId) => {
          void focusTaskAttention({
            taskId,
            workspaceId: args.workspaceId,
            repositoryPath: args.repositoryPath,
          });
        }}
      />
    );
  },
);
