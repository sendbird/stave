import { GitPullRequestDraft } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button, ExternalAnchor } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { isTarsPublicationUnfinished } from "@/lib/tars/publication";
import { isTarsPublishable } from "@/lib/tars/publish-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsStyles as styles } from "./tars.styles";
import { tarsPublishStyles as publishStyles } from "./tars-publish.styles";

/**
 * Where completed work leads to publishing, on its tray card and in its
 * report: its open draft pull request, a publish underway or stopped, and
 * "Create draft PR", which only opens the confirmation card. Nothing else.
 */
export function TarsPublishEntry({ row, onPublish }: { row: TarsResponsibility; onPublish?: (row: TarsResponsibility) => void }) {
  const { t } = useTranslation(["shell"]);
  const publication = row.publication;
  if (publication?.state === "opened" && publication.url) {
    return <ExternalAnchor href={publication.url} className={sx(publishStyles.link)} data-tars-publish-entry="opened" data-tars-publish-url={publication.url}>
      {publication.number ? t("shell:tars.publish.status.opened", { number: publication.number }) : t("shell:tars.publish.status.openedUnnumbered")}</ExternalAnchor>;
  }
  if (isTarsPublicationUnfinished(publication)) return <span className={sx(styles.text)} role="status" data-tars-publish-entry="running">{t("shell:tars.publish.status.running")}</span>;
  if (!isTarsPublishable(row) || !onPublish) return null;
  return <>
    {publication?.state === "failed" ? <span className={sx(styles.text, styles.error)} data-tars-publish-entry="failed">{t("shell:tars.publish.status.failed")}</span> : null}
    <Button type="button" variant="ghost" size="xs" title={t("shell:tars.publish.openHint")} data-tars-publish-open={row.id} onClick={() => onPublish(row)}>
      <GitPullRequestDraft aria-hidden />{t("shell:tars.publish.open")}</Button>
  </>;
}
