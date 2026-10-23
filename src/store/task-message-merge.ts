import { carryForwardInteractionAnswers } from "@/lib/session/interaction-state-merge";
import type { ChatMessage } from "@/types/chat";

/**
 * Chooses between the resident copy of a message and the persisted one.
 * The resident copy normally wins: it can be ahead of a debounced snapshot.
 * It loses only when it is visibly behind, mirroring the persistence guard in
 * `electron/persistence/task-message-upsert.ts`:
 * - it is still streaming while the persisted row already finished, or
 * - the persisted row finished with longer content and at least as many parts.
 * When the persisted copy wins, answers given in the resident copy are carried
 * into it, so answering from a stale view is not lost.
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
  const residentIsOlderCopy =
    resident.isStreaming ||
    (resident.content.length < persisted.content.length &&
      resident.parts.length <= persisted.parts.length);
  if (!residentIsOlderCopy) {
    return resident;
  }
  const { parts, carried } = carryForwardInteractionAnswers({
    target: persisted.parts,
    source: resident.parts,
  });
  return carried > 0 ? { ...persisted, parts } : persisted;
}

/** Without both start times the order is unknown, so the message is kept. */
function mayBeNewerThan(message: ChatMessage, timestamp: string | undefined) {
  return !timestamp || !message.startedAt || message.startedAt > timestamp;
}

/**
 * Merges the latest persisted page into the resident window without
 * reordering it. Resident messages keep their order (and win unless they are
 * an older copy); persisted messages the window lacks are placed where the
 * page puts them: before the next resident message the page also holds, or
 * right after the last one, ahead of resident messages newer than the page.
 */
function mergeLatestTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
}) {
  if (args.currentMessages.length === 0) {
    return args.pageMessages;
  }
  const residentIndexById = new Map(
    args.currentMessages.map((message, index) => [message.id, index] as const),
  );
  const pageById = new Map(
    args.pageMessages.map((message) => [message.id, message] as const),
  );
  const insertBefore = new Map<number, ChatMessage[]>();
  let pending: ChatMessage[] = [];
  let lastSharedIndex = -1;
  for (const message of args.pageMessages) {
    const residentIndex = residentIndexById.get(message.id);
    if (residentIndex === undefined) {
      pending.push(message);
      continue;
    }
    if (pending.length > 0) {
      insertBefore.set(residentIndex, [
        ...(insertBefore.get(residentIndex) ?? []),
        ...pending,
      ]);
      pending = [];
    }
    lastSharedIndex = Math.max(lastSharedIndex, residentIndex);
  }
  if (lastSharedIndex < 0) {
    if (args.pageMessages.length === 0) {
      return args.currentMessages;
    }
    // No overlap: the page is the persisted tail. Resident messages that
    // started after it are not persisted yet and stay after it; the rest are
    // an older window that the page supersedes.
    const pageTailStartedAt = args.pageMessages.at(-1)?.startedAt;
    return [
      ...args.pageMessages,
      ...args.currentMessages.filter((message) =>
        mayBeNewerThan(message, pageTailStartedAt),
      ),
    ];
  }

  const merged: ChatMessage[] = [];
  args.currentMessages.forEach((message, index) => {
    merged.push(...(insertBefore.get(index) ?? []));
    const persisted = pageById.get(message.id);
    merged.push(
      persisted ? pickFresherTaskMessage({ resident: message, persisted }) : message,
    );
    if (index === lastSharedIndex) {
      merged.push(...pending);
    }
  });
  return merged;
}

export function mergeTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
  mode: "latest" | "older";
}) {
  if (args.mode === "latest") {
    return mergeLatestTaskMessagePage(args);
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
