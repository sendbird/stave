import {
  getLensCommentImageId,
  shouldIncludeImageAttachmentAsProviderContext,
} from "@/lib/lens/lens-annotation-attachment";
import type { Attachment, MessagePart, PromptDraft } from "@/types/chat";

export function getImageAttachmentMimeType(
  attachment: Extract<Attachment, { kind: "image" }>,
) {
  return attachment.mimeType?.trim() || "image/png";
}

export function buildPromptDraftContentForSend(draft: PromptDraft): string {
  return [
    ...(draft.promptBatch ?? []).map((item) => item.content.trim()),
    draft.text.trim(),
    ...draft.attachments
      .filter(
        (
          attachment,
        ): attachment is Extract<Attachment, { kind: "lens-annotations" }> =>
          attachment.kind === "lens-annotations",
      )
      .map((attachment) => attachment.content.trim()),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildPromptDraftDisplayContentForSend(
  draft: PromptDraft,
): string {
  return [
    ...(draft.promptBatch ?? []).map((item) => item.content.trim()),
    draft.text.trim(),
    ...draft.attachments
      .filter(
        (
          attachment,
        ): attachment is Extract<Attachment, { kind: "lens-annotations" }> =>
          attachment.kind === "lens-annotations",
      )
      .map((attachment) =>
        (attachment.displayContent ?? attachment.content).trim(),
      ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildPromptDraftDisplayPartsForSend(
  draft: PromptDraft,
): MessagePart[] | undefined {
  const parts: MessagePart[] = [];
  let hasLensAnnotation = false;
  let hasWorkspaceInformationReference = false;

  for (const item of draft.promptBatch ?? []) {
    const text = item.content.trim();
    if (text) parts.push({ type: "text", text });
    for (const attachment of item.attachments ?? []) {
      if (shouldIncludeImageAttachmentAsProviderContext(attachment, true)) {
        parts.push({
          type: "image_context",
          dataUrl: attachment.dataUrl,
          label: attachment.label,
          mimeType: getImageAttachmentMimeType(attachment),
        });
      }
    }
  }

  const draftText = draft.text.trim();
  if (draftText) parts.push({ type: "text", text: draftText });

  for (const attachment of draft.attachments) {
    if (attachment.kind !== "workspace-information") continue;
    hasWorkspaceInformationReference = true;
    parts.push({
      type: "workspace_information_context",
      reference: attachment.reference,
    });
  }

  const imageAttachmentsById = new Map(
    draft.attachments
      .filter(
        (attachment): attachment is Extract<Attachment, { kind: "image" }> =>
          attachment.kind === "image",
      )
      .map((attachment) => [attachment.id, attachment]),
  );

  for (const attachment of draft.attachments) {
    if (attachment.kind !== "lens-annotations") continue;
    hasLensAnnotation = true;
    for (const annotation of attachment.annotations ?? []) {
      const screenshot = attachment.workspaceId
        ? imageAttachmentsById.get(
            getLensCommentImageId({
              workspaceId: attachment.workspaceId,
              lensSessionId: attachment.lensSessionId,
              annotationId: annotation.id,
            }),
          )
        : null;
      if (screenshot) {
        parts.push({
          type: "image_context",
          dataUrl: screenshot.dataUrl,
          label:
            annotation.comment.trim() || `Visual comment ${annotation.pin}`,
          mimeType: getImageAttachmentMimeType(screenshot),
        });
        continue;
      }
      const comment = annotation.comment.trim();
      if (comment) parts.push({ type: "text", text: comment });
    }
  }

  const hasBatchAttachment = (draft.promptBatch ?? []).some(
    (item) => (item.attachments?.length ?? 0) > 0,
  );
  const hasStructuredContent =
    hasLensAnnotation ||
    hasBatchAttachment ||
    hasWorkspaceInformationReference;
  return hasStructuredContent && parts.length > 0 ? parts : undefined;
}
