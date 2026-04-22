import type { ChatMessage, MessagePart } from "@/types/chat";
import {
  sanitizeChatMessagePayload,
  sanitizeMessagePartPayload,
} from "@/lib/file-context-sanitization";

function normalizeMessagePart(args: {
  part: MessagePart;
  providerId: ChatMessage["providerId"];
}): MessagePart {
  const { part, providerId } = args;

  if (part.type === "thinking") {
    return { ...part, isStreaming: false };
  }

  if (part.type === "tool_use" && part.state === "input-streaming") {
    return { ...part, state: "input-available" };
  }

  if (part.type === "code_diff" && providerId === "codex" && part.status === "pending") {
    return { ...part, status: "accepted" };
  }

  return sanitizeMessagePartPayload(part);
}

export function normalizeMessagesForSnapshot(args: {
  messagesByTask: Record<string, ChatMessage[]>;
}): Record<string, ChatMessage[]> {
  const out: Record<string, ChatMessage[]> = {};

  for (const [taskId, messages] of Object.entries(args.messagesByTask)) {
    out[taskId] = messages.map((message) => sanitizeChatMessagePayload({
      ...message,
      isStreaming: false,
      parts: message.parts.map((part) => normalizeMessagePart({ part, providerId: message.providerId })),
    }));
  }

  return out;
}
