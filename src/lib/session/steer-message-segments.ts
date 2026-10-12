import type { ChatMessage } from "@/types/chat";

/** A steer can split an empty placeholder before any provider output arrives. */
export function visibleSteerMessageSegments(messages: ChatMessage[]): ChatMessage[];
export function visibleSteerMessageSegments(messages: readonly ChatMessage[]): readonly ChatMessage[];
export function visibleSteerMessageSegments(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const visible = messages.filter((message, index) => {
    const previous = messages[index - 1];
    return !(
      previous?.role === "user" && previous.steeredIntoTurnId &&
      message.role === "assistant" && !message.isStreaming &&
      !message.terminalStopReason && !message.content.trim() &&
      !message.displayContent?.trim() && message.parts.length === 0 &&
      !message.displayParts?.length
    );
  });
  return visible.length === messages.length ? messages : visible;
}
