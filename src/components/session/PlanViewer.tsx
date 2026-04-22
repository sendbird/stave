import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowRightCircle, ClipboardCheck, Copy, Minus, Maximize2 } from "lucide-react";
import { Button, Textarea, WaveIndicator } from "@/components/ui";
import { MessageResponse } from "@/components/ai-elements";
import { getTaskControlOwner, isTaskArchived, isTaskManaged } from "@/lib/tasks";
import { APPROVE_PLAN_MESSAGE } from "@/lib/providers/plan-response";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useAppStore } from "@/store/app.store";
import {
  resolvePromptDraftPlanModeChange,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import {
  buildPlanViewerContextKey,
  resolvePlanViewerAutoViewState,
  resolvePlanViewerLayout,
  resolvePlanViewerState,
  type PlanViewerViewState,
} from "@/components/session/plan-viewer.utils";
import type { ChatMessage, PromptDraft } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";

const EMPTY_PROMPT_DRAFT: PromptDraft = { text: "", attachedFilePaths: [], attachments: [] };
const EMPTY_MESSAGES: ChatMessage[] = [];

interface DragState {
  pointerId: number;
  startMouseX: number;
  startMouseY: number;
  startPosX: number;
  startPosY: number;
  containerWidth: number;
  containerHeight: number;
  cardWidth: number;
  cardHeight: number;
  /** True once movement exceeds the activation threshold. */
  active: boolean;
}

export function PlanViewer() {
  const [revising, setRevising] = useState(false);
  const [revisionText, setRevisionText] = useState("");
  const [viewState, setViewState] = useState<PlanViewerViewState>("normal");
  const [copied, setCopied] = useState(false);
  /** Absolute pixel position of the minimised pill within the chat content div. */
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  const outerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [activeWorkspaceId, activeTaskId, activeTask, draftProvider, promptDraft, claudePermissionMode, claudePermissionModeBeforePlan, codexPlanMode, sendUserMessage, createTask, updatePromptDraft, clearTaskProviderSession] = useAppStore(
    useShallow((state) => [
      state.activeWorkspaceId,
      state.activeTaskId,
      state.tasks.find((task) => task.id === state.activeTaskId && !isTaskArchived(task)) ?? null,
      state.draftProvider,
      state.promptDraftByTask[state.activeTaskId] ?? EMPTY_PROMPT_DRAFT,
      state.settings.claudePermissionMode,
      state.settings.claudePermissionModeBeforePlan,
      state.settings.codexPlanMode,
      state.sendUserMessage,
      state.createTask,
      state.updatePromptDraft,
      state.clearTaskProviderSession,
    ] as const),
  );
  const activeProvider = activeTask?.provider ?? draftProvider;
  const taskRuntimeState = resolvePromptDraftRuntimeState({
    promptDraft,
    fallback: {
      claudePermissionMode,
      claudePermissionModeBeforePlan,
      codexPlanMode,
    },
  });
  const effectiveClaudePermissionMode = taskRuntimeState.claudePermissionMode;
  const effectiveClaudePermissionModeBeforePlan = taskRuntimeState.claudePermissionModeBeforePlan;
  const effectiveCodexPlanMode = taskRuntimeState.codexPlanMode;
  const providerLabel = activeProvider === "codex" ? "Codex" : "Claude";
  const isManagedTask = isTaskManaged(activeTask);
  const managedNotice = isManagedTask
    ? `Plan responses are managed by ${getTaskControlOwner(activeTask) === "external" ? "an external controller" : "Stave"}. Take over to reply here.`
    : null;

  const [latestPlanMessage, lastMessage, isTurnActive] = useAppStore(useShallow((state) => {
    const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
    const lastMessage = messages.at(-1) ?? null;
    let latestPlanMessage: (typeof lastMessage) | null = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message && message.role === "assistant" && message.isPlanResponse && message.planText?.trim()) {
        latestPlanMessage = message;
        break;
      }
    }
    return [
      latestPlanMessage,
      lastMessage,
      Boolean(state.activeTurnIdsByTask[state.activeTaskId]),
    ] as const;
  }));

  // Use the latest plan message for the plan text and pending state
  const { planText, isPlanPreparing, isPlanPending, canReplyToPlan } = resolvePlanViewerState({
    activeProvider,
    claudePermissionMode: effectiveClaudePermissionMode,
    codexPlanMode: effectiveCodexPlanMode,
    latestPlanMessage,
    lastMessage,
    isTurnActive,
  });
  const planReplyNotice = !isManagedTask && isPlanPending && !canReplyToPlan
    ? `Wait for ${providerLabel} to finish the current turn before replying to the plan.`
    : null;
  const replyNotice = managedNotice ?? planReplyNotice;
  const planViewerContextKey = buildPlanViewerContextKey({
    activeWorkspaceId,
    activeTaskId,
    latestPlanMessageId: latestPlanMessage?.id ?? null,
  });

  // Workspace and task switches keep this component mounted, so local floating
  // state must reset off the visible plan context instead of the pending
  // boolean alone.
  useEffect(() => {
    dragRef.current = null;
    setViewState("normal");
    setRevising(false);
    setRevisionText("");
    setCopied(false);
    setDragPos(null);
  }, [planViewerContextKey]);

  // Reset view state when a new plan arrives so it opens fully.
  useEffect(() => {
    if (isPlanPending) {
      dragRef.current = null;
      setViewState("normal");
      setRevising(false);
      setRevisionText("");
      setCopied(false);
      setDragPos(null);
    }
  }, [isPlanPending]);

  useEffect(() => {
    const nextViewState = resolvePlanViewerAutoViewState({
      viewState,
      isPlanPreparing,
      planText,
    });
    if (nextViewState !== viewState) {
      setViewState(nextViewState);
    }
  }, [isPlanPreparing, planText, viewState]);

  // Clear drag position whenever the viewer is not minimised.
  useEffect(() => {
    if (viewState !== "minimized") {
      setDragPos(null);
    }
  }, [viewState]);

  const handleApprove = useCallback(() => {
    if (isManagedTask || !canReplyToPlan) {
      return;
    }
    const nextPlanModeState = resolvePromptDraftPlanModeChange({
      providerId: activeProvider,
      enabled: false,
      runtimeOverrides: promptDraft.runtimeOverrides,
      claudePermissionMode: effectiveClaudePermissionMode,
      claudePermissionModeBeforePlan: effectiveClaudePermissionModeBeforePlan,
      codexPlanMode: effectiveCodexPlanMode,
    });
    if (nextPlanModeState.runtimeOverrides !== promptDraft.runtimeOverrides) {
      updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          runtimeOverrides: nextPlanModeState.runtimeOverrides,
        },
      });
    }
    if (nextPlanModeState.shouldClearCodexSession) {
      clearTaskProviderSession({ taskId: activeTaskId, providerId: "codex" });
    }
    void sendUserMessage({ taskId: activeTaskId, content: APPROVE_PLAN_MESSAGE });
    setRevising(false);
    setRevisionText("");
  }, [
    activeProvider,
    activeTaskId,
    canReplyToPlan,
    clearTaskProviderSession,
    effectiveClaudePermissionMode,
    effectiveClaudePermissionModeBeforePlan,
    effectiveCodexPlanMode,
    isManagedTask,
    promptDraft.runtimeOverrides,
    sendUserMessage,
    updatePromptDraft,
  ]);

  function handleCopy() {
    if (planText) {
      void copyTextToClipboard(planText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleHandoff() {
    if (isManagedTask) {
      return;
    }
    createTask({ title: "Plan handoff" });
    // createTask synchronously sets activeTaskId to the new task.
    const newTaskId = useAppStore.getState().activeTaskId;
    if (newTaskId && newTaskId !== activeTaskId) {
      updatePromptDraft({ taskId: newTaskId, patch: { text: planText } });
    }
  }

  function handleRevise() {
    if (isManagedTask || !canReplyToPlan || !revisionText.trim()) return;
    void sendUserMessage({ taskId: activeTaskId, content: revisionText.trim() });
    setRevising(false);
    setRevisionText("");
  }

  // ---------------------------------------------------------------------------
  // Drag logic for the minimised pill
  // ---------------------------------------------------------------------------

  const onHeaderPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (dragRef.current !== null) return; // already dragging
    const outer = outerRef.current;
    if (!outer) return;
    const containerRect = outer.parentElement?.getBoundingClientRect();
    if (!containerRect) return;
    const outerRect = outer.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      // Use stored position if we have it, otherwise derive from current render.
      startPosX: dragPos?.x ?? (outerRect.left - containerRect.left),
      startPosY: dragPos?.y ?? (outerRect.top - containerRect.top),
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      cardWidth: outer.offsetWidth,
      cardHeight: outer.offsetHeight,
      active: false,
    };
  }, [dragPos]);

  const onHeaderPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const dx = e.clientX - state.startMouseX;
    const dy = e.clientY - state.startMouseY;
    // Activate drag only after a small movement threshold to preserve button clicks.
    if (!state.active) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      state.active = true;
      e.currentTarget.setPointerCapture(state.pointerId);
    }
    const newX = Math.max(0, Math.min(state.containerWidth - state.cardWidth, state.startPosX + dx));
    const newY = Math.max(0, Math.min(state.containerHeight - state.cardHeight, state.startPosY + dy));
    setDragPos({ x: newX, y: newY });
  }, []);

  const onHeaderPointerUp = useCallback((_e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // Layout computation
  // ---------------------------------------------------------------------------

  const isMinimized = viewState === "minimized";
  const isExpanded = viewState === "expanded";
  const { wrapperClassName, wrapperStyle, cardClassName } = resolvePlanViewerLayout({
    viewState,
    dragPos,
  });

  if (!isPlanPreparing && !isPlanPending) {
    return null;
  }

  return (
    <div ref={outerRef} className={wrapperClassName} style={wrapperStyle}>
      <div className={cardClassName}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/80 px-4 py-2.5">
          {/* Drag handle: title area only — buttons remain independently clickable */}
          <div
            className={[
              "flex min-w-0 flex-1 select-none items-center gap-2 overflow-hidden",
              isMinimized ? "cursor-grab" : "",
            ].join(" ")}
            onPointerDown={isMinimized ? onHeaderPointerDown : undefined}
            onPointerMove={isMinimized ? onHeaderPointerMove : undefined}
            onPointerUp={isMinimized ? onHeaderPointerUp : undefined}
            onPointerCancel={isMinimized ? onHeaderPointerUp : undefined}
          >
            <ClipboardCheck className="size-4 shrink-0 text-primary" />
            <p className="flex-1 truncate text-sm font-medium">
              {isPlanPreparing ? "Preparing plan\u2026" : `Review ${providerLabel}'s Plan`}
            </p>
          </div>
          {isPlanPreparing ? (
            <WaveIndicator className="text-primary" />
          ) : (
            <>
              <button
                onClick={() => setViewState(isMinimized ? "normal" : "minimized")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isMinimized ? "Restore" : "Minimize"}
              >
                <Minus className="size-4" />
              </button>
              <button
                onClick={() => setViewState(isExpanded ? "normal" : "expanded")}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title={isExpanded ? "Restore" : "Expand"}
              >
                <Maximize2 className="size-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Body — hidden when preparing or minimized */}
        {!isPlanPreparing && !isMinimized && (
          <>
            <div className={["min-h-0 overflow-y-auto px-4 py-3", isExpanded ? "flex-1" : "max-h-72"].join(" ")}>
              <MessageResponse>{planText || "Plan ready."}</MessageResponse>
            </div>
            {revising ? (
              <div className="shrink-0 p-3">
                <Textarea
                  autoFocus
                  value={revisionText}
                  disabled={!canReplyToPlan}
                  onChange={(e) => setRevisionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleRevise();
                    }
                    if (e.key === "Escape") {
                      setRevising(false);
                      setRevisionText("");
                    }
                  }}
                  placeholder={`Tell ${providerLabel} what to change\u2026`}
                  className="min-h-[72px] rounded-lg border-border/70 bg-background text-base leading-7"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={handleRevise} disabled={!canReplyToPlan || !revisionText.trim()}>
                    Send
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setRevising(false); setRevisionText(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
                <Button size="sm" variant="outline" onClick={handleCopy} disabled={!planText}>
                  <Copy className="size-3.5" />
                  {copied ? "Copied!" : "Copy"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleHandoff} disabled={isManagedTask || !planText}>
                  <ArrowRightCircle className="size-3.5" />
                  Handoff
                </Button>
                <Button size="sm" disabled={isManagedTask || !canReplyToPlan} onClick={handleApprove}>
                  <ClipboardCheck className="size-3.5" />
                  Approve
                </Button>
                <Button size="sm" variant="outline" disabled={isManagedTask || !canReplyToPlan} onClick={() => setRevising(true)}>
                  Revise
                </Button>
                {replyNotice ? (
                  <p className="text-xs text-muted-foreground">{replyNotice}</p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
