import { useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { describeReviewRevision, type ReviewRevisionState } from "@/lib/reviews/review-revision";

export function ReviewRevisionNotice(props: { state: ReviewRevisionState | null }) {
  useTranslation();
  const message = describeReviewRevision(props.state);
  return message ? <p role="note" className={sx(styles.notice)}>{message}</p> : null;
}

const styles = stylex.create({
  notice: { margin: 0, paddingBlock: vars["--ads-space-8"], paddingInline: vars["--ads-space-12"],
    fontSize: vars["--ads-font-size-body"], lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-warning-text"] },
});
