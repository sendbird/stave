import { useCallback, useMemo, useState } from "react";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import { resolveAssignRoute, type AssignRoute } from "@/lib/agents/assign-route";
import { activeStandards } from "@/lib/agents/standards";
import { isUsableAs, type AgentConfig } from "@/lib/agents/schema";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";

export function newAssignRequestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `assign:${crypto.randomUUID()}`
    : `assign:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseAssignAgentResult {
  /** The provider and model the assignment would run with. */
  route: AssignRoute;
  /** "auto" or the provider the user picked in the Runs-on override. */
  choice: "auto" | ProviderId;
  setChoice: (choice: "auto" | ProviderId) => void;
  /** A fixed agent model pins the provider; the override is disabled then. */
  fixedProvider: ProviderId | null;
  /** Why the request cannot start yet, or null when it can. */
  blocked: string | null;
  busy: boolean;
  message: string | null;
  /** The started assignment when a task was created, else null. */
  started: AgentAssignment | null;
  /** Runs `agents.assign`; returns the row, or null when blocked or failed. */
  submit: (text: string) => Promise<AgentAssignment | null>;
  /** Focuses the task the assignment created. */
  openTask: () => Promise<void>;
  reset: () => void;
}

/**
 * The assign logic AssignPanel and Kickoff's quick "Start now" path share:
 * resolve where the work runs, keep one request id per attempt, submit through
 * `agents.assign`, and offer to open the task it made.
 */
export function useAssignAgent(
  agent: AgentConfig,
  options: {
    /** Provider auto-routing prefers; defaults to the active task's provider. */
    preferredProviderId?: ProviderId;
    /** Runs-on choice owned by the caller, so two views of one agent agree. */
    choice?: "auto" | ProviderId;
  } = {},
): UseAssignAgentResult {
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? null,
  );
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const myStandards = useAppStore((state) => state.settings.myStandards);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const closeAutomationCenter = useAppStore((state) => state.closeAutomationCenter);

  const fixedProvider = agent.model.mode === "fixed" ? agent.model.providerId : null;
  const [ownChoice, setChoice] = useState<"auto" | ProviderId>("auto");
  const choice = options.choice ?? ownChoice;
  const preferredProviderId = options.preferredProviderId ?? activeProvider ?? "claude-code";
  const route = useMemo(
    () => resolveAssignRoute({ agent, profile, preferredProviderId, choice }),
    [agent, profile, preferredProviderId, choice],
  );
  const [started, setStarted] = useState<AgentAssignment | null>(null);
  // One request id per attempt: a double click or a retried call starts the work once.
  const [requestId, setRequestId] = useState(newAssignRequestId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const usable = isUsableAs(agent, "primary") && !agent.archived;
  const needsWorkspace = agent.workspace === "same-workspace" && !activeWorkspaceId;
  const blocked = !usable
    ? agent.archived
      ? "This agent is archived. Restore it to assign work."
      : agent.source === "custom"
        ? "Turn on Main agent under Usable as to assign work to this agent."
        : "This agent works only as a Worker or a delegated task. Duplicate it and turn on Main agent to assign work."
    : !repositoryPath
      ? "Open a repository to assign work."
      : needsWorkspace
        ? "This agent works in the current workspace. Open one first."
        : null;

  const submit = useCallback(
    async (text: string): Promise<AgentAssignment | null> => {
      const api = window.api?.agents;
      const trimmed = text.trim();
      if (!api || blocked || !trimmed || !repositoryPath) return null;
      setBusy(true);
      setMessage(null);
      const result = await api.assign({
        requestId,
        agent,
        assignment: trimmed,
        providerId: route.providerId,
        model: route.model,
        repositoryPath,
        ...(activeWorkspaceId ? { currentWorkspaceId: activeWorkspaceId } : {}),
        ...(activeStandards(myStandards) ? { standards: activeStandards(myStandards) } : {}),
      });
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message);
        return null;
      }
      const row = result.value;
      setMessage(
        row.state === "started"
          ? row.workspaceMode === "new-worktree"
            ? `Started in a new worktree on ${row.branch}.`
            : "Started in the current workspace."
          : `${ASSIGNMENT_STATE_LABELS[row.state]}: ${row.detail ?? "see the task for details."}`,
      );
      if (row.state === "started") setRequestId(newAssignRequestId());
      setStarted(row.taskId ? row : null);
      return row.state === "started" ? row : null;
    },
    [activeWorkspaceId, agent, blocked, myStandards, repositoryPath, requestId, route.model, route.providerId],
  );

  const openTask = useCallback(async () => {
    if (!started?.taskId) return;
    await focusTaskAttention({
      taskId: started.taskId,
      workspaceId: started.workspaceId ?? undefined,
      repositoryPath: started.repositoryPath,
      refreshFromPersistence: true,
    });
    closeAutomationCenter();
  }, [closeAutomationCenter, focusTaskAttention, started]);

  const reset = useCallback(() => {
    setStarted(null);
    setMessage(null);
    setRequestId(newAssignRequestId());
  }, []);

  return { route, choice, setChoice, fixedProvider, blocked, busy, message, started, submit, openTask, reset };
}
