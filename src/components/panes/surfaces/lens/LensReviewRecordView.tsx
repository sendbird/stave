import { i18n, useTranslation } from "@/i18n";
import { CircleCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { ReviewVersionCompare } from "@/components/system/ReviewVersionCompare";
import { formatDateTime } from "@/i18n/format";
import type { LensReviewRecord, LensReviewVerdict } from "@/lib/lens/lens-review-record";
import { feedbackStyles as styles } from "./lens-feedback.styles";

/** "Confirmed as fixed Oct 22, 3:21 PM", or why the record needs another look. */
export function describeLensReviewVerdict(record: LensReviewRecord): string {
  if (record.verdict === "confirmed") return i18n.t("lens:lensReviewRecord.confirmedAt", { time: formatDateTime(record.confirmedAt ?? record.updatedAt) });
  if (record.recheckReason === "page-changed" && record.confirmedAt)
    return i18n.t("lens:lensReviewRecord.recheckPageChanged", { time: formatDateTime(record.confirmedAt) });
  return i18n.t("lens:lensReviewRecord.recheckByReviewer", { time: formatDateTime(record.updatedAt) });
}

/** A saved Lens review: its verdict, the before and after images, and the verdict it can change to. */
export function LensReviewRecordView(props: {
  record: LensReviewRecord; image?: string; original?: string; aspectRatio: number; busy?: boolean; onVerdict?: (verdict: LensReviewVerdict) => void;
}) {
  useTranslation();
  const { record } = props;
  const confirmed = record.verdict === "confirmed";
  const after = props.image
    ? <img className={sx(styles.compareImage)} src={props.image} alt={i18n.t("lens:lensReviewRecord.savedCapture")} />
    : null;
  return (
    <section className={sx(styles.record)} aria-label={i18n.t("lens:lensReviewRecord.savedRegion")}>
      <p className={sx(styles.verdict)} role="status">
        {confirmed ? <CircleCheck aria-hidden className={sx(styles.verdictIcon)} /> : <RotateCcw aria-hidden className={sx(styles.verdictIcon)} />}
        {describeLensReviewVerdict(record)}
      </p>
      {after && props.original ? (
        <ReviewVersionCompare
          defaultMode="side-by-side"
          aspectRatio={props.aspectRatio}
          baselineLabel={i18n.t("lens:lensFeedbackComparison.before")}
          currentLabel={i18n.t("lens:lensReviewRecord.capturedAt", { time: formatDateTime(record.capturedAt) })}
          baseline={<img className={sx(styles.compareImage)} src={props.original} alt={i18n.t("lens:lensFeedbackComparison.originalTarget")} />}
          current={after}
        />
      ) : after ?? <p className={sx(styles.hint)}>{i18n.t("lens:lensReviewRecord.captureMissing")}</p>}
      {props.onVerdict ? (
        <div className={sx(styles.actions)}>
          {confirmed ? (
            <Button size="xs" variant="quiet" disabled={props.busy} onClick={() => props.onVerdict?.("needs-recheck")}>{i18n.t("lens:lensReviewRecord.markNeedsRecheck")}</Button>
          ) : record.recheckReason !== "page-changed" ? (
            <Button size="xs" variant="quiet" disabled={props.busy} onClick={() => props.onVerdict?.("confirmed")}>{i18n.t("lens:lensReviewRecord.confirm")}</Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
