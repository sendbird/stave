/**
 * Assignments in the host service: the record of which agent a task runs as.
 * Kickoff, agent runs and the agentic composer create the task and its first
 * turn the ordinary way and record the agent here before that turn; every
 * turn of the task then resolves the agent from this record.
 *
 * Rows an earlier build left preparing (from the retired host-side assign
 * start) are never replayed; on start they are marked interrupted with what
 * they had made, so the user can check before starting the work again.
 *
 * Used by: `electron/host-service.ts` (wired through `assign-host.ts`).
 */
import { randomUUID } from "node:crypto";
import type { AgentAssignment } from "../../../src/lib/agents/assign";
import { compileAgent, hashAgentContent, snapshotAgent } from "../../../src/lib/agents/compile";
import { releasedAgentInstructions } from "../../../src/lib/agents/runtime-options";
import type { ProviderId } from "../../../src/lib/providers/provider.types";
import type { AgentAssignmentStore } from "../../persistence/agent-assignment-store";
import { prepareTaskAgentTurn, type TaskAgentTurn } from "../../providers/task-agent-turn";
import type { StreamTurnArgs } from "../../providers/types";

export class AssignError extends Error {
  constructor(
    readonly code: "invalid" | "refused" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "AssignError";
  }
}

export interface AssignRuntimeDependencies {
  store: Pick<AgentAssignmentStore, "create" | "update" | "get" | "getByRequestId" | "getByTaskId" | "list" | "listInState">;
  emitChanged?: (assignment: AgentAssignment) => void;
  /**
   * The task stopped running as the agent it had: released, or replaced by
   * another assignment. Its agent run ends with it.
   */
  onTaskAgentEnded?: (taskId: string) => void;
  /** The active agent library, for a main Agent's in-turn subagents. */
  listAgents?: () => readonly AgentAssignment["agent"][];
  now?: () => Date;
  newId?: () => string;
}

export interface AssignRuntime {
  prepareTurn: (turn: StreamTurnArgs) => TaskAgentTurn | null;
  /** Marks rows a previous run left preparing as interrupted. Call once at start. */
  recover: () => void;
  list: (args?: { agentConfigId?: string; limit?: number }) => AgentAssignment[];
  /** The agent an assigned task runs as, for its later turns. */
  agentForTask: (taskId: string) => AgentAssignment["agent"] | null;
  /**
   * Records that a task another starter made (a composer or delegated task) runs
   * as an agent, before its first turn. Idempotent by `requestId`.
   */
  recordTaskAgent: (args: {
    requestId: string;
    taskId: string;
    workspaceId: string;
    repositoryPath: string;
    agent: AgentAssignment["agent"];
    role?: "primary" | "delegate";
    providerId: ProviderId;
    model: string | null;
    assignment: string;
    standards?: string;
  }) => AgentAssignment;
  /** The agent and standards an assigned task runs with, for its later turns. */
  taskAgent: (taskId: string) => { agent: AgentAssignment["agent"]; standards: string | null } | null;
  /**
   * Ends the task's current agent: its later turns run with the task's own
   * settings. The row stays for history. Returns the ended row, or null when
   * the task was not running as an agent.
   */
  releaseTaskAgent: (taskId: string) => AgentAssignment | null;
  /**
   * The Agent instructions a task's turns carry after its Agent was released:
   * a notice that the agent's role and limits no longer apply. Null while the
   * task runs as an agent, or when it never ran as one.
   */
  releasedAgentInstructions: (taskId: string) => string | null;
}

