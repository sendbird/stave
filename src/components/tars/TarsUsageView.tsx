import { DailyLimits } from "@/components/usage/DailyLimits";
import { Tooltip } from "@/components/aui/components/Tooltip";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { formatCost, formatDateTime, formatDuration, formatNumber, formatTokenCount } from "@/i18n/format";
import { Meter } from "@/components/aui/components/Meter";
import { Button as LinkButton } from "@/components/aui/components/Button";
import { ToggleGroup } from "@/components/aui/components/ToggleGroup";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";
import {
  TARS_USAGE_WINDOWS, tarsUsageBarMeasure, tarsUsageShare, type TarsUsageMetrics, type TarsUsageReport, type TarsUsageWindow,
} from "@/lib/tars/usage";
import { tarsInsightsStyles as styles } from "./tars-insights.styles";
import type { TarsUsageState } from "./use-tars-insights";

function repositoryLabel(repositoryPath: string) {
  return repositoryPath.split(/[\\/]/).filter(Boolean).at(-1) ?? repositoryPath;
}

/** A row's figures in one line: tokens when a turn reported them, a reported cost when one exists, turns and time always. */
function RowFigures({ metrics }: { metrics: TarsUsageMetrics }) {
  const { t } = useTranslation(["shell"]);
  return <>
    <span>{metrics.measuredTurns ? t("shell:tars.usage.tokens", { value: formatTokenCount(metrics.tokens) }) : t("shell:tars.usage.notReported")}</span>
    {metrics.costUsd !== null ? <span>{formatCost(metrics.costUsd)}</span> : null}
    <span>{t("shell:tars.usage.turns", { count: metrics.turns })}</span>
    {metrics.durationMs > 0 ? <span>{formatDuration(metrics.durationMs)}</span> : null}
  </>;
}

function Totals({ total }: { total: TarsUsageMetrics }) {
  const { t } = useTranslation(["shell"]);
  const missing = <span className={sx(styles.totalMissing)}>{t("shell:tars.usage.notReported")}</span>;
  return <>
    <dl className={sx(styles.totals)} aria-label={t("shell:tars.usage.totals.label")} data-tars-usage-totals="">
      <div className={sx(styles.total)}><dt className={sx(styles.totalLabel)}>{t("shell:tars.usage.totals.tokens")}</dt>
        <dd className={sx(styles.totalValue)} data-tars-usage-total="tokens" title={total.measuredTurns ? formatNumber(total.tokens) : undefined}>{total.measuredTurns ? formatTokenCount(total.tokens) : missing}</dd></div>
      {/* Money only when a provider reported it; no price is ever applied to tokens. */}
      {total.costUsd !== null ? <div className={sx(styles.total)}><dt className={sx(styles.totalLabel)}>{t("shell:tars.usage.totals.cost")}</dt>
        <dd className={sx(styles.totalValue)} data-tars-usage-total="cost">{formatCost(total.costUsd)}</dd></div> : null}
      <div className={sx(styles.total)}><dt className={sx(styles.totalLabel)}>{t("shell:tars.usage.totals.turns")}</dt>
        <dd className={sx(styles.totalValue)} data-tars-usage-total="turns">{formatNumber(total.turns)}</dd></div>
      <div className={sx(styles.total)}><dt className={sx(styles.totalLabel)}>{t("shell:tars.usage.totals.time")}</dt>
        <dd className={sx(styles.totalValue)} data-tars-usage-total="time">{formatDuration(total.durationMs)}</dd></div>
    </dl>
    {total.turns > total.measuredTurns ? <p className={sx(styles.note)}>{t("shell:tars.usage.unmeasured", { count: total.turns - total.measuredTurns, total: total.turns })}</p> : null}
    {total.costUsd !== null && total.costReportedTurns < total.turns ? <p className={sx(styles.note)}>{t("shell:tars.usage.costPartial", { count: total.costReportedTurns, total: total.turns })}</p> : null}
  </>;
}

