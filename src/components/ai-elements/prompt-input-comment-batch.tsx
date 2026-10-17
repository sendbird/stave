import { i18n, useTranslation } from "@/i18n";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { Tooltip as AdsTooltip } from "@/components/ads/components/Tooltip";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import type { Attachment, PromptDraftBatchItem } from "@/types/chat";
import { getLensCommentImageId } from "@/lib/lens/lens-annotation-attachment";
import { resolveLensAnnotationReview } from "@/lib/lens/lens-element-message";
import { sx } from "../ads/utils/stylex";
import { promptInputStyles } from "./prompt-input.styles";
import {
  LensAnnotationFeedbackPopover,
  LensAnnotationStylePopover,
  formatLensFeedbackOption,
} from "./prompt-input-lens-annotation";
import type { PromptInputLensAnnotationActions } from "./prompt-input-lens-actions";
import type { PromptInputProps } from "./prompt-input.types";

/**
 * The comment batch above the toolbar: staged prompt comments and the Lens
 * annotations attached to the draft, each with its own edit and remove
 * actions.
 */
export function PromptInputCommentBatch(args: {
  promptBatch: readonly PromptDraftBatchItem[];
  commentItemCount: number;
  lensAnnotationAttachments: readonly Extract<Attachment, { kind: "lens-annotations" }>[];
  imageAttachmentsById: ReadonlyMap<string, Extract<Attachment, { kind: "image" }>>;
  attachments?: Attachment[];
  interactionsDisabled: boolean;
  onRemovePromptBatchItem: PromptInputProps["onRemovePromptBatchItem"];
  onAttachmentsChange: PromptInputProps["onAttachmentsChange"];
  setImagePreviewSrc: (preview: { dataUrl: string; label: string }) => void;
  applyLensAnnotationFeedback: PromptInputLensAnnotationActions["applyLensAnnotationFeedback"];
  applyLensAnnotationStyle: PromptInputLensAnnotationActions["applyLensAnnotationStyle"];
  removeLensAnnotation: PromptInputLensAnnotationActions["removeLensAnnotation"];
}) {
  useTranslation();
  const {
    promptBatch,
    commentItemCount,
    lensAnnotationAttachments,
    imageAttachmentsById,
    attachments,
    interactionsDisabled,
    onRemovePromptBatchItem,
    onAttachmentsChange,
    setImagePreviewSrc,
    applyLensAnnotationFeedback,
    applyLensAnnotationStyle,
    removeLensAnnotation,
  } = args;
  return (
    <div className={sx(promptInputStyles.commentBox)}>
      <div className={sx(promptInputStyles.rowCenter)}>
        <Badge
          variant="outline"
          className={sx(promptInputStyles.badgeUpper)}
        >
          {i18n.t("composer:promptInput.composerCard21")}</Badge>
        <span className={sx(promptInputStyles.captionMuted)}>{i18n.t("composer:promptInput.sentence32", { value1: commentItemCount, count: commentItemCount })}</span>
      </div>
      <div className={sx(promptInputStyles.flexWrapGap)}>
        {promptBatch.map((item, index) => {
          const summary = item.content.replace(/\s+/g, " ").trim();
          const attachmentCount =
            (item.attachedFilePaths?.length ?? 0) +
            (item.attachments?.filter(
              (attachment) => attachment.kind === "image",
            ).length ?? 0);
          return (
            <div
              key={item.id}
              className={sx(promptInputStyles.commentChip)}
              title={item.content}
            >
              <span className={sx(promptInputStyles.chipIndex)}>
                {index + 1}
              </span>
              <span className={sx(promptInputStyles.chipTrunc)}>
                {summary}
              </span>
              {attachmentCount > 0 ? (
                <span
                  className={sx(promptInputStyles.chipAttachCount)}
                  title={i18n.t("composer:promptInput.title4", { value1: attachmentCount, count: attachmentCount })}
                >
                  <Paperclip className={sx(promptInputStyles.icon3)} />
                  {attachmentCount}
                </span>
              ) : null}
              <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel12", { value1: index + 1 })}>
                <AdsButton layout="host"
                  type="button"
                  disabled={interactionsDisabled}
                  onClick={() =>
                    onRemovePromptBatchItem?.({ itemId: item.id })
                  }
                  xstyle={promptInputStyles.chipRemove}
                  aria-label={i18n.t("composer:promptInput.ariaLabel12", { value1: index + 1 })}
                >
                  <X className={sx(promptInputStyles.icon3)} />
                </AdsButton>
              </AdsTooltip>
            </div>
          );
        })}
        {lensAnnotationAttachments.map((attachment) => {
          const annotationItems = attachment.annotations ?? [];
          if (annotationItems.length === 0) {
            return (
              <div
                key={attachment.id}
                className={sx(promptInputStyles.lensChip)}
              >
                <Popover modal={false}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <PopoverTrigger
                          render={
                            <AdsButton layout="host"
                              type="button"
                              title={
                                attachment.displayContent ??
                                attachment.content
                              }
                              xstyle={promptInputStyles.lensChipTrigger}
                            />
                          }
                        />
                      }
                    >
                      <FileText className={sx(promptInputStyles.icon35Shrink)} />
                      <span className={sx(promptInputStyles.truncPlain)}>
                        {attachment.label}
                      </span>
                      <Badge
                        variant="outline"
                        className={sx(promptInputStyles.badgePlain)}
                      >
                        {attachment.count}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className={sx(promptInputStyles.maxW80)}>
                      {attachment.summary}
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent
                    side="top"
                    align="start"
                    xstyle={promptInputStyles.lensPopoverContent}
                  >
                    <pre className={sx(promptInputStyles.lensPre)}>
                      {attachment.displayContent ?? attachment.content}
                    </pre>
                  </PopoverContent>
                </Popover>
                <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel13", { value1: attachment.label })}>
                  <AdsButton layout="host"
                    type="button"
                    disabled={interactionsDisabled}
                    onClick={() =>
                      onAttachmentsChange?.({
                        attachments: (attachments ?? []).filter(
                          (candidate) =>
                            !(
                              candidate.kind === "lens-annotations" &&
                              candidate.id === attachment.id
                            ),
                        ),
                      })
                    }
                    xstyle={promptInputStyles.lensChipRemove}
                    aria-label={i18n.t("composer:promptInput.ariaLabel13", { value1: attachment.label })}
                  >
                    <X className={sx(promptInputStyles.icon3)} />
                  </AdsButton>
                </AdsTooltip>
              </div>
            );
          }
          return annotationItems.map((annotation) => {
            const feedback =
              resolveLensAnnotationReview(annotation).feedback;
            const screenshot = attachment.workspaceId
              ? imageAttachmentsById.get(
                  getLensCommentImageId({
                    workspaceId: attachment.workspaceId,
                    lensSessionId: attachment.lensSessionId,
                    annotationId: annotation.id,
                  }),
                )
              : null;
            return (
              <div
                key={`${attachment.id}:${annotation.id}`}
                className={sx(promptInputStyles.annotationChip)}
              >
                <span className={sx(promptInputStyles.annotationPin)}>
                  {annotation.pin}
                </span>
                {screenshot ? (
                  <AdsButton layout="host"
                    type="button"
                    xstyle={promptInputStyles.screenshotButton}
                    title={i18n.t("composer:promptInput.title5")}
                    onClick={() =>
                      setImagePreviewSrc({
                        dataUrl: screenshot.dataUrl,
                        label: screenshot.label,
                      })
                    }
                  >
                    <img
                      src={screenshot.dataUrl}
                      alt={screenshot.label}
                      className={sx(promptInputStyles.screenshotImage)}
                    />
                  </AdsButton>
                ) : null}
                <Popover modal={false}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <PopoverTrigger
                          render={
                            <AdsButton layout="host"
                              type="button"
                              title={annotation.comment}
                              xstyle={promptInputStyles.annotationTextButton}
                            />
                          }
                        />
                      }
                    >
                      <span className={sx(promptInputStyles.annotationComment)}>
                        {annotation.comment}
                      </span>
                      <span className={sx(promptInputStyles.annotationMeta)}>
                        {formatLensFeedbackOption(feedback.intent)} ·{" "}
                        {formatLensFeedbackOption(feedback.priority)}
                        {" · "}
                        {annotation.kind === "area"
                          ? i18n.t("composer:promptInput.copy12")
                          : annotation.selector}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className={sx(promptInputStyles.maxW80)}>
                      {annotation.comment}
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent
                    side="top"
                    align="start"
                    xstyle={promptInputStyles.lensPopoverContent}
                  >
                    <pre className={sx(promptInputStyles.lensPre)}>
                      {attachment.displayContent ?? attachment.content}
                    </pre>
                  </PopoverContent>
                </Popover>
                <LensAnnotationFeedbackPopover
                  annotation={annotation}
                  disabled={interactionsDisabled}
                  onApply={(targetAnnotation, nextFeedback) =>
                    applyLensAnnotationFeedback(
                      attachment,
                      targetAnnotation,
                      nextFeedback,
                    )
                  }
                />
                <LensAnnotationStylePopover
                  annotation={annotation}
                  disabled={
                    interactionsDisabled ||
                    !attachment.workspaceId ||
                    annotation.kind !== "element"
                  }
                  onApply={(targetAnnotation, patch) =>
                    applyLensAnnotationStyle(
                      attachment,
                      targetAnnotation,
                      patch,
                    )
                  }
                />
                <AdsTooltip content={i18n.t("composer:promptInput.ariaLabel14", { value1: annotation.pin })}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={interactionsDisabled}
                    aria-label={i18n.t("composer:promptInput.ariaLabel14", { value1: annotation.pin })}
                    onClick={() => {
                      void removeLensAnnotation(attachment, annotation);
                    }}
                  >
                    <Trash2 className={sx(promptInputStyles.icon3)} />
                  </Button>
                </AdsTooltip>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
