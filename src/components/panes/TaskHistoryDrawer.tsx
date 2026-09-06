import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/ads/utils/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
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
  // A summary that predates `openTaskTabIds` yields `null`, which
  // `selectTaskHistoryEntries` reads as "unknown" and resolves the same way
  // hydration does — not as "every tab closed".
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
      <DrawerContent className={sx(styles.drawer)}>
        <DrawerHeader className={sx(styles.header)}>
          <DrawerTitle>Task History</DrawerTitle>
          <DrawerDescription>
            {isActiveWorkspace
              ? "Closed and archived tasks for the current workspace."
              : "Closed and archived tasks for this workspace."}
          </DrawerDescription>
          <Input
            className={sx(styles.search)}
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </DrawerHeader>
        <div className={sx(styles.body)}>
          {isFetching ? (
            <div className={sx(styles.empty)}>
              Loading tasks...
            </div>
          ) : historyTasks.length === 0 ? (
            <div className={sx(styles.empty)}>
              No past tasks yet.
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className={sx(styles.empty)}>
              No tasks match &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <div className={sx(styles.list)}>
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={sx(styles.row)}
                >
                  <ModelIcon
                    providerId={task.provider}
                    className={sx(styles.icon)}
                  />
                  <span className={sx(styles.title)}>
                    {task.title}
                  </span>
                  {isTaskArchived(task) ? (
                    <span className={sx(styles.badge)}>
                      Archived
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className={sx(styles.action)}
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
        <DrawerFooter className={sx(styles.footer)}>
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const styles = stylex.create({
drawer: {width:"min(28rem, 92vw)",maxWidth:448},
header: {borderBottomWidth:1,borderBottomStyle:"solid",borderBottomColor:vars.colorBorder,padding:20,textAlign:"left"},
search: {marginTop:12,height:36,borderRadius:4,borderColor:vars.colorBorder,backgroundColor:vars.colorCanvas},
body: {minHeight:0,flex:1,overflowY:"auto",paddingInline:20,paddingBlock:16},
empty: {borderRadius:6,borderWidth:1,borderStyle:"dashed",borderColor:vars.colorBorder,paddingInline:12,paddingBlock:16,fontSize:14,color:vars.colorTextMuted},
list: {display:"flex",flexDirection:"column",gap:8},
row: {display:"flex",alignItems:"center",gap:12,borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,backgroundColor:vars.colorCanvas,padding:12},
icon: {width:16,height:16,flexShrink:0,color:vars.colorTextMuted},
title: {minWidth:0,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:14,fontWeight:500},
badge: {flexShrink:0,borderRadius:4,borderWidth:1,borderStyle:"solid",borderColor:vars.colorBorder,paddingInline:6,paddingBlock:2,fontSize:11,color:vars.colorTextMuted},
action: {height:32,flexShrink:0},
footer: {borderTopWidth:1,borderTopStyle:"solid",borderTopColor:vars.colorBorder,paddingInline:20,paddingBlock:16}
});
