import type { Attachment } from "@/types/chat";
import type {
  LensAnnotation,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import { formatAnnotationsForChat } from "@/lib/lens/lens-element-message";

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
