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
    return <><ExternalAnchor href={publication.url} className={sx(publishStyles.link)} data-tars-publish-entry="opened" data-tars-publish-url={publication.url}>
      {publication.number ? t("shell:tars.publish.status.opened", { number: publication.number }) : t("shell:tars.publish.status.openedUnnumbered")}</ExternalAnchor><TarsPrChecksLine row={row} /></>;
  }
  if (isTarsPublicationUnfinished(publication)) return <span className={sx(styles.text)} role="status" data-tars-publish-entry="running">{t("shell:tars.publish.status.running")}</span>;
  if (!isTarsPublishable(row) || !onPublish) return null;
  return <>
    {publication?.state === "failed" ? <span className={sx(styles.text, styles.error)} data-tars-publish-entry="failed">{t("shell:tars.publish.status.failed")}</span> : null}
    <Button type="button" variant="ghost" size="xs" title={t("shell:tars.publish.openHint")} data-tars-publish-open={row.id} onClick={() => onPublish(row)}>
      <GitPullRequestDraft aria-hidden />{t("shell:tars.publish.open")}</Button>
  </>;
}

/** Reuses the card's existing text treatment in every theme and density. */
export function TarsPrChecksLine({ row }: { row: TarsResponsibility }) {
  const { t } = useTranslation(["shell"]);
  if (!row.publication?.number) return null;
  const checks = row.publication.checks;
  const state = checks && checks.headSha === row.publication.commit ? checks.state : "pending";
  return <span className={sx(styles.text)} data-tars-pr-checks={state}>
    {" · "}{t(`shell:tars.prChecks.${state}`, { count: checks?.failing.length ?? 0 })}
  </span>;
}
