import type { DelegationExchange } from "@/lib/delegation/exchange";
import type { ProviderId } from "@/lib/providers/provider.types";
import { getWorkGraphFallbackLabel } from "@/lib/work-graph/work-graph-tree";
import type { AgentNode, WorkGraph } from "@/lib/work-graph/work-graph.types";
import { openAgentProgress } from "@/store/agent-progress-panel-store";

/**
 * The surfaces' ways into the Agent panel. Each addresses its agent by
 * reference (task, call, delegation key) so the panel reads it live.
 */

interface ParentTask {
  /** The task whose turn started the agent. */
  taskId: string;
  workspaceId?: string;
}

/** A delegation exchange from any list: a delegated task or an in-turn subagent. */
export function openExchangeProgress(args: ParentTask & { exchange: DelegationExchange }) {
  const { exchange } = args;
  if (exchange.kind === "delegated-task" && exchange.ref.delegationKey) {
    openAgentProgress({
      kind: "delegated-task",
      parentTaskId: args.taskId,
      ...(args.workspaceId ? { parentWorkspaceId: args.workspaceId } : {}),
      delegationKey: exchange.ref.delegationKey,
      ...(exchange.ref.delegatedTaskId ? { delegatedTaskId: exchange.ref.delegatedTaskId } : {}),
      ...(exchange.ref.delegatedWorkspaceId ? { delegatedWorkspaceId: exchange.ref.delegatedWorkspaceId } : {}),
      title: exchange.title,
      snapshot: exchange,
    });
    return;
  }
  openAgentProgress({
    kind: "subagent",
    parentTaskId: args.taskId,
    ...(args.workspaceId ? { parentWorkspaceId: args.workspaceId } : {}),
    ...(exchange.ref.toolUseId ? { toolUseId: exchange.ref.toolUseId } : {}),
    ...(exchange.ref.nodeKey ? { nodeKey: exchange.ref.nodeKey } : {}),
    ...(exchange.ref.agentId ? { agentId: exchange.ref.agentId } : {}),
    ...(exchange.identity.providerId ? { providerId: exchange.identity.providerId } : {}),
    title: exchange.title,
    snapshot: exchange,
  });
}

/** An agent row of the turn's work graph. */
export function openWorkGraphAgentProgress(args: ParentTask & { node: AgentNode; graph?: WorkGraph | null }) {
  const { node } = args;
  const title = getWorkGraphFallbackLabel(node.label);
  if (node.delegationKey) {
    openAgentProgress({
      kind: "delegated-task",
      parentTaskId: args.taskId,
      ...(args.workspaceId ? { parentWorkspaceId: args.workspaceId } : {}),
      delegationKey: node.delegationKey,
      ...(node.delegatedTaskId ? { delegatedTaskId: node.delegatedTaskId } : {}),
      title,
    });
    return;
  }
  openAgentProgress({
    kind: "subagent",
    parentTaskId: args.taskId,
    ...(args.workspaceId ? { parentWorkspaceId: args.workspaceId } : {}),
    nodeKey: node.key,
    ...(node.spawnedByToolUseId ? { toolUseId: node.spawnedByToolUseId } : {}),
    ...(node.agentId ? { agentId: node.agentId } : {}),
    ...(args.graph?.providerId ? { providerId: args.graph.providerId } : {}),
    title,
  });
}

/** A subagent's spawning call, as a turn activity row names it. */
export function openSubagentCallProgress(args: ParentTask & { toolUseId: string; title: string; providerId?: ProviderId }) {
  openAgentProgress({
    kind: "subagent",
    parentTaskId: args.taskId,
    ...(args.workspaceId ? { parentWorkspaceId: args.workspaceId } : {}),
    toolUseId: args.toolUseId,
    ...(args.providerId ? { providerId: args.providerId } : {}),
    title: args.title,
  });
}
