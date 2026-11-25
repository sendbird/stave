import { textStep } from "@/lib/agent-progress/step-builders";
import { useCompareVariantProgress } from "./use-compare-variant-progress";
import { useTranslation } from "@/i18n";
import { AgentProgressControllerView, type AgentPanelChrome } from "@/components/agent-progress/AgentProgressControllerView";
import { useChildTaskSteps } from "@/components/agent-progress/use-agent-progress";
import { countWorkSteps, findCurrentStep } from "@/lib/agent-progress";
import { COMPARE_VARIANT_WORK_STATE } from "@/lib/compare-run-progress";
import type { AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";

export function CompareProgressPanel({ target, chrome }: {
  target: Extract<AgentProgressTarget, { kind: "compare-candidate" }>;
  chrome: AgentPanelChrome;
}) {
  const { t } = useTranslation(["session"]);
  const run = useAppStore((state) => state.compareRunsById[target.runId]);
  const variant = run?.variants.find((item) => item.id === target.variantId) ?? target.snapshot;
  const summary = useCompareVariantProgress(variant);
  const elapsed = summary?.elapsed;
  const current = variant.status === "running" && summary?.current;
  const context = { taskId: variant.taskId, workspaceId: variant.workspaceId };
  const read = useChildTaskSteps({ ...context, providerId: variant.provider, live: variant.status === "running", settleKey: variant.status });
  const progress = {
    id: variant.id, source: target.kind, title: target.title, state: COMPARE_VARIANT_WORK_STATE[variant.status],
    ask: read.ask ?? run?.seedPrompt, result: read.result, error: variant.error, readOnly: true,
    steps: read.steps, now: current ? textStep({ id: variant.id + ":now", kind: "note", text: current, status: "running" }) : findCurrentStep(read.steps),
    facts: {
      ...(elapsed?.running && elapsed.startedAt !== null ? { startedAt: elapsed.startedAt } : { elapsedMs: elapsed?.milliseconds }),
      spend: summary?.usage,
      model: variant.model, effort: variant.effort, providerId: variant.provider, steps: countWorkSteps(read.steps) },
  };
  return <AgentProgressControllerView target={target} chrome={chrome} controller={{
    progress, context, loading: read.loading, hasOlder: read.hasOlder, onLoadOlder: read.loadOlder,
    notice: read.error ? t("session:agentProgress.panel.historyUnavailable", { detail: read.error }) : null,
    onOpenTask: run && variant.taskId && variant.workspaceId
      ? () => void useAppStore.getState().openCompareVariant({ compareRunId: run.id, variantId: variant.id }) : undefined,
  }} />;
}
