import { Button as AdsButton } from "@/components/ads/components/Button";
import { AlertTriangle, CircleDashed } from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import {
  buildWorkspaceProgressTaskItems,
  resolveWorkspaceProgressTaskLoaderVariant,
  type WorkspaceProgressTaskItem,
} from "@/components/layout/ProjectWorkspaceSidebar.utils";
import { Loader } from "@/components/ui";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ChatMessage, Task } from "@/types/chat";
import { useAppStore } from "@/store/app.store";
import {
  workspaceProgressStatusToneStyles as statusTone,
  workspaceProgressTaskTreeStyles as styles,
} from "./workspace-progress-task-tree.styles";

const EMPTY_TASKS: Task[] = [];
const EMPTY_MESSAGES_BY_TASK: Record<string, ChatMessage[]> = {};
const EMPTY_ACTIVE_TURN_IDS_BY_TASK: Record<string, string | undefined> = {};
const EMPTY_OPEN_TASK_TAB_IDS: string[] = [];

const STATUS_LABEL: Record<FleetTaskStatus, string> = {
  "waiting-input": "Awaiting input",
  "waiting-approval": "Awaiting approval",
  error: "Error",
  running: "Running",
  idle: "Idle",
};

function StatusMark(args: { status: FleetTaskStatus }) {
  const loaderVariant = resolveWorkspaceProgressTaskLoaderVariant(args.status);
  if (loaderVariant) {
    return (
      <Loader
        aria-hidden
        className={sx(statusTone[args.status])}
        size="xs"
        variant={loaderVariant}
      />
    );
  }
  if (args.status === "error") {
    return (
      <AlertTriangle
        className={sx(styles.statusIcon, statusTone.error)}
        aria-hidden="true"
      />
    );
  }
  return (
    <CircleDashed
      className={sx(styles.statusIcon, statusTone.idle)}
      aria-hidden="true"
    />
  );
}

function ProviderMark(args: {
  providerId: WorkspaceProgressTaskItem["providerId"];
}) {
  const label = getProviderLabel({ providerId: args.providerId });
  return (
    <span
      className={sx(styles.providerMark)}
      title={`${label} provider`}
    >
      <ModelIcon providerId={args.providerId} className={sx(styles.providerIcon)} />
      <VisuallyHidden>{label} provider</VisuallyHidden>
    </span>
  );
}

export function WorkspaceProgressTaskTreeView(args: {
  items: WorkspaceProgressTaskItem[];
  loading?: boolean;
  onOpenTask: (taskId: string) => void;
}) {
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
          <span>Loading tasks</span>
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
            onClick={() => args.onOpenTask(item.taskId)}
          >
            <ProviderMark providerId={item.providerId} />
            <span className={sx(styles.rowTitle)}>{item.title}</span>
            <span
              className={sx(styles.statusSlot, statusTone[item.status])}
              title={statusLabel}
            >
              <StatusMark status={item.status} />
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
      aria-label="Open tasks"
    >
      {body}
    </ul>
  );
}

export const WorkspaceProgressTaskTree = memo(
  function WorkspaceProgressTaskTree(args: {
    workspaceId: string;
    projectPath: string;
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
        tasks,
      ],
    );

    if (items.length === 0) {
      return null;
    }

    return (
      <WorkspaceProgressTaskTreeView
        items={items}
        onOpenTask={(taskId) => {
          void focusTaskAttention({
            taskId,
            workspaceId: args.workspaceId,
            projectPath: args.projectPath,
          });
        }}
      />
    );
  },
);
