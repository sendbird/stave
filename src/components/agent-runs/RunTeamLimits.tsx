import { useId, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { AgentResourceSnapshot } from "@/lib/agent-runs/resources";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { agentRunStyles as styles } from "./agent-runs.styles";

/**
 * The helper Agents a run may call, against its frozen limits. Turns are not a
 * budget here: time and provider usage bound the team, and its shared guard
 * against loops is explained on demand.
 */
export function RunTeamLimits({ resources }: { resources: AgentResourceSnapshot }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const policy = resources.memberPolicy ?? resources.policy;
  const ratio = (value: number, total: number) => i18n.t("agentRuns:teamLimits.ratio", { value: formatNumber(value), total: formatNumber(total) });
  return <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:teamLimits.title")}>
    <div className={sx(styles.sectionHeader)}>
      <Users aria-hidden className={sx(styles.sectionIcon)} />
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:teamLimits.usageTitle")}</h3>
    </div>
    <dl className={sx(metrics.helpers)}>
      <div className={sx(metrics.stat)}>
        <dt className={sx(metrics.label)}>{i18n.t("agentRuns:teamLimits.working")}</dt>
        <dd className={sx(metrics.value)}>{ratio(resources.activeHelpers, resources.policy.concurrentHelpers)}</dd>
      </div>
      <div className={sx(metrics.stat)}>
        <dt className={sx(metrics.label)}>{i18n.t("agentRuns:teamLimits.called")}</dt>
        <dd className={sx(metrics.value)}>{ratio(resources.helpersLaunched, resources.policy.totalHelpers)}</dd>
      </div>
    </dl>
    <Button variant="quiet" size="xs" press="none" xstyle={styles.disclosureSummary}
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
      <ChevronRight aria-hidden className={sx(styles.chevronSm, open && styles.chevronOpen)} />
      {i18n.t("agentRuns:teamLimits.details")}
    </Button>
    <div id={panelId} hidden={!open}>
      <div className={sx(styles.section)}>
        <p className={sx(styles.notice, metrics.copy)}>{i18n.t("agentRuns:teamLimits.route", {
          provider: getProviderLabel({ providerId: policy.providerId }),
          model: policy.modelLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible"),
          effort: policy.effortLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible") })}</p>
        <p className={sx(styles.notice, metrics.copy)}>{i18n.t("agentRuns:teamLimits.boundary", { count: resources.teamTurns })}</p>
      </div>
    </div>
  </section>;
}

const metrics = stylex.create({
  helpers: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: vars["--aui-space-8"], margin: 0 },
  stat: { minWidth: 0 },
  label: { fontSize: vars["--aui-font-size-caption"], color: vars["--aui-color-text-muted"] },
  value: { margin: 0, marginTop: vars["--aui-space-4"], fontSize: vars["--aui-font-size-lead"], fontWeight: vars["--aui-font-weight-semibold"], fontVariantNumeric: "tabular-nums", color: vars["--aui-color-text"] },
  copy: { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" },
});
