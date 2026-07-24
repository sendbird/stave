import {
  Bug,
  FolderOpen,
  Layers,
  ListChecks,
  SearchCode,
  type LucideIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";
import { ChatInput } from "@/components/session/ChatInput";
import { ChatPanel } from "@/components/session/ChatPanel";
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
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";

const EMPTY_MESSAGES: readonly unknown[] = [];

const TASK_START_OPTIONS = [
  {
    label: "Plan a feature",
    prompt: "Help me plan and implement a new feature in this workspace.",
    icon: ListChecks,
  },
  {
    label: "Fix an issue",
    prompt: "Investigate and fix an issue in this workspace.",
    icon: Bug,
  },
  {
    label: "Review the code",
    prompt: "Review the current code and suggest the most valuable improvements.",
    icon: SearchCode,
  },
] as const satisfies readonly {
  label: string;
  prompt: string;
  icon: LucideIcon;
}[];

function TaskStartPanel(props: { onSelect: (prompt: string) => void }) {
  return (
    <section
      data-testid="empty-splash"
      className="mx-auto w-full max-w-6xl px-3 pb-2 pt-10 sm:px-4"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h1 className="font-heading text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
            What would you like to work on?
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Describe the outcome you want, or choose a starting point.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Task starting points">
          {TASK_START_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.label}
                type="button"
                variant="secondary"
                className="h-11 rounded-full bg-muted/70 px-4 font-normal text-foreground shadow-none hover:bg-muted"
                onClick={() => props.onSelect(option.prompt)}
              >
                <Icon className="size-4 text-muted-foreground" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export interface ChatAreaProps {
  /**
   * Explicit task to render. Defaults to the store's active task id; the
   * pane host passes the panel's own task id so split panels stay scoped.
   */
  taskId?: string;
  /** Changes whenever a hidden pane is attached again. */
  scrollActivationKey?: string | number;
}

export const ChatArea = memo(function ChatArea(props: ChatAreaProps) {
  return (
    // Scope every session descendant (message list, prompt input, plan
    // viewer, ...) to this panel's task so unfocused split panels never
    // render or mutate the globally active task's state.
    <TaskScopeProvider taskId={props.taskId ?? null}>
      <ChatAreaImpl {...props} />
    </TaskScopeProvider>
  );
});

function ChatAreaImpl(props: ChatAreaProps) {
  const explicitTaskId = props.taskId;
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
    isScopedTaskGloballyActive,
    persistenceBootstrapPhase,
    persistenceBootstrapMessage,
    refreshActiveManagedTask,
    createProject,
    createTask,
    updatePromptDraft,
  ] = useAppStore(
    useShallow(
      (state) => {
        const scopedTaskId = explicitTaskId ?? state.activeTaskId;
        return [
          state.projectPath,
          state.hasHydratedWorkspaces,
          state.workspaces.length > 0,
          state.workspaces.some(
            (workspace) => workspace.id === state.activeWorkspaceId,
          ),
          state.tasks.some(
            (task) => task.id === scopedTaskId && !isTaskArchived(task),
          ),
          scopedTaskId,
          state.messageCountByTask[scopedTaskId] ??
            (state.messagesByTask[scopedTaskId] ?? EMPTY_MESSAGES).length,
          state.tasks.find(
            (task) => task.id === scopedTaskId && !isTaskArchived(task),
          ) ?? null,
          state.activeTurnIdsByTask[scopedTaskId],
          state.activeTaskId === scopedTaskId,
          state.persistenceBootstrapPhase,
          state.persistenceBootstrapMessage,
          state.refreshActiveManagedTask,
          state.createProject,
          state.createTask,
          state.updatePromptDraft,
        ] as const;
      },
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
  // refreshActiveManagedTask always refreshes the store's GLOBAL active
  // task (it takes no task id), so only the panel whose task is globally
  // active may poll — unfocused split panels would otherwise trigger
  // redundant refreshes of a different task every 3s.
  const shouldPollManagedTask =
    isScopedTaskGloballyActive &&
    isTaskManaged(activeTask) &&
    Boolean(activeTurnId);

  const handleTaskStartOption = useCallback(
    (prompt: string) => {
      updatePromptDraft({
        taskId: activeTaskId,
        patch: { text: prompt },
      });
      window.requestAnimationFrame(() => {
        sessionAreaRef.current
          ?.querySelector<HTMLElement>('[data-prompt-lexical-editor="true"]')
          ?.focus();
      });
    },
    [activeTaskId, updatePromptDraft],
  );

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

      // Popover/palette content is portaled but still bubbles through this
      // React tree; stealing focus mid-click dismisses the popover before the
      // click lands (Radix treats the focus shift as an outside interaction).
      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], [role='link'], [role='textbox'], [role='option'], [contenteditable='true'], [data-radix-popper-content-wrapper]",
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

  if (viewMode === "empty_task") {
    return (
      <div {...sessionAreaProps}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto">
            <TaskStartPanel onSelect={handleTaskStartOption} />
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
            <ChatPanel scrollActivationKey={props.scrollActivationKey} />
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
