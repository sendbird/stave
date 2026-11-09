import { useId } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { RunMonitor } from "@/components/aui/components/RunMonitor";
import type { AgentStepState } from "@/components/aui/components/agent-state";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsRecap, TarsRecapKind } from "@/lib/tars/tray-model";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import { tarsMonitorStyles as styles } from "./tars-monitor.styles";

const KINDS: readonly TarsRecapKind[] = ["needsYou", "failed", "done"];
const KIND_TONE: Record<TarsRecapKind, BadgeTone> = { needsYou: "warning", failed: "danger", done: "success" };
/** What came back, as the run lifecycle the design system's recap draws. */
const KIND_STATE: Record<TarsRecapKind, AgentStepState> = { needsYou: "approval", failed: "failed", done: "completed" };

/**
 * What changed while the user was away from the Tars view: counts, then the
 * latest changes, each a returned run (AUI `RunMonitor variant="recap"`) that opens its place in
 * the side view. Rendered only when something changed; dismissing it is
 * view-only. No review state is claimed: Tars does not record one.
 */
export function TarsAwayRecap({ recap, onOpenSide, onDismiss }: {
  recap: TarsRecap;
  onOpenSide?: (target: TarsSideViewTarget) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  return <section className={sx(styles.recap)} aria-labelledby={titleId} data-tars-recap="">
    <div className={sx(styles.recapHeader)}>
      <div className={sx(styles.recapHeading)}>
        <h3 id={titleId} className={sx(styles.recapTitle)}>{t("shell:tars.recap.title")}</h3>
        <p className={sx(styles.recapSince)}><time dateTime={recap.since}>{t("shell:tars.recap.since", { time: formatDateTime(recap.since) })}</time></p>
      </div>
      <Button variant="ghost" size="icon-2xs" aria-label={t("shell:tars.recap.dismiss")} title={t("shell:tars.recap.dismiss")} data-tars-recap-dismiss="" onClick={onDismiss}>
        <X aria-hidden /></Button>
    </div>
    <ul className={sx(styles.recapCounts)} data-tars-recap-counts="">
      {KINDS.filter((kind) => recap.counts[kind] > 0).map((kind) => <li key={kind}>
        <Badge size="md" tone={KIND_TONE[kind]} data-tars-recap-count={kind}>{t(`shell:tars.recap.${kind}`, { count: recap.counts[kind] })}</Badge>
      </li>)}
    </ul>
    <ul className={sx(styles.recapList)}>
      {recap.items.map((item) => {
        const kind = t(`shell:tars.recap.kind.${item.kind}`);
        return <li key={`${item.kind}:${item.responsibilityId}`}>
          <RunMonitor variant="recap" data-tars-recap-item={item.kind} title={item.title} status={KIND_STATE[item.kind]} statusLabel={kind}
            returned={<time dateTime={item.at}>{formatDateTime(item.at)}</time>}
            actions={<Button variant="secondary" size="2xs" disabled={!onOpenSide} aria-label={t("shell:tars.recap.open", { title: item.title, kind })}
              onClick={() => onOpenSide?.(item.side)}>{t("shell:tars.recap.openAction")}</Button>} />
        </li>;
      })}
    </ul>
    {recap.more > 0 ? <p className={sx(styles.recapMore)}>{t("shell:tars.recap.more", { count: recap.more })}</p> : null}
  </section>;
}
