import * as stylex from "@stylexjs/stylex";
import { useMemo, useState } from "react";
import { i18n, useTranslation } from "@/i18n";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { Button } from "@/components/ads/components/Button";
import { Plan } from "@/components/ads/components/Plan";
import { sx } from "@/components/ads/utils/stylex";
import { toPlanSteps } from "@/components/agent-runs/AgentRunPlan";
import type { StagePlan } from "@/lib/agent-runs/domain";

/**
 * The plan in the shelf's open details, on the design system's `Plan`. The
 * run line above already names the current step and the count and announces
 * them, so this plan has no count or announcer of its own: it lists the steps,
 * with the finished ones folded behind one toggle while any are left, so the
 * current step leads.
 */
export function ShelfPlan({ items, live }: { items: StagePlan["items"]; live: boolean }) {
  useTranslation();
  const [showDone, setShowDone] = useState(false);
  const steps = useMemo(() => toPlanSteps(items, live), [items, live]);
  if (!items.length) return null;
  const done = items.filter((item) => item.status === "completed").length;
  // A finished plan lists every step; there is nothing left to lead with.
  const foldable = done > 0 && done < items.length;
  const shown = foldable && !showDone ? steps.filter((step) => step.status !== "done") : steps;
  return (
    <div className={sx(styles.root)} data-testid="shelf-plan">
      <Plan
        steps={shown}
        title={i18n.t("ui:plan.plan")}
        count={false}
        announce={false}
        actions={foldable ? (
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
      />
    </div>
  );
}

const styles = stylex.create({
  root: {
    minWidth: 0,
    borderTopColor: `color-mix(in oklch, ${vars["--ads-color-border"]} 50%, transparent)`,
    borderTopStyle: "solid",
    borderTopWidth: vars["--ads-border-width-hairline"],
    // A long plan scrolls inside the shelf instead of pushing the composer down.
    maxHeight: "25vh",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: vars["--ads-space-4"],
    paddingInline: vars["--ads-space-4"],
  },
  toggle: { color: vars["--ads-color-text-muted"] },
});
