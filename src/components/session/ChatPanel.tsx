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
  MessageSquareIcon,
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
} from "@/components/ui";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationVirtualList,
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
import type { ChatMessage, MessagePart } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import {
  CopyButton,
  toProviderWaveToneClass,
} from "./chat-panel-message-parts";
import { AssistantMessageBody } from "./message/assistant-trace";
import { SessionLoadingState } from "./SessionLoadingState";

const EMPTY_MESSAGES: ChatMessage[] = [];

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
  message: {
    id: string;
    role: "user" | "assistant";
    providerId: "claude-code" | "codex" | "user";
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
    message,
  } = args;
  const showRespondingWave =
    Boolean(activeTurnId) &&
    message.id === liveStreamingMessageId &&
    message.role === "assistant" &&
    message.isStreaming;
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

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
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
                "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100",
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
              {message.role === "assistant" &&
              message.usage &&
              !showRespondingWave ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-default items-center gap-1.5 pl-1 text-[11px] leading-none text-muted-foreground/40">
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
                          <span>
                            {formatCostUsd(message.usage.totalCostUsd)}
                          </span>
                        ) : null}
                      </span>
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
            </div>
          </MessageActions>
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
    activeWorkspaceId,
    activeTurnId,
    chatStreamingEnabled,
    showInterimMessages,
    reasoningExpansionMode,
    loadTaskMessages,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.activeWorkspaceId,
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
  const totalMessageCount = useAppStore(
    (state) => state.messageCountByTask[taskId] ?? 0,
  );
  const focusPendingInteractionRequest = useAppStore(
    (state) => state.focusPendingInteractionRequest,
  );
  const taskMessagesLoading = useAppStore(
    (state) => state.taskMessagesLoadingByTask[taskId] === true,
  );
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [elapsedAnchorMs, setElapsedAnchorMs] = useState(() => Date.now());
  const [turnCompletionScrollTick, setTurnCompletionScrollTick] = useState(0);
  const previousActiveTurnIdRef = useRef<string | undefined>(activeTurnId);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.isPlanResponse),
    [messages],
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
    latestVisibleMessageId ?? "none",
    turnCompletionScrollTick,
    props.scrollActivationKey ?? 0,
  ].join(":");
  const scrollContextKey = `${activeWorkspaceId}:${taskId}`;
  const traceExpansionMode = getReasoningTraceExpansionMode({ reasoningExpansionMode });
  const pendingInteraction = useMemo(
    () => findLatestPendingToolInteraction({ messages: visibleMessages }),
    [visibleMessages],
  );

  useEffect(() => {
    if (previousActiveTurnIdRef.current && !activeTurnId) {
      setTurnCompletionScrollTick((current) => current + 1);
    }
    previousActiveTurnIdRef.current = activeTurnId;
  }, [activeTurnId]);

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
    <ConversationContent
      data-testid={`conversation-scroll-${taskId}`}
      autoScrollKey={autoScrollKey}
      autoScrollBehavior="auto"
      forceScrollKey={forceScrollKey}
      scrollScopeKey={scrollContextKey}
      forceScrollScopeKey={scrollContextKey}
      withInnerLayout={
        visibleMessages.length === 0 && !showConversationLoadingState
      }
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
              message={message}
            />
          )}
        />
      )}
    </ConversationContent>
  );
}

const MemoizedChatPanelMessageList = memo(ChatPanelMessageList);

export function ChatPanel(props: {
  scrollActivationKey?: string | number;
}) {
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
