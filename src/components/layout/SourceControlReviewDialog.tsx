import { useEffect, useRef, useState } from "react";
import { Check, MessageSquare, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

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
        className={cn(buttonVariants({ variant: "default" }), "w-full")}
        disabled={props.detail.isDraft || !props.detail.headRefOid}
      >
        Review changes
      </DialogTrigger>
      <DialogContent
        className="max-w-lg gap-5"
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
            <span className="font-mono text-foreground">
              {props.detail.headRefOid.slice(0, 8)}
            </span>
            . Stave checks the head again before submitting.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-foreground">
            Review decision
          </legend>
          {REVIEW_OPTIONS.map((option) => {
            const disabled = option.event === "APPROVE" && isOwnPullRequest;
            const selected = event === option.event;
            const Icon = option.icon;
            return (
              <label
                key={option.event}
                className={cn(
                  "flex min-h-12 items-start gap-3 rounded-lg border border-border/70 px-3 py-2.5 transition-colors",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-muted/45",
                  selected && "border-primary/40 bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name="github-pr-review-event"
                  value={option.event}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setEvent(option.event)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                    selected && "bg-primary/12 text-primary",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {disabled
                      ? "You cannot approve your own pull request."
                      : option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="space-y-2">
          <label
            htmlFor="github-pr-review-body"
            className="text-xs font-medium text-foreground"
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
            className={cn(
              "min-h-5 text-xs leading-5",
              props.error ? "text-destructive" : "text-muted-foreground",
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
