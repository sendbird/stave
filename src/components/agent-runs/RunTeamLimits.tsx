import { useId, useState } from "react";
import { ChevronRight, Gauge } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { AgentResourceSnapshot } from "@/lib/agent-runs/resources";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { Button } from "@/components/aui/components/Button";
import { Meter } from "@/components/aui/components/Meter";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
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
  // Near the limit means spent turns: a helper's held start turns are not used up.
  const nearLimit = resources.teamTurns - resources.spent <= resources.teamTurns * 0.2;
  const segments = [
    { key: "used" as const, style: nearLimit ? metrics.warning : metrics.used },
    { key: "reserved" as const, style: metrics.reserved },
    { key: "remaining" as const, style: metrics.available },
  ];
  const share = (value: number) => resources.teamTurns > 0 ? Math.min(100, Math.max(0, value / resources.teamTurns * 100)) : 0;
  return <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:teamLimits.title")}>
    <div className={sx(styles.sectionHeader)}>
      <Gauge aria-hidden className={sx(styles.sectionIcon)} />
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:teamLimits.usageTitle")}</h3>
      <span className={sx(metrics.headroom, nearLimit && styles.toneWaiting)}>
        {i18n.t("agentRuns:teamLimits.available", values)}
      </span>
    </div>
    {/* The meter's value is the spent turns; the reserved turns ride after them as an overlay on the same track,
        and the track itself is what remains. The legend below names all three in words. */}
    <div className={sx(metrics.frame)} data-team-turn-meter="">
      <Meter label={i18n.t("agentRuns:teamLimits.sharedTurns")} hideLabel hideValue size="sm"
        tone={nearLimit ? "warning" : "neutral"} min={0} max={Math.max(1, resources.teamTurns)} value={Math.min(resources.spent, Math.max(1, resources.teamTurns))}
        getAriaValueText={() => i18n.t("agentRuns:teamLimits.budget", values)} />
      {resources.reserved > 0 ? <span aria-hidden className={sx(metrics.reservedOverlay)}
        style={{ insetInlineStart: `${share(resources.spent)}%`, inlineSize: `${share(resources.reserved)}%` }} /> : null}
    </div>
    <dl className={sx(metrics.legend)}>
      {segments.map(({ key, style }) => <div key={key} className={sx(metrics.stat)}>
        <dt className={sx(metrics.label)}><span aria-hidden className={sx(metrics.swatch, style)} />
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
  headroom: { flexShrink: 0, fontSize: vars["--aui-font-size-caption"], fontVariantNumeric: "tabular-nums", color: vars["--aui-color-text-muted"] },
  /** Clips the reserved overlay to the meter track's rounded ends. */
  frame: { position: "relative", borderRadius: vars["--aui-radius-full"], overflow: "hidden" },
  /** Held, not spent: the reserved turns are striped so they never read as the solid spent fill, even near the limit. */
  reservedOverlay: { position: "absolute", insetBlock: 0, pointerEvents: "none",
    backgroundImage: `repeating-linear-gradient(135deg, ${vars["--aui-color-warning"]} 0 2px, transparent 2px 4px)` },
  /** Legend swatches in the meter's own inks: the neutral fill, the reserved overlay and the bare track. */
  used: { backgroundColor: vars["--aui-color-text-muted"] },
  reserved: { backgroundImage: `repeating-linear-gradient(135deg, ${vars["--aui-color-warning"]} 0 2px, transparent 2px 4px)` },
  available: { backgroundColor: vars["--aui-color-canvas-subtle"], boxShadow: `inset 0 0 0 ${vars["--aui-border-width-hairline"]} ${vars["--aui-color-border"]}` },
  warning: { backgroundColor: vars["--aui-color-warning"] },
  legend: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: vars["--aui-space-8"], margin: 0 },
  helpers: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: vars["--aui-space-8"], margin: 0 },
  stat: { minWidth: 0 },
  label: { display: "flex", alignItems: "center", gap: vars["--aui-space-4"], fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  swatch: { flexShrink: 0, width: 6, height: 6, borderRadius: vars["--aui-radius-full"] },
  value: { margin: 0, marginTop: vars["--aui-space-4"], fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"], fontVariantNumeric: "tabular-nums", color: vars["--aui-color-text"] },
  copy: { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
});
