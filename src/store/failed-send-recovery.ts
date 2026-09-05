import type {
  Attachment,
  PromptDraft,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";

/**
 * How many failed outgoing sends a single task keeps.
 *
 * A send that keeps failing (offline provider, unreadable attachment) would
 * otherwise park one bubble per attempt forever. The oldest entries drop
 * first, so the most recent failure — the one the user is looking at — always
 * survives.
 */
export const FAILED_OUTGOING_SEND_LIMIT = 10;

const DEFAULT_SEND_FAILURE_REASON = "The message could not be sent.";

/**
 * An outgoing message that never reached the provider, parked with everything
 * needed to send it again.
 *
 * In memory only, and deliberately not part of `messagesByTask`: nothing was
 * ever sent, so it must not enter the persisted transcript or the message
 * count. The payload lives here rather than in the composer because dismissing
 * the bubble has to be able to drop the text for good.
 */
export interface FailedOutgoingSend {
  id: string;
  taskId: string;
  failedAt: string;
  /** Why the send failed, shown on the bubble. */
  reason: string;
  text: string;
  attachedFilePaths: string[];
  attachments: Attachment[];
  /** Turn-scoped runtime settings the failed attempt was sent with. */
  runtimeOverrides?: PromptDraftRuntimeOverrides;
}

export type FailedOutgoingSendsByTask = Record<
  string,
  FailedOutgoingSend[] | undefined
>;

export function describeSendFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return DEFAULT_SEND_FAILURE_REASON;
}

export function buildFailedOutgoingSend(args: {
  id: string;
  taskId: string;
  failedAt: string;
  draft: Pick<
    PromptDraft,
    "text" | "attachedFilePaths" | "attachments" | "runtimeOverrides"
  >;
  error: unknown;
}): FailedOutgoingSend {
  return {
    id: args.id,
    taskId: args.taskId,
    failedAt: args.failedAt,
    reason: describeSendFailureReason(args.error),
    text: args.draft.text,
    attachedFilePaths: [...args.draft.attachedFilePaths],
    attachments: [...args.draft.attachments],
    ...(args.draft.runtimeOverrides
      ? { runtimeOverrides: args.draft.runtimeOverrides }
      : {}),
  };
}

export function appendFailedOutgoingSend(
  sendsByTask: FailedOutgoingSendsByTask,
  entry: FailedOutgoingSend,
): FailedOutgoingSendsByTask {
  const existing = sendsByTask[entry.taskId] ?? [];
  return {
    ...sendsByTask,
    [entry.taskId]: [...existing, entry].slice(-FAILED_OUTGOING_SEND_LIMIT),
  };
}

export function getFailedOutgoingSend(
  sendsByTask: FailedOutgoingSendsByTask,
  args: { taskId: string; id: string },
): FailedOutgoingSend | undefined {
  return (sendsByTask[args.taskId] ?? []).find((item) => item.id === args.id);
}

export function removeFailedOutgoingSend(
  sendsByTask: FailedOutgoingSendsByTask,
  args: { taskId: string; id: string },
): FailedOutgoingSendsByTask {
  const existing = sendsByTask[args.taskId];
  if (!existing) {
    return sendsByTask;
  }
  const remaining = existing.filter((item) => item.id !== args.id);
  if (remaining.length === existing.length) {
    return sendsByTask;
  }
  const next = { ...sendsByTask };
  if (remaining.length === 0) {
    delete next[args.taskId];
  } else {
    next[args.taskId] = remaining;
  }
  return next;
}

export function clearFailedOutgoingSendsForTask(
  sendsByTask: FailedOutgoingSendsByTask,
  taskId: string,
): FailedOutgoingSendsByTask {
  if (!sendsByTask[taskId]) {
    return sendsByTask;
  }
  const next = { ...sendsByTask };
  delete next[taskId];
  return next;
}

/**
 * How many distinct attachments the failed payload carries.
 *
 * A file picked in the composer lands in both `attachedFilePaths` and as a
 * `file` attachment, so those are counted once.
 */
export function countFailedSendAttachments(
  send: Pick<FailedOutgoingSend, "attachedFilePaths" | "attachments">,
): number {
  const filePaths = new Set(send.attachedFilePaths);
  let count = filePaths.size;
  for (const attachment of send.attachments) {
    if (attachment.kind === "file") {
      if (!filePaths.has(attachment.filePath)) {
        filePaths.add(attachment.filePath);
        count += 1;
      }
      continue;
    }
    count += 1;
  }
  return count;
}

export function describeFailedSendAttachments(
  send: Pick<FailedOutgoingSend, "attachedFilePaths" | "attachments">,
): string | null {
  const count = countFailedSendAttachments(send);
  if (count === 0) {
    return null;
  }
  return count === 1 ? "1 attachment" : `${count} attachments`;
}
