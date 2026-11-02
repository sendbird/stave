import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AgentRunPlan } from "@/components/agent-runs/AgentRunPlan";
import type { StagePlan } from "@/lib/agent-runs/domain";

/**
 * The plan in the shelf's open details. The run line above already names the
 * current step and the count, so this section has no summary of its own: it
 * lists the steps, with the finished ones folded behind one toggle while any
 * are left, so the current step leads.
 */
export function ShelfPlan({ items, live }: { items: StagePlan["items"]; live: boolean }) {
  useTranslation();
  const [showDone, setShowDone] = useState(false);
  if (!items.length) return null;
  const done = items.filter((item) => item.status === "completed").length;
  // A finished plan lists every step; there is nothing left to lead with.
  const foldable = done > 0 && done < items.length;
  const shown = foldable && !showDone ? items.filter((item) => item.status !== "completed") : items;
  return (
    <section className={sx(styles.root)} data-testid="shelf-plan" aria-label={i18n.t("ui:plan.plan")}>
      <div className={sx(styles.head)}>
        <span className={sx(styles.heading)}>{i18n.t("ui:plan.plan")}</span>
        {foldable ? (
          <Button
            variant="quiet"
            size="xs"
            aria-expanded={showDone}
            onClick={() => setShowDone(!showDone)}
            xstyle={styles.toggle}
          >
            {showDone
              ? i18n.t("composer:shelfPlan.hideDone")
              : i18n.t("composer:shelfPlan.showDone", { count: done })}
          </Button>
        ) : null}
      </div>
      <div className={sx(styles.list)}>
        <AgentRunPlan items={shown} live={live} compact />
      </div>
    </section>
  );
}

const styles = stylex.create({
  root: {
    minWidth: 0,
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars["--ads-space-8"],
    minWidth: 0,
    paddingBlockStart: vars["--ads-space-4"],
    paddingInlineStart: vars["--ads-space-12"],
    paddingInlineEnd: vars["--ads-space-4"],
  },
  heading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  toggle: { color: vars["--ads-color-text-muted"] },
  list: {
    maxHeight: "25vh",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-12"],
  },
});
