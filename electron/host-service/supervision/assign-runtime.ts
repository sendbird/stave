/**
 * Assign in the host service: hands one request to an Agent as the main agent
 * of a new task, through intake, and starts its first turn.
 *
 * Restart safety: the assignment row is written, keyed by the request id,
 * before any side effect, and each intake step is kept on it as it finishes.
 * A repeated request returns the row it already has. On start, a row still
 * preparing from a previous run is never replayed; it is marked interrupted
 * with what it had made, so the user can check before assigning again.
 *
 * Used by: `electron/host-service.ts` (wired through `assign-host.ts`).
 */
import { randomUUID } from "node:crypto";
import {
  AssignAgentInputSchema,
  assignmentBranchName,
  assignmentTitle,
  hashAssignRequest,
  type AgentAssignment,
} from "../../../src/lib/agents/assign";
import { compileAgent, snapshotAgent } from "../../../src/lib/agents/compile";
import { agentRuntimeOptions } from "../../../src/lib/agents/runtime-options";
import type { ProviderId, ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import type { AgentAssignmentStore } from "../../persistence/agent-assignment-store";
import { runIntake, type IntakePorts } from "./intake";

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
  createWorktree: IntakePorts["createWorktree"];
  createIdleTask: IntakePorts["createIdleTask"];
  runFirstTurn: (args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    fingerprint?: { providerId: ProviderId; model: string };
    runtimeOptions?: ProviderRuntimeOptions;
  }) => Promise<{ turnId: string }>;
  emitChanged?: (assignment: AgentAssignment) => void;
  now?: () => Date;
  newId?: () => string;
}

export interface AssignRuntime {
  /** Marks rows a previous run left preparing as interrupted. Call once at start. */
  recover: () => void;
  assign: (rawInput: unknown) => Promise<AgentAssignment>;
  list: (args?: { agentConfigId?: string; limit?: number }) => AgentAssignment[];
  /** The agent an assigned task runs as, for its later turns. */
  agentForTask: (taskId: string) => AgentAssignment["agent"] | null;
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

  return {
    list: (args = {}) => deps.store.list(args),
    agentForTask: (taskId) => {
      // A task intake made for an agent keeps running as it, even after a failed first turn.
      return deps.store.getByTaskId(taskId)?.agent ?? null;
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

    async assign(rawInput) {
      const parsed = AssignAgentInputSchema.safeParse(rawInput);
      if (!parsed.success) throw new AssignError("invalid", "The assignment request was not valid.");
      const input = parsed.data;
      const requestHash = hashAssignRequest(input);

      const existing = deps.store.getByRequestId(input.requestId);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new AssignError("conflict", "This request id was already used for different work.");
        }
        return existing;
      }

      const snapshot = snapshotAgent(input.agent);
      const compiled = compileAgent({ snapshot, role: "primary", providerId: input.providerId });
      if (!compiled.ok) throw new AssignError("refused", compiled.message);
      if (compiled.compiled.role !== "primary") throw new AssignError("refused", "The agent did not compile as a main agent.");
      const main = compiled.compiled;
      if (main.workspace === "same-workspace" && !input.currentWorkspaceId) {
        throw new AssignError("refused", `"${input.agent.name}" works in the current workspace; open one first.`);
      }

      // A model the agent fixes wins over the one the renderer routed to.
      const model = main.model.source === "fixed" && main.model.model ? main.model.model : (input.model ?? null);
      const id = newId();
      const timestamp = now().toISOString();
      let row: AgentAssignment = {
        id,
        requestId: input.requestId,
        requestHash,
        agentConfigId: input.agent.id,
        agentName: input.agent.name,
        agentContentHash: snapshot.contentHash,
        agent: snapshot.agent,
        assignment: input.assignment,
        providerId: input.providerId,
        model,
        repositoryPath: input.repositoryPath,
        workspaceMode: main.workspace,
        branch: main.workspace === "new-worktree" ? assignmentBranchName({ agentConfigId: input.agent.id, assignment: input.assignment, assignmentId: id }) : null,
        workspaceId: null,
        taskId: null,
        turnId: null,
        state: "preparing",
        detail: null,
        received: main.received,
        support: main.support,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      // Recorded before any side effect. A concurrent duplicate loses the insert and reads the winner.
      if (!deps.store.create(row)) {
        const winner = deps.store.getByRequestId(input.requestId);
        if (winner && winner.requestHash === requestHash) return winner;
        throw new AssignError("conflict", "This request id was already used for different work.");
      }
      announce(row);
      const keep = (patch: Partial<AgentAssignment>) => {
        row = { ...row, ...patch, updatedAt: now().toISOString() };
        deps.store.update(row);
        announce(row);
      };

      try {
        const title = assignmentTitle({ agentName: input.agent.name, assignment: input.assignment });
        const { workspaceId, taskId } = await runIntake(
          {
            workspace:
              main.workspace === "new-worktree"
                ? { mode: "new-worktree", repositoryPath: input.repositoryPath, branch: row.branch!, label: title }
                : { mode: "same-workspace", workspaceId: input.currentWorkspaceId! },
            task: { title, provider: input.providerId, model },
          },
          { createWorktree: deps.createWorktree, createIdleTask: deps.createIdleTask },
          {
            workspaceReady: (readyWorkspaceId) => keep({ workspaceId: readyWorkspaceId }),
            taskReady: (readyTaskId) => keep({ taskId: readyTaskId }),
          },
        );
        // Providers without an instruction channel get the agent at the top of the first message.
        const prompt = main.promptPreamble ? `${main.promptPreamble}\n\n---\n\n${input.assignment}` : input.assignment;
        const { turnId } = await deps.runFirstTurn({
          workspaceId,
          taskId,
          prompt,
          ...(model ? { fingerprint: { providerId: input.providerId, model } } : {}),
          runtimeOptions: agentRuntimeOptions(main),
        });
        keep({ state: "started", turnId, detail: null });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "The work could not start.";
        keep({ state: "failed", detail: message.slice(0, 500) });
      }
      return row;
    },
  };
}
