import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { AgentResourceSnapshot } from "@/lib/agent-runs/resources";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { agentRunStyles as styles } from "./agent-runs.styles";

/** The team limits a run froze when it started: the shared turn budget, helper Agents and model changes. */
export function RunTeamLimits({ resources }: { resources: AgentResourceSnapshot }) {
  useTranslation();
  const policy = resources.memberPolicy ?? resources.policy;
  const values = { used: formatNumber(resources.spent), total: formatNumber(resources.teamTurns),
    reserved: formatNumber(resources.reserved), remaining: formatNumber(resources.remaining),
    active: formatNumber(resources.activeHelpers), launched: formatNumber(resources.helpersLaunched),
    concurrent: formatNumber(resources.policy.concurrentHelpers), totalHelpers: formatNumber(resources.policy.totalHelpers) };
  return <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:teamLimits.title")}>
    <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:teamLimits.title")}</h3>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:teamLimits.budget", values)}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:teamLimits.helpers", values)}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:teamLimits.route", { provider: getProviderLabel({ providerId: policy.providerId }),
      model: policy.modelLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible"),
      effort: policy.effortLocked ? i18n.t("agentRuns:teamLimits.pinned") : i18n.t("agentRuns:teamLimits.eligible") })}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:teamLimits.boundary")}</p>
  </section>;
}
const copy = stylex.create({ text: { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" } });
