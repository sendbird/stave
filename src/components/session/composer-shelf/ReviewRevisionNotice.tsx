import { useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { describeReviewRevision, type ReviewRevisionState } from "@/lib/reviews/review-revision";

export function ReviewRevisionNotice(props: { state: ReviewRevisionState | null }) {
  useTranslation();
  const message = describeReviewRevision(props.state);
  return message ? <p role="note" className={sx(styles.notice)}>{message}</p> : null;
}

const styles = stylex.create({
  notice: { margin: 0, paddingBlock: vars["--aui-space-8"], paddingInline: vars["--aui-space-12"],
    fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-warning-text"] },
});
