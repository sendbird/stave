import { Check, Copy, Ellipsis, Plus, SquareTerminal, X } from "lucide-react";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { ModelIcon } from "@/components/ai-elements";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import {
  Badge,
  Button,
  Card,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Input,
  Kbd,
  KbdGroup,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
  buttonVariants,
} from "@/components/ui";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useDismissibleLayer } from "@/lib/dismissible-layer";
import {
  getProviderLabel,
  getProviderWaveToneClass,
} from "@/lib/providers/model-catalog";
import { resolveProviderTurnDisplayState } from "@/lib/providers/turn-status";
import {
  getProviderSessionLabel,
  listProviderSessions,
} from "@/lib/providers/provider-sessions";
import {
  getCliSessionContextLabel,
  getCliSessionProviderLabel,
  type CliSessionContextMode,
} from "@/lib/terminal/types";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import {
  filterTasksByName,
  getRespondingProviderId,
  isColiseumBranch,
  isTaskArchived,
  isTaskManaged,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: ChatMessage[] = [];

const isMacPlatform =
  typeof navigator !== "undefined" &&
  /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent);
const shortcutModifierSymbol = isMacPlatform ? "\u2318" : "Ctrl";

function triggerButtonClassName(args: {
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link";
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-lg";
  className?: string;
}) {
  return buttonVariants({
    variant: args.variant ?? "ghost",
    size: args.size ?? "sm",
    className: args.className,
  });
}

