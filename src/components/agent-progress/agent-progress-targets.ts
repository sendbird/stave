import { i18n } from "@/i18n/runtime";
import {
  exchangeFromSubagentStep,
  type AgentProgress,
  type AgentStep,
} from "@/lib/agent-progress";
import type { AgentProgressTarget } from "@/store/agent-progress-panel-store";
import { agentProgressTargetKey } from "@/store/agent-progress-panel-store";
import { useAppStore } from "@/store/app.store";

/** Where an agent's own steps were read: the task that holds them. */
export interface AgentStepContext {
  taskId?: string;
  workspaceId?: string;
  repositoryPath?: string;
}

/**
 * The target a subagent step opens: an in-turn subagent is read from the
 * task that holds its spawning call (or the context's task, for one read from
 * a saved transcript); a delegated task from the task that delegated it.
 */
export function childTargetFromStep(step: AgentStep, context: AgentStepContext): AgentProgressTarget | null {
  const child = step.child;
  if (!child) return null;
  if (child.kind === "delegated-task") {
    if (!context.taskId || !child.delegationKey) return null;
    return {
      kind: "delegated-task",
      parentTaskId: context.taskId,
      repositoryPath: context.repositoryPath,
      ...(context.workspaceId ? { parentWorkspaceId: context.workspaceId } : {}),
      delegationKey: child.delegationKey,
      delegatedTaskId: child.delegatedTaskId,
      ...(child.delegatedWorkspaceId ? { delegatedWorkspaceId: child.delegatedWorkspaceId } : {}),
      title: child.title,
    };
  }
  const taskId = child.taskId ?? context.taskId;
  if (!taskId || (!child.toolUseId && !child.agentId)) return null;
  const workspaceId = child.workspaceId ?? context.workspaceId;
  return {
    kind: "subagent",
    parentTaskId: taskId,
    repositoryPath: context.repositoryPath,
    ...(workspaceId ? { parentWorkspaceId: workspaceId } : {}),
    ...(child.toolUseId ? { toolUseId: child.toolUseId } : {}),
    ...(child.agentId ? { agentId: child.agentId } : {}),
    ...(child.providerId ? { providerId: child.providerId } : {}),
    title: child.title,
    snapshot: exchangeFromSubagentStep(step),
  };
}

export function agentTargetTitle(target: AgentProgressTarget): string {
  const snapshotTitle = target.kind === "subagent" || target.kind === "delegated-task" ? target.snapshot?.title : undefined;
  return target.title?.trim() || snapshotTitle || i18n.t("session:agentProgress.panel.title");
}

/** What the panel shows while an agent's sources are still being read. */
export function placeholderProgress(target: AgentProgressTarget): AgentProgress {
  return {
    id: agentProgressTargetKey(target),
    source: target.kind,
    title: agentTargetTitle(target),
    state: "unknown",
    facts: { steps: 0 },
    steps: [],
    readOnly: true,
  };
}

/** Brings the task forward and, when known, the call that started the agent. */
export async function revealInConversation(args: { taskId: string; workspaceId?: string; repositoryPath?: string; toolUseId?: string }) {
  const state = useAppStore.getState();
  if (state.activeTaskId !== args.taskId || (args.repositoryPath && state.repositoryPath !== args.repositoryPath)) {
    await state.focusTaskAttention({ taskId: args.taskId, repositoryPath: args.repositoryPath, ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}) });
  }
  if (args.toolUseId) {
    useAppStore.getState().focusTranscriptTool({ taskId: args.taskId, toolUseId: args.toolUseId });
  }
}
