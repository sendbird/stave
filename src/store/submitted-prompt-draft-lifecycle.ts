import {
  buildClearedPromptDraft,
  buildClearedPromptDraftWithQueuedNextTurn,
  hasPromptDraftPayload,
} from "@/store/prompt-draft-state";
import type { PromptDraft, PromptDraftQueuedTurn } from "@/types/chat";

/**
 * The composer draft's optimistic clear/restore around one send.
 *
 * A send clears the composer immediately so typing feels instant, and puts the
 * draft back when the send never leaves the app (a guard rejects it, or a
 * queued item returns to the queue). Once the turn is committed to the
 * provider the draft must never come back, so `commit` closes the window.
 *
 * Text typed into the composer after the clear is never overwritten: a restore
 * that finds the composer holding new text keeps it and parks the unsent
 * prompt through `parkUnsentPrompt` instead.
 */
export interface SubmittedPromptDraftLifecycle {
  clear: () => void;
  /**
   * No-op after {@link commit}, or when the draft was preserved. Keeps text
   * typed since the clear, parking the unsent prompt instead.
   */
  restore: () => void;
  commit: () => void;
  isCommitted: () => boolean;
}

export function createSubmittedPromptDraftLifecycle(args: {
  taskId: string;
  sourceTaskId: string;
  preservePromptDraft?: boolean;
  promptDraft: PromptDraft;
  /** Composer state to clear or restore when the payload has turn-only overrides. */
  composerDraft?: PromptDraft;
  sourcePromptDraft: PromptDraft;
  storedDraft?: PromptDraft;
  preservedQueuedDispatchDraft?: PromptDraft | null;
  queuedTurns?: PromptDraftQueuedTurn[];
  queuedTurnToSend?: PromptDraftQueuedTurn;
  updateDrafts: (drafts: Record<string, PromptDraft>) => void;
  /**
   * The composer was cleared before this lifecycle began (an agent-run start
   * the host refused, awaited after its own clear), so what it holds now was
   * typed since the send and `clear` leaves it alone.
   */
  composerClearedAtSend?: boolean;
  /** The task's composer draft as it is now. */
  readCurrentDraft?: () => PromptDraft | undefined;
  /** Surfaces the unsent prompt when a restore keeps text typed since the send. */
  parkUnsentPrompt?: () => void;
}): SubmittedPromptDraftLifecycle {
  let cleared = false;
  let committed = false;
  const sourceDraftEntry =
    args.sourceTaskId !== args.taskId
      ? { [args.sourceTaskId]: args.sourcePromptDraft }
      : {};
  const composerDraft = args.composerDraft ?? args.promptDraft;
  return {
    clear: () => {
      if (args.preservePromptDraft || cleared) {
        return;
      }
      cleared = true;
      const drafts: Record<string, PromptDraft> = {};
      // Already cleared at send: keep what the composer holds now, adding only
      // the turns this send queues.
      const current = args.composerClearedAtSend
        ? args.readCurrentDraft?.()
        : undefined;
      if (!current) {
        drafts[args.taskId] =
          args.preservedQueuedDispatchDraft ??
          buildClearedPromptDraftWithQueuedNextTurn({
            draft: composerDraft,
            queuedTurns: args.queuedTurns,
          });
      } else if (args.queuedTurns) {
        drafts[args.taskId] = { ...current, queuedTurns: args.queuedTurns };
      }
      if (args.sourceTaskId !== args.taskId) {
        drafts[args.sourceTaskId] = buildClearedPromptDraft(
          args.sourcePromptDraft,
        );
      }
      if (Object.keys(drafts).length > 0) {
        args.updateDrafts(drafts);
      }
    },
    restore: () => {
      if (!cleared) {
        return;
      }
      cleared = false;
      const current = args.queuedTurnToSend
        ? undefined
        : args.readCurrentDraft?.();
      if (current && hasPromptDraftPayload(current)) {
        args.parkUnsentPrompt?.();
        return;
      }
      args.updateDrafts({
        // For a failed queued-turn dispatch, put the original stored draft
        // back (the item returns to the queue untouched).
        [args.taskId]: args.queuedTurnToSend
          ? (args.storedDraft ?? args.sourcePromptDraft)
          : composerDraft,
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
