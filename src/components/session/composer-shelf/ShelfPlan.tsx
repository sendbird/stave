import * as stylex from "@stylexjs/stylex";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { AgentRunPlan, describePlanProgress } from "@/components/agent-runs/AgentRunPlan";
import type { StagePlan } from "@/lib/agent-runs/domain";

/** A plan stays readable independently of the activity list's placement/toggle. */
export function ShelfPlan({ items, live }: { items: StagePlan["items"]; live: boolean }) {
  useTranslation();
  if (!items.length) return null;
  const current = items.find((item) => item.status === "in_progress");
  const label = [i18n.t("ui:plan.plan"), describePlanProgress(items), current?.content].filter(Boolean).join(" · ");
  return (
    <details className={sx(styles.root)} data-testid="shelf-plan">
      <summary className={sx(styles.summary, focusRing.ringInset)} title={label}>
        <span className={sx(styles.label)}>{label}</span>
      </summary>
      <div className={sx(styles.list)}>
        <AgentRunPlan items={items} live={live} />
      </div>
    </details>
  );
}

const styles = stylex.create({
  root: { minWidth: 0 },
  summary: {
    cursor: "pointer",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
  label: { overflowWrap: "anywhere" },
  list: {
    maxHeight: "25vh",
    overflowY: "auto",
    paddingBlockEnd: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
  },
});
