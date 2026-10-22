import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import {
  TASK_DRAG_MIME,
  encodeTaskDragPayload,
} from "@/lib/task-context/attached-task-context";
import { memo, useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildWorkspaceProgressTaskItems,
  type WorkspaceProgressTaskItem,
} from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { StateMark } from "@/components/ads/components/StateMark";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import { Loader } from "@/components/ui";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { ProviderMark } from "@/components/system/ProviderMark";
import { sx } from "@/components/ads/utils/stylex";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ChatMessage, Task } from "@/types/chat";
import { useAppStore } from "@/store/app.store";
import { workspaceProgressTaskTreeStyles as styles } from "./workspace-progress-task-tree.styles";

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_OPEN_TASK_TAB_IDS: string[] = [];

const STATUS_LABEL: Record<FleetTaskStatus, string> = {
  get "waiting-input"() { return i18n.t("workspace:workspaceProgressTaskTree.awaitingInput"); },
  get "waiting-approval"() { return i18n.t("workspace:workspaceProgressTaskTree.awaitingApproval"); },
  get error() { return i18n.t("workspace:workspaceProgressTaskTree.error"); },
  get running() { return i18n.t("workspace:workspaceProgressTaskTree.running"); },
  get idle() { return i18n.t("workspace:workspaceProgressTaskTree.idle"); },
};

/** Each open task status as a shared work state, drawn by `StateMark`. */
const STATUS_WORK_STATE: Record<FleetTaskStatus, WorkState> = {
  "waiting-input": "needs-you",
  "waiting-approval": "approval",
  error: "failed",
  running: "working",
  idle: "idle",
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

export function WorkspaceProgressTaskTreeView(args: {
  items: WorkspaceProgressTaskItem[];
  loading?: boolean;
  onOpenTask: (taskId: string) => void;
  /** Lets a row be dragged into a composer to attach the task as context. */
  workspaceId?: string;
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
    body = args.items.map((item) => {
      const statusLabel = STATUS_LABEL[item.status];
      return (
        <li key={item.taskId}>
          <AdsButton layout="host"
            type="button"
            data-workspace-progress-task={item.taskId}
            data-workspace-progress-status={item.status}
            xstyle={styles.row}
            aria-label={`${item.title}, ${statusLabel}`}
            title={args.workspaceId ? tI18n("workspace:workspaceProgressTaskTree.openOrDragIntoAPromptTo") : undefined}
            onClick={() => args.onOpenTask(item.taskId)}
            draggable={Boolean(args.workspaceId)}
            onDragStart={(event) => {
              if (!args.workspaceId) {
                return;
              }
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData(
                TASK_DRAG_MIME,
                encodeTaskDragPayload({
                  taskId: item.taskId,
                  workspaceId: args.workspaceId,
                  title: item.title,
                }),
              );
            }}
          >
            <TaskProviderMark providerId={item.providerId} />
            <span className={sx(styles.rowTitle)}>{item.title}</span>
            <span className={sx(styles.statusSlot)} title={statusLabel}>
              <StateMark state={STATUS_WORK_STATE[item.status]} />
              <VisuallyHidden>{statusLabel}</VisuallyHidden>
            </span>
          </AdsButton>
        </li>
      );
    });
  }

  return (
    <ul
      data-testid="workspace-progress-tasks"
      className={sx(styles.list)}
      aria-label={tI18n("workspace:workspaceProgressTaskTree.openTasks")}
    >
      {body}
    </ul>
  );
}

export const WorkspaceProgressTaskTree = memo(
  function WorkspaceProgressTaskTree(args: {
    workspaceId: string;
    repositoryPath: string;
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

    const items = useMemo(
      () =>
        buildWorkspaceProgressTaskItems({
          tasks,
          messagesByTask,
          activeTurnIdsByTask,
          providerTurnActivityByTask,
          openTaskTabIds,
        }),
      [
        activeTurnIdsByTask,
        messagesByTask,
        openTaskTabIds,
        providerTurnActivityByTask,
        tasks, i18n.resolvedLanguage],
    );

    if (items.length === 0) {
      return null;
    }

    return (
      <WorkspaceProgressTaskTreeView
        items={items}
        workspaceId={args.workspaceId}
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
