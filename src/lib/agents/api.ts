import type { AgentAssignment, RecordTaskAgentInput, ReleaseTaskAgentInput } from "./assign";

/**
 * Renderer ↔ main ↔ host contract for agents. Kickoff creates the workspace
 * and task in the renderer and records here that the task runs as an agent;
 * main validates each request's shape and forwards it; the host validates it
 * again and keeps the record every later turn of the task reads.
 */

export const AGENT_IPC = Object.freeze({
  /** Renderer → main: record that a task Kickoff created runs as an agent. */
  recordTask: "agents:record-task",
  releaseTask: "agents:release-task",
  listAssignments: "agents:list-assignments",
  /** Renderer → main: the saved custom agents, for delegation and projects. */
  sync: "agents:sync",
  /** Main → renderer: an assignment was created or changed state. */
  changed: "agents:changed",
});

/** Host actions behind `agent.invoke`. */
export type HostAgentAction = "record-task" | "release-task" | "list-assignments" | "sync-agents" | "delegation-context";

/**
 * What limits a delegation from one task: the permission of the agent the
 * task runs as, and the agents its project allows. Null means no limit.
 */
export interface AgentDelegationContext {
  parentPermission: import("./schema").AgentPermission | null;
  allowedAgentIds: string[] | null;
  /** The delegating task's own agent's `canCall`; null when it may call any agent. */
  parentCanCall: string[] | null;
}

export type AgentInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "invalid" | "refused" | "conflict" | "failed"; message: string };

export interface AgentAssignmentsListArgs {
  agentConfigId?: string;
  limit?: number;
}

export interface AgentsBridgeApi {
  /**
   * Records that a task Kickoff already created runs as an agent, before its
   * first turn. Idempotent by `requestId`; every later turn runs as the agent.
   */
  recordTask: (args: RecordTaskAgentInput) => Promise<AgentInvokeResult<AgentAssignment>>;
  /** Sets a task back to the default agent from its next turn; null when it had none. */
  releaseTask: (args: ReleaseTaskAgentInput) => Promise<AgentInvokeResult<AgentAssignment | null>>;
  listAssignments: (args?: AgentAssignmentsListArgs) => Promise<AgentInvokeResult<AgentAssignment[]>>;
  subscribeChanged: (listener: () => void) => () => void;
  /** Hands main and the host the saved custom agents; they only read this copy. */
  sync: (args: { customAgents: unknown[]; myStandards?: unknown }) => Promise<{ ok: boolean }>;
}
