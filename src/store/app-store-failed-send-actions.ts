import type { StoreApi } from "zustand";
import type { AppState, SendUserMessageResult } from "@/store/app-store.types";
import {
  appendFailedOutgoingSend,
  buildFailedOutgoingSend,
  getFailedOutgoingSend,
  removeFailedOutgoingSend,
} from "@/store/failed-send-recovery";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";

type FailedSendActionKey = "retryFailedSend" | "dismissFailedSend";

type FailedSendActions = Pick<AppState, FailedSendActionKey>;

export function createFailedSendActions(args: {
  set: StoreApi<AppState>["setState"];
  get: StoreApi<AppState>["getState"];
}): FailedSendActions {
  const { set, get } = args;
  return {
    retryFailedSend: async ({ taskId, id }) => {
      const send = getFailedOutgoingSend(get().failedSendsByTask, {
        taskId,
        id,
      });
      if (!send) {
        return null;
      }
      // Drop the bubble before resending so a second failure parks one fresh
      // entry instead of leaving the original next to its retry.
      set((state) => ({
        failedSendsByTask: removeFailedOutgoingSend(state.failedSendsByTask, {
          taskId,
          id,
        }),
      }));
      const repark = (entry: typeof send) => {
        set((state) => ({
          failedSendsByTask: appendFailedOutgoingSend(
            state.failedSendsByTask,
            entry,
          ),
        }));
      };
      try {
        const result = await get().sendUserMessage({
          taskId,
          content: send.text,
          // The payload comes off the bubble, so the composer draft — which
          // the user may have typed into since the failure — stays as it is.
          preservePromptDraft: true,
          attachedFilePaths: send.attachedFilePaths,
          attachments: send.attachments,
          runtimeOverrides: send.runtimeOverrides,
          turnOrigin: "conversation",
        });
        if (result.status === "blocked") {
          // A guard rejected the retry (the task is busy, or is waiting on an
          // approval), so nothing was sent and nothing was parked. Put the
          // same bubble back rather than losing the payload.
          repark(send);
        }
        return result;
      } catch (error) {
        // sendUserMessage parks its own failed bubble and returns
        // `send-failed`, so reaching here means something outside that path
        // threw. Park the payload anyway rather than losing the message.
        repark(
          buildFailedOutgoingSend({
            id: crypto.randomUUID(),
            taskId,
            failedAt: buildRecentTimestamp(),
            draft: send,
            error,
          }),
        );
        return null;
      }
    },
    dismissFailedSend: ({ taskId, id }) => {
      set((state) => ({
        failedSendsByTask: removeFailedOutgoingSend(state.failedSendsByTask, {
          taskId,
          id,
        }),
      }));
    },
  };
}

/**
 * Park a send that never reached the provider as a failed outgoing bubble.
 *
 * The composer is deliberately left cleared: the text and attachments now
 * live on the bubble, where Retry resends them and Dismiss drops them.
 */
export function parkFailedOutgoingSend(args: {
  set: StoreApi<AppState>["setState"];
  taskId: string;
  workspaceId: string;
  draft: Parameters<typeof buildFailedOutgoingSend>[0]["draft"];
  error: unknown;
}): SendUserMessageResult {
  const failedSend = buildFailedOutgoingSend({
    id: crypto.randomUUID(),
    taskId: args.taskId,
    failedAt: buildRecentTimestamp(),
    draft: args.draft,
    error: args.error,
  });
  args.set((state) => ({
    failedSendsByTask: appendFailedOutgoingSend(
      state.failedSendsByTask,
      failedSend,
    ),
  }));
  return {
    status: "send-failed",
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    failedSendId: failedSend.id,
    message: failedSend.reason,
  };
}
