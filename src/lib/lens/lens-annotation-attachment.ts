import type { Attachment } from "@/types/chat";
import {
  DEFAULT_LENS_SESSION_ID,
  type LensAnnotation,
  type LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  formatAnnotationsDisplayForChat,
  formatAnnotationsForChat,
  resolveLensAnnotationReview,
} from "@/lib/lens/lens-element-message";

export const LENS_COMMENT_IMAGE_ID_PREFIX = "lens-comment-image:";

function buildLensAnnotationsAttachmentId(args: {
  workspaceId: string;
  lensSessionId?: string;
}) {
  return `lens-annotations:${args.workspaceId}${
    args.lensSessionId ? `:${args.lensSessionId}` : ""
  }`;
}

export function getLensCommentImageId(args: {
  workspaceId: string;
  lensSessionId?: string;
  annotationId: string;
}) {
  const sessionSegment = args.lensSessionId
    ? `${args.lensSessionId}:`
    : "";
  return `${LENS_COMMENT_IMAGE_ID_PREFIX}${args.workspaceId}:${sessionSegment}${args.annotationId}`;
}

export function isLensCommentImageAttachment(
  attachment: Attachment,
  workspaceId: string,
  lensSessionId?: string,
) {
  if (attachment.kind !== "image") {
    return false;
  }
  const workspacePrefix = `${LENS_COMMENT_IMAGE_ID_PREFIX}${workspaceId}:`;
  if (!lensSessionId) {
    return attachment.id.startsWith(workspacePrefix);
  }
  const sessionPrefix = `${workspacePrefix}${lensSessionId}:`;
  if (attachment.id.startsWith(sessionPrefix)) {
    return true;
  }
  const suffix = attachment.id.slice(workspacePrefix.length);
  return (
    lensSessionId === DEFAULT_LENS_SESSION_ID &&
    attachment.id.startsWith(workspacePrefix) &&
    !suffix.includes(":")
  );
}

export function isAnyLensCommentImageAttachment(attachment: Attachment) {
  return (
    attachment.kind === "image" &&
    attachment.id.startsWith(LENS_COMMENT_IMAGE_ID_PREFIX)
  );
}

export function removeLensCommentImageAttachments(args: {
  attachments: readonly Attachment[];
  workspaceId: string;
  lensSessionId?: string;
  annotationIds: readonly string[];
}): Attachment[] {
  const imageIds = new Set(
    args.annotationIds.map((annotationId) =>
      getLensCommentImageId({
        workspaceId: args.workspaceId,
        lensSessionId: args.lensSessionId,
        annotationId,
      }),
    ),
  );
  return args.attachments.filter(
    (attachment) =>
      attachment.kind !== "image" || !imageIds.has(attachment.id),
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
  lensSessionId?: string;
  annotations: readonly LensAnnotation[];
  sourceMappingConfig: LensSourceMappingConfig;
}): Extract<Attachment, { kind: "lens-annotations" }> {
  const annotations = [...args.annotations].sort(
    (left, right) => left.pin - right.pin,
  );
  return {
    kind: "lens-annotations",
    id: args.id ?? buildLensAnnotationsAttachmentId(args),
    workspaceId: args.workspaceId,
    ...(args.lensSessionId ? { lensSessionId: args.lensSessionId } : {}),
    label: "Lens comments",
    count: annotations.length,
    summary: annotations
      .map((annotation) => {
        const feedback = resolveLensAnnotationReview(annotation).feedback;
        return `${annotation.pin}. [${feedback.intent}/${feedback.priority}] ${feedback.comment.trim()}`;
      })
      .filter(Boolean)
      .join(" · "),
    content: formatAnnotationsForChat(annotations, args.sourceMappingConfig),
    displayContent: formatAnnotationsDisplayForChat(annotations),
    annotations,
  };
}

export function isTargetLensAnnotationsAttachment(
  attachment: Attachment,
  args: {
    workspaceId: string;
    lensSessionId?: string;
  },
): attachment is Extract<Attachment, { kind: "lens-annotations" }> {
  const targetSessionId = args.lensSessionId ?? DEFAULT_LENS_SESSION_ID;
  return (
    attachment.kind === "lens-annotations" &&
    (attachment.workspaceId === args.workspaceId ||
      attachment.id === `lens-annotations:${args.workspaceId}`) &&
    (attachment.lensSessionId ?? DEFAULT_LENS_SESSION_ID) === targetSessionId
  );
}

function preserveExistingAnnotationFeedback(args: {
  existing?: Extract<Attachment, { kind: "lens-annotations" }>;
  annotations: readonly LensAnnotation[];
}): LensAnnotation[] {
  const existingById = new Map(
    (args.existing?.annotations ?? []).map((annotation) => [
      annotation.id,
      annotation,
    ]),
  );

  return args.annotations.map((annotation) => {
    const existing = existingById.get(annotation.id);
    if (!existing) {
      return annotation;
    }
    const review = resolveLensAnnotationReview(annotation);
    const existingReview = resolveLensAnnotationReview(existing);
    if (review.page.documentId !== existingReview.page.documentId) {
      return annotation;
    }
    return {
      ...annotation,
      comment: existingReview.feedback.comment,
      review: {
        ...review,
        feedback: existingReview.feedback,
      },
    };
  });
}

export function upsertLensAnnotationsAttachment(args: {
  attachments: readonly Attachment[];
  workspaceId: string;
  lensSessionId?: string;
  annotations: readonly LensAnnotation[];
  sourceMappingConfig: LensSourceMappingConfig;
}) {
  const existingAttachment = args.attachments.find((attachment) =>
    isTargetLensAnnotationsAttachment(attachment, args),
  );
  const nextAttachments = args.attachments.filter(
    (attachment) => !isTargetLensAnnotationsAttachment(attachment, args),
  );
  if (args.annotations.length === 0) {
    return nextAttachments;
  }
  const annotations = preserveExistingAnnotationFeedback({
    existing: existingAttachment,
    annotations: args.annotations,
  });
  return [
    ...nextAttachments,
    buildLensAnnotationsAttachment({
      id: existingAttachment?.id,
      workspaceId: args.workspaceId,
      lensSessionId: args.lensSessionId,
      annotations,
      sourceMappingConfig: args.sourceMappingConfig,
    }),
  ];
}

export interface LensAnnotationSessionTarget {
  workspaceId: string;
  lensSessionId?: string;
}

/** Resolves and de-duplicates the Lens sessions cleared after prompt submit. */
export function resolveLensAnnotationClearTargets(args: {
  attachments: readonly Attachment[];
  fallbackWorkspaceId?: string;
}): LensAnnotationSessionTarget[] {
  const targets: LensAnnotationSessionTarget[] = [];
  const seen = new Set<string>();

  for (const attachment of args.attachments) {
    if (attachment.kind !== "lens-annotations") {
      continue;
    }
    const workspaceId = attachment.workspaceId ?? args.fallbackWorkspaceId;
    if (!workspaceId) {
      continue;
    }
    const key = `${workspaceId}\u0000${attachment.lensSessionId ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push({
      workspaceId,
      ...(attachment.lensSessionId
        ? { lensSessionId: attachment.lensSessionId }
        : {}),
    });
  }

  if (targets.length === 0 && args.fallbackWorkspaceId) {
    return [{ workspaceId: args.fallbackWorkspaceId }];
  }
  return targets;
}
