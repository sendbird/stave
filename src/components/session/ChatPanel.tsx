import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageSquareIcon, Undo2 } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Loader,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationVirtualList,
  type ConversationManualScrollIntentHandle,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  TurnModelChip,
} from "@/components/ai-elements";
import {
  findMessageIndexByToolUseId,
  getReasoningTraceExpansionMode,
  getMessageScrollFingerprint,
  resolvePlanMessagePresentation,
  shouldShowConversationLoadingState,
} from "@/components/session/chat-panel.utils";
import { ConversationPlanCard } from "@/components/session/ConversationPlanCard";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import {
  getTurnModelInfoLabel,
  getTurnModelInfoParts,
} from "@/lib/providers/turn-model-info";
import { cn } from "@/lib/utils";
import { resolveUserMessageClipboardPlainText } from "@/lib/user-message-copy";
import { useAppStore } from "@/store/app.store";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import {
  retainTaskScrollToLatestNonce,
  taskScrollAnchorCache,
} from "@/store/task-scroll.utils";
import type { ChatMessage, MessagePart } from "@/types/chat";
import type { ClaudeFileRewindResponse } from "@/lib/providers/provider.types";
import { useShallow } from "zustand/react/shallow";
import {
  CopyButton,
  toProviderWaveToneClass,
} from "./chat-panel-message-parts";
import { ConversationTurnActions } from "./ConversationTurnActions";
import {
  MessageUsageSummary,
  providerMayOmitTurnUsage,
} from "./message-usage-summary";
import {
  ConversationTurnRail,
  type ConversationTurnRailHandle,
} from "./ConversationTurnRail";
import {
  buildConversationTurnRailItems,
  findActiveConversationTurnMessageId,
} from "./conversation-turn-rail.utils";
import { AssistantMessageBody } from "./message/assistant-trace";
import { SessionLoadingState } from "./SessionLoadingState";
import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  buildConversationTurnActionStateByMessageId,
  type ConversationTurnActionState,
} from "@/lib/providers/thread-actions";

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_PROVIDER_SESSION: TaskProviderSessionState = {};

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

const MemoizedAssistantMessageBody = memo(AssistantMessageBody);

