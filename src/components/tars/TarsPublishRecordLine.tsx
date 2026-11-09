import { useTranslation } from "@/i18n";
import { Button, ExternalAnchor } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsPublishRecord } from "@/lib/tars/publication";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsStyles as styles } from "./tars.styles";
import { tarsPublishStyles as publishStyles } from "./tars-publish.styles";

/**
 * One publish confirmation folded to a line, never a user message: while it
 * runs, the step the host saved; then "Draft PR #12 opened" with its link,
 * or why it was not published, with Retry on the newest attempt.
 */
export function TarsPublishRecordLine({ record, row, title, onRetry }: {
  record: TarsPublishRecord;
  /** The work as the snapshot shows it now, for a running attempt's step. */
  row?: TarsResponsibility;
  title?: string;
  /** Present only on the newest attempt of work that can still be published; it reopens the card. */
  onRetry?: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const source = t(`shell:tars.publish.record.source.${record.source}`);
  const publication = row?.publication;
  // A step saved after this attempt started is this attempt's progress.
  const step = publication && publication.updatedAt >= record.createdAt ? publication.state : "pending";
  const sentence = record.status === "pending" ? t(`shell:tars.publish.record.progress.${step}`)
    : record.status === "applied"
      ? t(`shell:tars.publish.record.${record.existing ? "existing" : "opened"}${record.number ? "" : "Unnumbered"}`, { number: record.number ?? 0, source })
      : t("shell:tars.publish.record.rejected", { source });
  // A failed step's own output is a diagnostic in git's or gh's words, shown as written.
  const failedStep = record.status === "rejected" && publication?.state === "failed" && publication.updatedAt >= record.createdAt ? publication.failedStep : null;
  return <p className={sx(styles.actionRecord)} data-tars-publish-record={record.status} data-tars-publish-request={record.requestId}
    aria-live={record.status === "pending" ? "polite" : undefined}>
    <span aria-hidden="true" className={sx(styles.glyph)}>↳</span>
    <span>{sentence}</span>
    {title ? <span className={sx(styles.recordTitle)}>{title}</span> : null}
    {record.status === "applied" && record.url
      ? <ExternalAnchor href={record.url} className={sx(publishStyles.link)} data-tars-publish-url={record.url}>{t("shell:tars.publish.record.view")}</ExternalAnchor> : null}
    {record.status === "rejected" ? <span className={sx(styles.error)} data-tars-reason={record.reason ?? undefined}>{t(`shell:tars.publish.reason.${record.reason ?? "unknown"}`)}</span> : null}
    {failedStep ? <span>{t("shell:tars.publish.record.failedStep", { step: t(`shell:tars.publish.card.resumeStep.${failedStep}`) })}</span> : null}
    {record.status === "rejected" && record.reason === "publishFailed" && record.error
      ? <span className={sx(publishStyles.diagnostic)} title={record.error}>{record.error.split("\n")[0]!.slice(0, 200)}</span> : null}
    {onRetry ? <Button type="button" size="2xs" variant="ghost" data-tars-publish-retry={record.requestId} onClick={onRetry}>{t("shell:tars.publish.record.retry")}</Button> : null}
  </p>;
}
