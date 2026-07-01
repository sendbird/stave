import type { Attachment } from "@/types/chat";
import type {
  LensAnnotation,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  formatAnnotationsDisplayForChat,
  formatAnnotationsForChat,
} from "@/lib/lens/lens-element-message";

export const LENS_COMMENT_IMAGE_ID_PREFIX = "lens-comment-image:";

export function getLensCommentImageId(args: {
  workspaceId: string;
  annotationId: string;
}) {
  return `${LENS_COMMENT_IMAGE_ID_PREFIX}${args.workspaceId}:${args.annotationId}`;
}

export function isLensCommentImageAttachment(
  attachment: Attachment,
  workspaceId: string,
) {
  return (
    attachment.kind === "image" &&
    attachment.id.startsWith(`${LENS_COMMENT_IMAGE_ID_PREFIX}${workspaceId}:`)
  );
}

export function isAnyLensCommentImageAttachment(attachment: Attachment) {
  return (
    attachment.kind === "image" &&
    attachment.id.startsWith(LENS_COMMENT_IMAGE_ID_PREFIX)
  );
}

export function shouldIncludeImageAttachmentAsProviderContext(
  attachment: Attachment,
  includeLensCommentImages: boolean,
): attachment is Extract<Attachment, { kind: "image" }> {
  return (
    attachment.kind === "image" &&
    (includeLensCommentImages || !isAnyLensCommentImageAttachment(attachment))
  );
}

export function buildLensAnnotationsAttachment(args: {
  id?: string;
  workspaceId: string;
  annotations: readonly LensAnnotation[];
  sourceMappingConfig: LensSourceMappingConfig;
}): Extract<Attachment, { kind: "lens-annotations" }> {
  const annotations = [...args.annotations].sort(
    (left, right) => left.pin - right.pin,
  );
  return {
    kind: "lens-annotations",
    id: args.id ?? `lens-annotations:${args.workspaceId}`,
    workspaceId: args.workspaceId,
    label: "Lens comments",
    count: annotations.length,
    summary: annotations
      .map((annotation) => `${annotation.pin}. ${annotation.comment.trim()}`)
      .filter(Boolean)
      .join(" · "),
    content: formatAnnotationsForChat(annotations, args.sourceMappingConfig),
    displayContent: formatAnnotationsDisplayForChat(annotations),
    annotations,
  };
}

export function upsertLensAnnotationsAttachment(args: {
  attachments: readonly Attachment[];
  workspaceId: string;
  annotations: readonly LensAnnotation[];
  sourceMappingConfig: LensSourceMappingConfig;
}) {
  const nextAttachments = args.attachments.filter(
    (attachment) =>
      !(
        attachment.kind === "lens-annotations" &&
        (attachment.workspaceId === args.workspaceId ||
          attachment.id === `lens-annotations:${args.workspaceId}`)
      ),
  );
  if (args.annotations.length === 0) {
    return nextAttachments;
  }
  return [
    ...nextAttachments,
    buildLensAnnotationsAttachment({
      workspaceId: args.workspaceId,
      annotations: args.annotations,
      sourceMappingConfig: args.sourceMappingConfig,
    }),
  ];
}
