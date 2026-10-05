import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, RotateCcw } from "lucide-react";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { sx } from "@/components/ads/utils/stylex";
import { Button, Textarea } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  GitHubPrReviewDetail,
  GitHubPrReviewEvent,
} from "@/lib/github-pr-review";
import { reviewDialogStyles } from "./source-control-review-dialog.styles";

const REVIEW_OPTIONS: Array<{
  event: GitHubPrReviewEvent;
  title: string;
  description: string;
  icon: typeof Check;
}> = [
  {
    event: "APPROVE",
    get title() { return i18n.t("sourceControl:sourceControlReviewDialog.approve"); },
    get description() { return i18n.t("sourceControl:sourceControlReviewDialog.approveTheReviewedCommitForMerge"); },
    icon: Check,
  },
  {
    event: "REQUEST_CHANGES",
    get title() { return i18n.t("sourceControl:sourceControlReviewDialog.requestChanges"); },
    get description() { return i18n.t("sourceControl:sourceControlReviewDialog.blockApprovalAndExplainWhatNeedsTo"); },
    icon: RotateCcw,
  },
  {
    event: "COMMENT",
    get title() { return i18n.t("sourceControl:sourceControlReviewDialog.comment"); },
    get description() { return i18n.t("sourceControl:sourceControlReviewDialog.leaveFeedbackWithoutAnApprovalDecision"); },
    icon: MessageSquare,
  },
];

export function SourceControlReviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: GitHubPrReviewDetail;
  isSubmitting: boolean;
  error: string;
  onSubmit: (args: {
    event: GitHubPrReviewEvent;
    body: string;
  }) => Promise<void>;
}) {
  useTranslation();
  const isOwnPullRequest =
    Boolean(props.detail.viewerLogin) &&
    props.detail.viewerLogin.toLowerCase() ===
      props.detail.authorLogin.toLowerCase();
  const [event, setEvent] = useState<GitHubPrReviewEvent>(
    isOwnPullRequest ? "COMMENT" : "APPROVE",
  );
  const [body, setBody] = useState("");
  const wasOpenRef = useRef(props.open);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    setEvent(isOwnPullRequest ? "COMMENT" : "APPROVE");
    setBody("");
  }, [isOwnPullRequest, props.open]);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = props.open;
    if (!wasOpen || props.open) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!wasOpenRef.current) {
        document
          .querySelector<HTMLElement>("[data-source-control-review-trigger]")
          ?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [props.open]);

  const needsBody = event === "REQUEST_CHANGES";
  const canSubmit =
    !props.isSubmitting && (!needsBody || body.trim().length > 0);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger
        data-source-control-review-trigger=""
        disabled={props.detail.isDraft || !props.detail.headRefOid}
        render={<AdsButton fullWidth type="button" />}
      >
        {i18n.t("sourceControl:sourceControlReviewDialog.reviewChanges")}
      </DialogTrigger>
      <DialogContent
        xstyle={reviewDialogStyles.content}
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            "[data-source-control-review-trigger]",
          )
        }
      >
        <DialogHeader>
          <DialogTitle>{i18n.t("sourceControl:sourceControlReviewDialog.reviewChanges")}</DialogTitle>
          <DialogDescription>{i18n.t("sourceControl:sourceControlReviewDialog.pinnedDecision", { commit: props.detail.headRefOid.slice(0, 7) })}</DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className={sx(reviewDialogStyles.legend)}>
            {i18n.t("sourceControl:sourceControlReviewDialog.reviewDecision")}
          </legend>
          {REVIEW_OPTIONS.map((option) => {
            const disabled = option.event === "APPROVE" && isOwnPullRequest;
            const selected = event === option.event;
            const Icon = option.icon;
            return (
              <label
                key={option.event}
                className={sx(
                  reviewDialogStyles.option,
                  transition.colors,
                  // The tile owns the keyboard ring because the focusable
                  // element inside it is visually hidden.
                  focusRing.ringWithin,
                  disabled
                    ? reviewDialogStyles.optionDisabled
                    : reviewDialogStyles.optionEnabled,
                  selected && reviewDialogStyles.optionSelected,
                )}
              >
                <VisuallyHidden>
                  <input
                    type="radio"
                    name="github-pr-review-event"
                    value={option.event}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => setEvent(option.event)}
                  />
                </VisuallyHidden>
                <span
                  className={sx(
                    reviewDialogStyles.optionMark,
                    selected && reviewDialogStyles.optionMarkSelected,
                  )}
                >
                  <Icon className={sx(reviewDialogStyles.optionIcon)} />
                </span>
                <span className={sx(reviewDialogStyles.optionText)}>
                  <span className={sx(reviewDialogStyles.optionTitle)}>
                    {option.title}
                  </span>
                  <span className={sx(reviewDialogStyles.optionDescription)}>
                    {disabled
                      ? i18n.t("sourceControl:sourceControlReviewDialog.youCannotApproveYourOwnPullRequest")
                      : option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className={sx(reviewDialogStyles.summaryField)}>
          <label
            htmlFor="github-pr-review-body"
            className={sx(reviewDialogStyles.summaryLabel)}
          >
            {i18n.t("sourceControl:sourceControlReviewDialog.summary")}{needsBody ? i18n.t("sourceControl:sourceControlReviewDialog.required") : i18n.t("sourceControl:sourceControlReviewDialog.optional")}
          </label>
          <Textarea
            id="github-pr-review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              needsBody
                ? i18n.t("sourceControl:sourceControlReviewDialog.explainWhatShouldChangeBeforeApproval")
                : i18n.t("sourceControl:sourceControlReviewDialog.addAShortReviewSummary")
            }
            rows={5}
            disabled={props.isSubmitting}
            aria-invalid={Boolean(props.error)}
            aria-describedby={
              props.error ? "github-pr-review-error" : undefined
            }
          />
          <p
            id="github-pr-review-error"
            className={sx(
              reviewDialogStyles.helpText,
              Boolean(props.error) && reviewDialogStyles.helpTextError,
            )}
            aria-live="assertive"
          >
            {props.error ||
              i18n.t("sourceControl:sourceControlReviewDialog.gitHubRecordsThisReviewUnderYourSignedIn")}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.isSubmitting}
          >
            {i18n.t("sourceControl:sourceControlReviewDialog.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void props.onSubmit({ event, body })}
            disabled={!canSubmit}
          >
            {props.isSubmitting ? i18n.t("sourceControl:sourceControlReviewDialog.submitting") : i18n.t("sourceControl:sourceControlReviewDialog.submitReview")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
