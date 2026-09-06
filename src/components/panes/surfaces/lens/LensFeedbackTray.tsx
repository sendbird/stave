import { feedbackStyles } from "./lens-feedback.styles";
import { sx } from "../../../ads/utils/stylex";
import { getSentLensFeedback } from "@/lib/lens/lens-feedback-history";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Textarea } from "@/components/ads/components/Textarea";
import { useAppStore } from "@/store/app.store";
import {
  buildLensAnnotationsAttachment,
  getLensCommentImageId,
  isTargetLensAnnotationsAttachment,
} from "@/lib/lens/lens-annotation-attachment";
import type {
  LensAnnotation,
  LensSourceMappingConfig,
} from "@/lib/lens/lens.types";

/** The task draft owns edited feedback; page events own captured evidence. */
export function LensFeedbackTray({
  workspaceId,
  lensSessionId,
  taskId,
  sourceMappingConfig,
  onReload,
  onNavigate,
}: {
  workspaceId: string;
  lensSessionId: string;
  taskId: string;
  sourceMappingConfig: LensSourceMappingConfig;
  onReload: () => void;
  onNavigate: (url: string) => void;
}) {
  const draft = useAppStore((state) => state.promptDraftByTask[taskId]);
  const messages = useAppStore((state) => state.messagesByTask[taskId]);
  const taskTitle = useAppStore(
    (state) => state.tasks.find((task) => task.id === taskId)?.title,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const draftAttachment = draft?.attachments.find((item) =>
    isTargetLensAnnotationsAttachment(item, { workspaceId, lensSessionId }),
  );
  const sent = !draftAttachment;
  const attachments = sent
    ? getSentLensFeedback(messages, {
        workspaceId,
        lensSessionId,
        sourceMappingConfig,
      })
    : draft?.attachments;
  const attachment = attachments?.find((item) =>
    isTargetLensAnnotationsAttachment(item, { workspaceId, lensSessionId }),
  );
  if (
    !attachment ||
    attachment.kind !== "lens-annotations" ||
    !attachment.annotations?.length
  )
    return null;
  const selected =
    attachment.annotations.find((item) => item.id === selectedId) ??
    attachment.annotations[attachment.annotations.length - 1]!;
  const imageId = getLensCommentImageId({
    workspaceId,
    lensSessionId,
    annotationId: selected.id,
  });
  const screenshot = attachments?.find(
    (item) => item.kind === "image" && item.id === imageId,
  );

  function saveComment(annotation: LensAnnotation, comment: string) {
    const store = useAppStore.getState();
    if (
      store.activeWorkspaceId !== workspaceId ||
      store.activeTaskId !== taskId
    )
      return;
    const current = store.promptDraftByTask[taskId];
    if (!current) return;
    store.updatePromptDraft({
      taskId,
      patch: {
        attachments: current.attachments.map((item) => {
          if (
            !isTargetLensAnnotationsAttachment(item, {
              workspaceId,
              lensSessionId,
            })
          )
            return item;
          return buildLensAnnotationsAttachment({
            id: item.id,
            workspaceId,
            lensSessionId,
            sourceMappingConfig,
            annotations: (item.annotations ?? []).map((entry) =>
              entry.id === annotation.id &&
              entry.review.page.documentId === annotation.review.page.documentId
                ? {
                    ...entry,
                    comment,
                    review: {
                      ...entry.review,
                      feedback: { ...entry.review.feedback, comment },
                    },
                  }
                : entry,
            ),
          });
        }),
      },
    });
  }

  return (
    <section
      aria-label={sent ? "Sent visual feedback" : "Visual feedback draft"}
      className={sx(feedbackStyles.tray)}
    >
      <div className={sx(feedbackStyles.header)}>
        <div className={sx(feedbackStyles.headingGroup)}>
          <h2 className={sx(feedbackStyles.title)}>Visual feedback</h2>
          <p className={sx(feedbackStyles.subtitle)}>
            {sent ? "Sent with" : "In the draft for"} {taskTitle ?? "this task"}{" "}
            · {attachment.annotations.length} selected
          </p>
        </div>
        <div className={sx(feedbackStyles.actions)}>
          <Button
            variant="quiet"
            size="xs"
            onClick={() => onNavigate(selected.review.page.url)}
          >
            Open captured page
          </Button>
          <Button variant="quiet" size="xs" onClick={onReload}>
            {sent ? "Reload to check changes" : "Reload preview"}
          </Button>
        </div>
      </div>
      <div
        className={sx(feedbackStyles.targets)}
        aria-label="Selected page targets"
      >
        {attachment.annotations.map((item) => (
          <Button
            key={item.id}
            variant={selected.id === item.id ? "secondary" : "quiet"}
            size="xs"
            aria-pressed={selected.id === item.id}
            onClick={() => setSelectedId(item.id)}
          >
            {item.pin}. {item.tagName ?? "Area"}
          </Button>
        ))}
      </div>
      <div className={sx(feedbackStyles.capture)}>
        {screenshot?.kind === "image" ? (
          <Button
            layout="host"
            type="button"
            aria-label={`Enlarge captured target ${selected.pin}`}
            onClick={() => setPreviewOpen(true)}
          >
            <img
              className={sx(feedbackStyles.thumbnail)}
              src={screenshot.dataUrl}
              alt={`Captured target ${selected.pin}`}
            />
          </Button>
        ) : null}
        <div className={sx(feedbackStyles.context)}>
          <p className={sx(feedbackStyles.selector)} title={selected.selector}>
            {selected.selector ?? "Selected area"}
          </p>
          <p className={sx(feedbackStyles.excerpt)}>
            {selected.textContent}
          </p>
          <p className={sx(feedbackStyles.explanation)}>
            {sent
              ? "Original capture. Compare it with the current page above."
              : "Captured context stays attached while you edit the request."}
          </p>
        </div>
      </div>
      {sent ? (
        <p className={sx(feedbackStyles.sentComment)}>{selected.comment}</p>
      ) : (
        <FeedbackEditor
          key={`${taskId}:${selected.id}:${selected.review.page.documentId}`}
          annotation={selected}
          onSave={saveComment}
        />
      )}
      {screenshot?.kind === "image" ? (
        <ImageLightbox
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageSrc={screenshot.dataUrl}
          alt={`Original captured target ${selected.pin}`}
        />
      ) : null}
    </section>
  );
}

function FeedbackEditor({
  annotation,
  onSave,
}: {
  annotation: LensAnnotation;
  onSave: (annotation: LensAnnotation, comment: string) => void;
}) {
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className={sx(feedbackStyles.editor)}>
      <Textarea
        label="Requested change"
        size="sm"
        value={edit ?? annotation.comment}
        onChange={(event) => setEdit(event.target.value)}
      />
      {edit !== null ? (
        <div className={sx(feedbackStyles.editorActions)}>
          <Button
            size="xs"
            onClick={() => {
              onSave(annotation, edit);
              setEdit(null);
            }}
          >
            Save to draft
          </Button>
          <Button variant="quiet" size="xs" onClick={() => setEdit(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className={sx(feedbackStyles.hint)}>
          Review and send from the task composer.
        </p>
      )}
    </div>
  );
}
