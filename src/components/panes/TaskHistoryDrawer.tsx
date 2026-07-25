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
import { loadWorkspaceShellSummary } from "@/lib/db/workspaces.db";
import {
  filterTasksByName,
  isLegacyBranchTask,
  isTaskArchived,
} from "@/lib/tasks";
import type { Task } from "@/types/chat";
import { useAppStore } from "@/store/app.store";

const EMPTY_TASKS: Task[] = [];

/**
 * Archived-task browser (ported from the removed WorkspaceTaskTabs strip).
 * Restoring a task re-opens it as a pane tab via `restoreTask`.
 *
 * `workspaceId`/`projectPath` let this be opened for a workspace other than
 * the active one (e.g. from the LNB kebab menu) without switching first —
 * browsing reads live store state when the workspace has runtime cache, or
 * falls back to an async persistence fetch. Only "Restore" needs to switch
 * into the target workspace, since restoring opens a pane tab there.
 */
export function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  projectPath?: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWorkspaceId, restoreTask] = useAppStore(
    useShallow(
      (state) => [state.activeWorkspaceId, state.restoreTask] as const,
    ),
  );
  const targetWorkspaceId = args.workspaceId ?? activeWorkspaceId;
  const isActiveWorkspace = Boolean(
    targetWorkspaceId && targetWorkspaceId === activeWorkspaceId,
  );

  const [liveTasks, hasRuntimeCache] = useAppStore(
    useShallow((state) => {
      if (isActiveWorkspace) {
        return [state.tasks, true] as const;
      }
      const runtimeState = targetWorkspaceId
        ? state.workspaceRuntimeCacheById[targetWorkspaceId]
        : undefined;
      return [
        runtimeState?.tasks ?? EMPTY_TASKS,
        Boolean(runtimeState),
      ] as const;
    }),
  );

  const [fetchedTasks, setFetchedTasks] = useState<Task[] | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (
      !args.open ||
      isActiveWorkspace ||
      hasRuntimeCache ||
      !targetWorkspaceId
    ) {
      setFetchedTasks(null);
      return;
    }
    let cancelled = false;
    setIsFetching(true);
    void loadWorkspaceShellSummary({ workspaceId: targetWorkspaceId })
      .then((shell) => {
        if (!cancelled) {
          setFetchedTasks(shell?.tasks ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedTasks([]);
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

  const tasks =
    isActiveWorkspace || hasRuntimeCache
      ? liveTasks
      : (fetchedTasks ?? EMPTY_TASKS);
  const archivedTasks = tasks.filter(
    (task) => !isLegacyBranchTask(task) && isTaskArchived(task),
  );
  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery("");
    }
    args.onOpenChange(open);
  }

  const filteredTasks = filterTasksByName({
    tasks: archivedTasks,
    query: searchQuery,
  });

  async function handleRestore(taskId: string) {
    if (!isActiveWorkspace && targetWorkspaceId) {
      const store = useAppStore.getState();
      if (args.projectPath && args.projectPath !== store.projectPath) {
        await store.openProject({ projectPath: args.projectPath });
      }
      await useAppStore.getState().switchWorkspace({
        workspaceId: targetWorkspaceId,
      });
    }
    restoreTask({ taskId });
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
              ? "Archived tasks for the current workspace."
              : "Archived tasks for this workspace."}
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
          ) : archivedTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No archived tasks yet.
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => {
                      void handleRestore(task.id);
                    }}
                  >
                    Restore
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
