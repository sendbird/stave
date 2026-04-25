import { memo, useCallback, type CSSProperties } from "react";
import {
  Conversation,
  ConversationScrollButton,
  Message,
  ZenMessageContent,
} from "@/components/ai-elements";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/chat";
import { toProviderStartCase } from "./chat-panel-message-parts";
import {
  ChatPanelMessageListScaffold,
  type ChatPanelRowRenderArgs,
} from "./chat-panel.shared";
import {
  ZenAssistantMessageBody,
  hasVisibleZenAssistantMessageBody,
} from "./message/ZenAssistantMessageBody";

const ZenMessageRow = memo(function ZenMessageRow(
  args: ChatPanelRowRenderArgs,
) {
  const { activeTaskId, chatStreamingEnabled, isFirst, message } = args;

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
      <Message from={message.role}>
        <div className="group/message-shell flex w-full flex-col items-stretch gap-2">
          <div
            className={cn(
              "mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]",
              message.role === "user"
                ? "justify-end text-primary/80"
                : "justify-start text-muted-foreground/80",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                message.role === "user"
                  ? "bg-primary"
                  : "bg-muted-foreground/70",
              )}
              aria-hidden="true"
            />
            <span>{message.role === "user" ? "USER" : "AGENT"}</span>
            {message.role === "assistant" ? (
              <span className="text-muted-foreground/55">
                {message.providerId === "user"
                  ? "Assistant"
                  : toProviderStartCase({ providerId: message.providerId })}
              </span>
            ) : null}
          </div>
          <ZenMessageContent
            className={cn(
              message.role === "assistant" &&
                "w-full max-w-[72ch] self-start pb-0 text-left text-[0.98em] tracking-[-0.01em]",
              message.role === "user" &&
                "w-full max-w-[38ch] self-end pb-0 text-right text-[0.98em] tracking-[-0.01em]",
            )}
          >
            <ZenAssistantMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
            />
          </ZenMessageContent>
        </div>
      </Message>
    </div>
  );
});

const MemoizedZenChatPanelMessageList = memo(
  function ZenChatPanelMessageList(args: { inputDockHeight?: number }) {
    const filterMessage = useCallback(
      (message: ChatMessage) =>
        message.role !== "assistant" ||
        hasVisibleZenAssistantMessageBody({ message }),
      [],
    );

    return (
      <ChatPanelMessageListScaffold
        layout="zen"
        filterMessage={filterMessage}
        bottomSpacerHeight={(args.inputDockHeight ?? 0) + 24}
        renderMessageRow={(rowArgs) => <ZenMessageRow {...rowArgs} />}
      />
    );
  },
);

export function ZenChatPanel(args: { inputDockHeight?: number }) {
  const conversationStyle = {
    "--zen-chat-input-dock-height": `${Math.max(0, Math.round(args.inputDockHeight ?? 0))}px`,
  } as CSSProperties;

  return (
    <Conversation style={conversationStyle}>
      <div className="flex h-full w-full flex-col">
        <MemoizedZenChatPanelMessageList
          inputDockHeight={args.inputDockHeight}
        />
      </div>
      <ConversationScrollButton
        tooltip="Scroll to bottom"
        className="bottom-[calc(var(--zen-chat-input-dock-height,0px)+0.75rem)]"
      />
    </Conversation>
  );
}
