import { useId, useState } from "react";
import { ChevronRight, Gauge } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { AgentResourceSnapshot } from "@/lib/agent-runs/resources";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { Button } from "@/components/ads/components/Button";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** Keep the live budget readable; frozen limits and accounting rules are available on demand. */
export function RunTeamLimits({ resources }: { resources: AgentResourceSnapshot }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const policy = resources.memberPolicy ?? resources.policy;
  const values = { used: formatNumber(resources.spent), total: formatNumber(resources.teamTurns),
    reserved: formatNumber(resources.reserved), remaining: formatNumber(resources.remaining),
    active: formatNumber(resources.activeHelpers), launched: formatNumber(resources.helpersLaunched),
    concurrent: formatNumber(resources.policy.concurrentHelpers), totalHelpers: formatNumber(resources.policy.totalHelpers) };
  const nearLimit = resources.remaining <= resources.teamTurns * 0.2;
  const segments = [
    { key: "used" as const, value: resources.spent, style: metrics.used },
    { key: "reserved" as const, value: resources.reserved, style: metrics.reserved },
    { key: "remaining" as const, value: resources.remaining, style: metrics.available },
  ];
  return <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:teamLimits.title")}>
    <div className={sx(styles.sectionHeader)}>
      <Gauge aria-hidden className={sx(styles.sectionIcon)} />
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:teamLimits.usageTitle")}</h3>
      <span className={sx(metrics.headroom, nearLimit && styles.toneWaiting)}>
        {i18n.t("agentRuns:teamLimits.available", values)}
      </span>
    </div>
    <div className={sx(metrics.track)} role="meter" aria-label={i18n.t("agentRuns:teamLimits.sharedTurns")}
      aria-valuemin={0} aria-valuemax={resources.teamTurns} aria-valuenow={resources.spent + resources.reserved}
      aria-valuetext={i18n.t("agentRuns:teamLimits.budget", values)}>
      {segments.map(({ key, value, style }) => <span key={key} aria-hidden
        className={sx(metrics.segment, style, nearLimit && key === "used" && metrics.warning)}
        style={{ width: `${value / resources.teamTurns * 100}%` }} />)}
    </div>
    <dl className={sx(metrics.legend)}>
      {segments.map(({ key, style }) => <div key={key} className={sx(metrics.stat)}>
        <dt className={sx(metrics.label)}><span aria-hidden className={sx(metrics.swatch, style, nearLimit && key === "used" && metrics.warning)} />
          {i18n.t(`agentRuns:teamLimits.${key}`)}</dt>
        <dd className={sx(metrics.value)}>{values[key]}</dd>
      </div>)}
    </dl>
    {resources.remaining === 0 ? <p className={sx(styles.notice, styles.toneWaiting)}>
      {i18n.t(resources.reserved > 0 ? "agentRuns:teamLimits.allAllocated" : "agentRuns:teamLimits.exhausted")}
    </p> : null}
    <Button variant="quiet" size="xs" press="none" xstyle={styles.disclosureSummary}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
      <ChevronRight aria-hidden className={sx(styles.chevronSm, open && styles.chevronOpen)} />
      {i18n.t("agentRuns:teamLimits.details")}
    </Button>
    <div id={panelId} hidden={!open}>
      <div className={sx(styles.section)}>
        <dl className={sx(metrics.helpers)}>
          <div className={sx(metrics.stat)}>
            <dt className={sx(metrics.label)}>{i18n.t("agentRuns:teamLimits.working")}</dt>
            <dd className={sx(metrics.value)}>{i18n.t("agentRuns:teamLimits.ratio", { value: values.active, total: values.concurrent })}</dd>
          </div>
          <div className={sx(metrics.stat)}>
            <dt className={sx(metrics.label)}>{i18n.t("agentRuns:teamLimits.called")}</dt>
            <dd className={sx(metrics.value)}>{i18n.t("agentRuns:teamLimits.ratio", { value: values.launched, total: values.totalHelpers })}</dd>
          </div>
        </dl>
        <p className={sx(styles.notice, metrics.copy)}>{i18n.t("agentRuns:teamLimits.route", {
          provider: getProviderLabel({ providerId: policy.providerId }),
          model: policy.modelLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible"),
          effort: policy.effortLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible") })}</p>
        <p className={sx(styles.notice, metrics.copy)}>{i18n.t("agentRuns:teamLimits.boundary")}</p>
      </div>
    </div>
  </section>;
}

const metrics = stylex.create({
  headroom: { flexShrink: 0, fontSize: vars["--ads-font-size-caption"], fontVariantNumeric: "tabular-nums", color: vars["--ads-color-text-muted"] },
  track: { display: "flex", height: vars["--ads-space-8"], borderRadius: vars["--ads-radius-full"], overflow: "hidden" },
  segment: { height: "100%", flexShrink: 0 },
  used: { backgroundColor: vars["--ads-color-text-muted"] },
  reserved: { backgroundColor: vars["--ads-color-warning"] },
  available: { backgroundColor: vars["--ads-color-border"] },
  warning: { backgroundColor: vars["--ads-color-warning-text"] },
  legend: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: vars["--ads-space-8"], margin: 0 },
  helpers: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: vars["--ads-space-8"], margin: 0 },
  stat: { minWidth: 0 },
  label: { display: "flex", alignItems: "center", gap: vars["--ads-space-4"], fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-muted"] },
  swatch: { flexShrink: 0, width: 6, height: 6, borderRadius: vars["--ads-radius-full"] },
  value: { margin: 0, marginTop: vars["--ads-space-4"], fontSize: vars["--ads-font-size-lead"], fontWeight: vars["--ads-font-weight-semibold"], fontVariantNumeric: "tabular-nums", color: vars["--ads-color-text"] },
  copy: { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
});
