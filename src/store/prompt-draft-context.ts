import { shouldIncludeImageAttachmentAsProviderContext } from "@/lib/lens/lens-annotation-attachment";
import { extractWorkspaceInformationReferencesFromText } from "@/lib/workspace-information-references";
import { buildRecentTimestamp } from "@/store/chat-state-helpers";
import { resolveLanguage } from "@/store/editor.utils";
import {
  buildPromptDraftContentForSend,
  getImageAttachmentMimeType,
} from "@/store/prompt-draft-message-content";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type {
  Attachment,
  PromptDraft,
  PromptDraftQueuedTurn,
} from "@/types/chat";

export type DraftImageContext = {
  dataUrl: string;
  label: string;
  mimeType: string;
};

export type DraftFileContext = {
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
};

export function getPromptDraftAttachedFilePaths(draft: PromptDraft) {
  return [
    ...draft.attachedFilePaths,
    ...(draft.promptBatch ?? []).flatMap(
      (item) => item.attachedFilePaths ?? [],
    ),
  ];
}

export function getPromptDraftAttachments(draft: PromptDraft) {
  return [
    ...draft.attachments,
    ...(draft.promptBatch ?? []).flatMap((item) => item.attachments ?? []),
  ];
}

export function promptDraftReferencesLens(draft: PromptDraft) {
  const attachmentHasLens = getPromptDraftAttachments(draft).some(
    (attachment) =>
      attachment.kind === "workspace-information" &&
      attachment.reference.section === "lens",
  );
  if (attachmentHasLens) {
    return true;
  }
  return [
    draft.text,
    ...(draft.promptBatch ?? []).map((item) => item.content),
    ...(draft.queuedTurns ?? []).map((item) => item.content),
  ].some((text) =>
    extractWorkspaceInformationReferencesFromText(text).some(
      (reference) => reference.section === "lens",
    ),
  );
}

export function buildQueuedTurnFromDraft(args: {
  draft: PromptDraft;
  sourceTurnId?: string;
  content?: string;
}): PromptDraftQueuedTurn {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    queuedAt: buildRecentTimestamp(),
    sourceTurnId: args.sourceTurnId,
    content: args.content ?? buildPromptDraftContentForSend(args.draft),
    attachedFilePaths: getPromptDraftAttachedFilePaths(args.draft),
    attachments: getPromptDraftAttachments(args.draft),
  };
}

export function getDraftImageContexts(args: {
  promptDraft: PromptDraft;
  imageContexts?: DraftImageContext[];
  includeLensCommentImages?: boolean;
}): DraftImageContext[] {
  const contexts: DraftImageContext[] = [];
  const seen = new Set<string>();
  const addContext = (context: DraftImageContext) => {
    const key = `${context.mimeType}\n${context.label}\n${context.dataUrl}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    contexts.push(context);
  };

  for (const context of args.imageContexts ?? []) {
    addContext(context);
  }

  const includeLensCommentImages = args.includeLensCommentImages === true;
  const imageAttachments = getPromptDraftAttachments(args.promptDraft).filter(
    (attachment): attachment is Extract<Attachment, { kind: "image" }> =>
      shouldIncludeImageAttachmentAsProviderContext(
        attachment,
        includeLensCommentImages,
      ),
  );

  for (const attachment of imageAttachments) {
    addContext({
      dataUrl: attachment.dataUrl,
      label: attachment.label,
      mimeType: getImageAttachmentMimeType(attachment),
    });
  }

  return contexts;
}

export async function getDraftFileContexts(args: {
  promptDraft: PromptDraft;
  session: Pick<WorkspaceSessionState, "editorTabs">;
  workspaceRootPath?: string | null;
  fileContexts?: DraftFileContext[];
}): Promise<DraftFileContext[]> {
  const nextFileContexts: DraftFileContext[] = [];
  const seenFilePaths = new Set<string>();
  const readFile = window.api?.fs?.readFile;
  for (const context of args.fileContexts ?? []) {
    if (!context.filePath || seenFilePaths.has(context.filePath)) {
      continue;
    }
    seenFilePaths.add(context.filePath);
    nextFileContexts.push(context);
  }

  const attachedFilePaths = getPromptDraftAttachedFilePaths(args.promptDraft);

  for (const filePath of attachedFilePaths) {
    if (!filePath || seenFilePaths.has(filePath)) {
      continue;
    }
    seenFilePaths.add(filePath);

    const openTab = args.session.editorTabs.find(
      (tab) =>
        tab.filePath === filePath &&
        tab.kind !== "image" &&
        (!tab.contentState || tab.contentState === "ready"),
    );
    if (openTab) {
      nextFileContexts.push({
        filePath: openTab.filePath,
        content: openTab.content,
        language: openTab.language,
      });
      continue;
    }

    if (!args.workspaceRootPath || !readFile) {
      continue;
    }

    const result = await readFile({
      rootPath: args.workspaceRootPath,
      filePath,
    });
    if (!result.ok) {
      continue;
    }

    nextFileContexts.push({
      filePath,
      content: result.content,
      language: resolveLanguage({ filePath }),
    });
  }

  return nextFileContexts;
}
