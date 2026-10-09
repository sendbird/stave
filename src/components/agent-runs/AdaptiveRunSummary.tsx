import { i18n, useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import type { AgentResourceSnapshot } from "@/lib/agent-runs/resources";
import { sx } from "@/components/ads/utils/stylex";
import * as stylex from "@stylexjs/stylex";
import { agentRunStyles as styles } from "./agent-runs.styles";

export function AdaptiveRunSummary({ resources }: { resources: AgentResourceSnapshot }) {
  useTranslation();
  const policy = resources.memberPolicy ?? resources.policy;
  const values = { used: formatNumber(resources.spent), total: formatNumber(resources.policy.teamTurns),
    reserved: formatNumber(resources.reserved), remaining: formatNumber(resources.remaining),
    active: formatNumber(resources.activeHelpers), launched: formatNumber(resources.helpersLaunched) };
  return <section className={sx(styles.section, styles.sectionRule)} aria-label={i18n.t("agentRuns:adaptive.title")}>
    <h3 className={sx(styles.sectionTitle)}>{i18n.t("agentRuns:adaptive.title")}</h3>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:adaptive.budget", values)}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:adaptive.helpers", values)}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:adaptive.route", { provider: policy.providerId,
      model: policy.modelLocked ? i18n.t("agentRuns:adaptive.pinned") : i18n.t("agentRuns:adaptive.eligible"),
      effort: policy.effortLocked ? i18n.t("agentRuns:adaptive.pinned") : i18n.t("agentRuns:adaptive.eligible") })}</p>
    <p className={sx(copy.text)}>{i18n.t("agentRuns:adaptive.boundary")}</p>
  </section>;
}
const copy = stylex.create({ text: { minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" } });
