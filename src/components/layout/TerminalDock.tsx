import {
  Ellipsis,
  Eraser,
  Loader2,
  Plus,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { TerminalTabSurface } from "@/components/layout/TerminalTabSurface";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui";
import { TERMINAL_WRITE_ERROR_THRESHOLD } from "@/components/layout/useTerminalInstance";
import { useTerminalSessionManager } from "@/components/layout/useTerminalSessionManager";
import { useTerminalTabManager } from "@/components/layout/useTerminalTabManager";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import {
  buildTerminalSessionSlotKey,
  getWorkspaceTerminalTabKey,
  type TerminalCreateSessionArgs,
} from "@/lib/terminal/types";
import { cn } from "@/lib/utils";
import { shouldAutoCreateDockTerminalTab } from "@/components/layout/terminal-dock.utils";
import {
  TERMINAL_SURFACE_PANEL_CLASS_NAME,
  TERMINAL_SURFACE_VIEWPORT_CLASS_NAME,
} from "@/components/layout/terminal-surface-styles";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/store/app.store";

const TERMINAL_TRANSCRIPT_STORAGE_KEY = "stave:terminal-tab-transcript:v2";

const DockTerminalTab = memo(function DockTerminalTab(args: {
  tab: ReturnType<typeof useAppStore.getState>["terminalTabs"][number];
  isActive: boolean;
  draggingTabId: string | null;
  dropTargetTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onRenameTab: (tab: { id: string; title: string }) => void;
  onCloseTab: (tabId: string) => void;
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
          args.onCloseTab(args.tab.id);
        }
      }}
      className={cn(
        "group flex h-full items-center gap-1 border-b-[2.5px] px-3 transition-colors",
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
        title={args.tab.cwd}
        onClick={() => args.onSelectTab(args.tab.id)}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <SquareTerminal className="size-4 text-muted-foreground" />
        </span>
        <span className="max-w-48 truncate text-sm font-medium">
          {args.tab.title}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 rounded-md p-0 text-muted-foreground",
              buttonVisibility,
            )}
            aria-label={`terminal-menu-${args.tab.id}`}
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() =>
              args.onRenameTab({ id: args.tab.id, title: args.tab.title })
            }
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => args.onCloseTab(args.tab.id)}
          >
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

