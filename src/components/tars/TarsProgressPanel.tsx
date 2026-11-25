import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { AgentProgressControllerView, type AgentPanelChrome } from "@/components/agent-progress/AgentProgressControllerView";
import { useTaskMessages } from "@/components/agent-progress/use-task-messages";
import { countWorkSteps, findCurrentStep, stepsFromMessages } from "@/lib/agent-progress";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { agentRunElapsedMs } from "@/lib/agent-runs/agent-run-status";
import { useNow } from "@/components/agent-runs/useAgentRun";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { textStep } from "@/lib/agent-progress/step-builders";
import type { AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";

const RUN_STATE = { running: "working", paused: "paused", completed: "ready", stopped: "stopped", cancelled: "stopped" } as const;

/** A single lead task can hold ordinary turns and several runs. Only read this run's responses. */
export function tarsRunMessages(detail: AgentRunDetail, messages: readonly ChatMessage[]) {
  const turns = new Set<string>();
  for (const event of detail.events) {
    if (event.kind === "turn-linked" && typeof event.detail.turnId === "string") turns.add(event.detail.turnId);
  }
  for (const message of messages) {
    if (message.turnId && message.agentRunPrompt?.agentRunId === detail.agentRun.id) turns.add(message.turnId);
  }
  return messages.filter((message) => message.role === "assistant" && message.turnId && turns.has(message.turnId));
}

export function TarsProgressPanel({ target, chrome }: {
  target: Extract<AgentProgressTarget, { kind: "tars" }>;
  chrome: AgentPanelChrome;
}) {
  const { t, i18n } = useTranslation(["session"]);
  const detail = useFleetAgentRunsStore((state) => state.details[target.runId]) ?? target.snapshot;
  const { agentRun: run } = detail;
  const now = useNow(run.state === "running", 1_000);
  const context = { taskId: run.leadTaskId, workspaceId: run.workspaceId };
  const read = useTaskMessages({ ...context, refreshKey: run.state });
  const cwd = useAppStore((state) => state.workspacePathById[run.workspaceId]);
  const trace = useMemo(() => stepsFromMessages(tarsRunMessages(detail, read.messages), {
    taskId: run.leadTaskId, workspaceId: run.workspaceId, providerId: run.fingerprint.providerId,
    live: run.state === "running", cwd,
  }), [detail, read.messages, run, cwd, i18n.language]);
  const steps = trace.steps.length ? trace.steps : detail.stages.flatMap((record) => {
    const stage = run.workflow.stages.find((item) => item.id === record.stageId);
    if (!stage || !record.startedAt) return [];
    const report = record.report;
    const text = report?.outcome === "complete" ? report.summary : report?.missing ?? record.detail;
    const title = getStageDisplayTitle(stage);
    return [textStep({ id: JSON.stringify([stage.id, record.attempt]), kind: "note", text: text ? title + "\n" + text : title,
      startedAt: Date.parse(record.startedAt), status: record.status === "running" ? "running" : record.status === "blocked" || record.status === "stuck" ? "error" : "done" })];
  });
  return <AgentProgressControllerView target={target} chrome={chrome} controller={{
    context, loading: read.loading, hasOlder: read.hasOlder, onLoadOlder: read.loadOlder,
    notice: read.error ? t("session:agentProgress.panel.historyUnavailable", { detail: read.error }) : null,
    progress: { id: run.id, source: "tars", title: target.title, ask: run.assignment, result: trace.result,
      state: RUN_STATE[run.state], steps, now: findCurrentStep(steps), readOnly: true,
      facts: { model: run.fingerprint.model, providerId: run.fingerprint.providerId, steps: trace.steps.length ? countWorkSteps(steps) : steps.length,
        elapsedMs: agentRunElapsedMs(detail, now), spend: detail.usage ? { inputTokens: detail.usage.inputTokens, outputTokens: detail.usage.outputTokens, totalCostUsd: detail.usage.costUsd ?? undefined } : undefined } },
  }} />;
}
