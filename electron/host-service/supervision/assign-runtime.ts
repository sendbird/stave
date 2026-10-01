/**
 * Assignments in the host service: the record of which agent a task runs as.
 * Kickoff, missions and the agentic composer create the task and its first
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
import type { ProviderId } from "../../../src/lib/providers/provider.types";
import type { AgentAssignmentStore } from "../../persistence/agent-assignment-store";

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
  now?: () => Date;
  newId?: () => string;
}

export interface AssignRuntime {
  /** Marks rows a previous run left preparing as interrupted. Call once at start. */
  recover: () => void;
  list: (args?: { agentConfigId?: string; limit?: number }) => AgentAssignment[];
  /** The agent an assigned task runs as, for its later turns. */
  agentForTask: (taskId: string) => AgentAssignment["agent"] | null;
  /**
   * Records that a task another starter made (a project mission's task) runs
   * as an agent, before its first turn. Idempotent by `requestId`.
   */
  recordTaskAgent: (args: {
    requestId: string;
    taskId: string;
    workspaceId: string;
    repositoryPath: string;
    agent: AgentAssignment["agent"];
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
   * The instructions a prompt-channel provider still owes the task's agent,
   * taken once: the flag clears whether or not this provider needed them.
   */
  takeTaskPreamble: (taskId: string, providerId: ProviderId) => string | null;
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

  /** The row a task runs as now: its newest, unless the user ended it. */
  const currentRow = (taskId: string) => {
    const row = deps.store.getByTaskId(taskId);
    return row && !row.endedAt ? row : null;
  };

  return {
    list: (args = {}) => deps.store.list(args),
    agentForTask: (taskId) => {
      // A task intake made for an agent keeps running as it, even after a failed first turn.
      return currentRow(taskId)?.agent ?? null;
    },
    taskAgent: (taskId) => {
      const row = currentRow(taskId);
      return row ? { agent: row.agent, standards: row.standards ?? null } : null;
    },
    releaseTaskAgent(taskId) {
      const row = currentRow(taskId);
      if (!row) return null;
      const timestamp = now().toISOString();
      const ended: AgentAssignment = { ...row, endedAt: timestamp, preambleDue: false, updatedAt: timestamp };
      deps.store.update(ended);
      announce(ended);
      return ended;
    },
    takeTaskPreamble(taskId, providerId) {
      const row = currentRow(taskId);
      if (!row?.preambleDue) return null;
      deps.store.update({ ...row, preambleDue: false, updatedAt: now().toISOString() });
      const compiled = compileAgent({
        snapshot: snapshotAgent({ ...row.agent, archived: false }),
        role: "primary",
        providerId,
        ...(row.standards ? { standards: row.standards } : {}),
      });
      return compiled.ok && compiled.compiled.role === "primary" ? (compiled.compiled.promptPreamble ?? null) : null;
    },
    recordTaskAgent(args) {
      const existing = deps.store.getByRequestId(args.requestId);
      if (existing) return existing;
      const snapshot = snapshotAgent(args.agent);
      const compiled = compileAgent({ snapshot, role: "primary", providerId: args.providerId, standards: args.standards });
      if (!compiled.ok) throw new AssignError("refused", compiled.message);
      const timestamp = now().toISOString();
      const row: AgentAssignment = {
        id: newId(),
        requestId: args.requestId,
        requestHash: hashAgentContent({ requestId: args.requestId, agent: snapshot.contentHash }),
        agentConfigId: args.agent.id,
        agentName: args.agent.name,
        agentContentHash: snapshot.contentHash,
        agent: snapshot.agent,
        assignment: args.assignment,
        providerId: args.providerId,
        model: args.model,
        repositoryPath: args.repositoryPath,
        workspaceMode: "new-worktree",
        branch: null,
        workspaceId: args.workspaceId,
        taskId: args.taskId,
        turnId: null,
        // The starter (the mission) owns the turns; this row only says who the task runs as.
        state: "started",
        detail: null,
        standards: args.standards ?? null,
        // The starter sends the user's text as is, so a prompt-channel provider
        // gets the agent's instructions from the next primary turn instead.
        preambleDue: true,
        received: compiled.compiled.received,
        support: compiled.compiled.support,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (!deps.store.create(row)) return deps.store.getByRequestId(args.requestId) ?? row;
      announce(row);
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
