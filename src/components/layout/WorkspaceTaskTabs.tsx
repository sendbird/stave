import { Check, Copy, Ellipsis, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ModelIcon } from "@/components/ai-elements";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { Button, Card, Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { getProviderLabel, getProviderWaveToneClass } from "@/lib/providers/model-catalog";
import { getProviderConversationLabel, listProviderConversations } from "@/lib/providers/provider-conversations";
import { isTaskArchived } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archivedTasks: ReturnType<typeof useAppStore.getState>["tasks"];
  onRestore: (taskId: string) => void;
}) {
  return (
    <Drawer open={args.open} onOpenChange={args.onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(28rem,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[28rem]">
        <DrawerHeader className="border-b border-border/70 px-5 py-5 text-left">
          <DrawerTitle>Task History</DrawerTitle>
          <DrawerDescription>Archived tasks for the current workspace.</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {args.archivedTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-sm text-muted-foreground">
              No archived tasks yet.
            </div>
          ) : (
            <div className="space-y-2">
              {args.archivedTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-3">
                  <ModelIcon providerId={task.provider} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => args.onRestore(task.id)}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DrawerFooter className="border-t border-border/70 px-5 py-4">
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function WorkspaceTaskTabs() {
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [taskToArchive, setTaskToArchive] = useState<{ id: string; title: string } | null>(null);
  const [taskToRename, setTaskToRename] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [taskToViewSession, setTaskToViewSession] = useState<{ id: string; title: string } | null>(null);
  const [copiedSessionIdKey, setCopiedSessionIdKey] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const tasks = useAppStore((state) => state.tasks);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeTurnIdsByTask = useAppStore((state) => state.activeTurnIdsByTask);
  const providerConversationByTask = useAppStore((state) => state.providerConversationByTask);
  const selectTask = useAppStore((state) => state.selectTask);
  const createTask = useAppStore((state) => state.createTask);
  const archiveTask = useAppStore((state) => state.archiveTask);
  const renameTask = useAppStore((state) => state.renameTask);
  const exportTask = useAppStore((state) => state.exportTask);
  const restoreTask = useAppStore((state) => state.restoreTask);
  const reorderTasks = useAppStore((state) => state.reorderTasks);

  const visibleTasks = tasks.filter((task) => !isTaskArchived(task));
  const archivedTasks = tasks.filter((task) => isTaskArchived(task));
  const sessionTask = taskToViewSession
    ? tasks.find((task) => task.id === taskToViewSession.id) ?? null
    : null;
  const sessionConversationRows = listProviderConversations({
    conversations: taskToViewSession ? providerConversationByTask[taskToViewSession.id] : undefined,
  });

  useEffect(() => {
    if (!taskToRename) {
      return;
    }
    setRenameValue(taskToRename.title);
    // Use a small delay so focus is applied after Radix DropdownMenu
    // finishes restoring focus to the trigger element on close.
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [taskToRename]);

  useEffect(() => {
    if (!taskToViewSession || !copiedSessionIdKey) {
      return;
    }
    const handle = window.setTimeout(() => setCopiedSessionIdKey(null), 1500);
    return () => window.clearTimeout(handle);
  }, [copiedSessionIdKey, taskToViewSession]);

  function handleRenameConfirm() {
    if (!taskToRename) {
      return;
    }
    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === taskToRename.title) {
      setTaskToRename(null);
      return;
    }
    renameTask({ taskId: taskToRename.id, title: nextTitle });
    setTaskToRename(null);
  }

  function handleTaskDragStart(event: DragEvent<HTMLDivElement>, taskId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  }

  function handleTaskDrop(event: DragEvent<HTMLDivElement>, overTaskId: string) {
    event.preventDefault();
    const activeTaskId = draggingTaskId ?? event.dataTransfer.getData("text/plain");
    if (activeTaskId && activeTaskId !== overTaskId) {
      reorderTasks({ activeTaskId, overTaskId, filter: "active" });
    }
    setDropTargetTaskId(null);
    setDraggingTaskId(null);
  }

  async function copySessionIdentifier(args: { key: string; value: string }) {
    try {
      await copyTextToClipboard(args.value);
      setCopiedSessionIdKey(args.key);
    } catch {
      setCopiedSessionIdKey(null);
    }
  }

  return (
    <>
      <div className="border-b border-border/70 bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              {visibleTasks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">
                  No active tasks
                </div>
              ) : (
                visibleTasks.map((task) => {
                  const isActive = task.id === activeTaskId;
                  const isResponding = Boolean(activeTurnIdsByTask[task.id]);
                  const respondingToneClass = getProviderWaveToneClass({ providerId: task.provider });

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(event) => handleTaskDragStart(event, task.id)}
                      onDragEnd={() => {
                        setDraggingTaskId(null);
                        setDropTargetTaskId(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (draggingTaskId && draggingTaskId !== task.id) {
                          setDropTargetTaskId(task.id);
                        }
                      }}
                      onDrop={(event) => handleTaskDrop(event, task.id)}
                      className={cn(
                        "flex h-11 cursor-grab items-center gap-1 rounded-md border px-2",
                        isActive
                          ? "border-primary/50 bg-background shadow-sm"
                          : "border-border/70 bg-background/70",
                        draggingTaskId === task.id && "cursor-grabbing opacity-70",
                        dropTargetTaskId === task.id && draggingTaskId && draggingTaskId !== task.id && "outline outline-1 outline-primary/60",
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2"
                        onClick={() => selectTask({ taskId: task.id })}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                          {isResponding ? (
                            <WaveIndicator className={cn("gap-px", respondingToneClass)} barClassName="h-3 w-0.5 rounded-[2px]" />
                          ) : (
                            <ModelIcon providerId={task.provider} className="size-4 text-muted-foreground" />
                          )}
                        </span>
                        <span className="max-w-56 truncate text-sm font-medium">{task.title}</span>
                      </button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 rounded-md p-0 text-muted-foreground"
                              onClick={() => setTaskToArchive({ id: task.id, title: task.title })}
                              aria-label={`archive-task-${task.id}`}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Archive task</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 rounded-md p-0 text-muted-foreground" aria-label={`task-menu-${task.id}`}>
                            <Ellipsis className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onSelect={() => setTaskToRename({ id: task.id, title: task.title })}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => exportTask({ taskId: task.id })}>
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => {
                              setCopiedSessionIdKey(null);
                              setTaskToViewSession({ id: task.id, title: task.title });
                            }}
                          >
                            Conversation IDs
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 w-11 shrink-0 rounded-md p-0"
                      onClick={() => createTask({ title: "" })}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New Task</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0">
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setTaskHistoryOpen(true)}>
                Task History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => createTask({ title: "" })}>
                New Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <TaskHistoryDrawer
        open={taskHistoryOpen}
        onOpenChange={setTaskHistoryOpen}
        archivedTasks={archivedTasks}
        onRestore={(taskId) => {
          restoreTask({ taskId });
          setTaskHistoryOpen(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(taskToArchive)}
        title="Archive Task"
        description={taskToArchive ? `Archive task "${taskToArchive.title}"? You can still restore it from Task History.` : ""}
        confirmLabel="Archive"
        onCancel={() => setTaskToArchive(null)}
        onConfirm={() => {
          if (!taskToArchive) {
            return;
          }
          archiveTask({ taskId: taskToArchive.id });
          setTaskToArchive(null);
        }}
      />
      {taskToRename ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]" onMouseDown={() => setTaskToRename(null)}>
          <Card className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground">Rename Task</h3>
            <p className="mt-2 text-sm text-muted-foreground">Enter a new name for this task.</p>
            <Input
              ref={renameInputRef}
              className="mt-3 h-10 rounded-sm border-border/80 bg-background"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleRenameConfirm();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setTaskToRename(null);
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTaskToRename(null)}>Cancel</Button>
              <Button onClick={handleRenameConfirm}>Rename</Button>
            </div>
          </Card>
        </div>
      ) : null}
      {taskToViewSession ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]" onMouseDown={() => setTaskToViewSession(null)}>
          <Card className="w-full max-w-lg rounded-lg border-border/80 bg-card p-4 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Conversation IDs</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stave keeps its own stable task id, and each provider keeps its own native conversation id.
                  For <span className="font-medium text-foreground">{taskToViewSession.title}</span>, these ids can coexist because one task can switch between providers over time.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                {sessionTask?.provider ? `Current: ${getProviderLabel({ providerId: sessionTask.provider })}` : "Task"}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border/80 bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stave task ID</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{taskToViewSession.id}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2"
                    onClick={() => void copySessionIdentifier({ key: "task", value: taskToViewSession.id })}
                  >
                    {copiedSessionIdKey === "task" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copiedSessionIdKey === "task" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {sessionConversationRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  No provider-native conversation ids have been recorded for this task yet.
                </div>
              ) : (
                sessionConversationRows.map((row) => (
                  <div key={row.providerId} className="rounded-md border border-border/80 bg-background px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {getProviderConversationLabel({ providerId: row.providerId })}
                      </p>
                      <span className="rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                        {getProviderLabel({ providerId: row.providerId })}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{row.nativeConversationId}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 px-2"
                        onClick={() => void copySessionIdentifier({ key: row.providerId, value: row.nativeConversationId })}
                      >
                        {copiedSessionIdKey === row.providerId ? <Check className="size-4" /> : <Copy className="size-4" />}
                        {copiedSessionIdKey === row.providerId ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTaskToViewSession(null)}>Close</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
