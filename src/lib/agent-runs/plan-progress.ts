import type { StagePlan } from "./domain";

export function describeRunPlan(plan: StagePlan | null): string {
  if (!plan?.items.length) return "Planning…";
  const done = plan.items.filter((item) => item.status === "completed").length;
  const current = plan.items.find((item) => item.status === "in_progress");
  return `Plan ${done}/${plan.items.length}${current ? ` · Now: ${current.content}` : ""}`;
}
