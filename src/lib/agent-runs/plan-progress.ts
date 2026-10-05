import { i18n } from "@/i18n/runtime";
import type { StagePlan } from "./domain";

export function describeRunPlan(plan: StagePlan | null): string {
  if (!plan?.items.length) return i18n.t("agentRuns:planProgress.describeRunPlan");
  const done = plan.items.filter((item) => item.status === "completed").length;
  const current = plan.items.find((item) => item.status === "in_progress");
  return i18n.t("agentRuns:planProgress.describeRunPlan2", { value1: done, value2: plan.items.length, value3: current ? i18n.t("agentRuns:planProgress.extraCopy292", { value1: current.content }) : "" });
}
