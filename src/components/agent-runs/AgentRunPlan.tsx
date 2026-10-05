import { i18n, useTranslation } from "@/i18n";
import { CircleCheck, CircleDashed, LoaderCircle } from "lucide-react";
import { sx } from "@/components/ads/utils/stylex";
import type { StagePlan, StagePlanStatus } from "@/lib/agent-runs/domain";
import { agentRunStyles as styles } from "./agent-runs.styles";

const PRESENTATION = {
  completed: { icon: CircleCheck, mark: styles.toneDone, text: styles.muted, get label() { return i18n.t("agentRuns:agentRunPlan.label"); } },
  in_progress: { icon: LoaderCircle, mark: styles.toneActive, text: undefined, get label() { return i18n.t("agentRuns:agentRunPlan.label2"); } },
  pending: { icon: CircleDashed, mark: styles.toneIdle, text: undefined, label: "" },
} as const satisfies Record<StagePlanStatus, unknown>;

export function describePlanProgress(items: StagePlan["items"]): string {
  const done = items.filter((item) => item.status === "completed").length;
  return i18n.t("agentRuns:agentRunPlan.describePlanProgress", { value1: done, value2: items.length });
}

/**
 * A one-stage run's steps: the agent's own to-do list, as it stood when its
 * latest turn ended.
 */
export function AgentRunPlan({ items }: { items: StagePlan["items"] }) {
  useTranslation();
  return (
    <ul className={sx(styles.checkList)} aria-label={i18n.t("agentRuns:agentRunPlan.ariaLabel")}>
      {items.map((item, index) => {
        const presentation = PRESENTATION[item.status];
        const Icon = presentation.icon;
        return (
          <li key={`${index}:${item.content}`} className={sx(styles.check)}>
            <span className={sx(styles.checkMark)}>
              <Icon aria-hidden className={sx(styles.icon, presentation.mark)} />
            </span>
            <span className={sx(styles.checkText, presentation.text)}>{item.content}</span>
            {presentation.label ? (
              <span className={sx(styles.checkState, presentation.text)}>{presentation.label}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
