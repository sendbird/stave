import { useTranslation } from "@/i18n";
import { Button, ExternalAnchor } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsPublishRecord } from "@/lib/tars/publication";
import type { TarsResponsibility } from "@/lib/tars/types";
import { TarsRecordDetail, TarsRecordDiagnostic, TarsRecordRow } from "./TarsRecord";
import { tarsPublishStyles as publishStyles } from "./tars-publish.styles";

/**
 * One publish confirmation as a record row, never a user message: while it
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
  const publication = row?.publication;
  // A step saved after this attempt started is this attempt's progress.
  const step = publication && publication.updatedAt >= record.createdAt ? publication.state : "pending";
  const lead = record.status === "pending" ? t(`shell:tars.publish.record.progress.${step}`)
    : record.status === "applied"
      ? t(`shell:tars.publish.record.outcome.${record.existing ? "existing" : "opened"}${record.number ? "" : "Unnumbered"}`, { number: record.number ?? 0 })
      : t("shell:tars.publish.record.outcome.rejected");
  // A failed step's own output is a diagnostic in git's or gh's words, shown as written.
  const failedStep = record.status === "rejected" && publication?.state === "failed" && publication.updatedAt >= record.createdAt ? publication.failedStep : null;
  const diagnostic = record.status === "rejected" && record.reason === "publishFailed" && record.error ? record.error : null;
  const state = record.status === "pending" ? "running" : record.status === "applied" ? "applied" : record.reason === "publishFailed" ? "failed" : "refused";
  const link = record.status === "applied" && record.url
    ? <ExternalAnchor href={record.url} className={sx(publishStyles.link)} data-tars-publish-url={record.url}>{t("shell:tars.publish.record.view")}</ExternalAnchor> : null;
  const retry = onRetry ? <Button type="button" size="2xs" variant="ghost" data-tars-publish-retry={record.requestId} onClick={onRetry}>{t("shell:tars.publish.record.retry")}</Button> : null;
  return <TarsRecordRow state={state} lead={lead} subject={title} meta={t(`shell:tars.record.source.${record.source}`)}
    data-tars-publish-record={record.status} data-tars-publish-request={record.requestId} aria-live={record.status === "pending" ? "polite" : undefined}
    detail={record.status === "rejected" ? <TarsRecordDetail data-tars-reason={record.reason ?? undefined}>
      {t(`shell:tars.publish.reason.${record.reason ?? "unknown"}`)}
      {failedStep ? <> {t("shell:tars.publish.record.failedStep", { step: t(`shell:tars.publish.card.resumeStep.${failedStep}`) })}</> : null}
      {diagnostic ? <TarsRecordDiagnostic title={diagnostic}>{diagnostic.split("\n")[0]!.slice(0, 200)}</TarsRecordDiagnostic> : null}
    </TarsRecordDetail> : null}
    actions={link || retry ? <>{link}{retry}</> : null} />;
}
