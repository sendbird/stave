import { FolderOpen, Layers } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";
import { ChatInput } from "@/components/session/ChatInput";
import { ChatPanel } from "@/components/session/ChatPanel";
import { ColiseumArenaPanel } from "@/components/session/ColiseumArenaPanel";
import {
  resolveChatAreaViewMode,
  resolveHydratingProjectCopy,
} from "@/components/session/chat-area.utils";
import { EmptySplash } from "@/components/session/EmptySplash";
import { PlanViewer } from "@/components/session/PlanViewer";
import { TodoFloater } from "@/components/session/TodoFloater";
import { SessionLoadingState } from "@/components/session/SessionLoadingState";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { isTaskArchived, isTaskManaged } from "@/lib/tasks";
import { RenderProfiler } from "@/lib/render-profiler";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: readonly unknown[] = [];

export const ChatArea = memo(ChatAreaImpl);

function ChatAreaImpl() {
  const sessionAreaRef = useRef<HTMLDivElement>(null);
  const [
    projectPath,
    hasHydratedWorkspaces,
    hasAnyWorkspace,
    hasSelectedWorkspace,
    hasSelectedTask,
    activeTaskId,
    activeTaskMessageCount,
    activeTask,
    activeTurnId,
    activeColiseum,
    persistenceBootstrapPhase,
    persistenceBootstrapMessage,
    refreshActiveManagedTask,
    createProject,
    createTask,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.projectPath,
          state.hasHydratedWorkspaces,
          state.workspaces.length > 0,
          state.workspaces.some(
            (workspace) => workspace.id === state.activeWorkspaceId,
          ),
          state.tasks.some(
            (task) => task.id === state.activeTaskId && !isTaskArchived(task),
          ),
          state.activeTaskId,
          state.messageCountByTask[state.activeTaskId] ??
            (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).length,
          state.tasks.find(
            (task) => task.id === state.activeTaskId && !isTaskArchived(task),
          ) ?? null,
          state.activeTurnIdsByTask[state.activeTaskId],
          state.activeColiseumsByTask[state.activeTaskId] ?? null,
          state.persistenceBootstrapPhase,
          state.persistenceBootstrapMessage,
          state.refreshActiveManagedTask,
          state.createProject,
          state.createTask,
        ] as const,
    ),
  );
  const viewMode = resolveChatAreaViewMode({
    projectPath,
    hasHydratedWorkspaces,
    hasAnyWorkspace,
    hasSelectedWorkspace,
    hasSelectedTask,
    activeTaskMessageCount,
  });
  const hydratingProjectCopy = resolveHydratingProjectCopy({
    persistenceBootstrapPhase,
    persistenceBootstrapMessage,
  });
  const shouldPollManagedTask =
    isTaskManaged(activeTask) && Boolean(activeTurnId);

  useEffect(() => {
    if (!shouldPollManagedTask) {
      return;
    }
    void refreshActiveManagedTask();
    const handle = window.setInterval(() => {
      void refreshActiveManagedTask();
    }, 3000);
    return () => window.clearInterval(handle);
  }, [refreshActiveManagedTask, shouldPollManagedTask]);

  const handleSessionAreaMouseDownCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [role='link'], [role='textbox'], [contenteditable='true']",
        )
      ) {
        return;
      }

      sessionAreaRef.current?.focus({ preventScroll: true });
    },
    [],
  );

  const sessionAreaProps = {
    ref: sessionAreaRef,
    tabIndex: -1,
    "data-testid": "session-area",
    "data-task-abort-scope": "",
    onMouseDownCapture: handleSessionAreaMouseDownCapture,
    className:
      "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background outline-none",
  } as const;

  if (viewMode === "no_project") {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-project">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Open a Project</EmptyTitle>
            <EmptyDescription>
              Select a local repository folder to get started.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void createProject({})}>
              <FolderOpen className="size-4" />
              Select Folder
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (viewMode === "hydrating_project") {
    return (
      <div {...sessionAreaProps}>
        <SessionLoadingState
          testId="session-loading-state"
          title={hydratingProjectCopy.title}
          description={hydratingProjectCopy.description}
        />
      </div>
    );
  }

  if (viewMode === "no_workspace") {
    return (
      <div {...sessionAreaProps}>
        <Empty data-testid="splash-no-workspace">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Pick a Workspace</EmptyTitle>
            <EmptyDescription>
              Select a workspace from the left sidebar to continue.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (viewMode === "no_task") {
    return (
      <div {...sessionAreaProps}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
            <EmptySplash
              layout="top-card"
              onCreateTask={() => createTask({ title: "" })}
              showCreateTaskAction
              showCreateCliSessionAction
            />
          </div>
        </div>
      </div>
    );
  }

  // Coliseum should take over the session surface even when the parent task
  // has no direct messages yet; brand-new tasks can launch a Coliseum as
  // their first action.
  if (activeColiseum && !activeColiseum.minimized) {
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <RenderProfiler id="ColiseumArenaPanel" thresholdMs={8}>
            <ColiseumArenaPanel parentTaskId={activeTaskId} />
          </RenderProfiler>
        </div>
      </div>
    );
  }

  if (viewMode === "empty_task") {
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-6xl flex-col">
              <EmptySplash
                layout="top-card"
                title="Start this task"
                description="Send the first prompt to begin work in this workspace — or use Coliseum from the composer controls to compare answers from multiple models in parallel."
              />
            </div>
          </div>
          <div className="relative z-30 shrink-0">
            <RenderProfiler id="ChatInput" thresholdMs={8}>
              <ChatInput />
            </RenderProfiler>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...sessionAreaProps}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* The message pane must be a flex column so `ChatPanel`'s
              `Conversation` root (`flex min-h-0 flex-1`) can claim the
              remaining height and keep its internal list scrollable. */}
          <RenderProfiler id="ChatPanel" thresholdMs={8}>
            <ChatPanel />
          </RenderProfiler>
          <div className="pointer-events-none absolute inset-0">
            {/* Keep floating plan/todo cards inside the message pane so they are
                structurally separated from the input dock without measuring
                dock height changes frame-by-frame. */}
            <RenderProfiler id="PlanViewer">
              <PlanViewer />
            </RenderProfiler>
            <TodoFloater />
          </div>
        </div>
        <div className="relative z-30 shrink-0">
          <RenderProfiler id="ChatInput" thresholdMs={8}>
            <ChatInput />
          </RenderProfiler>
        </div>
      </div>
    </div>
  );
}