function formatElapsedLabel(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getMessageElapsedLabel(args: {
  message: Pick<ChatMessage, "startedAt" | "completedAt">;
  nowMs?: number;
}) {
  const startedAt = args.message.startedAt
    ? Date.parse(args.message.startedAt)
    : Number.NaN;
  if (!Number.isFinite(startedAt)) {
    return null;
  }
  const endMs = args.message.completedAt
    ? Date.parse(args.message.completedAt)
    : args.nowMs;
  if (!Number.isFinite(endMs ?? Number.NaN)) {
    return null;
  }
  return formatElapsedLabel(Math.max(0, (endMs ?? startedAt) - startedAt));
}

interface MessageRowProps {
  taskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  elapsedAnchorMs?: number;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
  showInterimMessages: boolean;
  traceExpansionMode: "auto" | "manual";
  threadActionState?: ConversationTurnActionState;
  message: {
    id: string;
    role: "user" | "assistant";
    providerId: ChatMessage["providerId"];
    nativeProviderSessionId?: string;
    nativeProviderTurnId?: string;
    model: string;
    modelInfo?: ChatMessage["modelInfo"];
    content: string;
    displayContent?: string;
    startedAt?: string;
    completedAt?: string;
    parts: MessagePart[];
    displayParts?: MessagePart[];
    isPlanResponse?: boolean;
    planText?: string;
    isStreaming?: boolean;
    steerDeliveryState?: ChatMessage["steerDeliveryState"];
    dispatchedFromQueue?: ChatMessage["dispatchedFromQueue"];
    providerBoundary?: ChatMessage["providerBoundary"];
    usage?: ChatMessage["usage"];
    delegatedUsage?: ChatMessage["delegatedUsage"];
  };
}

const MessageRow = memo(function MessageRow(args: MessageRowProps) {
  const {
    taskId,
    activeTurnId,
    chatStreamingEnabled,
    elapsedAnchorMs,
    isFirst,
    liveStreamingMessageId,
    showInterimMessages,
    traceExpansionMode,
    threadActionState,
    message,
  } = args;
  const showRespondingWave =
    Boolean(activeTurnId) &&
    message.id === liveStreamingMessageId &&
    message.role === "assistant" &&
    message.isStreaming;
  const [historyAction, setHistoryAction] = useState<
    "preview" | "rewind" | null
  >(null);
  const [rewindDialogOpen, setRewindDialogOpen] = useState(false);
  const [rewindPreview, setRewindPreview] =
    useState<ClaudeFileRewindResponse | null>(null);
  const [rewindClaudeFilesFromMessage, capabilities] = useAppStore(
    useShallow((state) => [
      state.rewindClaudeFilesFromMessage,
      message.providerBoundary
        ? state.providerRuntimeCapabilities[message.providerBoundary.providerId]
        : null,
    ]),
  );
  const boundary = message.providerBoundary;
  const canRewindFiles = Boolean(
    !activeTurnId &&
    !message.isStreaming &&
    message.role === "user" &&
    boundary?.providerId === "claude-code" &&
    boundary.kind === "message" &&
    capabilities?.history.rewind.files,
  );
  const elapsedLabel = useMemo(
    () => getMessageElapsedLabel({ message, nowMs: elapsedAnchorMs }),
    [elapsedAnchorMs, message],
  );
  const planPresentation = useMemo(
    () => resolvePlanMessagePresentation(message),
    [message],
  );
  const userMessageSourceText = message.displayContent ?? message.content;
  const turnModelInfoLabel = getTurnModelInfoLabel(message);
  const turnModelInfoParts = getTurnModelInfoParts(message);
  const steerDeliveryLabel =
    message.steerDeliveryState === "accepted"
      ? "Steered into active turn"
      : message.steerDeliveryState === "pending"
        ? "Steer pending"
        : message.steerDeliveryState === "unknown"
          ? "Steer delivery unconfirmed"
          : message.steerDeliveryState === "rejected"
            ? "Steer rejected"
            : message.dispatchedFromQueue
              ? "Sent from queue"
              : null;

  function handleUserMessageCopy(event: ReactClipboardEvent<HTMLDivElement>) {
    if (message.role !== "user") {
      return;
    }
    const selectedText = window.getSelection()?.toString() ?? "";
    const clipboardText = resolveUserMessageClipboardPlainText({
      sourceMarkdown: userMessageSourceText,
      selectedText,
    });
    if (!clipboardText) {
      return;
    }
    event.clipboardData.setData("text/plain", clipboardText);
    event.preventDefault();
  }

  async function handleRewindPreview() {
    setRewindPreview(null);
    setRewindDialogOpen(true);
    setHistoryAction("preview");
    try {
      const result = await rewindClaudeFilesFromMessage({
        taskId,
        messageId: message.id,
        dryRun: true,
      });
      setRewindPreview(result);
    } catch (error) {
      setRewindPreview({
        ok: false,
        canRewind: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setHistoryAction(null);
    }
  }

  async function handleRewindConfirm() {
    setHistoryAction("rewind");
    try {
      const result = await rewindClaudeFilesFromMessage({
        taskId,
        messageId: message.id,
        dryRun: false,
      });
      if (result.ok && result.canRewind) {
        setRewindDialogOpen(false);
        toast.success("Claude files rewound", {
          description: `${result.filesChanged?.length ?? 0} file(s) restored. Conversation history was unchanged.`,
        });
      } else {
        setRewindPreview(result);
        toast.error("Could not rewind Claude files", {
          description: result.detail,
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setRewindPreview({ ok: false, canRewind: false, detail });
      toast.error("Could not rewind Claude files", { description: detail });
    } finally {
      setHistoryAction(null);
    }
  }

  return (
    <div
      data-message-id={message.id}
      data-conversation-turn-id={
        message.role === "assistant" && threadActionState
          ? message.id
          : undefined
      }
      className={cn(isFirst && "pt-3 sm:pt-4")}
    >
      <Message from={message.role}>
        <div
          className={cn(
            "group/message-shell flex flex-col items-stretch",
            message.role === "assistant"
              ? "w-full max-w-4xl gap-1.5"
              : "min-w-0 max-w-[88%] w-fit gap-1",
          )}
        >
          <MessageContent
            className={message.role === "assistant" ? "pb-1" : undefined}
            onCopy={handleUserMessageCopy}
          >
            {planPresentation.showPlanCard ? (
              <ConversationPlanCard planText={planPresentation.planText} />
            ) : null}
            {planPresentation.showAssistantBody ? (
              <MemoizedAssistantMessageBody
                message={message}
                taskId={taskId}
                messageId={message.id}
                streamingEnabled={chatStreamingEnabled}
                traceExpansionMode={traceExpansionMode}
                showInterimMessages={showInterimMessages}
              />
            ) : null}
          </MessageContent>
          {message.role === "user" && steerDeliveryLabel ? (
            <span className="self-end px-1 text-[11px] text-muted-foreground">
              {steerDeliveryLabel}
            </span>
          ) : null}
          <MessageActions
            className={cn(
              message.role === "user" &&
                "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100 group-focus-within/message-shell:pointer-events-auto group-focus-within/message-shell:opacity-100",
              message.role === "assistant" && "self-stretch !ml-0 !mt-1",
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {message.providerId !== "user" && message.model ? (
                <MessageAction
                  key="provider-action"
                  label={turnModelInfoLabel}
                  // The chip owns its own border and fill, so the action shell
                  // is stripped back to a positioning wrapper.
                  className="pointer-events-none h-auto max-w-full cursor-default gap-0 rounded-sm border-0 bg-transparent p-0 font-normal opacity-100 hover:bg-transparent"
                >
                  <TurnModelChip
                    providerId={message.providerId}
                    model={message.model}
                    parts={turnModelInfoParts}
                  />
                </MessageAction>
              ) : null}
              {message.role === "assistant" && elapsedLabel ? (
                <MessageAction
                  key="elapsed-action"
                  label="Elapsed time"
                  className="pointer-events-none h-7 cursor-default gap-1.5 rounded-sm px-2 text-sm font-normal text-muted-foreground opacity-100"
                >
                  {showRespondingWave ? (
                    <Loader
                      aria-hidden
                      className={toProviderWaveToneClass({
                        providerId: message.providerId,
                        model: message.model,
                      })}
                      size="xs"
                      variant="pulse"
                    />
                  ) : null}
                  {elapsedLabel}
                </MessageAction>
              ) : null}
              <CopyButton
                key="copy-action"
                text={message.displayContent ?? message.content}
              />
              {canRewindFiles ? (
                <MessageAction
                  key="rewind-action"
                  label="Preview Claude file rewind"
                  disabled={historyAction != null}
                  onClick={() => void handleRewindPreview()}
                >
                  {historyAction === "preview" ? (
                    <Loader aria-hidden size="xs" variant="scan" />
                  ) : (
                    <Undo2 className="size-3.5" />
                  )}
                </MessageAction>
              ) : null}
              {/* Kiro can finish a turn with no usage record; the summary
                  still mounts so it can say so. Cursor never reports over
                  ACP, so an empty Cursor turn stays badge-less. */}
              {message.role === "assistant" &&
              (message.usage ||
                message.delegatedUsage?.length ||
                providerMayOmitTurnUsage(message.providerId)) &&
              !showRespondingWave ? (
                <MessageUsageSummary
                  usage={message.usage}
                  delegatedUsage={message.delegatedUsage}
                  providerId={message.providerId}
                  model={message.model}
                />
              ) : null}
              {message.role === "assistant" && threadActionState ? (
                <ConversationTurnActions
                  taskId={taskId}
                  messageId={message.id}
                  state={threadActionState}
                  className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100 group-focus-within/message-shell:pointer-events-auto group-focus-within/message-shell:opacity-100 motion-reduce:transition-none"
                />
              ) : null}
            </div>
          </MessageActions>
          {canRewindFiles || rewindDialogOpen ? (
            <Dialog
              open={rewindDialogOpen}
              onOpenChange={(open) => {
                if (historyAction !== "rewind") {
                  setRewindDialogOpen(open);
                }
              }}
            >
              <DialogContent showCloseButton={false} className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Rewind Claude file changes?</DialogTitle>
                  <DialogDescription>
                    This restores working files to their state before this user
                    message. Conversation history and Git history are not
                    changed.
                  </DialogDescription>
                </DialogHeader>
                <div aria-live="polite" className="min-w-0 space-y-3">
                  {historyAction === "preview" && !rewindPreview ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader aria-hidden size="xs" variant="scan" />
                      Checking affected files…
                    </div>
                  ) : rewindPreview?.ok && rewindPreview.canRewind ? (
                    <>
                      <p className="text-sm text-foreground">
                        {rewindPreview.filesChanged?.length ?? 0} file(s) will
                        change
                        {rewindPreview.insertions != null ||
                        rewindPreview.deletions != null
                          ? ` · +${rewindPreview.insertions ?? 0} / −${rewindPreview.deletions ?? 0}`
                          : ""}
                        .
                      </p>
                      {rewindPreview.filesChanged?.length ? (
                        <ul
                          aria-label="Files affected by rewind"
                          className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs"
                        >
                          {rewindPreview.filesChanged.map((filePath) => (
                            <li key={filePath} className="break-all">
                              {filePath}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Claude reported no changed file paths.
                        </p>
                      )}
                    </>
                  ) : rewindPreview ? (
                    <p className="text-sm text-destructive">
                      {rewindPreview.detail}
                    </p>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={historyAction === "rewind"}
                    onClick={() => setRewindDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={
                      historyAction != null ||
                      !rewindPreview?.ok ||
                      !rewindPreview.canRewind
                    }
                    onClick={() => void handleRewindConfirm()}
                  >
                    {historyAction === "rewind" ? (
                      <Loader aria-hidden size="xs" variant="persist" />
                    ) : null}
                    Rewind files
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </Message>
    </div>
  );
});

function ChatPanelMessageList(props: {
  scrollActivationKey?: string | number;
}) {
  const taskId = useScopedTaskId();
  const [
    activeTurnId,
    chatStreamingEnabled,
    showConversationTurnRail,
    showInterimMessages,
    reasoningExpansionMode,
    loadTaskMessages,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeTurnIdsByTask[taskId],
          state.settings.chatStreamingEnabled,
          state.settings.showConversationTurnRail,
          state.settings.showInterimMessages,
          state.settings.reasoningExpansionMode,
          state.loadTaskMessages,
        ] as const,
    ),
  );
  const messages = useAppStore(
    (state) => state.messagesByTask[taskId] ?? EMPTY_MESSAGES,
  );
  const providerSession = useAppStore(
    (state) => state.providerSessionByTask[taskId] ?? EMPTY_PROVIDER_SESSION,
  );
  const providerRuntimeCapabilities = useAppStore(
    (state) => state.providerRuntimeCapabilities,
  );
  const totalMessageCount = useAppStore(
    (state) => state.messageCountByTask[taskId] ?? 0,
  );
  const focusPendingInteractionRequest = useAppStore(
    (state) => state.focusPendingInteractionRequest,
  );
  const scrollToLatestMessageRequest = useAppStore(
    (state) => state.scrollToLatestMessageRequest,
  );
  const focusTranscriptToolRequest = useAppStore(
    (state) => state.focusTranscriptToolRequest,
  );
  const taskMessagesLoading = useAppStore(
    (state) => state.taskMessagesLoadingByTask[taskId] === true,
  );
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const manualScrollIntentRef =
    useRef<ConversationManualScrollIntentHandle | null>(null);
  const turnRailRef = useRef<ConversationTurnRailHandle | null>(null);
  const turnRailNavigationFrameRef = useRef<number | null>(null);
  const retainedScrollToLatestMessageNonceRef = useRef(0);
  retainedScrollToLatestMessageNonceRef.current = retainTaskScrollToLatestNonce(
    {
      currentNonce: retainedScrollToLatestMessageNonceRef.current,
      request: scrollToLatestMessageRequest,
      taskId,
    },
  );
  const scrollToLatestMessageRequestNonce =
    retainedScrollToLatestMessageNonceRef.current;
  const [elapsedAnchorMs, setElapsedAnchorMs] = useState(() => Date.now());
  const [turnCompletionScrollTick, setTurnCompletionScrollTick] = useState(0);
  const previousActiveTurnIdRef = useRef<string | undefined>(activeTurnId);

  // Plan responses stay in the transcript and render as a dedicated plan card
  // (see `resolvePlanMessagePresentation`). They used to be filtered out here,
  // which left the floating `PlanViewer` as their only renderer — so the plan
  // vanished as soon as the task moved past plan review, and any follow-up
  // content sharing the message was dropped with it.
  const visibleMessages = messages;
  const threadActionStateByMessageId = useMemo(
    () =>
      buildConversationTurnActionStateByMessageId({
        messages,
        providerSession,
        hasActiveTurn: Boolean(activeTurnId),
        runtimeCapabilities: providerRuntimeCapabilities,
      }),
    [activeTurnId, messages, providerRuntimeCapabilities, providerSession],
  );
  const turnRailItems = useMemo(
    () =>
      buildConversationTurnRailItems({
        messages: visibleMessages,
        actionStateByMessageId: threadActionStateByMessageId,
      }),
    [threadActionStateByMessageId, visibleMessages],
  );
  const hasOlderMessages = messages.length < totalMessageCount;
  const showConversationLoadingState = shouldShowConversationLoadingState({
    visibleMessageCount: visibleMessages.length,
    totalMessageCount,
    taskMessagesLoading,
  });
  const liveStreamingMessageId = activeTurnId
    ? visibleMessages.at(-1)?.id
    : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages],
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = [
    scrollToLatestMessageRequestNonce,
    latestVisibleMessageId ?? "none",
    turnCompletionScrollTick,
  ].join(":");
  const scrollContextKey = taskId;
  const messageIndexById = useMemo(
    () =>
      new Map(
        visibleMessages.map((message, index) => [message.id, index] as const),
      ),
    [visibleMessages],
  );
  const restoreAnchor = taskScrollAnchorCache.get(scrollContextKey);
  const restoreItemIndex = restoreAnchor
    ? messageIndexById.get(restoreAnchor.messageId)
    : undefined;
  const traceExpansionMode = getReasoningTraceExpansionMode({
    reasoningExpansionMode,
  });
  const pendingInteraction = useMemo(
    () => findLatestPendingToolInteraction({ messages: visibleMessages }),
    [visibleMessages],
  );

  useEffect(() => {
    return () => {
      if (turnRailNavigationFrameRef.current !== null) {
        window.cancelAnimationFrame(turnRailNavigationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previousActiveTurnIdRef.current && !activeTurnId) {
      setTurnCompletionScrollTick((current) => current + 1);
    }
    previousActiveTurnIdRef.current = activeTurnId;
  }, [activeTurnId]);

  useEffect(() => {
    if (restoreAnchor && restoreItemIndex == null && !taskMessagesLoading) {
      // An anchor whose message is no longer resident cannot be restored
      // safely. Drop it once loading settles so later activations use the
      // explicit bottom fallback instead of retrying stale geometry.
      taskScrollAnchorCache.delete(scrollContextKey);
    }
  }, [restoreAnchor, restoreItemIndex, scrollContextKey, taskMessagesLoading]);

  useEffect(() => {
    if (!activeTurnId) {
      return;
    }
    const handle = window.setInterval(() => {
      setElapsedAnchorMs(Date.now());
    }, 1000);
    return () => window.clearInterval(handle);
  }, [activeTurnId]);

  useEffect(() => {
    if (
      !focusPendingInteractionRequest ||
      focusPendingInteractionRequest.taskId !== taskId ||
      !pendingInteraction
    ) {
      return;
    }

    const messageIndex = visibleMessages.findIndex(
      (message) => message.id === pendingInteraction.messageId,
    );
    if (messageIndex < 0) {
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      index: messageIndex,
      align: "center",
      behavior: "smooth",
    });

    const requestId = pendingInteraction.part.requestId;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const node = document.querySelector<HTMLElement>(
          `[data-pending-interaction-request-id="${escapeAttributeSelectorValue(requestId)}"]`,
        );
        node?.scrollIntoView({ block: "center", behavior: "smooth" });
        node?.focus({ preventScroll: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [
    taskId,
    focusPendingInteractionRequest,
    pendingInteraction,
    visibleMessages,
  ]);

  // A Turn Activity row asked to be shown in the conversation. Same two-step as
  // the pending-interaction focus above: the virtualized list has to mount the
  // message before its tool step exists in the DOM to scroll to.
  //
  // The request is a standing store value with no natural end — unlike the
  // pending-interaction one above, which stops when the prompt is answered — so
  // the nonce it carries is what marks it spent. Without that, `visibleMessages`
  // hands this effect a fresh array on every provider flush and a single row
  // click would keep yanking the transcript back to that step, and focus away
  // from the composer, for the rest of the session.
  const handledFocusTranscriptNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      !focusTranscriptToolRequest ||
      focusTranscriptToolRequest.taskId !== taskId ||
      handledFocusTranscriptNonceRef.current ===
        focusTranscriptToolRequest.nonce
    ) {
      return;
    }
    const { toolUseId } = focusTranscriptToolRequest;
    const messageIndex = findMessageIndexByToolUseId({
      messages: visibleMessages,
      toolUseId,
    });
    // Not marked spent: the message may still be paging in, and the next
    // `visibleMessages` change is this request's second chance.
    if (messageIndex < 0) {
      return;
    }
    handledFocusTranscriptNonceRef.current = focusTranscriptToolRequest.nonce;

    virtuosoRef.current?.scrollToIndex({
      index: messageIndex,
      align: "center",
      behavior: "smooth",
    });

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const node = document.querySelector<HTMLElement>(
          `[data-tool-use-id="${escapeAttributeSelectorValue(toolUseId)}"]`,
        );
        node?.scrollIntoView({ block: "center", behavior: "smooth" });
        node?.focus({ preventScroll: true });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [focusTranscriptToolRequest, taskId, visibleMessages]);

  return (
    <>
      <ConversationContent
        data-testid={`conversation-scroll-${taskId}`}
        autoScrollKey={autoScrollKey}
        autoScrollBehavior="auto"
        forceScrollKey={forceScrollKey}
        scrollScopeKey={scrollContextKey}
        forceScrollScopeKey={scrollContextKey}
        manualScrollIntentRef={manualScrollIntentRef}
        restoreScrollPosition={restoreItemIndex != null}
        withInnerLayout={
          visibleMessages.length === 0 && !showConversationLoadingState
        }
        onScrollPositionChange={({ atBottom, container }) => {
          const nextActiveRailMessageId = atBottom
            ? turnRailItems.at(-1)?.messageId
            : findActiveConversationTurnMessageId({
                turns: Array.from(
                  container.querySelectorAll<HTMLElement>(
                    "[data-conversation-turn-id]",
                  ),
                ).flatMap((node) => {
                  const messageId = node.dataset.conversationTurnId;
                  if (!messageId) {
                    return [];
                  }
                  const bounds = node.getBoundingClientRect();
                  return [
                    {
                      messageId,
                      top: bounds.top,
                      bottom: bounds.bottom,
                    },
                  ];
                }),
                viewportTop: container.getBoundingClientRect().top,
                viewportHeight: container.clientHeight,
              });
          if (nextActiveRailMessageId) {
            turnRailRef.current?.setActiveMessageId(nextActiveRailMessageId);
          }

          if (atBottom) {
            taskScrollAnchorCache.delete(scrollContextKey);
            return;
          }
          const containerTop = container.getBoundingClientRect().top;
          const anchorNode = Array.from(
            container.querySelectorAll<HTMLElement>("[data-message-id]"),
          ).find((node) => node.getBoundingClientRect().bottom > containerTop);
          const messageId = anchorNode?.dataset.messageId;
          if (!anchorNode || !messageId) {
            return;
          }
          taskScrollAnchorCache.save(scrollContextKey, {
            messageId,
            // Preserve the signed offset. At the absolute top, the first
            // message can sit below the container because "Load older" precedes
            // the list, so clamping this value would lose the true top anchor.
            offset: Math.round(
              containerTop - anchorNode.getBoundingClientRect().top,
            ),
          });
        }}
      >
        {hasOlderMessages ? (
          <div className="mx-auto mb-3 flex w-full max-w-6xl px-3 pt-3 sm:px-5 sm:pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={taskMessagesLoading}
              className="h-8 rounded-sm"
              onClick={() => {
                void loadTaskMessages({ taskId, mode: "older" });
              }}
            >
              {taskMessagesLoading
                ? "Loading older messages..."
                : `Load older messages (${totalMessageCount - messages.length} remaining)`}
            </Button>
          </div>
        ) : null}
        {showConversationLoadingState ? (
          <SessionLoadingState
            testId="conversation-loading-state"
            title="Loading conversation"
            description="Fetching the latest messages for this task."
          />
        ) : visibleMessages.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>Start a conversation</EmptyTitle>
              <EmptyDescription>
                Send a prompt to begin this task.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ConversationVirtualList
            listKey={scrollContextKey}
            listRef={virtuosoRef}
            data={visibleMessages}
            forceScrollKey={forceScrollKey}
            forceScrollScopeKey={scrollContextKey}
            restoreKey={props.scrollActivationKey}
            restoreItemIndex={restoreItemIndex}
            restoreItemId={restoreAnchor?.messageId}
            restoreItemOffset={restoreAnchor?.offset}
            itemKey={(_, message) => message.id}
            itemContent={(index, message) => (
              <MessageRow
                taskId={taskId}
                activeTurnId={activeTurnId}
                chatStreamingEnabled={chatStreamingEnabled}
                elapsedAnchorMs={
                  message.id === liveStreamingMessageId
                    ? elapsedAnchorMs
                    : undefined
                }
                isFirst={index === 0}
                liveStreamingMessageId={liveStreamingMessageId}
                showInterimMessages={showInterimMessages}
                traceExpansionMode={traceExpansionMode}
                threadActionState={threadActionStateByMessageId.get(message.id)}
                message={message}
              />
            )}
          />
        )}
      </ConversationContent>
      {showConversationTurnRail ? (
        <ConversationTurnRail
          ref={turnRailRef}
          taskId={taskId}
          items={turnRailItems}
          hasEarlierMessages={hasOlderMessages}
          onNavigate={(item) => {
            manualScrollIntentRef.current?.markManualScrollIntent();
            if (turnRailNavigationFrameRef.current !== null) {
              window.cancelAnimationFrame(turnRailNavigationFrameRef.current);
            }
            turnRailNavigationFrameRef.current = window.requestAnimationFrame(
              () => {
                turnRailNavigationFrameRef.current = null;
                virtuosoRef.current?.scrollToIndex({
                  index: item.messageIndex,
                  align: "center",
                  behavior: "auto",
                });
                // Virtuoso may synchronously report the pre-settled viewport
                // while it measures the target row. Preserve the user's explicit
                // choice until stable row geometry drives the next report.
                turnRailRef.current?.setActiveMessageId(item.messageId);
              },
            );
          }}
        />
      ) : null}
    </>
  );
}

const MemoizedChatPanelMessageList = memo(ChatPanelMessageList);

export function ChatPanel(props: { scrollActivationKey?: string | number }) {
  return (
    <Conversation>
      <div className="flex h-full w-full flex-col">
        <MemoizedChatPanelMessageList
          scrollActivationKey={props.scrollActivationKey}
        />
      </div>
      <ConversationScrollButton tooltip="Scroll to bottom" />
    </Conversation>
  );
}
