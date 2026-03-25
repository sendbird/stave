import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { TopBar } from "@/components/layout/TopBar";
import { ProjectWorkspaceSidebar } from "@/components/layout/ProjectWorkspaceSidebar";
import { WorkspaceTaskTabs } from "@/components/layout/WorkspaceTaskTabs";
import { ChatArea } from "@/components/session/ChatArea";
import { TerminalDock } from "@/components/layout/TerminalDock";
import { Toaster } from "@/components/ui";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { getNextProviderId } from "@/lib/providers/model-catalog";
import { RenderProfiler } from "@/lib/render-profiler";
import { MIN_EDITOR_PANEL_WIDTH, TASK_LIST_MIN_WIDTH, useAppStore } from "@/store/app.store";
import { EditorMainPanel } from "@/components/layout/EditorMainPanel";
import { RightRail } from "@/components/layout/RightRail";

const EditorPanel = lazy(() =>
  import("@/components/layout/EditorPanel").then((module) => ({
    default: module.EditorPanel,
  }))
);

type ResizableLayoutKey =
  | "taskListWidth"
  | "editorPanelWidth"
  | "explorerPanelWidth"
  | "terminalDockHeight";

const TASK_LIST_MAX_WIDTH = 340;

function isEditableShortcutTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (
      target.isContentEditable
      || (
        Boolean(target.closest("input, textarea, select, [role='textbox'], [contenteditable='true']"))
        && !target.closest("[data-prompt-input-root]")
      )
    );
}

