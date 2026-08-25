import { useEffect, useState } from "react";
import {
  getLensCommentImageId,
  isLensCommentImageAttachment,
  upsertLensAnnotationsAttachment,
} from "@/lib/lens/lens-annotation-attachment";
import {
  matchesSession,
  mergeAnnotationEntry,
} from "@/lib/lens/lens-log-format";
import {
  type LensAnnotation,
  type LensAnnotationEventPayload,
  type LensSourceMappingConfig,
} from "@/lib/lens/lens.types";
import { useAppStore } from "@/store/app.store";

/** Annotation data owned by one Lens session, independent of overlay mode. */
export type LensAnnotationSyncHandle = {
  annotations: LensAnnotation[];
  /**
   * Replace the annotation set. The session-lifecycle effect uses this to
   * clear a previous generation and to seed the set restored from main.
   */
  setAnnotations: (annotations: LensAnnotation[]) => void;
};

/**
 * Annotation data pipeline for one Lens session: guest events in, prompt-draft
 * attachments out.
 *
 * Deliberately separate from `useLensOverlayModes`. Whether visual-comment mode
 * is armed is a property of the in-page overlay and disappears in its current
 * form once the interactive chrome becomes React; the annotations themselves
 * are session data that outlives the mode and survives that change untouched.
 */
export function useLensAnnotationSync(args: {
  workspaceId: string;
  lensSessionId: string;
  hasLensApi: boolean;
  activeTaskId: string | null;
  sourceMappingConfig: LensSourceMappingConfig;
}): LensAnnotationSyncHandle {
  const {
    workspaceId,
    lensSessionId,
    hasLensApi,
    activeTaskId,
    sourceMappingConfig,
  } = args;

  const [annotations, setAnnotations] = useState<LensAnnotation[]>([]);

  useEffect(() => {
    if (!workspaceId || !hasLensApi) {
      return;
    }

    const captureAnnotationScreenshot = async (annotation: LensAnnotation) => {
      if (!activeTaskId) {
        return;
      }
      const imageId = getLensCommentImageId({
        workspaceId,
        lensSessionId,
        annotationId: annotation.id,
      });
      const storeBeforeCapture = useAppStore.getState();
      const currentDraftBeforeCapture =
        storeBeforeCapture.promptDraftByTask[activeTaskId];
      if (
        currentDraftBeforeCapture?.attachments.some(
          (attachment) =>
            attachment.kind === "image" && attachment.id === imageId,
        )
      ) {
        return;
      }
      const result = await window.api?.lens?.screenshot?.({
        workspaceId,
        lensSessionId,
        options: {
          clip: {
            x: Math.max(0, Math.round(annotation.rect.x)),
            y: Math.max(0, Math.round(annotation.rect.y)),
            width: Math.max(1, Math.round(annotation.rect.width)),
            height: Math.max(1, Math.round(annotation.rect.height)),
          },
          documentId: annotation.review.page.documentId,
        },
      });
      if (
        !result?.ok ||
        !result.dataUrl ||
        result.documentId !== annotation.review.page.documentId
      ) {
        return;
      }
      const store = useAppStore.getState();
      const currentDraft = store.promptDraftByTask[activeTaskId];
      const currentAttachments = currentDraft?.attachments ?? [];
      if (
        currentAttachments.some(
          (attachment) =>
            attachment.kind === "image" && attachment.id === imageId,
        )
      ) {
        return;
      }
      store.updatePromptDraft({
        taskId: activeTaskId,
        patch: {
          attachments: [
            ...currentAttachments,
            {
              kind: "image",
              id: imageId,
              dataUrl: result.dataUrl,
              label:
                annotation.comment.trim() || `Visual comment ${annotation.pin}`,
            },
          ],
        },
      });
    };

    const unsubscribe = window.api?.lens?.subscribeAnnotationEvents?.(
      (payload: LensAnnotationEventPayload) => {
        if (!matchesSession(payload, workspaceId, lensSessionId)) {
          return;
        }

        if (payload.type === "clear") {
          setAnnotations([]);
          return;
        }
        if (
          payload.type === "remove" &&
          payload.annotation &&
          payload.documentId === payload.annotation.review.page.documentId
        ) {
          setAnnotations((current) =>
            current.filter(
              (annotation) => annotation.id !== payload.annotation?.id,
            ),
          );
          return;
        }
        if (
          (payload.type === "add" || payload.type === "update") &&
          payload.annotation &&
          payload.documentId === payload.annotation.review.page.documentId
        ) {
          setAnnotations((current) =>
            mergeAnnotationEntry(
              current.filter(
                (annotation) =>
                  annotation.review.page.documentId === payload.documentId,
              ),
              payload.annotation!,
            ),
          );
          if (payload.type === "add") {
            void captureAnnotationScreenshot(payload.annotation);
          }
        }
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [activeTaskId, hasLensApi, lensSessionId, workspaceId]);

  useEffect(() => {
    if (!activeTaskId || !workspaceId) {
      return;
    }

    const store = useAppStore.getState();
    const currentDraft = store.promptDraftByTask[activeTaskId];
    const currentAttachments = currentDraft?.attachments ?? [];
    const currentAnnotationIds = new Set(
      annotations.map((annotation) =>
        getLensCommentImageId({
          workspaceId,
          lensSessionId,
          annotationId: annotation.id,
        }),
      ),
    );
    const retainedAttachments = currentAttachments.filter((attachment) => {
      if (
        attachment.kind !== "image" ||
        !isLensCommentImageAttachment(attachment, workspaceId, lensSessionId)
      ) {
        return true;
      }
      return currentAnnotationIds.has(attachment.id);
    });
    const nextAttachments = upsertLensAnnotationsAttachment({
      attachments: retainedAttachments,
      workspaceId,
      lensSessionId,
      annotations,
      sourceMappingConfig,
    });
    if (
      JSON.stringify(currentAttachments) === JSON.stringify(nextAttachments)
    ) {
      return;
    }
    store.updatePromptDraft({
      taskId: activeTaskId,
      patch: {
        attachments: nextAttachments,
      },
    });
  }, [
    activeTaskId,
    annotations,
    lensSessionId,
    sourceMappingConfig,
    workspaceId,
  ]);

  return { annotations, setAnnotations };
}
