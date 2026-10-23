import type { ChatMessage } from "@/types/chat";

/**
 * Chooses between the resident copy of a message and the persisted one.
 * The resident copy normally wins: it can be ahead of a debounced snapshot.
 * It loses only when it is visibly behind, mirroring the persistence guard in
 * `electron/persistence/task-message-upsert.ts`:
 * - it is still streaming while the persisted row already finished, or
 * - both finished and the persisted row has more parts and longer content.
 */
export function pickFresherTaskMessage(args: {
  resident: ChatMessage;
  persisted: ChatMessage;
}): ChatMessage {
  const { resident, persisted } = args;
  if (resident.role !== persisted.role) {
    return resident;
  }
  const persistedFinished = !persisted.isStreaming && Boolean(persisted.completedAt);
  if (!persistedFinished) {
    return resident;
  }
  if (resident.isStreaming) {
    return persisted;
  }
  const persistedIsLonger =
    persisted.parts.length > resident.parts.length &&
    persisted.content.length > resident.content.length;
  return persistedIsLonger ? persisted : resident;
}

export function mergeTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
  mode: "latest" | "older";
}) {
  if (args.mode === "latest") {
    const currentById = new Map(
      args.currentMessages.map((message) => [message.id, message] as const),
    );
    const merged = args.pageMessages.map((message) => {
      const resident = currentById.get(message.id);
      return resident
        ? pickFresherTaskMessage({ resident, persisted: message })
        : message;
    });
    const seen = new Set(merged.map((message) => message.id));
    for (const message of args.currentMessages) {
      if (!seen.has(message.id)) {
        merged.push(message);
      }
    }
    return merged;
  }

  const seen = new Set(args.currentMessages.map((message) => message.id));
  const olderMessages = args.pageMessages.filter(
    (message) => !seen.has(message.id),
  );
  if (olderMessages.length === 0) {
    return args.currentMessages;
  }
  return [...olderMessages, ...args.currentMessages];
}
