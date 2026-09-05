import {
  buildClearedPromptDraft,
  buildClearedPromptDraftWithQueuedNextTurn,
} from "@/store/prompt-draft-state";
import type { PromptDraft, PromptDraftQueuedTurn } from "@/types/chat";

/**
 * The composer draft's optimistic clear/restore around one send.
 *
 * A send clears the composer immediately so typing feels instant, and puts the
 * draft back when the send never leaves the app (a guard rejects it, or a
 * queued item returns to the queue). Once the turn is committed to the
 * provider the draft must never come back, so `commit` closes the window.
 */
export interface SubmittedPromptDraftLifecycle {
  clear: () => void;
  /** No-op after {@link commit}, or when the draft was preserved. */
  restore: () => void;
  commit: () => void;
  isCommitted: () => boolean;
}

export function createSubmittedPromptDraftLifecycle(args: {
  taskId: string;
  sourceTaskId: string;
  preservePromptDraft?: boolean;
  promptDraft: PromptDraft;
  sourcePromptDraft: PromptDraft;
  storedDraft?: PromptDraft;
  preservedQueuedDispatchDraft?: PromptDraft | null;
  queuedTurns?: PromptDraftQueuedTurn[];
  queuedTurnToSend?: PromptDraftQueuedTurn;
  updateDrafts: (drafts: Record<string, PromptDraft>) => void;
}): SubmittedPromptDraftLifecycle {
  let cleared = false;
  let committed = false;
  const sourceDraftEntry =
    args.sourceTaskId !== args.taskId
      ? { [args.sourceTaskId]: args.sourcePromptDraft }
      : {};
  return {
    clear: () => {
      if (args.preservePromptDraft || cleared) {
        return;
      }
      cleared = true;
      args.updateDrafts({
        [args.taskId]:
          args.preservedQueuedDispatchDraft ??
          buildClearedPromptDraftWithQueuedNextTurn({
            draft: args.promptDraft,
            queuedTurns: args.queuedTurns,
          }),
        ...(args.sourceTaskId !== args.taskId
          ? {
              [args.sourceTaskId]: buildClearedPromptDraft(
                args.sourcePromptDraft,
              ),
            }
          : {}),
      });
    },
    restore: () => {
      if (!cleared) {
        return;
      }
      cleared = false;
      args.updateDrafts({
        // For a failed queued-turn dispatch, put the original stored draft
        // back (the item returns to the queue untouched).
        [args.taskId]: args.queuedTurnToSend
          ? (args.storedDraft ?? args.sourcePromptDraft)
          : args.promptDraft,
        ...sourceDraftEntry,
      });
    },
    commit: () => {
      cleared = false;
      committed = true;
    },
    isCommitted: () => committed,
  };
}
