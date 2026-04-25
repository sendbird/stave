import { MessageSquareIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import {
  ConversationContent,
  ConversationVirtualList,
} from "@/components/ai-elements";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { getMessageScrollFingerprint, shouldShowConversationLoadingState } from "@/components/session/chat-panel.utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { SessionLoadingState } from "./SessionLoadingState";

const EMPTY_MESSAGES: ChatMessage[] = [];

export interface ChatPanelRowRenderArgs {
  activeTaskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  elapsedAnchorMs?: number;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
  message: ChatMessage;
}

interface ChatPanelMessageListScaffoldProps {
  layout?: "default" | "zen";
  filterMessage?: (message: ChatMessage) => boolean;
  bottomSpacerHeight?: number;
  renderMessageRow: (args: ChatPanelRowRenderArgs) => ReactNode;
}

export function ChatPanelMessageListScaffold(args: ChatPanelMessageListScaffoldProps) {
  const layout = args.layout ?? "default";
  const [activeWorkspaceId, activeTaskId, activeTurnId, chatStreamingEnabled, loadTaskMessages] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.activeTaskId,
    state.activeTurnIdsByTask[state.activeTaskId],
    state.settings.chatStreamingEnabled,
    state.loadTaskMessages,
  ] as const));
  const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
  const totalMessageCount = useAppStore((state) => state.messageCountByTask[state.activeTaskId] ?? 0);
  const taskMessagesLoading = useAppStore((state) => state.taskMessagesLoadingByTask[state.activeTaskId] === true);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [elapsedAnchorMs, setElapsedAnchorMs] = useState(() => Date.now());
  const [turnCompletionScrollTick, setTurnCompletionScrollTick] = useState(0);
  const previousActiveTurnIdRef = useRef<string | undefined>(activeTurnId);

  const visibleMessages = useMemo(
    () => messages.filter((message) => (
      !message.isPlanResponse
      && (args.filterMessage?.(message) ?? true)
    )),
    [args.filterMessage, messages],
  );
  const hasOlderMessages = messages.length < totalMessageCount;
  const showConversationLoadingState = shouldShowConversationLoadingState({
    visibleMessageCount: visibleMessages.length,
    totalMessageCount,
    taskMessagesLoading,
  });
  const liveStreamingMessageId = activeTurnId ? visibleMessages.at(-1)?.id : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages]
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = `${latestVisibleMessageId ?? "none"}:${turnCompletionScrollTick}`;
  const scrollContextKey = `${activeWorkspaceId}:${activeTaskId}`;

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

  return (
    <ConversationContent
      autoScrollKey={autoScrollKey}
      autoScrollBehavior="auto"
      forceScrollKey={forceScrollKey}
      scrollScopeKey={scrollContextKey}
      forceScrollScopeKey={scrollContextKey}
      withInnerLayout={layout === "default" && visibleMessages.length === 0 && !showConversationLoadingState}
      className={layout === "zen" ? "zen-conversation-scroll" : undefined}
    >
      {hasOlderMessages ? (
        <div className={cn(
          "mx-auto mb-3 flex w-full pt-3",
          layout === "zen" ? "max-w-[82ch] px-2 sm:px-0" : "max-w-6xl px-3 sm:px-5 sm:pt-4",
        )}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={taskMessagesLoading}
            className="h-8 rounded-sm"
            onClick={() => {
              void loadTaskMessages({ taskId: activeTaskId, mode: "older" });
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
        <div className={cn(layout === "zen" && "mx-auto flex w-full max-w-[82ch] flex-1 px-2 py-4 sm:px-0")}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>Start a conversation</EmptyTitle>
              <EmptyDescription>Send a prompt to begin this task.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ConversationVirtualList
          listKey={scrollContextKey}
          listRef={virtuosoRef}
          data={visibleMessages}
          forceScrollKey={forceScrollKey}
          forceScrollScopeKey={scrollContextKey}
          layout={layout}
          extraBottomPadding={layout === "zen" ? args.bottomSpacerHeight : undefined}
          itemKey={(_, message) => message.id}
          itemContent={(index, message) => args.renderMessageRow({
            activeTaskId,
            activeTurnId,
            chatStreamingEnabled,
            elapsedAnchorMs: message.id === liveStreamingMessageId ? elapsedAnchorMs : undefined,
            isFirst: index === 0,
            liveStreamingMessageId,
            message,
          })}
        />
      )}
    </ConversationContent>
  );
}
