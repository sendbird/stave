import type { AgentAssignment } from "./assign";

/**
 * Renderer ↔ main ↔ host contract for agents. The renderer sends an assign
 * request; main validates its shape and forwards it; the host validates it
 * again, records it, runs intake and starts the first turn.
 */

export const AGENT_IPC = Object.freeze({
  assign: "agents:assign",
  listAssignments: "agents:list-assignments",
  /** Main → renderer: an assignment was created or changed state. */
  changed: "agents:changed",
});

/** Host actions behind `agent.invoke`. */
export type HostAgentAction = "assign" | "list-assignments";

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
  listAssignments: (args?: AgentAssignmentsListArgs) => Promise<AgentInvokeResult<AgentAssignment[]>>;
  subscribeChanged: (listener: () => void) => () => void;
}
