import type { ConversationTurnActionState } from "@/lib/providers/thread-actions";
import type { ChatMessage } from "@/types/chat";

const TURN_PREVIEW_MAX_LENGTH = 140;

export interface ConversationTurnRailItem {
  messageId: string;
  messageIndex: number;
  providerId: "claude-code" | "codex";
  model: string;
  promptPreview: string;
  responsePreview: string;
  state: ConversationTurnActionState;
}

export function toConversationTurnPreviewText(
  value: string | undefined,
): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= TURN_PREVIEW_MAX_LENGTH) {
    return normalized;
  }

  const truncated = normalized.slice(0, TURN_PREVIEW_MAX_LENGTH - 1);
  const safeTruncated = /[\uD800-\uDBFF]$/.test(truncated)
    ? truncated.slice(0, -1)
    : truncated;
  return `${safeTruncated.trimEnd()}…`;
}

export function buildConversationTurnRailItems(args: {
  messages: ChatMessage[];
  actionStateByMessageId: Map<string, ConversationTurnActionState>;
}): ConversationTurnRailItem[] {
  const items: ConversationTurnRailItem[] = [];
  let latestUserPrompt = "";

  for (
    let messageIndex = 0;
    messageIndex < args.messages.length;
    messageIndex += 1
  ) {
    const message = args.messages[messageIndex];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      latestUserPrompt = toConversationTurnPreviewText(
        message.displayContent ?? message.content,
      );
      continue;
    }

    const state = args.actionStateByMessageId.get(message.id);
    if (
      !state ||
      (message.providerId !== "claude-code" && message.providerId !== "codex")
    ) {
      continue;
    }

    items.push({
      messageId: message.id,
      messageIndex,
      providerId: message.providerId,
      model: message.model,
      promptPreview: latestUserPrompt || "Assistant response",
      responsePreview:
        toConversationTurnPreviewText(
          message.displayContent ?? message.content,
        ) || "Provider activity completed without a text response.",
      state,
    });
  }

  return items;
}

export function getConversationRailTickScale(args: {
  index: number;
  displayedIndex: number;
  active: boolean;
}): number {
  if (args.displayedIndex < 0) {
    return args.active ? 0.68 : 0.25;
  }

  const distance = Math.abs(args.index - args.displayedIndex);
  if (distance === 0) {
    return 1;
  }
  if (distance === 1) {
    return 0.68;
  }
  if (distance === 2) {
    return 0.44;
  }
  return 0.25;
}

export interface ConversationTurnGeometry {
  messageId: string;
  top: number;
  bottom: number;
}

export function findActiveConversationTurnMessageId(args: {
  turns: ConversationTurnGeometry[];
  viewportTop: number;
  viewportHeight: number;
}): string | null {
  const viewportBottom = args.viewportTop + args.viewportHeight;
  const visibleTurns = args.turns.filter(
    (turn) => turn.bottom > args.viewportTop && turn.top < viewportBottom,
  );
  if (visibleTurns.length === 0) {
    return null;
  }

  const readingLine =
    args.viewportTop + Math.min(args.viewportHeight * 0.35, 240);
  let activeTurn = visibleTurns[0];
  for (const turn of visibleTurns) {
    if (turn.top > readingLine) {
      break;
    }
    activeTurn = turn;
  }
  return activeTurn?.messageId ?? null;
}
