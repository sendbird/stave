import type { ChatMessage } from "../../src/types/chat";

/**
 * Synthetic transcript large enough that "load the whole task" is a memory
 * problem rather than a rounding error.
 *
 * Used by the persistence-efficiency guards: a 5,000-message task with a few
 * hundred-KiB tool results is the shape that made host-service hydrate the
 * full history on every provider event. Tests assert on *how much* of this
 * fixture a code path touches, so the generator must stay deterministic —
 * no randomness, no timestamps read from the clock.
 */
export const LARGE_TASK_DEFAULT_MESSAGE_COUNT = 5_000;

const BASE_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

function buildLargeText(bytes: number, seed: number) {
  // Deterministic filler; the exact bytes never matter, only the size.
  const unit = `[chunk-${seed}]`;
  return unit.repeat(Math.max(1, Math.ceil(bytes / unit.length)));
}

export function buildLargeTaskHistory(args: {
  count?: number;
  /** Attach a large tool-result part to every Nth message. 0 disables. */
  largePartEveryNth?: number;
  largePartBytes?: number;
  idPrefix?: string;
}): ChatMessage[] {
  const count = args.count ?? LARGE_TASK_DEFAULT_MESSAGE_COUNT;
  const largePartEveryNth = args.largePartEveryNth ?? 500;
  const largePartBytes = args.largePartBytes ?? 200 * 1024;
  const idPrefix = args.idPrefix ?? "msg";

  const messages: ChatMessage[] = [];
  for (let index = 0; index < count; index += 1) {
    const isUser = index % 2 === 0;
    const at = new Date(BASE_EPOCH_MS + index * 1_000).toISOString();
    const attachLargePart =
      largePartEveryNth > 0 &&
      !isUser &&
      (index + 1) % largePartEveryNth === 0 &&
      largePartBytes > 0;

    messages.push({
      id: `${idPrefix}-${String(index).padStart(6, "0")}`,
      role: isUser ? "user" : "assistant",
      model: isUser ? "" : "claude-sonnet-4-5",
      providerId: isUser ? "user" : "claude-code",
      content: isUser ? `User turn ${index}` : `Assistant turn ${index}`,
      startedAt: at,
      completedAt: at,
      parts: attachLargePart
        ? [
            {
              type: "tool",
              toolCallId: `tool-${index}`,
              toolName: "Read",
              state: "output-available",
              input: { file_path: `/tmp/fixture-${index}.txt` },
              output: buildLargeText(largePartBytes, index),
            } as ChatMessage["parts"][number],
          ]
        : [],
    } as ChatMessage);
  }
  return messages;
}

/**
 * Total byte size of the fixture's message payloads, so a test can assert a
 * code path did not serialize the whole transcript.
 */
export function measureTaskHistoryBytes(messages: ChatMessage[]) {
  return messages.reduce(
    (total, message) => total + JSON.stringify(message).length,
    0,
  );
}
