import { useLayoutEffect, useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { AgentRunOverview } from "@/components/agent-runs/AgentRunOverview";
import { FleetAgentRunStrip } from "@/components/agent-runs/FleetAgentRunStrip";
import { ComposerShelf } from "@/components/session/composer-shelf/ComposerShelf";
import { TaskScopeProvider } from "@/components/session/task-scope-context";
import { SubagentsSection } from "@/components/session/SubagentsSection";
import { useAppStore } from "@/store/app.store";
import { agentRunTaskKey, useAgentRunsStore } from "@/store/agent-runs-store";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { appendProviderEventToAssistant } from "@/lib/session/provider-event-replay";
import { resolveAgentRunPlan } from "@/lib/agent-runs/progress";
import type { ChatMessage } from "@/types/chat";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { buildAgentRunFixtures } from "./agent-run-fixtures";
import { agentRunStyles as styles } from "@/components/agent-runs/agent-runs.styles";

export function PlanVisibilityCases({ width }: { width: number | null }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<"claude-code" | "codex">("claude-code");
  const detail = useMemo(() => {
    const base = buildAgentRunFixtures(new Date(Date.now() - 60_000)).working;
    return { ...base, agentRun: { ...base.agentRun, workflow: { ...base.agentRun.workflow, name: "Lead" } } };
  }, []);
  const { leadTaskId: taskId, workspaceId } = detail.agentRun;
  useLayoutEffect(() => {
    let message: ChatMessage = { id: "live", role: "assistant", providerId: provider, model: "model", content: "", turnId: "live-turn", parts: [] };
    const events: NormalizedProviderEvent[] = step === 0 ? [] : [
      { type: "tool", toolUseId: "lead-plan", toolName: "TodoWrite", input: JSON.stringify({ todos: [
        { content: "Inspect the affected contract", status: "completed" },
        { content: step > 1 ? "Review the result and verify every affected surface before opening the pull request" : "Implement the fix", status: "in_progress" },
        { content: "Open the pull request", status: "pending" },
      ] }), state: "output-available" },
      { type: "tool", toolUseId: "worker", agentId: "worker", toolName: provider === "codex" ? "collaboration:spawn_agent" : "Agent", input: '{"description":"Implementer"}', state: step > 1 ? "output-available" : "input-available", ...(step > 1 ? { output: "The fix and focused checks passed." } : {}) },
      { type: "tool", toolUseId: "worker-plan", ownerAgentId: "worker", toolName: "TodoWrite", input: '{"todos":[{"content":"Run focused checks","status":"in_progress"}]}', state: "output-available" },
    ];
    for (const event of events) message = appendProviderEventToAssistant({ message, event });
    const messages: ChatMessage[] = [{ id: "prompt", role: "user", model: "user", providerId: "user", content: "assignment", parts: [], agentRunPrompt: { agentRunId: detail.agentRun.id, assignment: "assignment" } }, message];
    const plan = resolveAgentRunPlan(detail, messages);
    const shown = {
      ...detail,
      agentRun: { ...detail.agentRun, fingerprint: { providerId: provider, model: provider === "codex" ? "gpt-6.1-sol" : "sonnet" } },
      stages: step === 3 && plan ? detail.stages.map((stage) => ({ ...stage, facts: { diff: null, commands: [], toolCalls: [], action: null, plan } })) : detail.stages,
    };
    // Between turns only saved stage facts supply the lead plan; worker parts survive.
    if (step === 3) messages[1] = { ...message, parts: message.parts?.filter((part) => part.type !== "tool_use" || part.ownerAgentId || part.toolName !== "TodoWrite") };
    useAppStore.setState((state) => ({
      activeWorkspaceId: workspaceId, activeTaskId: taskId,
      activeTurnIdsByTask: { ...state.activeTurnIdsByTask, [taskId]: step === 3 ? undefined : "live-turn" },
      messagesByTask: { ...state.messagesByTask, [taskId]: messages },
    }));
    useAgentRunsStore.setState({ workspaceId, loadedWorkspaceId: workspaceId, details: { [shown.agentRun.id]: shown }, agentRunIdByTask: { [agentRunTaskKey(workspaceId, taskId)]: shown.agentRun.id } });
    useFleetAgentRunsStore.setState((state) => ({ details: { ...state.details, [shown.agentRun.id]: shown } }));
  }, [detail, provider, step, taskId, workspaceId]);
  const shownDetail = useAgentRunsStore((state) => state.details[detail.agentRun.id]) ?? detail;
  return (
    <div style={{ maxWidth: width ?? 700 }} className={sx(styles.panel)}>
      <div className={sx(styles.actions)}>
        <Button size="xs" onClick={() => setProvider(provider === "codex" ? "claude-code" : "codex")}>{provider}</Button>
        <Button size="xs" onClick={() => setStep((step + 1) % 4)}>{["Write plan", "Finish worker", "Save between turns", "Reset"][step]}</Button>
      </div>
      <TaskScopeProvider taskId={taskId}>
        <ComposerShelf framed={false} steering={false} queue={null} />
        <FleetAgentRunStrip workspaceId={workspaceId} onOpen={() => {}} />
        <AgentRunOverview detail={shownDetail} now={Date.now()} />
        <SubagentsSection workspaceId={workspaceId} taskId={taskId} repositoryPath="/tmp/preview-project" readOnly />
      </TaskScopeProvider>
    </div>
  );
}
