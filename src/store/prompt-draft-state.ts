import type { PromptDraft } from "@/types/chat";

export function hasPromptDraftPayload(
  draft: Pick<PromptDraft, "text" | "attachedFilePaths" | "attachments"> &
    Pick<Partial<PromptDraft>, "promptBatch">,
) {
  return (
    draft.text.trim().length > 0 ||
    draft.attachedFilePaths.length > 0 ||
    draft.attachments.length > 0 ||
    (draft.promptBatch ?? []).some(
      (item) =>
        item.content.trim().length > 0 ||
        (item.attachedFilePaths?.length ?? 0) > 0 ||
        (item.attachments?.length ?? 0) > 0,
    )
  );
}

export function buildClearedPromptDraft(
  draft?: PromptDraft | null,
): PromptDraft {
  return {
    text: "",
    attachedFilePaths: [],
    attachments: [],
    ...(draft?.runtimeOverrides
      ? { runtimeOverrides: draft.runtimeOverrides }
      : {}),
  };
}

export function buildClearedPromptDraftWithQueuedNextTurn(args: {
  draft?: PromptDraft | null;
  queuedTurns?: PromptDraft["queuedTurns"];
}): PromptDraft {
  const clearedDraft = buildClearedPromptDraft(args.draft);
  const queuedTurns = args.queuedTurns ?? args.draft?.queuedTurns;
  return queuedTurns?.length
    ? {
        ...clearedDraft,
        queuedTurns,
      }
    : clearedDraft;
}

export function normalizePromptDraftForStorage(
  draft: PromptDraft,
): PromptDraft {
  const promptBatch = (draft.promptBatch ?? []).filter(
    (item) =>
      item.content.trim().length > 0 ||
      (item.attachedFilePaths?.length ?? 0) > 0 ||
      (item.attachments?.length ?? 0) > 0,
  );
  const legacyQueuedTurn = draft.queuedNextTurn?.content?.trim()
    ? [
        {
          id: `legacy-${draft.queuedNextTurn.queuedAt}`,
          queuedAt: draft.queuedNextTurn.queuedAt,
          sourceTurnId: draft.queuedNextTurn.sourceTurnId,
          content: draft.queuedNextTurn.content,
          attachedFilePaths: [],
          attachments: [],
        },
      ]
    : [];
  const queuedTurns = [
    ...(draft.queuedTurns ?? []),
    ...legacyQueuedTurn,
  ].filter(
    (item) =>
      item.content.trim().length > 0 ||
      item.attachedFilePaths.length > 0 ||
      item.attachments.length > 0,
  );
  const nextDraft: PromptDraft = {
    ...draft,
    ...(promptBatch.length > 0 ? { promptBatch } : { promptBatch: undefined }),
    ...(queuedTurns.length > 0 ? { queuedTurns } : { queuedTurns: undefined }),
    queuedNextTurn: undefined,
  };
  if (
    hasPromptDraftPayload(nextDraft) ||
    (nextDraft.queuedTurns?.length ?? 0) > 0
  ) {
    return nextDraft;
  }
  return buildClearedPromptDraft(nextDraft);
}

export function arePromptDraftQueuedTurnsEqual(
  left?: PromptDraft["queuedTurns"],
  right?: PromptDraft["queuedTurns"],
) {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  return (
    leftItems.length === rightItems.length &&
    leftItems.every((item, index) => {
      const other = rightItems[index];
      return (
        other?.id === item.id &&
        other.queuedAt === item.queuedAt &&
        other.sourceTurnId === item.sourceTurnId &&
        other.content === item.content &&
        other.attachedFilePaths.length === item.attachedFilePaths.length &&
        other.attachedFilePaths.every(
          (path, pathIndex) => path === item.attachedFilePaths[pathIndex],
        ) &&
        other.attachments.length === item.attachments.length &&
        other.attachments.every(
          (attachment, attachmentIndex) =>
            attachment === item.attachments[attachmentIndex],
        )
      );
    })
  );
}

export function arePromptDraftBatchItemsEqual(
  left?: PromptDraft["promptBatch"],
  right?: PromptDraft["promptBatch"],
) {
  const leftItems = left ?? [];
  const rightItems = right ?? [];
  return (
    leftItems.length === rightItems.length &&
    leftItems.every((item, index) => {
      const other = rightItems[index];
      const itemFilePaths = item.attachedFilePaths ?? [];
      const otherFilePaths = other?.attachedFilePaths ?? [];
      const itemAttachments = item.attachments ?? [];
      const otherAttachments = other?.attachments ?? [];
      return (
        other?.id === item.id &&
        other.createdAt === item.createdAt &&
        other.content === item.content &&
        otherFilePaths.length === itemFilePaths.length &&
        otherFilePaths.every(
          (path, pathIndex) => path === itemFilePaths[pathIndex],
        ) &&
        otherAttachments.length === itemAttachments.length &&
        otherAttachments.every(
          (attachment, attachmentIndex) =>
            attachment === itemAttachments[attachmentIndex],
        )
      );
    })
  );
}
