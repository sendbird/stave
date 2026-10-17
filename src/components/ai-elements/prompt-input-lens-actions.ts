import { i18n } from "@/i18n";
import { useCallback, useMemo } from "react";
import { toast } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import type { Attachment } from "@/types/chat";
import type {
  LensAnnotationFeedback,
  LensAnnotation,
  LensStyleEdit,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import {
  buildLensAnnotationsAttachment,
  removeLensCommentImageAttachments,
} from "@/lib/lens/lens-annotation-attachment";
import { resolveLensAnnotationReview } from "@/lib/lens/lens-element-message";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * Edits the Lens annotations attached to the draft: feedback, element style
 * changes applied through Lens, and removal (which also drops the
 * annotation's screenshot attachment).
 */
export function usePromptInputLensAnnotationActions(args: {
  attachments?: Attachment[];
  onAttachmentsChange?: PromptInputProps["onAttachmentsChange"];
}) {
  const { attachments, onAttachmentsChange } = args;
  const lensSourceMappingHeuristic = useAppStore(
    (state) => state.settings.lensSourceMappingHeuristic,
  );
  const lensSourceMappingReactDebugSource = useAppStore(
    (state) => state.settings.lensSourceMappingReactDebugSource,
  );
  const lensSourceMappingConfig = useMemo(
    (): LensSourceMappingConfig => ({
      heuristic: lensSourceMappingHeuristic,
      reactDebugSource: lensSourceMappingReactDebugSource,
    }),
    [lensSourceMappingHeuristic, lensSourceMappingReactDebugSource],
  );

  const updateLensAnnotationAttachment = useCallback(
    (args: {
      attachment: Extract<Attachment, { kind: "lens-annotations" }>;
      annotations: readonly LensAnnotation[];
      removeImageAnnotationIds?: readonly string[];
    }) => {
      if (!args.attachment.workspaceId || !onAttachmentsChange) {
        return;
      }
      const currentAttachments = attachments ?? [];
      const retainedAttachments = removeLensCommentImageAttachments({
        attachments: currentAttachments,
        workspaceId: args.attachment.workspaceId,
        lensSessionId: args.attachment.lensSessionId,
        annotationIds: args.removeImageAnnotationIds ?? [],
      });
      const nextAttachment =
        args.annotations.length > 0
          ? buildLensAnnotationsAttachment({
              id: args.attachment.id,
              workspaceId: args.attachment.workspaceId,
              lensSessionId: args.attachment.lensSessionId,
              annotations: args.annotations,
              sourceMappingConfig: lensSourceMappingConfig,
            })
          : null;
      onAttachmentsChange({
        attachments: retainedAttachments.flatMap((candidate) => {
          if (
            candidate.kind === "lens-annotations" &&
            candidate.id === args.attachment.id
          ) {
            return nextAttachment ? [nextAttachment] : [];
          }
          return [candidate];
        }),
      });
    },
    [attachments, lensSourceMappingConfig, onAttachmentsChange],
  );

  const applyLensAnnotationFeedback = useCallback(
    (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
      feedback: LensAnnotationFeedback,
    ) => {
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).map((candidate) => {
          if (candidate.id !== annotation.id) {
            return candidate;
          }
          const review = resolveLensAnnotationReview(candidate);
          return {
            ...candidate,
            comment: feedback.comment,
            review: {
              ...review,
              feedback,
            },
          };
        }),
      });
    },
    [updateLensAnnotationAttachment],
  );

  const removeLensAnnotation = useCallback(
    async (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
    ) => {
      if (attachment.workspaceId) {
        const result = await window.api?.lens?.removeAnnotation?.({
          workspaceId: attachment.workspaceId,
          lensSessionId: attachment.lensSessionId,
          annotationId: annotation.id,
          documentId: resolveLensAnnotationReview(annotation).page.documentId,
        });
        if (!result?.ok) {
          toast.error(i18n.t("composer:promptInput.copy"), {
            description:
              result?.message ?? i18n.t("composer:promptInput.description"),
          });
        }
      }
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).filter(
          (candidate) => candidate.id !== annotation.id,
        ),
        removeImageAnnotationIds: [annotation.id],
      });
    },
    [updateLensAnnotationAttachment, i18n.language],
  );

  const applyLensAnnotationStyle = useCallback(
    async (
      attachment: Extract<Attachment, { kind: "lens-annotations" }>,
      annotation: LensAnnotation,
      patch: Record<string, string>,
    ) => {
      if (!attachment.workspaceId || !annotation.selector) {
        return;
      }

      const result = await window.api?.lens?.setElementStyle?.({
        workspaceId: attachment.workspaceId,
        lensSessionId: attachment.lensSessionId,
        annotationId: annotation.id,
        selector: annotation.selector,
        patch,
        documentId: resolveLensAnnotationReview(annotation).page.documentId,
      });

      if (!result?.ok || !result.edits) {
        toast.error(i18n.t("composer:promptInput.copy2"), {
          description: result?.message ?? i18n.t("composer:promptInput.description2"),
        });
        return;
      }

      const edits: LensStyleEdit[] = result.edits;
      updateLensAnnotationAttachment({
        attachment,
        annotations: (attachment.annotations ?? []).map((candidate) => {
          if (candidate.id !== annotation.id) {
            return candidate;
          }
          const nextComputedStyles = {
            ...(candidate.computedStyles ?? {}),
            ...Object.fromEntries(
              edits.map((edit) => [edit.property, edit.after]),
            ),
          };
          const nextStyleEdits = [...(candidate.styleEdits ?? []), ...edits];
          return {
            ...candidate,
            computedStyles: nextComputedStyles,
            styleEdits: nextStyleEdits,
            ...(candidate.review
              ? {
                  review: {
                    ...candidate.review,
                    anchor: {
                      ...candidate.review.anchor,
                      computedStyles: nextComputedStyles,
                    },
                    evidence: {
                      ...candidate.review.evidence,
                      styleEdits: nextStyleEdits,
                    },
                  },
                }
              : {}),
          };
        }),
      });

      toast.success(i18n.t("composer:promptInput.copy3"), {
        description: i18n.t("composer:promptInput.description3", { value1: edits.length, count: edits.length }),
      });
    },
    [updateLensAnnotationAttachment, i18n.language],
  );

  return {
    applyLensAnnotationFeedback,
    removeLensAnnotation,
    applyLensAnnotationStyle,
  };
}
