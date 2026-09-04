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
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ChatMessage, Task } from "@/types/chat";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

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

const STATUS_TEXT_CLASS: Record<FleetTaskStatus, string> = {
  "waiting-input": "text-warning",
  "waiting-approval": "text-warning",
  error: "text-destructive",
  running: "text-primary",
  idle: "text-muted-foreground",
};

function StatusMark(args: { status: FleetTaskStatus }) {
  const loaderVariant = resolveWorkspaceProgressTaskLoaderVariant(args.status);
  if (loaderVariant) {
    return (
      <Loader
        aria-hidden
        className={STATUS_TEXT_CLASS[args.status]}
        size="xs"
        variant={loaderVariant}
      />
    );
  }
  if (args.status === "error") {
    return (
      <AlertTriangle className="size-3.5 text-destructive" aria-hidden="true" />
    );
  }
  return (
    <CircleDashed
      className="size-3.5 text-muted-foreground"
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
      className="inline-flex size-4 shrink-0 items-center justify-center"
      title={`${label} provider`}
    >
      <ModelIcon providerId={args.providerId} className="size-3.5" />
      <span className="sr-only">{label} provider</span>
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
          className="flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
          data-workspace-progress-loading="true"
        >
          <Loader
            aria-hidden
            className="text-primary"
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
          <button
            type="button"
            data-workspace-progress-task={item.taskId}
            data-workspace-progress-status={item.status}
            className={cn(
              "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55",
            )}
            aria-label={`${item.title}, ${statusLabel}`}
            onClick={() => args.onOpenTask(item.taskId)}
          >
            <ProviderMark providerId={item.providerId} />
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center",
                STATUS_TEXT_CLASS[item.status],
              )}
              title={statusLabel}
            >
              <StatusMark status={item.status} />
              <span className="sr-only">{statusLabel}</span>
            </span>
          </button>
        </li>
      );
    });
  }

  return (
    <ul
      data-testid="workspace-progress-tasks"
      className="mt-0.5 ml-5 min-w-0 space-y-0.5 border-l border-sidebar-border/60 pl-2"
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
