import {
  buildClearedPromptDraftWithQueuedNextTurn,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import type {
  PromptDraft,
  PromptDraftQueuedTurn,
  PromptDraftRuntimeOverrides,
} from "@/types/chat";

export function buildPromptDraftForSend(args: {
  content: string;
  preservePromptDraft?: boolean;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  sourceDraft: PromptDraft;
  storedDraft?: PromptDraft;
  queuedTurn?: PromptDraftQueuedTurn;
  remainingQueuedTurns?: PromptDraft["queuedTurns"];
}): PromptDraft {
  if (args.preservePromptDraft) {
    return normalizePromptDraftForStorage({
      text: args.content,
      attachedFilePaths: [],
      attachments: [],
      runtimeOverrides: args.runtimeOverrides,
    });
  }

  return normalizePromptDraftForStorage({
    ...(args.storedDraft ?? args.sourceDraft),
    ...(args.queuedTurn
      ? {
          // A queued turn supplies the payload while the composer stays stored.
          text: args.queuedTurn.content,
          attachedFilePaths: args.queuedTurn.attachedFilePaths,
          attachments: args.queuedTurn.attachments,
          promptBatch: undefined,
          queuedTurns: args.remainingQueuedTurns,
        }
      : {
          text: args.content,
          queuedTurns: args.storedDraft?.queuedTurns,
        }),
    ...(args.runtimeOverrides
      ? { runtimeOverrides: args.runtimeOverrides }
      : undefined),
    queuedNextTurn: undefined,
  });
}

export function resolvePromptDraftSendState(args: {
  content: string;
  preservePromptDraft?: boolean;
  runtimeOverrides?: PromptDraftRuntimeOverrides;
  sourceDraft: PromptDraft;
  storedDraft?: PromptDraft;
  queuedTurnId?: string;
}): {
  promptDraft: PromptDraft;
  queuedTurnToSend?: PromptDraftQueuedTurn;
  remainingQueuedTurns?: PromptDraft["queuedTurns"];
} | null {
  const queuedTurnToSend = args.queuedTurnId
    ? args.storedDraft?.queuedTurns?.find(
        (item) => item.id === args.queuedTurnId,
      )
    : undefined;
  if (args.queuedTurnId && !queuedTurnToSend) {
    return null;
  }
  const remainingQueuedTurns = queuedTurnToSend
    ? (args.storedDraft?.queuedTurns ?? []).filter(
        (item) => item.id !== queuedTurnToSend.id,
      )
    : undefined;

  return {
    queuedTurnToSend,
    remainingQueuedTurns,
    promptDraft: buildPromptDraftForSend({
      ...args,
      queuedTurn: queuedTurnToSend,
      remainingQueuedTurns,
    }),
  };
}

export function buildPreservedQueuedDraft(args: {
  sourceDraft: PromptDraft;
  queuedTurn?: PromptDraftQueuedTurn;
  queuedTurns?: PromptDraft["queuedTurns"];
  remainingQueuedTurns?: PromptDraft["queuedTurns"];
}): PromptDraft | null {
  if (!args.queuedTurn) {
    return null;
  }
  return normalizePromptDraftForStorage({
    ...args.sourceDraft,
    queuedTurns: args.queuedTurns
      ? [...args.queuedTurns, ...(args.remainingQueuedTurns ?? [])]
      : args.remainingQueuedTurns,
    queuedNextTurn: undefined,
  });
}

export function resolvePromptDraftAfterSend(args: {
  currentDraft?: PromptDraft;
  storedDraft?: PromptDraft;
  sourceDraft: PromptDraft;
  sentDraft: PromptDraft;
  preservePromptDraft?: boolean;
  preservedQueuedDraft?: PromptDraft | null;
  queuedTurns?: PromptDraft["queuedTurns"];
}): PromptDraft {
  if (args.preservePromptDraft) {
    return args.currentDraft ?? args.storedDraft ?? args.sourceDraft;
  }
  if (args.preservedQueuedDraft) {
    return args.currentDraft ?? args.preservedQueuedDraft;
  }
  return buildClearedPromptDraftWithQueuedNextTurn({
    draft: args.currentDraft ?? args.sentDraft,
    queuedTurns: args.queuedTurns,
  });
}
