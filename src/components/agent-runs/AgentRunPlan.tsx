import { i18n, useTranslation } from "@/i18n";
import { useMemo, type ReactNode } from "react";
import { Plan, type PlanProps, type PlanStepItem } from "@/components/ads/components/Plan";
import type { StagePlan } from "@/lib/agent-runs/domain";

/**
 * An agent's to-do items as plan steps, the one mapping every plan surface
 * uses: completed is done, and the step in progress runs while its work is
 * `live`. Once the work pauses, halts or ends that step reads as waiting, so a
 * stopped plan never looks busy, and it stays the current step
 * (`aria-current="step"`). Ids come from the full list, so a surface that
 * folds steps away keeps each step's identity.
 */
export function toPlanSteps(items: StagePlan["items"], live: boolean): PlanStepItem[] {
  return items.map((item, index) => ({
    id: `${index}:${item.content}`,
    title: item.content,
    status: item.status === "completed" ? "done" : item.status === "in_progress" && live ? "running" : "pending",
    ...(item.status === "in_progress" ? { current: true } : {}),
  }));
}

/**
 * A run's steps on the design system's `Plan`: its count, its status marks and
 * its announcer, which says what changed after the first render and nothing
 * before. `live` is whether the run is working right now.
 */
export function AgentRunPlan(props: {
  items: StagePlan["items"];
  live?: boolean;
  /** @default true */
  announce?: boolean;
  title?: ReactNode;
  count?: PlanProps["count"];
}) {
  useTranslation();
  const { items, live = false } = props;
  const steps = useMemo(() => toPlanSteps(items, live), [items, live]);
  return (
    <Plan
      steps={steps}
      announce={props.announce ?? true}
      title={props.title ?? i18n.t("ui:plan.plan")}
      {...(props.count === undefined ? {} : { count: props.count })}
    />
  );
}
