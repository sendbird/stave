import type { Attachment, ChatMessage } from "@/types/chat";
import type { LensSourceMappingConfig } from "./lens.types";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
} from "./lens-annotation-attachment";

/** Read the latest sent feedback from its existing, persisted conversation. */
export function getSentLensFeedback(
  messages: readonly ChatMessage[] | undefined,
  target: {
    workspaceId: string;
    lensSessionId: string;
    sourceMappingConfig: LensSourceMappingConfig;
  },
): Attachment[] {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index--) {
    const message = messages![index]!;
    if (message.role !== "user") continue;
    const annotations = [];
    const images: Attachment[] = [];
    for (const part of message.displayParts ?? []) {
      if (part.type !== "text" && part.type !== "image_context") continue;
      const reference = part.lensFeedback;
      if (
        !reference ||
        reference.workspaceId !== target.workspaceId ||
        reference.lensSessionId !== target.lensSessionId
      )
        continue;
      annotations.push(reference.annotation);
      if (part.type === "image_context")
        images.push({
          kind: "image",
          id: getLensCommentImageId({
            ...target,
            annotationId: reference.annotation.id,
          }),
          dataUrl: part.dataUrl,
          label: part.label,
          mimeType: part.mimeType,
        });
    }
    if (annotations.length)
      return [
        buildLensAnnotationsAttachment({ ...target, annotations }),
        ...images,
      ];
  }
  return [];
}
