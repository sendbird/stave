import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ModelIcon } from "@/components/ai-elements";
import {
  Button,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Input,
} from "@/components/ui";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import {
  filterTasksByName,
  isTaskArchived,
  selectTaskHistoryEntries,
} from "@/lib/tasks";
import type { Task } from "@/types/chat";
import { useAppStore } from "@/store/app.store";

const EMPTY_TASKS: Task[] = [];

/**
 * Past-task browser (ported from the removed WorkspaceTaskTabs strip).
 *
 * "Past" means archived *or* closed-but-still-live: `closeTaskTab` closes a
 * pane without archiving, and hydration keeps an empty `openTaskTabIds` as-is,
 * so an archived-only list would leave those tasks reachable from nowhere.
 * Archived entries come back through `restoreTask`; merely closed ones only
 * need `selectTask`, which re-adds the pane tab.
 *
 * `workspaceId`/`projectPath` let this be opened for a workspace other than
 * the active one (e.g. from the LNB kebab menu) without switching first —
 * browsing reads live store state when the workspace has runtime cache, or
 * falls back to an async persistence fetch. Only reopening needs to switch into
 * the target workspace, since it opens a pane tab there.
 */
export function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  projectPath?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWorkspaceId, restoreTask, selectTask] = useAppStore(
    useShallow(
      (state) =>
        [state.activeWorkspaceId, state.restoreTask, state.selectTask] as const,
    ),
  );
  const targetWorkspaceId = args.workspaceId ?? activeWorkspaceId;
  const isActiveWorkspace = Boolean(
    targetWorkspaceId && targetWorkspaceId === activeWorkspaceId,
  );

  const [liveTasks, liveOpenTaskTabIds, hasRuntimeCache] = useAppStore(
    useShallow((state) => {
      if (isActiveWorkspace) {
        return [state.tasks, state.openTaskTabIds, true] as const;
      }
      const runtimeState = targetWorkspaceId
        ? state.workspaceRuntimeCacheById[targetWorkspaceId]
        : undefined;
      return [
        runtimeState?.tasks ?? EMPTY_TASKS,
        runtimeState?.openTaskTabIds ?? null,
        Boolean(runtimeState),
      ] as const;
    }),
  );

  const [fetchedShell, setFetchedShell] = useState<Pick<
    WorkspaceShellSummary,
    "tasks" | "openTaskTabIds"
  > | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (
      !args.open ||
      isActiveWorkspace ||
      hasRuntimeCache ||
      !targetWorkspaceId
    ) {
      setFetchedShell(null);
      return;
    }
    let cancelled = false;
    setIsFetching(true);
    void loadWorkspaceShellSummary({ workspaceId: targetWorkspaceId })
      .then((shell) => {
        if (!cancelled) {
          setFetchedShell({
            tasks: shell?.tasks ?? [],
            openTaskTabIds: shell?.openTaskTabIds,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedShell({ tasks: [], openTaskTabIds: undefined });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsFetching(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [args.open, isActiveWorkspace, hasRuntimeCache, targetWorkspaceId]);

  const useLiveState = isActiveWorkspace || hasRuntimeCache;
  const tasks = useLiveState ? liveTasks : (fetchedShell?.tasks ?? EMPTY_TASKS);
  const openTaskTabIds = useLiveState
    ? liveOpenTaskTabIds
    : (fetchedShell?.openTaskTabIds ?? null);
  const historyTasks = selectTaskHistoryEntries({ tasks, openTaskTabIds });
  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery("");
    }
    args.onOpenChange(open);
  }

  const filteredTasks = filterTasksByName({
    tasks: historyTasks,
    query: searchQuery,
  });

  async function handleReopen(task: Task) {
    if (!isActiveWorkspace && targetWorkspaceId) {
      const store = useAppStore.getState();
      if (args.projectPath && args.projectPath !== store.projectPath) {
        await store.openProject({ projectPath: args.projectPath });
      }
      await useAppStore.getState().switchWorkspace({
        workspaceId: targetWorkspaceId,
      });
    }
    // `restoreTask` is a no-op on a task that was never archived, so a merely
    // closed tab has to go through `selectTask` to get its pane back.
    if (isTaskArchived(task)) {
      restoreTask({ taskId: task.id });
    } else {
      selectTask({ taskId: task.id });
    }
    args.onOpenChange(false);
  }

  return (
    <Drawer
      open={args.open}
      onOpenChange={handleOpenChange}
      swipeDirection="right"
    >
      <DrawerContent className="data-[swipe-direction=right]:w-[min(28rem,92vw)] data-[swipe-direction=right]:sm:max-w-[28rem]">
        <DrawerHeader className="border-b border-border/70 px-5 py-5 text-left">
          <DrawerTitle>Task History</DrawerTitle>
          <DrawerDescription>
            {isActiveWorkspace
              ? "Closed and archived tasks for the current workspace."
              : "Closed and archived tasks for this workspace."}
          </DrawerDescription>
          <Input
            className="mt-3 h-9 rounded-sm border-border/80 bg-background"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isFetching ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              Loading tasks...
            </div>
          ) : historyTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No past tasks yet.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No tasks match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-3"
                >
                  <ModelIcon
                    providerId={task.provider}
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {task.title}
                  </span>
                  {isTaskArchived(task) ? (
                    <span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                      Archived
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => {
                      void handleReopen(task);
                    }}
                  >
                    {isTaskArchived(task) ? "Restore" : "Open"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DrawerFooter className="border-t border-border/70 px-5 py-4">
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
