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
    title: "Approve",
    description: "Approve the reviewed commit for merge.",
    icon: Check,
  },
  {
    event: "REQUEST_CHANGES",
    title: "Request changes",
    description: "Block approval and explain what needs to change.",
    icon: RotateCcw,
  },
  {
    event: "COMMENT",
    title: "Comment",
    description: "Leave feedback without an approval decision.",
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
        Review changes
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
          <DialogTitle>Review changes</DialogTitle>
          <DialogDescription>
            Your decision will be pinned to commit{" "}
            <span className={sx(reviewDialogStyles.commitHash)}>
              {props.detail.headRefOid.slice(0, 8)}
            </span>
            . Stave checks the head again before submitting.
          </DialogDescription>
        </DialogHeader>

        <fieldset>
          <legend className={sx(reviewDialogStyles.legend)}>
            Review decision
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
                      ? "You cannot approve your own pull request."
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
            Summary{needsBody ? " (required)" : " (optional)"}
          </label>
          <Textarea
            id="github-pr-review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              needsBody
                ? "Explain what should change before approval."
                : "Add a short review summary."
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
              "GitHub records this review under your signed-in account."}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void props.onSubmit({ event, body })}
            disabled={!canSubmit}
          >
            {props.isSubmitting ? "Submitting…" : "Submit review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