export function createAssignRuntime(deps: AssignRuntimeDependencies): AssignRuntime {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => randomUUID());
  const announce = (row: AgentAssignment) => {
    try {
      deps.emitChanged?.(row);
    } catch (error) {
      console.warn("[agents] failed to announce an assignment change", error);
    }
  };

  const endRun = (taskId: string) => {
    try {
      deps.onTaskAgentEnded?.(taskId);
    } catch (error) {
      console.warn("[agents] failed to end the agent run of a task whose agent ended", error);
    }
  };

  /** The row a task runs as now: its newest, unless the user ended it. */
  const currentRow = (taskId: string) => {
    const row = deps.store.getByTaskId(taskId);
    return row && !row.endedAt ? row : null;
  };

  return {
    prepareTurn(turn) {
      if (!turn.taskId || turn.executionPolicy) return null;
      const row = currentRow(turn.taskId);
      if (!row) return null;
      // Capture once, independently of a later release or assignment switch.
      return prepareTaskAgentTurn({
        turn, assignment: row, library: deps.listAgents?.() ?? [],
        hasDelivery: (delivery) => (row.instructionDeliveries ?? []).some((entry) =>
          entry.providerId === delivery.providerId && entry.nativeSessionId === delivery.nativeSessionId &&
          entry.agentContentHash === delivery.agentContentHash),
        recordDelivery: (delivery) => {
          const current = currentRow(turn.taskId!);
          if (current?.id !== row.id || current.agentContentHash !== row.agentContentHash) return;
          const deliveries = current.instructionDeliveries ?? [];
          if (deliveries.some((entry) => entry.providerId === delivery.providerId &&
              entry.nativeSessionId === delivery.nativeSessionId && entry.agentContentHash === delivery.agentContentHash)) return;
          // Eviction only resends instructions; it cannot imply missing delivery.
          deps.store.update({ ...current, instructionDeliveries: [...deliveries, delivery].slice(-32),
            updatedAt: now().toISOString() });
        },
      });
    },
    list: (args = {}) => deps.store.list(args),
    agentForTask: (taskId) => {
      // A task intake made for an agent keeps running as it, even after a failed first turn.
      return currentRow(taskId)?.agent ?? null;
    },
    taskAgent: (taskId) => {
      const row = currentRow(taskId);
      return row ? { agent: row.agent, standards: row.standards ?? null } : null;
    },
    releasedAgentInstructions(taskId) {
      const row = deps.store.getByTaskId(taskId);
      return row?.endedAt ? releasedAgentInstructions(row.agentName) : null;
    },
    releaseTaskAgent(taskId) {
      const row = currentRow(taskId);
      if (!row) return null;
      const timestamp = now().toISOString();
      const ended: AgentAssignment = { ...row, endedAt: timestamp, updatedAt: timestamp };
      deps.store.update(ended);
      announce(ended);
      endRun(taskId);
      return ended;
    },
    recordTaskAgent(args) {
      const existing = deps.store.getByRequestId(args.requestId);
      if (existing) return existing;
      const snapshot = snapshotAgent(args.agent);
      const compiled = compileAgent({ snapshot, role: args.role ?? "primary", providerId: args.providerId, standards: args.standards });
      if (!compiled.ok) throw new AssignError("refused", compiled.message);
      const replaced = currentRow(args.taskId);
      const timestamp = now().toISOString();
      const row: AgentAssignment = {
        id: newId(),
        requestId: args.requestId,
        requestHash: hashAgentContent({ requestId: args.requestId, agent: snapshot.contentHash }),
        agentConfigId: args.agent.id,
        agentName: args.agent.name,
        agentContentHash: snapshot.contentHash,
        agent: snapshot.agent,
        role: args.role ?? "primary",
        assignment: args.assignment,
        providerId: args.providerId,
        model: args.model,
        repositoryPath: args.repositoryPath,
        workspaceMode: "new-worktree",
        branch: null,
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        turnId: null,
        // The starter (the agent run) owns the turns; this row only says who the task runs as.
        state: "started",
        detail: null,
        standards: args.standards ?? null,
        received: compiled.compiled.received,
        support: compiled.compiled.support,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (!deps.store.create(row)) return deps.store.getByRequestId(args.requestId) ?? row;
      announce(row);
      // A run the previous agent started must not go on under the new one.
      if (replaced) endRun(args.taskId);
      return row;
    },
    recover() {
      for (const row of deps.store.listInState("preparing")) {
        deps.store.update({
          ...row,
          state: "interrupted",
          detail: row.taskId
            ? "Stave stopped before the first turn started. Open the task to continue it."
            : "Stave stopped while preparing this work. Check the workspace list before assigning it again.",
          updatedAt: now().toISOString(),
        });
      }
    },
  };
}
