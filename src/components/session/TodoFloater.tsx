import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, ListTodo } from "lucide-react";
import { Loader } from "@/components/ui/loader";
import { getTodoProgress, type TodoItem } from "@/components/ai-elements/todo";
import { deriveTodoTraceItems } from "@/components/session/message/assistant-trace.utils";
import {
  resolvePlanViewerInsets,
  resolvePlanViewerState,
  SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
} from "@/components/session/plan-viewer.utils";
import {
  findLatestTodoPart,
  resolveTodoFloaterVisibility,
} from "@/components/session/todo-floater.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { cx, sx } from "@/components/ads/utils/stylex";
import { todoFloaterStyles as styles } from "@/components/session/todo-floater.styles";
import { useAppStore } from "@/store/app.store";
import { resolvePromptDraftRuntimeState } from "@/store/prompt-draft-runtime";
import { useShallow } from "zustand/react/shallow";
import type { ChatMessage, PromptDraft } from "@/types/chat";

/** Keep the floater visible briefly after all todos complete so the user sees the final state. */
const COMPLETION_LINGER_MS = 2000;

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};

export function TodoFloater() {
  const taskId = useScopedTaskId();
  const [
    activeTask,
    draftProvider,
    promptDraft,
    claudePermissionMode,
    claudePermissionModeBeforePlan,
    codexPlanMode,
    messages,
    activeTurnId,
  ] = useAppStore(
    useShallow((state) => {
      return [
        state.tasks.find((task) => task.id === taskId) ?? null,
        state.draftProvider,
        state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT,
        state.settings.claudePermissionMode,
        state.settings.claudePermissionModeBeforePlan,
        state.settings.codexPlanMode,
        state.messagesByTask[taskId] ?? EMPTY_MESSAGES,
        state.activeTurnIdsByTask[taskId] ?? null,
      ] as const;
    }),
  );
  const isTurnActive = Boolean(activeTurnId);
  const activeProvider = activeTask?.provider ?? draftProvider;
  const taskRuntimeState = resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
    },
  });

  const todoPart = useMemo(
    () => findLatestTodoPart(messages, activeTurnId),
    [activeTurnId, messages],
  );
  const lastMessage = messages.at(-1) ?? null;
  const latestPlanMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (
        message &&
        message.role === "assistant" &&
        message.isPlanResponse &&
        message.planText?.trim()
      ) {
        return message;
      }
    }
    return null;
  }, [messages]);
  const { isPlanPreparing, isPlanPending } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: taskRuntimeState.claudePermissionMode,
    codexPlanMode: taskRuntimeState.codexPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive,
  });
  const planViewerVisible = isPlanPreparing || isPlanPending;

  const progress = useMemo(() => {
    if (!todoPart) return null;
    return getTodoProgress({ input: todoPart.input });
  }, [todoPart]);

  const displayTodos = useMemo<TodoItem[]>(() => {
    if (!todoPart) return [];
    return deriveTodoTraceItems({
      input: todoPart.input,
      state: todoPart.state,
    });
  }, [todoPart]);

  // ── Visibility logic ──────────────────────────────────────────────
  // Show when: active turn + todos exist + at least one is not completed.
  // Linger briefly after all complete, then fade out.

  const allCompleted =
    progress !== null &&
    progress.totalCount > 0 &&
    progress.completedCount === progress.totalCount;

  // Linger after completion
  const [lingering, setLingering] = useState(false);
  const lingerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // When all todos just completed while we were showing the floater, start linger timer.
    if (allCompleted && isTurnActive && progress && progress.totalCount > 0) {
      setLingering(true);
      lingerTimer.current = setTimeout(() => {
        setLingering(false);
      }, COMPLETION_LINGER_MS);
      return () => {
        if (lingerTimer.current) {
          clearTimeout(lingerTimer.current);
        }
      };
    }
    setLingering(false);
    if (lingerTimer.current) {
      clearTimeout(lingerTimer.current);
      lingerTimer.current = null;
    }
  }, [allCompleted, isTurnActive, progress]);

  // Turn end → immediately clear linger.
  useEffect(() => {
    if (!isTurnActive) {
      setLingering(false);
      if (lingerTimer.current) {
        clearTimeout(lingerTimer.current);
        lingerTimer.current = null;
      }
    }
  }, [isTurnActive]);

  const shouldShow = resolveTodoFloaterVisibility({
    progress,
    todoState: todoPart?.state,
    isTurnActive,
    lingering,
    planViewerVisible,
  });

  if (!shouldShow || !progress) {
    return null;
  }

  const { rightOffset, bottomOffset } = resolvePlanViewerInsets({
    isExpanded: false,
  });
  const progressPercent =
    progress.totalCount > 0
      ? Math.round((progress.completedCount / progress.totalCount) * 100)
      : 0;

  return (
    <div
      className={cx(
        SESSION_INPUT_FLOATING_WRAPPER_CLASS_NAME,
        // Anchor todo progress in the same session-edge slot the plan viewer uses.
        sx(
          styles.wrapper,
          lingering ? styles.wrapperLingering : styles.wrapperVisible,
        ),
      )}
      style={{
        right: rightOffset,
        bottom: bottomOffset,
        width: `calc(100% - ${rightOffset * 2}px)`,
        maxWidth: 400,
      }}
    >
      <div className={sx(styles.card)}>
        {/* Header */}
        <div className={sx(styles.header)}>
          <ListTodo aria-hidden size={16} className={sx(styles.headerIcon)} />
          <span className={sx(styles.headerTitle)}>Todo</span>
          <span className={sx(styles.headerCount)}>
            {progress.completedCount}/{progress.totalCount}
          </span>
        </div>

        {/* Progress bar */}
        <div className={sx(styles.progressTrack)}>
          <div
            className={sx(
              styles.progressBar,
              allCompleted
                ? styles.progressBarComplete
                : styles.progressBarActive,
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Todo items */}
        <div className={sx(styles.items)}>
          <ol className={sx(styles.list)}>
            {displayTodos.map((todo, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: stable todo list ordering
                key={idx}
                className={sx(styles.item)}
              >
                <TodoFloaterItemIcon status={todo.status} />
                <span
                  className={sx(
                    styles.itemLabel,
                    todo.status === "completed" && styles.itemLabelCompleted,
                    todo.status === "in_progress" &&
                      styles.itemLabelInProgress,
                    todo.status === "pending" && styles.itemLabelPending,
                  )}
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function TodoFloaterItemIcon({ status }: { status: TodoItem["status"] }) {
  if (status === "completed") {
    return (
      <CheckCircle2
        aria-hidden
        size={16}
        className={sx(styles.statusIcon, styles.statusIconCompleted)}
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Loader
        aria-hidden
        className={sx(styles.statusLoader)}
        size="xs"
        variant="steps"
      />
    );
  }
  return (
    <Circle
      aria-hidden
      size={16}
      className={sx(styles.statusIcon, styles.statusIconPending)}
    />
  );
}
