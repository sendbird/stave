import type { ChatMessage } from "@/types/chat";
import { trimLoadedTaskMessages } from "./task-message-loading";
import { findLatestPendingToolInteractionPart } from "./provider-message.utils";

export const MAX_RESIDENT_MESSAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const RESIDENT_MESSAGE_PAYLOAD_SLACK_BYTES = 2 * 1024 * 1024;

const messagePayloadSizes = new WeakMap<ChatMessage, number>();

function payloadBytes(value: unknown): number {
  if (typeof value === "string") return value.length * 2;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 4;
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value))
    return value.reduce((size, item) => size + payloadBytes(item), 0);
  let size = 0;
  for (const [key, item] of Object.entries(value)) {
    size += key.length * 2 + payloadBytes(item);
  }
  return size;
}

/** Payload accounting, not a claim about V8 heap or process RSS. No serialization copy. */
export function estimateMessagePayloadBytes(message: ChatMessage): number {
  const cached = messagePayloadSizes.get(message);
  if (cached !== undefined) return cached;
  const size = payloadBytes(message);
  // Canonical message objects are immutable; streamed revisions get a new object.
  messagePayloadSizes.set(message, size);
  return size;
}

/**
 * Only call for acknowledged/disk-loaded messages. This never edits a message
 * or its full durable content. Keep the two latest rows even when it
 * exceeds the budget; a large individual artifact needs its own lazy view.
 */
export function trimPersistedMessageWindow({
  messages,
  maxBytes = MAX_RESIDENT_MESSAGE_PAYLOAD_BYTES,
  slackBytes = RESIDENT_MESSAGE_PAYLOAD_SLACK_BYTES,
}: {
  messages: ChatMessage[];
  maxBytes?: number;
  slackBytes?: number;
}): ChatMessage[] {
  const protectedIndex = messages.findIndex(
    (message) =>
      message.isStreaming ||
      findLatestPendingToolInteractionPart({ message }) != null,
  );
  let countBounded = trimLoadedTaskMessages({ messages });
  if (
    protectedIndex >= 0 &&
    messages.length - countBounded.length > protectedIndex
  ) {
    countBounded =
      protectedIndex === 0 ? messages : messages.slice(protectedIndex);
  }
  const sizes = countBounded.map(estimateMessagePayloadBytes);
  let totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  if (totalBytes <= maxBytes + slackBytes) return countBounded;
  let firstKept = 0;
  const keepAtLeast = Math.min(2, countBounded.length);
  const protectedOffset =
    protectedIndex - (messages.length - countBounded.length);
  const lastEvictable =
    protectedIndex < 0
      ? countBounded.length - keepAtLeast
      : Math.min(protectedOffset, countBounded.length - keepAtLeast);
  while (firstKept < lastEvictable && totalBytes > maxBytes) {
    totalBytes -= sizes[firstKept] ?? 0;
    firstKept += 1;
  }
  return firstKept === 0 ? countBounded : countBounded.slice(firstKept);
}
