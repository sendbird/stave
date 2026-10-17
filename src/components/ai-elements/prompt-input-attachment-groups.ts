import { useMemo } from "react";
import type { Attachment, PromptDraftBatchItem } from "@/types/chat";
import { isAnyLensCommentImageAttachment } from "@/lib/lens/lens-annotation-attachment";
import type { DocumentContextAttachment } from "@/lib/documents/attached-document-context";
import type { TaskContextAttachment } from "@/lib/task-context/attached-task-context";

/**
 * Splits the draft's attachments by kind and counts what the attachment row
 * and the comment batch show.
 */
export function usePromptInputAttachmentGroups(args: {
  attachments?: Attachment[];
  attachedFilePaths: string[];
  promptBatch: readonly PromptDraftBatchItem[];
}) {
  const { attachments, attachedFilePaths, promptBatch } = args;
  const imageAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (a): a is Extract<Attachment, { kind: "image" }> => a.kind === "image",
      ),
    [attachments],
  );
  const standaloneImageAttachments = useMemo(
    () => imageAttachments.filter((a) => !isAnyLensCommentImageAttachment(a)),
    [imageAttachments],
  );
  const imageAttachmentsById = useMemo(
    () =>
      new Map(
        imageAttachments.map((attachment) => [attachment.id, attachment]),
      ),
    [imageAttachments],
  );
  const lensAnnotationAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (
          attachment,
        ): attachment is Extract<Attachment, { kind: "lens-annotations" }> =>
          attachment.kind === "lens-annotations",
      ),
    [attachments],
  );
  const workspaceInformationAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (
          attachment,
        ): attachment is Extract<
          Attachment,
          { kind: "workspace-information" }
        > => attachment.kind === "workspace-information",
      ),
    [attachments],
  );
  const taskContextAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (attachment): attachment is TaskContextAttachment =>
          attachment.kind === "task-context",
      ),
    [attachments],
  );
  const documentContextAttachments = useMemo(
    () =>
      (attachments ?? []).filter(
        (attachment): attachment is DocumentContextAttachment =>
          attachment.kind === "document-context",
      ),
    [attachments],
  );
  const referenceAttachments = useMemo(
    () => [
      ...workspaceInformationAttachments,
      ...taskContextAttachments,
      ...documentContextAttachments,
    ],
    [documentContextAttachments, taskContextAttachments, workspaceInformationAttachments],
  );
  const currentAttachmentCount =
    attachedFilePaths.length +
    standaloneImageAttachments.length +
    referenceAttachments.length;
  const lensCommentCount = lensAnnotationAttachments.reduce(
    (count, attachment) =>
      count + (attachment.annotations?.length ?? attachment.count),
    0,
  );
  const commentItemCount = promptBatch.length + lensCommentCount;

  return {
    imageAttachments,
    standaloneImageAttachments,
    imageAttachmentsById,
    lensAnnotationAttachments,
    workspaceInformationAttachments,
    taskContextAttachments,
    documentContextAttachments,
    referenceAttachments,
    currentAttachmentCount,
    commentItemCount,
  };
}