export function TerminalDock() {
  const [terminalToRename, setTerminalToRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [terminalRenameValue, setTerminalRenameValue] = useState("");
  const [draggingTerminalTabId, setDraggingTerminalTabId] = useState<
    string | null
  >(null);
  const [dropTargetTerminalTabId, setDropTargetTerminalTabId] = useState<
    string | null
  >(null);
  const wasTerminalDockedRef = useRef<boolean | null>(null);
  const terminalRenameInputRef = useRef<HTMLInputElement | null>(null);
  const [
    terminalDocked,
    terminalDockHeight,
    terminalFontFamily,
    terminalFontSize,
    isDarkMode,
    setLayout,
    activeWorkspaceId,
    workspacePath,
    tasks,
    terminalTabs,
    activeTerminalTabId,
    createTerminalTab,
    setActiveTerminalTab,
    renameTerminalTab,
    reorderTerminalTabs,
    closeTerminalTab,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.layout.terminalDocked,
          state.layout.terminalDockHeight ?? 210,
          state.settings.terminalFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
          state.settings.terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE,
          state.isDarkMode,
          state.setLayout,
          state.activeWorkspaceId,
          state.workspacePathById[state.activeWorkspaceId] ??
            state.projectPath ??
            "",
          state.tasks,
          state.terminalTabs,
          state.activeTerminalTabId,
          state.createTerminalTab,
          state.setActiveTerminalTab,
          state.renameTerminalTab,
          state.reorderTerminalTabs,
          state.closeTerminalTab,
        ] as const,
    ),
  );

  const activeTab = useMemo(
    () => terminalTabs.find((tab) => tab.id === activeTerminalTabId) ?? null,
    [activeTerminalTabId, terminalTabs],
  );
  const getTabKey = useCallback(
    (tab: ReturnType<typeof useAppStore.getState>["terminalTabs"][number]) =>
      getWorkspaceTerminalTabKey({
        workspaceId: activeWorkspaceId,
        terminalTabId: tab.id,
      }),
    [activeWorkspaceId],
  );
  const createSession = useCallback(
    async (args: {
      tab: ReturnType<typeof useAppStore.getState>["terminalTabs"][number];
      cols: number;
      rows: number;
      deliveryMode: "poll" | "push";
    }) => {
      if (!workspacePath) {
        return { ok: false, stderr: "Workspace path unavailable." };
      }

      const createSession = window.api?.terminal?.createSession;
      if (!createSession) {
        return {
          ok: false,
          stderr: "Terminal bridge unavailable. Use bun run dev:desktop.",
        };
      }

      const linkedTask = args.tab.linkedTaskId
        ? (tasks.find((task) => task.id === args.tab.linkedTaskId) ?? null)
        : null;
      const request: TerminalCreateSessionArgs = {
        workspaceId: activeWorkspaceId,
        workspacePath,
        taskId: linkedTask?.id ?? null,
        taskTitle: linkedTask?.title ?? null,
        terminalTabId: args.tab.id,
        cwd: args.tab.cwd,
        cols: args.cols,
        rows: args.rows,
        deliveryMode: args.deliveryMode,
      };

      return createSession(request);
    },
    [activeWorkspaceId, tasks, workspacePath],
  );

  const tabManager = useTerminalTabManager({
    tabs: terminalTabs,
    activeTabId: activeTerminalTabId,
    isVisible: terminalDocked,
    getTabKey,
  });

  const slotKeyForTab = useCallback(
    (tab: ReturnType<typeof useAppStore.getState>["terminalTabs"][number]) =>
      buildTerminalSessionSlotKey({
        surface: "terminal",
        workspaceId: activeWorkspaceId,
        tabId: tab.id,
      }),
    [activeWorkspaceId],
  );

  const {
    activeSessionId,
    activeWriteErrorCount,
    bridgeError,
    clearActiveTranscript,
    getSessionIdForTabKey,
    handleTerminalInput,
    handleTerminalResize,
    restartActiveTerminalRenderer,
    sessionExited,
    terminalReady,
  } = useTerminalSessionManager({
    activeTab,
    activeTabId: activeTerminalTabId,
    tabs: terminalTabs,
    workspaceId: activeWorkspaceId,
    transcriptStorageKey: TERMINAL_TRANSCRIPT_STORAGE_KEY,
    isVisible: terminalDocked,
    getTabKey,
    createSession,
    slotKeyForTab,
    tabManager,
  });

  useEffect(() => {
    const wasTerminalDocked = wasTerminalDockedRef.current;
    wasTerminalDockedRef.current = terminalDocked;

    if (
      !shouldAutoCreateDockTerminalTab({
        isTerminalDocked: terminalDocked,
        wasTerminalDocked,
        terminalTabCount: terminalTabs.length,
        workspacePath,
      })
    ) {
      return;
    }

    createTerminalTab({ cwd: workspacePath });
  }, [createTerminalTab, terminalDocked, terminalTabs.length, workspacePath]);

  useEffect(() => {
    if (!terminalToRename) {
      return;
    }
    setTerminalRenameValue(terminalToRename.title);
    const timer = window.setTimeout(() => {
      terminalRenameInputRef.current?.focus();
      terminalRenameInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [terminalToRename]);

  function handleTerminalRenameConfirm() {
    if (!terminalToRename) {
      return;
    }
    const nextTitle = terminalRenameValue.trim();
    if (!nextTitle || nextTitle === terminalToRename.title) {
      setTerminalToRename(null);
      return;
    }
    renameTerminalTab({ tabId: terminalToRename.id, title: nextTitle });
    setTerminalToRename(null);
  }

  function handleTerminalTabDrop(
    event: DragEvent<HTMLDivElement>,
    overTabId: string,
  ) {
    event.preventDefault();
    const draggedTabId =
      draggingTerminalTabId ?? event.dataTransfer.getData("text/plain");
    if (draggedTabId && draggedTabId !== overTabId) {
      reorderTerminalTabs({ fromTabId: draggedTabId, toTabId: overTabId });
    }
    setDropTargetTerminalTabId(null);
    setDraggingTerminalTabId(null);
  }

  return (
    <>
      <div
        data-testid="terminal-dock"
        className="transition-[height] duration-200"
        style={{ height: `${terminalDockHeight}px` }}
      >
        <div className="h-full min-h-0 overflow-hidden bg-card">
          <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex h-10 items-stretch border-b border-border/80 bg-muted/20">
              <div className="min-w-0 flex-1 overflow-x-auto">
                <div className="flex h-full min-w-max items-stretch">
                  {terminalTabs.map((tab) => (
                    <DockTerminalTab
                      key={tab.id}
                      tab={tab}
                      isActive={tab.id === activeTerminalTabId}
                      draggingTabId={draggingTerminalTabId}
                      dropTargetTabId={dropTargetTerminalTabId}
                      onSelectTab={(tabId) =>
                        setActiveTerminalTab({ tabId, openDock: true })
                      }
                      onRenameTab={setTerminalToRename}
                      onCloseTab={(tabId) => closeTerminalTab({ tabId })}
                      onDragStart={(event, tabId) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", tabId);
                        setDraggingTerminalTabId(tabId);
                      }}
                      onDragEnd={() => {
                        setDraggingTerminalTabId(null);
                        setDropTargetTerminalTabId(null);
                      }}
                      onDragOver={(event, tabId) => {
                        event.preventDefault();
                        if (
                          draggingTerminalTabId &&
                          draggingTerminalTabId !== tabId
                        ) {
                          setDropTargetTerminalTabId(tabId);
                        }
                      }}
                      onDrop={(event, tabId) =>
                        handleTerminalTabDrop(event, tabId)
                      }
                    />
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 px-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() =>
                          createTerminalTab({ cwd: workspacePath || undefined })
                        }
                        aria-label="new-terminal-tab"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      New Terminal Tab
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={clearActiveTranscript}
                        aria-label="clear-terminal"
                        disabled={!activeTab}
                      >
                        <Eraser className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Clear Terminal
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() =>
                          setLayout({ patch: { terminalDocked: false } })
                        }
                        aria-label="hide-terminal"
                      >
                        <SquareTerminal className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Hide Terminal</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-md p-0 text-muted-foreground"
                        onClick={() => {
                          if (activeTab) {
                            closeTerminalTab({ tabId: activeTab.id });
                          }
                        }}
                        aria-label="close-active-terminal-tab"
                        disabled={!activeTab}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Close Active Tab
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="flex h-8 items-center gap-2 border-b border-border/60 px-3 text-xs text-muted-foreground">
              <SquareTerminal className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {activeTab?.cwd ?? workspacePath ?? "Terminal"}
              </span>
              {sessionExited ? (
                <span
                  className={cn(
                    "truncate text-[11px] font-medium",
                    sessionExited.exitCode === 0
                      ? "text-muted-foreground/80"
                      : "text-destructive",
                  )}
                >
                  exited ({sessionExited.exitCode})
                </span>
              ) : activeSessionId ? (
                <span className="truncate text-[11px] text-emerald-600 dark:text-emerald-400">
                  live
                </span>
              ) : null}
            </div>
            <div className={TERMINAL_SURFACE_PANEL_CLASS_NAME}>
              <div className={TERMINAL_SURFACE_VIEWPORT_CLASS_NAME}>
                {bridgeError ? (
                  <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {bridgeError}
                  </div>
                ) : null}
                {activeWriteErrorCount > TERMINAL_WRITE_ERROR_THRESHOLD ? (
                  <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <span>Terminal rendering may be degraded.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                      onClick={restartActiveTerminalRenderer}
                      disabled={!activeTab}
                    >
                      Restart renderer
                    </Button>
                  </div>
                ) : null}
                {!terminalReady ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-terminal">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Initializing terminal…</span>
                    </div>
                  </div>
                ) : null}
                {terminalTabs.map((tab) => {
                  const tabKey = getTabKey(tab);
                  return (
                    <TerminalTabSurface
                      key={tabKey}
                      tabKey={tabKey}
                      sessionId={getSessionIdForTabKey(tabKey)}
                      surface="terminal-dock"
                      isActive={tab.id === activeTerminalTabId}
                      isVisible={terminalDocked}
                      fontFamily={terminalFontFamily}
                      fontSize={terminalFontSize || DEFAULT_TERMINAL_FONT_SIZE}
                      isDarkMode={isDarkMode}
                      dimmed={!activeTab}
                      tabManager={tabManager}
                      onData={handleTerminalInput}
                      onResize={handleTerminalResize}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
      {terminalToRename ? (
        <div
          className={cn(
            UI_LAYER_CLASS.dialog,
            "fixed inset-0 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]",
          )}
          onMouseDown={() => setTerminalToRename(null)}
        >
          <Card
            className="w-full max-w-md rounded-lg border-border/80 bg-card p-4 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-foreground">
              Rename Terminal Tab
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter a new name for this terminal tab.
            </p>
            <Input
              ref={terminalRenameInputRef}
              className="mt-3 h-10 rounded-sm border-border/80 bg-background"
              value={terminalRenameValue}
              onChange={(event) => setTerminalRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleTerminalRenameConfirm();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setTerminalToRename(null);
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setTerminalToRename(null)}
              >
                Cancel
              </Button>
              <Button onClick={handleTerminalRenameConfirm}>Rename</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
