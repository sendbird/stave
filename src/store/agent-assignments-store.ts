/**
 * Renderer view of agent assignments, keyed by the task each one created, so
 * Fleet and task surfaces can say which agent a task runs as. Refreshed on
 * `agents:changed`.
 *
 * Selectors return stored references only: read one task's entry
 * (`byTaskId[taskId]`), never build a list in a selector.
 */
import { useEffect } from "react";
import { create } from "zustand";
import type { AgentsBridgeApi } from "@/lib/agents/api";
import type { AgentAssignment } from "@/lib/agents/assign";

export type TaskAgent = Pick<
  AgentAssignment,
  | "agentConfigId"
  | "agentName"
  | "agentContentHash"
  | "received"
  | "support"
  | "state"
  | "providerId"
  | "model"
  | "workspaceMode"
  | "branch"
  | "detail"
  | "createdAt"
  | "updatedAt"
> & {
  assignmentId: string;
  /** The recorded agent's permission, so a switch can tell whether it widens. */
  agentPermission: AgentAssignment["agent"]["permission"];
  /** The recorded agent's colour, so its avatar matches the Agents surface. */
  agentAppearance: AgentAssignment["agent"]["appearance"];
};

interface AgentAssignmentsState {
  byTaskId: Record<string, TaskAgent>;
  loaded: boolean;
  load: () => Promise<void>;
}

/** The most assignments one load reads; older tasks lose their badge first. */
const LOAD_LIMIT = 500;

function agentsApi(): AgentsBridgeApi | null {
  return typeof window === "undefined" ? null : (window.api?.agents ?? null);
}

export function indexAssignmentsByTask(assignments: readonly AgentAssignment[]): Record<string, TaskAgent> {
  const byTaskId: Record<string, TaskAgent> = {};
  const seen = new Set<string>();
  // Newest first from the host; the first assignment seen for a task wins. A
  // task whose newest row ended runs with its own settings again: no agent.
  for (const row of assignments) {
    if (!row.taskId || seen.has(row.taskId)) continue;
    seen.add(row.taskId);
    if (row.endedAt) continue;
    byTaskId[row.taskId] = {
      assignmentId: row.id,
      agentConfigId: row.agentConfigId,
      agentName: row.agentName,
      agentPermission: row.agent.permission,
      agentAppearance: row.agent.appearance,
      agentContentHash: row.agentContentHash,
      received: row.received,
      support: row.support,
      state: row.state,
      providerId: row.providerId,
      model: row.model,
      workspaceMode: row.workspaceMode,
      branch: row.branch,
      detail: row.detail,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  return byTaskId;
}

export const useAgentAssignmentsStore = create<AgentAssignmentsState>()((set) => ({
  byTaskId: {},
  loaded: false,
  load: async () => {
    const api = agentsApi();
    if (!api) return;
    const result = await api.listAssignments({ limit: LOAD_LIMIT }).catch(() => null);
    if (!result?.ok) return;
    set({ byTaskId: indexAssignmentsByTask(result.value), loaded: true });
  },
}));

let subscribed = false;

/** Mount once near the surfaces that read the store; later mounts are free. */
export function useAgentAssignmentsSync() {
  useEffect(() => {
    if (subscribed) return;
    const api = agentsApi();
    if (!api) return;
    subscribed = true;
    void useAgentAssignmentsStore.getState().load();
    const unsubscribe = api.subscribeChanged(() => void useAgentAssignmentsStore.getState().load());
    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, []);
}
