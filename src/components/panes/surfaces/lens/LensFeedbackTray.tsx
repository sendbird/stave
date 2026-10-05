import { i18n, useTranslation } from "@/i18n";
import { feedbackStyles } from "./lens-feedback.styles";
import { LensFeedbackComparison } from "./LensFeedbackComparison";
import { LensFeedbackSelection } from "./LensFeedbackSelection";
import { sx } from "../../../ads/utils/stylex";
import { getSentLensFeedback } from "@/lib/lens/lens-feedback-history";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { useEffect, useState } from "react";
import { matchesSession } from "@/lib/lens/lens-log-format";
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
  useTranslation();
  const draft = useAppStore((state) => state.promptDraftByTask[taskId]);
  const messages = useAppStore((state) => state.messagesByTask[taskId]);
  const taskTitle = useAppStore(
    (state) => state.tasks.find((task) => task.id === taskId)?.title,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => window.api?.lens?.subscribeAnnotationEvents?.((event) => {
    if (event.type === "select" && matchesSession(event, workspaceId, lensSessionId) && event.documentId === event.annotation?.review.page.documentId)
      setSelectedId(event.annotation?.id ?? null);
  }), [workspaceId, lensSessionId]);
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
      aria-label={sent ? i18n.t("lens:lensFeedbackTray.sentVisualFeedback") : i18n.t("lens:lensFeedbackTray.visualFeedbackDraft")}
      className={sx(feedbackStyles.tray)}
    >
      <div className={sx(feedbackStyles.header)}>
        <div className={sx(feedbackStyles.headingGroup)}>
          <h2 className={sx(feedbackStyles.title)}>{i18n.t("lens:lensFeedbackTray.visualFeedback")}</h2>
          <p className={sx(feedbackStyles.subtitle)}>{i18n.t(sent ? "lens:lensFeedbackTray.sentSummary" : "lens:lensFeedbackTray.draftSummary", { task: taskTitle ?? i18n.t("lens:lensFeedbackTray.thisTask"), count: attachment.annotations.length })}</p>
        </div>
        <div className={sx(feedbackStyles.actions)}>
          <Button
            variant="quiet"
            size="xs"
            onClick={() => onNavigate(selected.review.page.url)}
          >
            {i18n.t("lens:lensFeedbackTray.openCapturedPage")}
          </Button>
          <Button variant="quiet" size="xs" onClick={onReload}>
            {sent ? i18n.t("lens:lensFeedbackTray.reloadToCheckChanges") : i18n.t("lens:lensFeedbackTray.reloadPreview")}
          </Button>
        </div>
      </div>
      <div
        className={sx(feedbackStyles.targets)}
        aria-label={i18n.t("lens:lensFeedbackTray.selectedPageTargets")}
      >
        {attachment.annotations.map((item) => (
          <Button
            key={item.id}
            variant={selected.id === item.id ? "secondary" : "quiet"}
            size="xs"
            aria-pressed={selected.id === item.id}
            onClick={() => setSelectedId(item.id)}
          >
            {item.pin}. {item.tagName ?? i18n.t("lens:lensFeedbackTray.area")}
          </Button>
        ))}
      </div>
      {!sent ? <LensFeedbackSelection key={attachment.annotations[0]?.review.page.documentId} workspaceId={workspaceId} lensSessionId={lensSessionId} annotations={attachment.annotations} /> : null}
      <div className={sx(feedbackStyles.capture)}>
        {screenshot?.kind === "image" ? (
          <Button
            layout="host"
            type="button"
            aria-label={i18n.t("lens:lensFeedbackTray.enlargeCapturedTarget", { value1: selected.pin })}
            onClick={() => setPreviewOpen(true)}
          >
            <img
              className={sx(feedbackStyles.thumbnail)}
              src={screenshot.dataUrl}
              alt={i18n.t("lens:lensFeedbackTray.capturedTarget", { value1: selected.pin })}
            />
          </Button>
        ) : null}
        <div className={sx(feedbackStyles.context)}>
          <p className={sx(feedbackStyles.selector)} title={selected.selector}>
            {selected.selector ?? i18n.t("lens:lensFeedbackTray.selectedArea")}
          </p>
          <p className={sx(feedbackStyles.excerpt)}>
            {selected.textContent}
          </p>
          <p className={sx(feedbackStyles.explanation)}>
            {sent
              ? i18n.t("lens:lensFeedbackTray.originalCaptureCompareItWithTheCurrent")
              : i18n.t("lens:lensFeedbackTray.capturedContextStaysAttachedWhileYouEdit")}
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
      {sent ? <LensFeedbackComparison key={selected.id} workspaceId={workspaceId} lensSessionId={lensSessionId} annotation={selected} original={screenshot?.kind === "image" ? screenshot.dataUrl : undefined} /> : null}
      {screenshot?.kind === "image" ? (
        <ImageLightbox
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          imageSrc={screenshot.dataUrl}
          alt={i18n.t("lens:lensFeedbackTray.originalCapturedTarget", { value1: selected.pin })}
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
  useTranslation();
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className={sx(feedbackStyles.editor)}>
      <Textarea
        label={i18n.t("lens:lensFeedbackTray.requestedChange")}
        size="sm"
        value={edit ?? annotation.comment}
        onChange={(event) => setEdit(event.target.value)}
      />
      {edit !== null ? (
        <div className={sx(feedbackStyles.editorActions)}>
          <Button
            size="xs"
            disabled={!edit.trim()}
            onClick={() => {
              onSave(annotation, edit);
              setEdit(null);
            }}
          >
            {i18n.t("lens:lensFeedbackTray.saveToDraft")}
          </Button>
          <Button variant="quiet" size="xs" onClick={() => setEdit(null)}>
            {i18n.t("lens:lensFeedbackTray.cancel")}
          </Button>
        </div>
      ) : (
        <p className={sx(feedbackStyles.hint)}>
          {i18n.t("lens:lensFeedbackTray.reviewAndSendFromTheTaskComposer")}
        </p>
      )}
    </div>
  );
}
