import type { AgentAssignment, RecordTaskAgentInput } from "./assign";

/**
 * Renderer ↔ main ↔ host contract for agents. The renderer sends an assign
 * request; main validates its shape and forwards it; the host validates it
 * again, records it, runs intake and starts the first turn.
 */

export const AGENT_IPC = Object.freeze({
  assign: "agents:assign",
  /** Renderer → main: record that a task Kickoff created runs as an agent. */
  recordTask: "agents:record-task",
  listAssignments: "agents:list-assignments",
  /** Renderer → main: the saved custom agents, for delegation and projects. */
  sync: "agents:sync",
  /** Main → renderer: an assignment was created or changed state. */
  changed: "agents:changed",
});

/** Host actions behind `agent.invoke`. */
export type HostAgentAction = "assign" | "record-task" | "list-assignments" | "sync-agents" | "delegation-context";

/**
 * What limits a delegation from one task: the permission of the agent the
 * task runs as, and the agents its project allows. Null means no limit.
 */
export interface AgentDelegationContext {
  parentPermission: import("./schema").AgentPermission | null;
  allowedAgentIds: string[] | null;
}

export type AgentInvokeResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "invalid" | "refused" | "conflict" | "failed"; message: string };

export interface AgentAssignmentsListArgs {
  agentConfigId?: string;
  limit?: number;
}

export interface AgentsBridgeApi {
  /** `requestId` makes a retried call return the same assignment. */
  assign: (args: unknown) => Promise<AgentInvokeResult<AgentAssignment>>;
  /**
   * Records that a task Kickoff already created runs as an agent, before its
   * first turn. Idempotent by `requestId`; every later turn runs as the agent.
   */
  recordTask: (args: RecordTaskAgentInput) => Promise<AgentInvokeResult<AgentAssignment>>;
  listAssignments: (args?: AgentAssignmentsListArgs) => Promise<AgentInvokeResult<AgentAssignment[]>>;
  subscribeChanged: (listener: () => void) => () => void;
  /** Hands main and the host the saved custom agents; they only read this copy. */
  sync: (args: { customAgents: unknown[]; myStandards?: unknown }) => Promise<{ ok: boolean }>;
}
