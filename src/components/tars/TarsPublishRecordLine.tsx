import { GitBranch, GitPullRequest } from "lucide-react";
import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui";
import { LinkChip } from "@/components/aui/components/LinkChip";
import { normalizeExternalUrl, openExternalUrl } from "@/lib/external-links";
import { tarsPublishHeadBranch, type TarsPublishRecord } from "@/lib/tars/publication";
import type { TarsResponsibility } from "@/lib/tars/types";
import { useTarsDirectActor } from "./TarsActionRecordLine";
import { TarsRecordChip, TarsRecordDetail, TarsRecordDiagnostic, TarsRecordRow, TarsWorkChip } from "./TarsRecord";
import { tarsRecordStyles as recordStyles } from "./tars-record.styles";

/**
 * One publish confirmation as a record row, never a user message: the user
 * confirmed it, so it carries their glyph. While it runs, the step the host
 * saved; then "Draft PR #12 opened" with the pull request as a link chip, or
 * why it was not published, with Retry on the newest attempt. The work and
 * its branch are chips beside it.
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
  const actorOf = useTarsDirectActor();
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
  // The pull request opens in the browser, as every external link in Stave does.
  const link = record.status === "applied" && record.url
    ? <LinkChip href={normalizeExternalUrl(record.url) ?? record.url} icon={<GitPullRequest aria-hidden="true" className={sx(recordStyles.chipIcon)} />} xstyle={recordStyles.chip}
      data-tars-publish-url={record.url} onClick={(event) => { event.preventDefault(); void openExternalUrl({ url: record.url! }); }}>
      {record.number ? t("shell:tars.publish.record.pullRequest", { number: record.number }) : t("shell:tars.publish.record.view")}
    </LinkChip> : null;
  const retry = onRetry ? <Button type="button" size="xs" variant="ghost" data-tars-publish-retry={record.requestId} onClick={onRetry}>{t("shell:tars.publish.record.retry")}</Button> : null;
  const values = <>
    {title ? <TarsWorkChip title={title} responsibilityId={record.responsibilityId} /> : null}
    {row ? <TarsRecordChip icon={GitBranch} hint={tarsPublishHeadBranch(row)} data-tars-publish-branch="">{tarsPublishHeadBranch(row)}</TarsRecordChip> : null}
    {link}
  </>;
  return <TarsRecordRow state={state} actor={actorOf(record.source)} lead={lead} values={values} at={record.createdAt}
    data-tars-publish-record={record.status} data-tars-publish-request={record.requestId} data-tars-record-source={record.source}
    aria-live={record.status === "pending" ? "polite" : undefined}
    detail={record.status === "rejected" ? <TarsRecordDetail data-tars-reason={record.reason ?? undefined}>
      {t(`shell:tars.publish.reason.${record.reason ?? "unknown"}`)}
      {failedStep ? <> {t("shell:tars.publish.record.failedStep", { step: t(`shell:tars.publish.card.resumeStep.${failedStep}`) })}</> : null}
      {diagnostic ? <TarsRecordDiagnostic title={diagnostic}>{diagnostic.split("\n")[0]!.slice(0, 200)}</TarsRecordDiagnostic> : null}
    </TarsRecordDetail> : null}
    actions={retry} />;
}