export function AppShell() {
  const [
    projectPath,
    taskListWidth,
    taskListCollapsed,
    editorVisible,
    editorPanelWidth,
    sidebarOverlayVisible,
    explorerPanelWidth,
    terminalDocked,
    terminalDockHeight,
    setLayout,
  ] = useAppStore(useShallow((state) => [
    state.projectPath,
    state.layout.taskListWidth,
    state.layout.taskListCollapsed,
    state.layout.editorVisible,
    state.layout.editorPanelWidth,
    state.layout.sidebarOverlayVisible,
    state.layout.explorerPanelWidth,
    state.layout.terminalDocked,
    state.layout.terminalDockHeight ?? 210,
    state.setLayout,
  ] as const));
  const hasProject = Boolean(projectPath);
  const panelRowRef = useRef<HTMLDivElement>(null);
  const pendingLayoutPatchRef = useRef<Partial<Record<ResizableLayoutKey, number>> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const [zoomHudPercent, setZoomHudPercent] = useState<number | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const zoomHudTimerRef = useRef<number | null>(null);

  function flushPendingLayoutPatch() {
    if (!pendingLayoutPatchRef.current) {
      return;
    }
    setLayout({ patch: pendingLayoutPatchRef.current });
    pendingLayoutPatchRef.current = null;
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    }
  }

  function scheduleLayoutResizePatch(key: ResizableLayoutKey, value: number) {
    pendingLayoutPatchRef.current = {
      ...(pendingLayoutPatchRef.current ?? {}),
      [key]: value,
    };
    if (resizeFrameRef.current !== null) {
      return;
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      if (!pendingLayoutPatchRef.current) {
        return;
      }
      const patch = pendingLayoutPatchRef.current;
      pendingLayoutPatchRef.current = null;
      setLayout({ patch });
    });
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void useAppStore.getState().checkOpenTabConflicts();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeZoomChanges?.(({ percent }) => {
      setZoomHudPercent(percent);
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
      zoomHudTimerRef.current = window.setTimeout(() => {
        setZoomHudPercent(null);
        zoomHudTimerRef.current = null;
      }, 1200);
    });
    return () => {
      if (zoomHudTimerRef.current !== null) {
        window.clearTimeout(zoomHudTimerRef.current);
      }
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = window.api?.window?.subscribeCloseShortcut?.(() => {
      const store = useAppStore.getState();
      const { editorTabs, activeEditorTabId, activeTaskId, settings } = store;

      if (activeEditorTabId && editorTabs.length > 0) {
        store.requestCloseActiveEditorTab();
        return;
      }

      if (activeTaskId) {
        store.archiveTask({ taskId: activeTaskId });
        return;
      }

      if (settings.confirmBeforeClose) {
        setShowCloseConfirm(true);
      } else {
        void window.api?.window?.close?.();
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const store = useAppStore.getState();
      const hasMod = event.ctrlKey || event.metaKey;
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      if (!hasMod) {
        if (event.key === "Escape") {
          store.abortTaskTurn({ taskId: store.activeTaskId });
        }
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        store.createTask({ title: "" });
        return;
      }

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        const nextVisible = !(store.layout.sidebarOverlayVisible && store.layout.sidebarOverlayTab === "changes");
        store.setLayout({ patch: { sidebarOverlayVisible: nextVisible, sidebarOverlayTab: "changes" } });
        return;
      }

      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        store.setLayout({ patch: { editorVisible: !store.layout.editorVisible } });
        return;
      }

      if (event.key === "`") {
        event.preventDefault();
        store.setLayout({ patch: { terminalDocked: !store.layout.terminalDocked } });
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void store.saveActiveEditorTab();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        const activeTask = store.tasks.find((task) => task.id === store.activeTaskId);
        if (!activeTask) {
          return;
        }
        const nextProvider = getNextProviderId({ providerId: activeTask.provider });
        store.setTaskProvider({ taskId: activeTask.id, provider: nextProvider });
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "j" || event.key === "ArrowDown")) {
        event.preventDefault();
        const currentIndex = store.tasks.findIndex((task) => task.id === store.activeTaskId);
        const nextIndex = currentIndex >= 0 ? Math.min(store.tasks.length - 1, currentIndex + 1) : 0;
        const nextTaskId = store.tasks[nextIndex]?.id;
        if (nextTaskId) {
          store.selectTask({ taskId: nextTaskId });
        }
        return;
      }

      if (event.shiftKey && (event.key.toLowerCase() === "k" || event.key === "ArrowUp")) {
        event.preventDefault();
        const currentIndex = store.tasks.findIndex((task) => task.id === store.activeTaskId);
        const prevIndex = currentIndex >= 0 ? Math.max(0, currentIndex - 1) : 0;
        const prevTaskId = store.tasks[prevIndex]?.id;
        if (prevTaskId) {
          store.selectTask({ taskId: prevTaskId });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
  }, []);

  return (
    <div className="relative flex h-full w-full bg-background text-foreground">
      {zoomHudPercent !== null ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-50 -translate-x-1/2">
          <div className="rounded-full border border-border/80 bg-card/95 px-3 py-1 text-sm font-medium text-foreground shadow-lg backdrop-blur-sm">
            Zoom {zoomHudPercent}%
          </div>
        </div>
      ) : null}
      <Toaster />
      <ConfirmDialog
        open={showCloseConfirm}
        title="Close Stave?"
        description="Are you sure you want to close the application window?"
        confirmLabel="Close"
        cancelLabel="Cancel"
        onCancel={() => setShowCloseConfirm(false)}
        onConfirm={() => {
          setShowCloseConfirm(false);
          void window.api?.window?.close?.();
        }}
      />
      <RenderProfiler id="ProjectWorkspaceSidebar">
        <ProjectWorkspaceSidebar width={Math.max(taskListWidth, TASK_LIST_MIN_WIDTH)} collapsed={taskListCollapsed} />
      </RenderProfiler>
      {!taskListCollapsed ? (
        <div
          className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
          onMouseDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = Math.max(taskListWidth, TASK_LIST_MIN_WIDTH);
            const onMove = (moveEvent: MouseEvent) => {
              const next = Math.max(
                TASK_LIST_MIN_WIDTH,
                Math.min(TASK_LIST_MAX_WIDTH, startWidth + (moveEvent.clientX - startX)),
              );
              scheduleLayoutResizePatch("taskListWidth", next);
            };
            const onUp = () => {
              flushPendingLayoutPatch();
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/50">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {hasProject ? <WorkspaceTaskTabs /> : null}
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-2">
                <div ref={panelRowRef} className="flex min-h-0 flex-1 overflow-hidden px-2 pt-2">
                  <div className="min-h-0 min-w-[420px] flex-1">
                    <ChatArea />
                  </div>
                  {editorVisible ? (
                    <>
                      <div
                        className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const startX = event.clientX;
                          const startWidth = editorPanelWidth;
                          const onMove = (moveEvent: MouseEvent) => {
                            const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                            const explorerWidth = sidebarOverlayVisible ? explorerPanelWidth : 0;
                            const separators = sidebarOverlayVisible ? 10 : 5;
                            const chatMinWidth = 420;
                            const maxEditor = Math.max(0, containerWidth - chatMinWidth - explorerWidth - separators);
                            const minEditor = Math.min(MIN_EDITOR_PANEL_WIDTH, maxEditor);
                            const delta = startX - moveEvent.clientX;
                            const next = Math.max(minEditor, Math.min(maxEditor, startWidth + delta));
                            scheduleLayoutResizePatch("editorPanelWidth", next);
                          };
                          const onUp = () => {
                            flushPendingLayoutPatch();
                            window.removeEventListener("mousemove", onMove);
                            window.removeEventListener("mouseup", onUp);
                          };
                          window.addEventListener("mousemove", onMove);
                          window.addEventListener("mouseup", onUp);
                        }}
                      />
                      <div className="hidden h-full min-w-0 lg:block" style={{ width: `${editorPanelWidth}px` }}>
                        <RenderProfiler id="EditorMainPanel" thresholdMs={10}>
                          <EditorMainPanel />
                        </RenderProfiler>
                      </div>
                    </>
                  ) : null}
                  {sidebarOverlayVisible ? (
                    <>
                      <div
                        className="hidden w-[5px] shrink-0 cursor-col-resize transition-colors hover:bg-border/50 lg:block"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          const startX = event.clientX;
                          const startWidth = explorerPanelWidth;
                          const onMove = (moveEvent: MouseEvent) => {
                            const containerWidth = panelRowRef.current?.offsetWidth ?? 9999;
                            const editorWidth = editorVisible ? editorPanelWidth : 0;
                            const separators = editorVisible ? 10 : 5;
                            const chatMinWidth = 420;
                            const maxExplorer = Math.max(200, containerWidth - chatMinWidth - editorWidth - separators);
                            const delta = startX - moveEvent.clientX;
                            const next = Math.max(200, Math.min(maxExplorer, startWidth + delta));
                            scheduleLayoutResizePatch("explorerPanelWidth", next);
                          };
                          const onUp = () => {
                            flushPendingLayoutPatch();
                            window.removeEventListener("mousemove", onMove);
                            window.removeEventListener("mouseup", onUp);
                          };
                          window.addEventListener("mousemove", onMove);
                          window.addEventListener("mouseup", onUp);
                        }}
                      />
                      <Suspense fallback={<aside className="rounded-lg border border-border/80 bg-card p-3 text-sm text-muted-foreground shadow-sm" style={{ width: `${explorerPanelWidth}px` }}>Loading panel...</aside>}>
                        <div className="hidden h-full min-w-0 lg:block" style={{ width: `${explorerPanelWidth}px` }}>
                          <RenderProfiler id="EditorPanel" thresholdMs={8}>
                            <EditorPanel />
                          </RenderProfiler>
                        </div>
                      </Suspense>
                    </>
                  ) : null}
                </div>
                <div className={terminalDocked ? undefined : "hidden"}>
                    <div
                      className="h-[5px] shrink-0 cursor-row-resize transition-colors hover:bg-border/50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        const startY = event.clientY;
                        const startHeight = terminalDockHeight;
                        const onMove = (moveEvent: MouseEvent) => {
                          const delta = startY - moveEvent.clientY;
                          const next = Math.max(120, Math.min(420, startHeight + delta));
                          scheduleLayoutResizePatch("terminalDockHeight", next);
                        };
                        const onUp = () => {
                          flushPendingLayoutPatch();
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    />
                    <TerminalDock />
                </div>
              </div>
              <RightRail />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