function TaskHistoryDrawer(args: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archivedTasks: ReturnType<typeof useAppStore.getState>["tasks"];
  onRestore: (taskId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery("");
    }
    args.onOpenChange(open);
  }

  const filteredTasks = filterTasksByName({
    tasks: args.archivedTasks,
    query: searchQuery,
  });

  return (
    <Drawer open={args.open} onOpenChange={handleOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[min(28rem,92vw)] data-[vaul-drawer-direction=right]:sm:max-w-[28rem]">
        <DrawerHeader className="border-b border-border/70 px-5 py-5 text-left">
          <DrawerTitle>Task History</DrawerTitle>
          <DrawerDescription>
            Archived tasks for the current workspace.
          </DrawerDescription>
          <Input
            className="mt-3 h-9 rounded-sm border-border/80 bg-background"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {args.archivedTasks.length === 0 ? (
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
                    onClick={() => args.onRestore(task.id)}
                  >
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

type TaskItem = ReturnType<typeof useAppStore.getState>["tasks"][number];
type CliSessionTab = ReturnType<
  typeof useAppStore.getState
>["cliSessionTabs"][number];

function useTaskRespondingState(args: {
  taskId: string;
  fallbackProviderId: TaskItem["provider"];
}) {
  const [turnState, toneClass] = useAppStore(
    useShallow((state) => {
      const activeTurnId = state.activeTurnIdsByTask[args.taskId] ?? null;
      const respondingProviderId = getRespondingProviderId({
        fallbackProviderId: args.fallbackProviderId,
        messages: state.messagesByTask[args.taskId] ?? EMPTY_MESSAGES,
      });
      return [
        resolveProviderTurnDisplayState({
          activeTurnId,
          activity: state.providerTurnActivityByTask[args.taskId] ?? null,
        }),
        getProviderWaveToneClass({ providerId: respondingProviderId }),
      ] as const;
    }),
  );

  return {
    isResponding: turnState !== "idle",
    isStalled: turnState === "stalled",
    toneClass,
  };
}

const WorkspaceTaskTab = memo(function WorkspaceTaskTab(args: {
  task: TaskItem;
  isActive: boolean;
  draggingTaskId: string | null;
  dropTargetTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onArchiveTask: (task: { id: string; title: string }) => void;
  onOpenTaskMenuRename: (task: { id: string; title: string }) => void;
  onOpenTaskMenuSessionIds: (task: { id: string; title: string }) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd: () => void;
  onDragOver: (
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    disabled: boolean,
  ) => void;
  onDrop: (
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    disabled: boolean,
  ) => void;
  onExportTask: (taskId: string) => void;
}) {
  const { isResponding, isStalled, toneClass } = useTaskRespondingState({
    taskId: args.task.id,
    fallbackProviderId: args.task.provider,
  });
  const isManaged = isTaskManaged(args.task);
  const buttonVisibility = args.isActive
    ? "opacity-100"
    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150";

  return (
    <div
      draggable={!isManaged}
      onDragStart={(event) => {
        if (isManaged) {
          return;
        }
        args.onDragStart(event, args.task.id);
      }}
      onDragEnd={args.onDragEnd}
      onDragOver={(event) => args.onDragOver(event, args.task.id, isManaged)}
      onDrop={(event) => args.onDrop(event, args.task.id, isManaged)}
      onAuxClick={(event) => {
        if (event.button === 1 && !isManaged) {
          event.preventDefault();
          args.onArchiveTask({ id: args.task.id, title: args.task.title });
        }
      }}
      className={cn(
        "group flex items-center gap-1 border-b-[2.5px] px-3 transition-colors",
        isManaged ? "cursor-default" : "cursor-grab",
        args.isActive
          ? "border-b-primary bg-background shadow-[1px_0_3px_-1px_rgba(0,0,0,0.1),-1px_0_3px_-1px_rgba(0,0,0,0.1)]"
          : "border-b-transparent hover:bg-background/60",
        args.draggingTaskId === args.task.id &&
          !isManaged &&
          "cursor-grabbing opacity-70",
        args.dropTargetTaskId === args.task.id &&
          args.draggingTaskId &&
          args.draggingTaskId !== args.task.id &&
          "bg-primary/5",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 items-center gap-2"
        onClick={() => args.onSelectTask(args.task.id)}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          {isResponding ? (
            <WaveIndicator
              className={cn("gap-px", toneClass)}
              barClassName="h-3 w-0.5 rounded-[2px]"
            />
          ) : (
            <ModelIcon
              providerId={args.task.provider}
              className="size-4 text-muted-foreground"
            />
          )}
        </span>
        <span className="max-w-56 truncate text-sm font-medium">
          {args.task.title}
        </span>
        {isStalled ? (
          <Badge
            variant="warning"
            className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
          >
            Stalled
          </Badge>
        ) : null}
        {isManaged ? (
          <Badge
            variant="secondary"
            className="rounded-sm text-[10px] uppercase tracking-[0.14em]"
          >
            Managed
          </Badge>
        ) : null}
      </button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            className={triggerButtonClassName({
              className: cn(
                "h-7 w-7 rounded-md p-0 text-muted-foreground",
                buttonVisibility,
              ),
            })}
            disabled={isManaged}
            onClick={() =>
              args.onArchiveTask({ id: args.task.id, title: args.task.title })
            }
            aria-label={`archive-task-${args.task.id}`}
          >
            <X className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isManaged
              ? "Take over this task before archiving."
              : "Archive task"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={triggerButtonClassName({
            className: cn(
              "h-7 w-7 rounded-md p-0 text-muted-foreground",
              buttonVisibility,
            ),
          })}
          aria-label={`task-menu-${args.task.id}`}
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            disabled={isManaged}
            onSelect={() =>
              args.onOpenTaskMenuRename({
                id: args.task.id,
                title: args.task.title,
              })
            }
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => args.onExportTask(args.task.id)}>
            Export
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              args.onOpenTaskMenuSessionIds({
                id: args.task.id,
                title: args.task.title,
              });
            }}
          >
            Session IDs
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

const WorkspaceCliSessionStripTab = memo(
  function WorkspaceCliSessionStripTab(args: {
    tab: CliSessionTab;
    isActive: boolean;
    draggingTabId: string | null;
    dropTargetTabId: string | null;
    onSelectTab: (tabId: string) => void;
    onRenameTab: (tab: { id: string; title: string }) => void;
    onRequestCloseTab: (tab: { id: string; title: string }) => void;
    onDragStart: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
    onDrop: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
  }) {
    const buttonVisibility = args.isActive
      ? "opacity-100"
      : "opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150";

    return (
      <div
        draggable
        onDragStart={(event) => args.onDragStart(event, args.tab.id)}
        onDragEnd={args.onDragEnd}
        onDragOver={(event) => args.onDragOver(event, args.tab.id)}
        onDrop={(event) => args.onDrop(event, args.tab.id)}
        onAuxClick={(event) => {
          if (event.button === 1) {
            event.preventDefault();
            args.onRequestCloseTab({ id: args.tab.id, title: args.tab.title });
          }
        }}
        className={cn(
          "group flex items-center gap-1 border-b-[2.5px] px-3 transition-colors",
          "cursor-grab",
          args.isActive
            ? "border-b-primary bg-background shadow-[1px_0_3px_-1px_rgba(0,0,0,0.1),-1px_0_3px_-1px_rgba(0,0,0,0.1)]"
            : "border-b-transparent hover:bg-background/60",
          args.draggingTabId === args.tab.id && "cursor-grabbing opacity-70",
          args.dropTargetTabId === args.tab.id &&
            args.draggingTabId &&
            args.draggingTabId !== args.tab.id &&
            "bg-primary/5",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 items-center gap-2"
          title={`${getCliSessionProviderLabel(args.tab.provider)} · ${getCliSessionContextLabel(args.tab.contextMode)}`}
          onClick={() => args.onSelectTab(args.tab.id)}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <ModelIcon
              providerId={args.tab.provider}
              className="size-4 text-muted-foreground"
            />
            <SquareTerminal
              className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-sm bg-background text-muted-foreground"
              strokeWidth={2.5}
            />
          </span>
          <span className="max-w-56 truncate text-sm font-medium">
            {args.tab.title}
          </span>
        </button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              className={triggerButtonClassName({
                className: cn(
                  "h-7 w-7 rounded-md p-0 text-muted-foreground",
                  buttonVisibility,
                ),
              })}
              onClick={() =>
                args.onRequestCloseTab({
                  id: args.tab.id,
                  title: args.tab.title,
                })
              }
              aria-label={`close-cli-session-${args.tab.id}`}
            >
              <X className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="bottom">Close session</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={triggerButtonClassName({
              className: cn(
                "h-7 w-7 rounded-md p-0 text-muted-foreground",
                buttonVisibility,
              ),
            })}
            aria-label={`cli-session-menu-${args.tab.id}`}
          >
            <Ellipsis className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={() =>
                args.onRenameTab({ id: args.tab.id, title: args.tab.title })
              }
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                args.onRequestCloseTab({
                  id: args.tab.id,
                  title: args.tab.title,
                })
              }
            >
              Close
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  },
);

const CLI_SESSION_CHOICES = [
  { provider: "claude-code", contextMode: "workspace" },
  { provider: "claude-code", contextMode: "active-task" },
  { provider: "codex", contextMode: "workspace" },
  { provider: "codex", contextMode: "active-task" },
] as const satisfies readonly {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
}[];

export function WorkspaceTaskTabs() {
  const [taskHistoryOpen, setTaskHistoryOpen] = useState(false);
  const [taskToArchive, setTaskToArchive] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [cliSessionToClose, setCliSessionToClose] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [taskToRename, setTaskToRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [cliSessionToRename, setCliSessionToRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [cliSessionRenameValue, setCliSessionRenameValue] = useState("");
  const [taskToViewSession, setTaskToViewSession] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [copiedSessionIdKey, setCopiedSessionIdKey] = useState<string | null>(
    null,
  );
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);
  const [draggingCliSessionTabId, setDraggingCliSessionTabId] = useState<
    string | null
  >(null);
  const [dropTargetCliSessionTabId, setDropTargetCliSessionTabId] = useState<
    string | null
  >(null);
  const {
    containerRef: sessionIdsDialogRef,
    handleKeyDown: handleSessionIdsDialogKeyDown,
  } = useDismissibleLayer<HTMLDivElement>({
    enabled: Boolean(taskToViewSession),
    onDismiss: () => setTaskToViewSession(null),
  });
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const cliSessionRenameInputRef = useRef<HTMLInputElement | null>(null);
  const [
    tasks,
    activeTaskId,
    activeSurface,
    cliSessionTabs,
    providerAvailability,
    showPresetBar,
    selectTask,
    createTask,
    archiveTask,
    renameTask,
    exportTask,
    restoreTask,
    reorderTasks,
    createCliSessionTab,
    updateSettings,
    setActiveCliSessionTab,
    renameCliSessionTab,
    reorderCliSessionTabs,
    closeCliSessionTab,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.tasks,
          state.activeTaskId,
          state.activeSurface,
          state.cliSessionTabs,
          state.providerAvailability,
          state.settings.showPresetBar,
          state.selectTask,
          state.createTask,
          state.archiveTask,
          state.renameTask,
          state.exportTask,
          state.restoreTask,
          state.reorderTasks,
          state.createCliSessionTab,
          state.updateSettings,
          state.setActiveCliSessionTab,
          state.renameCliSessionTab,
          state.reorderCliSessionTabs,
          state.closeCliSessionTab,
        ] as const,
    ),
  );

  // Coliseum branch tasks are ephemeral fan-out children — never render them
  // as tabs; only the parent tab is visible, and its ChatPanel handles the
  // branch split view directly.
  const visibleTasks = tasks.filter(
    (task) => !isColiseumBranch(task) && !isTaskArchived(task),
  );
  const archivedTasks = tasks.filter(
    (task) => !isColiseumBranch(task) && isTaskArchived(task),
  );
  const viewedSessionState = useAppStore((state) =>
    taskToViewSession
      ? state.providerSessionByTask[taskToViewSession.id]
      : undefined,
  );
  const sessionTask = taskToViewSession
    ? (tasks.find((task) => task.id === taskToViewSession.id) ?? null)
    : null;
  const activeTask = activeTaskId
    ? (tasks.find(
        (task) => task.id === activeTaskId && !isTaskArchived(task),
      ) ?? null)
    : null;
  const sessionRows = useMemo(
    () =>
      listProviderSessions({
        sessions: viewedSessionState,
      }),
    [viewedSessionState],
  );

  useEffect(() => {
    function handleRequestCloseCliSession(event: Event) {
      const detail = (event as CustomEvent<{ id: string; title: string }>)
        .detail;
      if (detail?.id) {
        setCliSessionToClose(detail);
      }
    }
    window.addEventListener(
      "stave:request-close-cli-session",
      handleRequestCloseCliSession,
    );
    return () =>
      window.removeEventListener(
        "stave:request-close-cli-session",
        handleRequestCloseCliSession,
      );
  }, []);

  useEffect(() => {
    if (!taskToRename) {
      return;
    }
    setRenameValue(taskToRename.title);
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [taskToRename]);

  useEffect(() => {
    if (!cliSessionToRename) {
      return;
    }
    setCliSessionRenameValue(cliSessionToRename.title);
    const timer = window.setTimeout(() => {
      cliSessionRenameInputRef.current?.focus();
      cliSessionRenameInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [cliSessionToRename]);

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

  function handleCliSessionRenameConfirm() {
    if (!cliSessionToRename) {
      return;
    }
    const nextTitle = cliSessionRenameValue.trim();
    if (!nextTitle || nextTitle === cliSessionToRename.title) {
      setCliSessionToRename(null);
      return;
    }
    renameCliSessionTab({ tabId: cliSessionToRename.id, title: nextTitle });
    setCliSessionToRename(null);
  }

  function handleTaskDragStart(
    event: DragEvent<HTMLDivElement>,
    taskId: string,
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  }

  function handleTaskDrop(
    event: DragEvent<HTMLDivElement>,
    overTaskId: string,
  ) {
    event.preventDefault();
    const reorderedTaskId =
      draggingTaskId ?? event.dataTransfer.getData("text/plain");
    if (reorderedTaskId && reorderedTaskId !== overTaskId) {
      reorderTasks({
        activeTaskId: reorderedTaskId,
        overTaskId,
        filter: "active",
      });
    }
    setDropTargetTaskId(null);
    setDraggingTaskId(null);
  }

  function handleCliSessionTabDrop(
    event: DragEvent<HTMLDivElement>,
    overTabId: string,
  ) {
    event.preventDefault();
    const reorderedTabId =
      draggingCliSessionTabId ?? event.dataTransfer.getData("text/plain");
    if (reorderedTabId && reorderedTabId !== overTabId) {
      reorderCliSessionTabs({ fromTabId: reorderedTabId, toTabId: overTabId });
    }
    setDropTargetCliSessionTabId(null);
    setDraggingCliSessionTabId(null);
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
      <div
        className={cn(
          "flex min-w-0 items-stretch border-b border-border/70 bg-muted/30",
          PANEL_BAR_HEIGHT_CLASS,
        )}
      >
        <div className="flex min-w-0 w-full items-stretch">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex h-full min-w-max items-stretch">
              {visibleTasks.map((task) => (
                <WorkspaceTaskTab
                  key={task.id}
                  task={task}
                  isActive={
                    activeSurface.kind === "task" &&
                    activeSurface.taskId === task.id
                  }
                  draggingTaskId={draggingTaskId}
                  dropTargetTaskId={dropTargetTaskId}
                  onSelectTask={(taskId) => selectTask({ taskId })}
                  onArchiveTask={setTaskToArchive}
                  onOpenTaskMenuRename={setTaskToRename}
                  onOpenTaskMenuSessionIds={(nextTask) => {
                    setCopiedSessionIdKey(null);
                    setTaskToViewSession(nextTask);
                  }}
                  onDragStart={handleTaskDragStart}
                  onDragEnd={() => {
                    setDraggingTaskId(null);
                    setDropTargetTaskId(null);
                  }}
                  onDragOver={(event, taskId, disabled) => {
                    if (disabled) {
                      return;
                    }
                    event.preventDefault();
                    if (draggingTaskId && draggingTaskId !== taskId) {
                      setDropTargetTaskId(taskId);
                    }
                  }}
                  onDrop={(event, taskId, disabled) => {
                    if (disabled) {
                      return;
                    }
                    handleTaskDrop(event, taskId);
                  }}
                  onExportTask={(taskId) => exportTask({ taskId })}
                />
              ))}
              {visibleTasks.length > 0 && cliSessionTabs.length > 0 ? (
                <div className="mx-1 my-2 w-px shrink-0 bg-border/70" />
              ) : null}
              {cliSessionTabs.map((tab) => (
                <WorkspaceCliSessionStripTab
                  key={tab.id}
                  tab={tab}
                  isActive={
                    activeSurface.kind === "cli-session" &&
                    activeSurface.cliSessionTabId === tab.id
                  }
                  draggingTabId={draggingCliSessionTabId}
                  dropTargetTabId={dropTargetCliSessionTabId}
                  onSelectTab={(tabId) => setActiveCliSessionTab({ tabId })}
                  onRenameTab={setCliSessionToRename}
                  onRequestCloseTab={setCliSessionToClose}
                  onDragStart={(event, tabId) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", tabId);
                    setDraggingCliSessionTabId(tabId);
                  }}
                  onDragEnd={() => {
                    setDraggingCliSessionTabId(null);
                    setDropTargetCliSessionTabId(null);
                  }}
                  onDragOver={(event, tabId) => {
                    event.preventDefault();
                    if (
                      draggingCliSessionTabId &&
                      draggingCliSessionTabId !== tabId
                    ) {
                      setDropTargetCliSessionTabId(tabId);
                    }
                  }}
                  onDrop={(event, tabId) =>
                    handleCliSessionTabDrop(event, tabId)
                  }
                />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 px-2">
            <DropdownMenu>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-sm p-0 text-muted-foreground"
                        aria-label="Create new task or CLI session"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span>New task or CLI session</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => createTask({ title: "" })}>
                  <Plus className="size-4" />
                  New Task
                  <DropdownMenuShortcut className="text-[11px] tracking-normal">
                    {shortcutModifierSymbol}+N
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <SquareTerminal className="size-4" />
                    New CLI Session
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64">
                    <DropdownMenuLabel>Start Here</DropdownMenuLabel>
                    {CLI_SESSION_CHOICES.map((choice) => {
                      const providerAvailable =
                        providerAvailability[choice.provider];
                      const requiresTask = choice.contextMode === "active-task";
                      const disabled =
                        !providerAvailable ||
                        (requiresTask && !activeTask) ||
                        false;
                      const providerLabel = getCliSessionProviderLabel(
                        choice.provider,
                      );
                      const contextLabel = getCliSessionContextLabel(
                        choice.contextMode,
                      );
                      const secondaryLabel = !providerAvailable
                        ? `${providerLabel} is unavailable in this environment`
                        : requiresTask
                          ? activeTask
                            ? `Continue from the active task context`
                            : "Select an active task first"
                          : "Use the current workspace context";
                      const taskHint =
                        requiresTask && activeTask ? activeTask.title : null;

                      return (
                        <DropdownMenuItem
                          key={`${choice.provider}:${choice.contextMode}`}
                          disabled={disabled}
                          className="items-start"
                          onSelect={() => {
                            createCliSessionTab({
                              provider: choice.provider,
                              contextMode: choice.contextMode,
                            });
                          }}
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <ModelIcon
                              providerId={choice.provider}
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">
                                {providerLabel} · {contextLabel}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {secondaryLabel}
                              </div>
                              {taskHint ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground/60">
                                  {taskHint}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={triggerButtonClassName({
                  className:
                    "h-8 w-8 shrink-0 rounded-sm p-0 text-muted-foreground",
                })}
              >
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setTaskHistoryOpen(true)}>
                  Task History
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showPresetBar}
                  onCheckedChange={(checked) =>
                    updateSettings({ patch: { showPresetBar: checked } })
                  }
                >
                  Show preset bar
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
        description={
          taskToArchive
            ? `Archive task "${taskToArchive.title}"? You can still restore it from Task History.`
            : ""
        }
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
      <ConfirmDialog
        open={Boolean(cliSessionToClose)}
        title="Close CLI Session"
        description={
          cliSessionToClose
            ? `Close CLI session "${cliSessionToClose.title}"? The underlying process will be terminated.`
            : ""
        }
        confirmLabel="Close"
        onCancel={() => setCliSessionToClose(null)}
        onConfirm={() => {
          if (!cliSessionToClose) {
            return;
          }
          closeCliSessionTab({ tabId: cliSessionToClose.id });
          setCliSessionToClose(null);
        }}
      />
      {taskToRename ? (
        <div
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]",
          )}
          onMouseDown={() => setTaskToRename(null)}
        >
          <Card
            className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground">
              Rename Task
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter a new name for this task.
            </p>
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
              <Button variant="outline" onClick={() => setTaskToRename(null)}>
                Cancel
              </Button>
              <Button onClick={handleRenameConfirm}>Rename</Button>
            </div>
          </Card>
        </div>
      ) : null}
      {cliSessionToRename ? (
        <div
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]",
          )}
          onMouseDown={() => setCliSessionToRename(null)}
        >
          <Card
            className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground">
              Rename CLI Session
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter a new name for this CLI session.
            </p>
            <Input
              ref={cliSessionRenameInputRef}
              className="mt-3 h-10 rounded-sm border-border/80 bg-background"
              value={cliSessionRenameValue}
              onChange={(event) => setCliSessionRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCliSessionRenameConfirm();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCliSessionToRename(null);
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCliSessionToRename(null)}
              >
                Cancel
              </Button>
              <Button onClick={handleCliSessionRenameConfirm}>Rename</Button>
            </div>
          </Card>
        </div>
      ) : null}
      {taskToViewSession ? (
        <div
          ref={sessionIdsDialogRef}
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Session IDs"
          tabIndex={-1}
          onKeyDown={handleSessionIdsDialogKeyDown}
          onMouseDown={() => setTaskToViewSession(null)}
        >
          <Card
            className="w-full max-w-lg rounded-lg border-border/80 bg-card p-4 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Session IDs
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Stave keeps its own stable task id, and each provider keeps
                  its own native session id. For{" "}
                  <span className="font-medium text-foreground">
                    {taskToViewSession.title}
                  </span>
                  , these ids can coexist because one task can switch between
                  providers over time. Provider-native ids are what Stave uses
                  for in-app resume. They may not be resumable from an external
                  Claude or Codex terminal session.
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                {sessionTask?.provider
                  ? `Current: ${getProviderLabel({ providerId: sessionTask.provider })}`
                  : "Task"}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-border/80 bg-background px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Stave task ID
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                    {taskToViewSession.id}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 px-2"
                    onClick={() =>
                      void copySessionIdentifier({
                        key: "task",
                        value: taskToViewSession.id,
                      })
                    }
                  >
                    {copiedSessionIdKey === "task" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copiedSessionIdKey === "task" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
              {sessionRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  No provider-native session ids have been recorded for this
                  task yet.
                </div>
              ) : (
                sessionRows.map((row) => (
                  <div
                    key={row.providerId}
                    className="rounded-md border border-border/80 bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {getProviderSessionLabel({
                          providerId: row.providerId,
                        })}
                      </p>
                      <span className="rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground">
                        {getProviderLabel({ providerId: row.providerId })}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                        {row.nativeSessionId}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 px-2"
                        onClick={() =>
                          void copySessionIdentifier({
                            key: row.providerId,
                            value: row.nativeSessionId,
                          })
                        }
                      >
                        {copiedSessionIdKey === row.providerId ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        {copiedSessionIdKey === row.providerId
                          ? "Copied"
                          : "Copy"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setTaskToViewSession(null)}
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
