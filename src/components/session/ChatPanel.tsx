import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import {
  ArrowDownRight,
  ArrowUpRight,
  LoaderCircle,
  MessageSquareIcon,
  Undo2,
  Zap,
} from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WaveIndicator,
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
  ModelIcon,
} from "@/components/ai-elements";
import {
  getReasoningTraceExpansionMode,
  getMessageScrollFingerprint,
  shouldShowConversationLoadingState,
} from "@/components/session/chat-panel.utils";
import { useScopedTaskId } from "@/components/session/task-scope-context";
import { getTurnModelInfoLabel } from "@/lib/providers/turn-model-info";
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

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatCostUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

type MessageUsage = NonNullable<ChatMessage["usage"]>;

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
    providerId: "claude-code" | "codex" | "user";
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
    isStreaming?: boolean;
    steerDeliveryState?: ChatMessage["steerDeliveryState"];
    providerBoundary?: ChatMessage["providerBoundary"];
    usage?: MessageUsage;
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
  const userMessageSourceText = message.displayContent ?? message.content;
  const turnModelInfoLabel = getTurnModelInfoLabel(message);
  const steerDeliveryLabel =
    message.steerDeliveryState === "accepted"
      ? "Steered into active turn"
      : message.steerDeliveryState === "pending"
        ? "Steer pending"
        : message.steerDeliveryState === "unknown"
          ? "Steer delivery unconfirmed"
          : message.steerDeliveryState === "rejected"
            ? "Steer rejected"
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
            <MemoizedAssistantMessageBody
              message={message}
              taskId={taskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
              traceExpansionMode={traceExpansionMode}
              showInterimMessages={showInterimMessages}
            />
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
                  className="pointer-events-none h-7 cursor-default rounded-sm border border-border/70 bg-background px-2 text-sm font-normal text-foreground opacity-100"
                >
                  <ModelIcon
                    providerId={message.providerId}
                    className="size-3.5"
                  />
                  {turnModelInfoLabel}
                </MessageAction>
              ) : null}
              {message.role === "assistant" && elapsedLabel ? (
                <MessageAction
                  key="elapsed-action"
                  label="Elapsed time"
                  className="pointer-events-none h-7 cursor-default gap-1.5 rounded-sm px-2 text-sm font-normal text-muted-foreground opacity-100"
                >
                  {showRespondingWave ? (
                    <WaveIndicator
                      className={cn(
                        "size-3.5",
                        toProviderWaveToneClass({
                          providerId: message.providerId,
                          model: message.model,
                        }),
                      )}
                      animate
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
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <Undo2 className="size-3.5" />
                  )}
                </MessageAction>
              ) : null}
              {message.role === "assistant" &&
              message.usage &&
              !showRespondingWave ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex cursor-default items-center gap-1.5 pl-1 text-[11px] leading-none text-muted-foreground/40" />
                      }
                    >
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowUpRight className="size-2.5" />
                        {formatTokenCount(message.usage.inputTokens)}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowDownRight className="size-2.5" />
                        {formatTokenCount(message.usage.outputTokens)}
                      </span>
                      {message.usage.cacheReadTokens ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Zap className="size-2.5" />
                          {formatTokenCount(message.usage.cacheReadTokens)}
                        </span>
                      ) : null}
                      {message.usage.totalCostUsd != null ? (
                        <span>{formatCostUsd(message.usage.totalCostUsd)}</span>
                      ) : null}
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        <span className="text-background/70">Input</span>
                        <span className="text-right font-mono">
                          {message.usage.inputTokens.toLocaleString()} tokens
                        </span>
                        <span className="text-background/70">Output</span>
                        <span className="text-right font-mono">
                          {message.usage.outputTokens.toLocaleString()} tokens
                        </span>
                        {message.usage.cacheReadTokens ? (
                          <>
                            <span className="text-background/70">
                              Cache read
                            </span>
                            <span className="text-right font-mono">
                              {message.usage.cacheReadTokens.toLocaleString()}{" "}
                              tokens
                            </span>
                          </>
                        ) : null}
                        {message.usage.cacheCreationTokens ? (
                          <>
                            <span className="text-background/70">
                              Cache write
                            </span>
                            <span className="text-right font-mono">
                              {message.usage.cacheCreationTokens.toLocaleString()}{" "}
                              tokens
                            </span>
                          </>
                        ) : null}
                        {message.usage.totalCostUsd != null ? (
                          <>
                            <span className="text-background/70">Cost</span>
                            <span className="text-right font-mono">
                              {formatCostUsd(message.usage.totalCostUsd)}
                            </span>
                          </>
                        ) : null}
                        {message.usage.ttftMs != null ? (
                          <>
                            <span className="text-background/70">TTFT</span>
                            <span className="text-right font-mono">
                              {message.usage.ttftMs >= 1000
                                ? `${(message.usage.ttftMs / 1000).toFixed(1)}s`
                                : `${Math.round(message.usage.ttftMs)}ms`}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
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
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
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
    showInterimMessages,
    reasoningExpansionMode,
    loadTaskMessages,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeTurnIdsByTask[taskId],
          state.settings.chatStreamingEnabled,
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

  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.isPlanResponse),
    [messages],
  );
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
