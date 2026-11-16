import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { sx } from "@/components/aui/utils/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { deleteFleetTask } from "@/lib/fleet/task-control-client";
import { reconcileFleetSelection, toggleFleetSelection } from "@/lib/fleet/selection";
import { toast } from "@/lib/notifications/toast";
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
import { ActivityTimestamp } from "@/components/system/ActivityTimestamp";

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
 * `workspaceId`/`repositoryPath` let this be opened for a workspace other than
 * the active one (e.g. from the LNB kebab menu) without switching first —
 * browsing reads live store state when the workspace has runtime cache, or
 * falls back to an async persistence fetch. Only reopening needs to switch into
 * the target workspace, since it opens a pane tab there.
 */
export function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  repositoryPath?: string | null;
}) {
  useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const anchorRef = useRef<string | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
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
      setSelectedIds(new Set());
      setDeleteIds([]);
    }
    args.onOpenChange(open);
  }

  const filteredTasks = filterTasksByName({
    tasks: historyTasks,
    query: searchQuery,
  });

  const visibleKey = filteredTasks.map((task) => task.id).join("\0");
  useEffect(() => {
    const visible = new Set(visibleKey.split("\0"));
    setSelectedIds((previous) => {
      const next = reconcileFleetSelection({ selectedKeys: previous, anchor: anchorRef.current }, [...visible]).selectedKeys;
      return next.size === previous.size ? previous : next;
    });
  }, [visibleKey]);
  useEffect(() => {
    setSelectedIds(new Set());
    anchorRef.current = null;
  }, [targetWorkspaceId]);

  function toggleSelection(taskId: string, range = false) {
    const anchor = anchorRef.current;
    const visible = filteredTasks.map((task) => task.id);
    setSelectedIds((previous) => toggleFleetSelection({ selectedKeys: previous, anchor }, taskId, visible, range).selectedKeys);
    if (!range || !anchor) anchorRef.current = taskId;
  }

  async function activateTargetWorkspace() {
    if (targetWorkspaceId && useAppStore.getState().activeWorkspaceId !== targetWorkspaceId) {
      const store = useAppStore.getState();
      if (args.repositoryPath && args.repositoryPath !== store.repositoryPath) {
        await store.openRepository({ repositoryPath: args.repositoryPath });
      }
      await useAppStore.getState().switchWorkspace({
        workspaceId: targetWorkspaceId,
      });
    }
  }

  async function reopenTask(task: Task) {
    await activateTargetWorkspace();
    // `restoreTask` is a no-op on a task that was never archived, so a merely
    // closed tab has to go through `selectTask` to get its pane back.
    if (isTaskArchived(task)) {
      restoreTask({ taskId: task.id });
    } else {
      selectTask({ taskId: task.id });
    }
  }

  async function handleReopen(task: Task) {
    await reopenTask(task);
    handleOpenChange(false);
  }

  async function restoreSelected() {
    setBusy(true);
    let restored = 0;
    const failed: string[] = [];
    for (const task of filteredTasks.filter((item) => selectedIds.has(item.id))) {
      try {
        await reopenTask(task);
        if (useAppStore.getState().openTaskTabIds.includes(task.id)) restored += 1;
        else failed.push(task.title);
      } catch { failed.push(task.title); }
    }
    setBusy(false);
    setSelectedIds(new Set());
    toast(i18n.t("panes:taskHistoryDrawer.restoreResult", { restored, skipped: failed.length }), {
      description: failed.join(", ") || undefined,
    });
  }

  async function deleteSelected() {
    if (!targetWorkspaceId || busy) return;
    setBusy(true);
    let deleted = 0;
    const failed: string[] = [];
    for (const taskId of deleteIds) {
      const task = tasks.find((item) => item.id === taskId);
      try {
        const result = await deleteFleetTask({ workspaceId: targetWorkspaceId, taskId });
        if (result.ok) {
          deleted += 1;
          setFetchedShell((shell) => shell ? { ...shell, tasks: shell.tasks.filter((item) => item.id !== taskId) } : null);
        } else failed.push(`${task?.title ?? taskId}: ${result.message ?? i18n.t("panes:taskHistoryDrawer.deleteRefused")}`);
      } catch { failed.push(task?.title ?? taskId); }
    }
    setDeleteIds([]);
    setSelectedIds(new Set());
    setBusy(false);
    toast(i18n.t("panes:taskHistoryDrawer.deleteResult", { deleted, skipped: failed.length }), {
      description: failed.join(", ") || undefined,
    });
  }

  return (
    <>
    <Drawer
      open={args.open}
      onOpenChange={handleOpenChange}
      swipeDirection="right"
    >
      <DrawerContent className={sx(styles.drawer)}>
        <DrawerHeader className={sx(styles.header)}>
          <DrawerTitle>{i18n.t("panes:taskHistoryDrawer.taskHistory")}</DrawerTitle>
          <DrawerDescription>
            {isActiveWorkspace
              ? i18n.t("panes:taskHistoryDrawer.closedAndArchivedTasksForTheCurrent")
              : i18n.t("panes:taskHistoryDrawer.closedAndArchivedTasksForThisWorkspace")}
          </DrawerDescription>
          <div className={sx(styles.bulkActions)}>
            <Checkbox
              controlOnly
              xstyle={styles.selectionControl}
              aria-label={i18n.t("panes:taskHistoryDrawer.selectAll")}
              checked={filteredTasks.length > 0 && selectedIds.size === filteredTasks.length}
              indeterminate={selectedIds.size > 0 && selectedIds.size < filteredTasks.length}
              disabled={busy}
              onCheckedChange={() => setSelectedIds(selectedIds.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((task) => task.id)))}
            />
            <span role="status" aria-live="polite">{i18n.t("panes:taskHistoryDrawer.selected", { count: selectedIds.size })}</span>
            <Button size="sm" variant="outline" disabled={busy || selectedIds.size === 0} onClick={() => void restoreSelected()}>
              {i18n.t("panes:taskHistoryDrawer.restoreSelected", { count: selectedIds.size })}
            </Button>
            <Button size="sm" variant="outline" disabled={busy || selectedIds.size === 0} onClick={() => setDeleteIds([...selectedIds])}>
              {i18n.t("panes:taskHistoryDrawer.deleteSelected", { count: selectedIds.size })}
            </Button>
          </div>
          <Input
            className={sx(styles.search)}
            placeholder={i18n.t("panes:taskHistoryDrawer.searchTasks")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </DrawerHeader>
        <div className={sx(styles.body)} onKeyDown={(event) => {
          if (busy) return;
          if (event.key === "Escape" && selectedIds.size > 0) {
            event.preventDefault(); event.stopPropagation(); setSelectedIds(new Set());
          } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
            event.preventDefault(); setSelectedIds(new Set(filteredTasks.map((task) => task.id)));
          }
        }}>
          {isFetching ? (
            <div className={sx(styles.empty)}>
              {i18n.t("panes:taskHistoryDrawer.loadingTasks")}
            </div>
          ) : historyTasks.length === 0 ? (
            <div className={sx(styles.empty)}>
              {i18n.t("panes:taskHistoryDrawer.noPastTasksYet")}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className={sx(styles.empty)}>
              {i18n.t("panes:taskHistoryDrawer.noMatches", { query: searchQuery })}
            </div>
          ) : (
            <div className={sx(styles.list)}>
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={sx(styles.row)}
                  tabIndex={0}
                  data-history-task-id={task.id}
                  onClick={(event) => {
                    if (!busy && (event.metaKey || event.ctrlKey || event.shiftKey)) {
                      event.preventDefault(); toggleSelection(task.id, event.shiftKey);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (busy || event.target !== event.currentTarget) return;
                    if (event.key.toLowerCase() === "x") {
                      event.preventDefault(); toggleSelection(task.id);
                    } else if (event.shiftKey && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                      event.preventDefault();
                      const nextTask = filteredTasks[filteredTasks.indexOf(task) + (event.key === "ArrowDown" ? 1 : -1)];
                      if (nextTask) {
                        anchorRef.current ??= task.id;
                        toggleSelection(nextTask.id, true);
                        const rows = event.currentTarget.parentElement?.children;
                        const nextRow = rows?.[filteredTasks.indexOf(nextTask)];
                        if (nextRow instanceof HTMLElement) nextRow.focus();
                      }
                    }
                  }}
                >
                  <Checkbox controlOnly xstyle={styles.selectionControl} checked={selectedIds.has(task.id)}
                    disabled={busy} aria-label={i18n.t("panes:taskHistoryDrawer.selectTask", { title: task.title })}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={() => toggleSelection(task.id)} />
                  <ModelIcon
                    providerId={task.provider}
                    className={sx(styles.icon)}
                  />
                  <div className={sx(styles.details)}>
                    <span className={sx(styles.title)} title={task.title}>
                      {task.title}
                    </span>
                    <ActivityTimestamp value={task.updatedAt} kind="updated" />
                  </div>
                  {isTaskArchived(task) ? (
                    <span className={sx(styles.badge)}>
                      {i18n.t("panes:taskHistoryDrawer.archived")}
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
                    {isTaskArchived(task) ? i18n.t("panes:taskHistoryDrawer.restore") : i18n.t("panes:taskHistoryDrawer.open")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DrawerFooter className={sx(styles.footer)}>
          <DrawerClose render={<Button variant="outline" />}>{i18n.t("panes:taskHistoryDrawer.close")}</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
    <Dialog open={deleteIds.length > 0} onOpenChange={(open) => { if (!open && !busy) setDeleteIds([]); }}>
      <DialogContent initialFocus={cancelDeleteRef} onKeyDown={(event) => {
        if (event.key === "Enter" && !(event.target instanceof HTMLElement && event.target.dataset.confirmHistoryDelete)) {
          event.preventDefault(); event.stopPropagation();
        }
      }}>
        <DialogHeader>
          <DialogTitle>{i18n.t("panes:taskHistoryDrawer.confirmDeleteTitle", { count: deleteIds.length })}</DialogTitle>
          <DialogDescription>{i18n.t("panes:taskHistoryDrawer.confirmDeleteDescription")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelDeleteRef} variant="outline" disabled={busy} onClick={() => setDeleteIds([])}>{i18n.t("panes:taskHistoryDrawer.cancel")}</Button>
          <Button data-confirm-history-delete="true" variant="destructive" disabled={busy} onClick={() => void deleteSelected()}>{i18n.t("panes:taskHistoryDrawer.deleteSelected", { count: deleteIds.length })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

const styles = stylex.create({
selectionControl: {minInlineSize:vars["--aui-space-24"],minBlockSize:vars["--aui-space-24"]},
bulkActions: {display:"flex",alignItems:"center",flexWrap:"wrap",gap:vars["--aui-space-8"],marginTop:vars["--aui-space-12"]},
drawer: {width:"min(28rem, 92vw)",maxWidth:448},
header: {borderBottomWidth:1,borderBottomStyle:"solid",borderBottomColor:vars["--aui-color-border"],padding:vars["--aui-space-20"],textAlign:"left"},
search: {marginTop:vars["--aui-space-12"],height:36,borderRadius:vars["--aui-radius-control"],borderColor:vars["--aui-color-border"]},
body: {minHeight:0,flex:1,overflowY:"auto",paddingInline:vars["--aui-space-20"],paddingBlock:vars["--aui-space-16"]},
empty: {borderRadius:6,borderWidth:1,borderStyle:"dashed",borderColor:vars["--aui-color-border"],paddingInline:vars["--aui-space-12"],paddingBlock:vars["--aui-space-16"],fontSize: vars["--aui-font-size-body"],color:vars["--aui-color-text-muted"]},
list: {display:"flex",flexDirection:"column",gap:vars["--aui-space-8"]},
row: {display:"flex",alignItems:"center",gap:vars["--aui-space-12"],borderRadius:6,borderWidth:1,borderStyle:"solid",borderColor:vars["--aui-color-border"],backgroundColor:vars["--aui-color-canvas"],padding:vars["--aui-space-12"]},
icon: {width:16,height:16,flexShrink:0,color:vars["--aui-color-text-muted"]},
details: {minWidth:0,flex:1,display:"flex",flexDirection:"column",gap:vars["--aui-space-4"]},
title: {minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize: vars["--aui-font-size-body"],fontWeight:500},
badge: {flexShrink:0,borderRadius:4,borderWidth:1,borderStyle:"solid",borderColor:vars["--aui-color-border"],paddingInline:vars["--aui-space-8"],paddingBlock:vars["--aui-space-2"],fontSize: vars["--aui-font-size-micro"],color:vars["--aui-color-text-muted"]},
action: {height:32,flexShrink:0},
footer: {borderTopWidth:1,borderTopStyle:"solid",borderTopColor:vars["--aui-color-border"],paddingInline:vars["--aui-space-20"],paddingBlock:vars["--aui-space-16"]}
});
