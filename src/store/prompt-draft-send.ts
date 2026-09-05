import {
  buildClearedPromptDraftWithQueuedNextTurn,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import type {
  Attachment,
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
  payloadAttachedFilePaths?: string[];
  payloadAttachments?: Attachment[];
}): PromptDraft {
  if (args.preservePromptDraft) {
    // The composer stays untouched, so the payload can only come from the
    // caller — a retried send passes the attachments the failed attempt had.
    return normalizePromptDraftForStorage({
      text: args.content,
      attachedFilePaths: args.payloadAttachedFilePaths ?? [],
      attachments: args.payloadAttachments ?? [],
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
  payloadAttachedFilePaths?: string[];
  payloadAttachments?: Attachment[];
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

/**
 * The prompt-draft map to store after a mid-turn steer succeeds.
 *
 * Two shapes, depending on where the steered payload came from. Steering the
 * composer's own text clears it — but only while the composer still holds
 * exactly what was sent, so a newer draft typed while the steer was in flight
 * survives. Steering a staged queue item instead leaves the composer entirely
 * alone and drops just that one item from the queue; every other queued item
 * keeps waiting for its automatic dispatch.
 */
export function applySteeredPromptDraft(args: {
  promptDraftByTask: Record<string, PromptDraft>;
  taskId: string;
  storedDraft?: PromptDraft;
  sourceDraft: PromptDraft;
  sentDraft: PromptDraft;
  preservePromptDraft?: boolean;
  steeredQueuedTurn?: PromptDraftQueuedTurn;
}): Record<string, PromptDraft> {
  const currentDraft = args.promptDraftByTask[args.taskId];
  if (args.steeredQueuedTurn) {
    const steeredId = args.steeredQueuedTurn.id;
    const baseDraft = currentDraft ?? args.storedDraft ?? args.sourceDraft;
    return {
      ...args.promptDraftByTask,
      [args.taskId]: normalizePromptDraftForStorage({
        ...baseDraft,
        queuedTurns: (baseDraft.queuedTurns ?? []).filter(
          (item) => item.id !== steeredId,
        ),
        queuedNextTurn: undefined,
      }),
    };
  }
  if (args.preservePromptDraft || currentDraft?.text !== args.sentDraft.text) {
    return args.promptDraftByTask;
  }
  return {
    ...args.promptDraftByTask,
    [args.taskId]: normalizePromptDraftForStorage({
      ...(currentDraft ?? args.sourceDraft),
      text: "",
      attachedFilePaths: [],
      attachments: [],
      promptBatch: undefined,
    }),
  };
}
