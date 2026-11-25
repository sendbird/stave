import { i18n, useTranslation } from "@/i18n";
import { memo } from "react";
import {
  Check,
  PanelRight,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/aui/components/Button";
import { StateMark } from "@/components/aui/components/StateMark";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { sx } from "@/components/aui/utils/stylex";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { Loader } from "@/components/ui";
import { REVIEW_SHELF_WORK_STATE, type ReviewShelfItem } from "@/lib/reviews/review-task";
import {
  describeReviewShelfFindings,
  describeReviewShelfLine,
} from "./composer-shelf.utils";
import { useReviewTranscript } from "./use-review-transcript";
import { useReviewRevision } from "./use-review-revision";
import { describeReviewRevision, reviewRevisionLabel } from "@/lib/reviews/review-revision";
import { shelfStyles as styles } from "./composer-shelf.styles";
import type { ShelfReviewActions } from "./use-shelf-reviews";

export interface ShelfReviewsProps {
  items: readonly ReviewShelfItem[];
  attachedTaskIds: ReadonlySet<string>;
  actions: ShelfReviewActions;
  onView: (item: ReviewShelfItem) => void;
}

const TONE_INK = {
  accent: styles.labelAccent,
  danger: styles.labelDanger,
  neutral: styles.strong,
} as const;

/**
 * Reviews this task started in their own read-only task: one line each while
 * it runs (View, Stop) and once it settles (Attach the findings to the next
 * message, View, Dismiss). View opens the review in the Agent panel beside
 * the conversation, so checking how it reviewed never leaves this task.
 */
export const ShelfReviews = memo(function ShelfReviews(props: ShelfReviewsProps) {
  useTranslation();
  const running = props.items.some((item) => item.status === "running");
  // Elapsed time reads in seconds under a minute; a 5s tick keeps it honest.
  const now = useNow(running, 5_000);
  return (
    <div role="group" aria-label={i18n.t("composer:shelfReviews.ariaLabel")} data-testid="composer-shelf-reviews">
      {props.items.map((item) => (
        <ReviewLine
          key={item.child.delegationKey}
          item={item}
          now={now}
          attached={props.attachedTaskIds.has(item.child.delegatedTaskId)}
          actions={props.actions}
          onView={props.onView}
        />
      ))}
    </div>
  );
});

/**
 * A running review wears the verify loader, as a shelf run line draws work in
 * progress. A settled review is a work state, drawn as every surface draws one.
 * The line's label says the state in words, so the mark stays decorative.
 */
function ReviewMark(props: { item: ReviewShelfItem }) {
  if (props.item.status === "running") {
    return <Loader aria-hidden cadence="reduced" size="sm" variant="verify" />;
  }
  return <StateMark state={REVIEW_SHELF_WORK_STATE[props.item.status]} size="sm" />;
}

function ReviewLine(props: {
  item: ReviewShelfItem;
  now: number;
  attached: boolean;
  actions: ShelfReviewActions;
  onView: (item: ReviewShelfItem) => void;
}) {
  useTranslation();
  const { item, actions } = props;
  // Only a finished review has findings to count; reading is cached.
  const { findings } = useReviewTranscript(item, { enabled: item.status === "ready" });
  const { state: revision } = useReviewRevision(item);
  const revisionNote = describeReviewRevision(revision);
  const line = describeReviewShelfLine({
    item,
    now: props.now,
    findings: findings ? describeReviewShelfFindings(findings) : null,
  });
  return (
    <div
      className={sx(styles.line)}
      data-testid="composer-shelf-review"
      data-status={item.status}
    >
      <span className={sx(styles.mark)}>
        <span className={sx(styles.markSlot)}>
          <ReviewMark item={item} />
        </span>
      </span>
      <p className={sx(styles.text)} title={`${line.label} · ${line.detail}`}>
        <span className={sx(styles.label, TONE_INK[line.tone])}>{line.label}</span>
        <span>{` · ${line.detail}`}</span>
        {revisionNote ? <span className={sx(styles.labelWaiting)} title={revisionNote}> · {reviewRevisionLabel(revision)}</span> : null}
      </p>
      <span className={sx(styles.actions)}>
        {item.status === "ready" ? (
          props.attached ? (
            <span className={sx(styles.meta, styles.metaWithIcon)} title={i18n.t("composer:shelfReviews.title4")}>
              <Check aria-hidden className={sx(styles.markIcon)} />
              <span>{i18n.t("composer:shelfReviews.reviewLine")}</span>
            </span>
          ) : (
            <Button
              variant="quiet"
              size="xs"
              title={i18n.t("composer:shelfReviews.title5")}
              onClick={() => actions.attach(item)}
              xstyle={styles.itemAccent}
            >
              <Paperclip aria-hidden />
              <span className={sx(styles.actionWord)}>{i18n.t("composer:shelfReviews.reviewLine2")}</span>
            </Button>
          )
        ) : null}
        <Button
          variant="quiet"
          size="xs"
          title={i18n.t("composer:shelfReviews.title6")}
          onClick={() => props.onView(item)}
          xstyle={styles.quiet}
        >
          <PanelRight aria-hidden />
          <span className={sx(styles.actionWord)}>{i18n.t("composer:shelfReviews.reviewLine3")}</span>
        </Button>
        {item.status === "running" ? (
          <Tooltip content={i18n.t("composer:shelfReviews.title7")}>
            <Button
              variant="quiet"
              size="xs"
              iconOnly
              aria-label={i18n.t("composer:shelfReviews.ariaLabel2")}
              onClick={() => actions.stop(item)}
              xstyle={styles.quiet}
            >
              <Square aria-hidden />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content={i18n.t("composer:shelfReviews.title8")}>
            <Button
              variant="quiet"
              size="xs"
              iconOnly
              aria-label={i18n.t("composer:shelfReviews.ariaLabel3")}
              onClick={() => actions.dismiss(item)}
              xstyle={styles.quiet}
            >
              <X aria-hidden />
            </Button>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