function Report({ report, window, onOpenWork }: { report: TarsUsageReport; window: TarsUsageWindow; onOpenWork?: (responsibilityId: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const total = report.totals[window];
  const works = report.works.filter((work) => work.usage[window].turns > 0);
  const models = report.models.filter((model) => model.usage[window].turns > 0);
  const measure = tarsUsageBarMeasure(total);
  const bySize = (a: { usage: Record<TarsUsageWindow, TarsUsageMetrics> }, b: { usage: Record<TarsUsageWindow, TarsUsageMetrics> }) => b.usage[window][measure] - a.usage[window][measure];
  return <>
    <section className={sx(styles.section)} aria-label={t("shell:tars.usage.totals.label")}><Totals total={total} /></section>
    {total.turns === 0 ? <p className={sx(styles.note)} data-tars-usage-empty="">{t("shell:tars.usage.empty")}</p> : <>
      <section className={sx(styles.section)} data-tars-usage-breakdown="work">
        <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.usage.byWork")}</h3>
        <ul className={sx(styles.rows)}>{[...works].sort(bySize).map((work) => {
          const metrics = work.usage[window];
          return <li key={work.responsibilityId} className={sx(styles.row)} data-tars-usage-work={work.responsibilityId}>
            <div className={sx(styles.rowHead)}>
              {onOpenWork ? <LinkButton type="button" variant="link" size="sm" flushInline xstyle={styles.rowOpen} aria-label={t("shell:tars.usage.openWork", { title: work.title })}
                onClick={() => onOpenWork(work.responsibilityId)}>{work.title}</LinkButton> : <span className={sx(styles.rowName)}>{work.title}</span>}
            </div>
            <Meter size="sm" tone="neutral" showLabel={false} hideValue label={t("shell:tars.usage.share", { name: work.title })} value={tarsUsageShare(metrics, total)} />
            <p className={sx(styles.rowMeta)}>
              <RowFigures metrics={metrics} />
              <span className={sx(styles.rowMetaText)}>{[repositoryLabel(work.repositoryPath), ...work.modelIds[window]].join(" · ")}</span>
            </p>
          </li>;
        })}</ul>
      </section>
      <section className={sx(styles.section)} data-tars-usage-breakdown="model">
        <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.usage.byModel")}</h3>
        <ul className={sx(styles.rows)}>{[...models].sort(bySize).map((model) => {
          const metrics = model.usage[window];
          const name = model.modelId ?? t("shell:tars.usage.modelNotRecorded");
          return <li key={`${model.providerId}:${model.modelId ?? ""}`} className={sx(styles.row)} data-tars-usage-model={model.modelId ?? ""}>
            <div className={sx(styles.rowHead)}><span className={sx(styles.rowName)}>{name}</span></div>
            <Meter size="sm" tone="neutral" showLabel={false} hideValue label={t("shell:tars.usage.share", { name })} value={tarsUsageShare(metrics, total)} />
            <p className={sx(styles.rowMeta)}><RowFigures metrics={metrics} /><span className={sx(styles.rowMetaText)}>{PROVIDER_LABELS[model.providerId] ?? model.providerId}</span></p>
          </li>;
        })}</ul>
      </section>
    </>}
    {/* What the figures leave out, said where they are read. */}
    <ul className={sx(styles.notes)} data-tars-usage-notes="">
      <li className={sx(styles.note)}>{report.replies ? t("shell:tars.usage.replies", { count: report.replies[window] }) : t("shell:tars.usage.repliesUnread")}</li>
      <li className={sx(styles.note)}>{t("shell:tars.usage.helpers")}</li>
      <li className={sx(styles.note)}>{t("shell:tars.usage.period.localTime")}</li>
      {report.truncated ? <li className={sx(styles.note)}>{t("shell:tars.usage.truncated")}</li> : null}
      {report.omittedWorks ? <li className={sx(styles.note)}>{t("shell:tars.usage.omittedWorks", { count: report.omittedWorks })}</li> : null}
    </ul>
  </>;
}

/**
 * What Tars's work spent in a period, by work and by model. It shows only
 * what turn rows recorded: tokens where a provider reported them, money only
 * where a provider reported a cost, and turns and time for every turn.
 */
export function TarsUsageView({ state, onReload, onOpenWork, onOpenSettings }: { state: TarsUsageState; onReload: () => void; onOpenWork?: (responsibilityId: string) => void; onOpenSettings?: () => void }) {
  const { t } = useTranslation(["shell", "common"]);
  const [window, setWindow] = useState<TarsUsageWindow>("sevenDays");
  return <div className={sx(styles.body)} data-testid="tars-usage-view" data-tars-usage-status={state.status} data-tars-usage-window={window}>
    <DailyLimits refreshKey={state.report} onOpenSettings={onOpenSettings} />
    <div className={sx(styles.toolbar)}>
      <ToggleGroup density="compact" aria-label={t("shell:tars.usage.period.label")} value={[window]}
        options={TARS_USAGE_WINDOWS.map((value) => ({ value, label: t(`shell:tars.usage.period.${value}`) }))}
        onValueChange={(value) => { const next = value[0] as TarsUsageWindow | undefined; if (next) setWindow(next); }} />
      {state.status === "ready" ? <div className={sx(styles.toolbarEnd)}>
        <span className={sx(styles.note)}>{t("shell:tars.usage.asOf", { time: formatDateTime(state.report.generatedAt) })}</span>
        <Tooltip content={t("shell:tars.usage.refresh")}><Button type="button" variant="ghost" size="icon-sm" disabled={state.refreshing} focusableWhenDisabled aria-label={t("shell:tars.usage.refresh")} onClick={onReload}><RefreshCw aria-hidden /></Button></Tooltip>
      </div> : null}
    </div>
    {state.status === "loading" ? <p className={sx(styles.note)} role="status">{t("shell:tars.usage.loading")}</p> : null}
    {state.status === "unavailable" ? <p className={sx(styles.note)}>{t("shell:tars.usage.unavailable")}</p> : null}
    {state.status === "failed" ? <p role="alert" className={sx(styles.note, styles.error)}>{t("shell:tars.usage.loadFailed")}{" "}
      <Button type="button" variant="secondary" size="xs" onClick={onReload}>{t("common:actions.retry")}</Button></p> : null}
    {state.status === "ready" ? <Report report={state.report} window={window} onOpenWork={onOpenWork} /> : null}
  </div>;
}
