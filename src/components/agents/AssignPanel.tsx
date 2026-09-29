import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import { resolveAssignRoute } from "@/lib/agents/assign-route";
import { isUsableAs, type AgentConfig } from "@/lib/agents/schema";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

const PROVIDERS = listProviderIds();
export const PROVIDER_LABELS: Record<string, string> = {
  "claude-code": "Claude",
  codex: "Codex",
  cursor: "Cursor",
  kiro: "Kiro",
};

function newRequestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `assign:${crypto.randomUUID()}`
    : `assign:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Assign: describe the work, pick where it runs, start it. One request id per
 * attempt, so a double click or a retried call starts the work once.
 */
export function AssignPanel(props: {
  agent: AgentConfig;
  /** Prefills the request, e.g. from an issue. */
  initialText?: string;
  /** Runs once work has started, with the assignment. */
  onStarted?: (assignment: AgentAssignment) => void;
}) {
  const { agent } = props;
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? null,
  );
  const profile = useAppStore((state) => state.settings.autoRoutingProfile);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const closeAutomationCenter = useAppStore((state) => state.closeAutomationCenter);
  const fixedProvider = agent.model.mode === "fixed" ? agent.model.providerId : null;
  const [choice, setChoice] = useState<"auto" | ProviderId>("auto");
  const route = useMemo(
    () =>
      resolveAssignRoute({ agent, profile, preferredProviderId: activeProvider ?? "claude-code", choice }),
    [agent, profile, activeProvider, choice],
  );
  const [started, setStarted] = useState<AgentAssignment | null>(null);
  const [text, setText] = useState(props.initialText ?? "");
  // One request id per attempt: a double click or a retried call starts the work once.
  const [requestId, setRequestId] = useState(newRequestId);
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

  const submit = async () => {
    const api = window.api?.agents;
    if (!api || blocked || !text.trim() || !repositoryPath) return;
    setBusy(true);
    setMessage(null);
    const result = await api.assign({
      requestId,
      agent,
      assignment: text.trim(),
      providerId: route.providerId,
      model: route.model,
      repositoryPath,
      ...(activeWorkspaceId ? { currentWorkspaceId: activeWorkspaceId } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const row = result.value;
    setMessage(
      row.state === "started"
        ? row.workspaceMode === "new-worktree"
          ? `Started in a new worktree on ${row.branch}.`
          : "Started in the current workspace."
        : `${ASSIGNMENT_STATE_LABELS[row.state]}: ${row.detail ?? "see the task for details."}`,
    );
    if (row.state === "started") {
      setText("");
      setRequestId(newRequestId());
    }
    setStarted(row.taskId ? row : null);
    if (row.state === "started") props.onStarted?.(row);
  };

  const openTask = async () => {
    if (!started?.taskId) return;
    await focusTaskAttention({
      taskId: started.taskId,
      workspaceId: started.workspaceId ?? undefined,
      repositoryPath: started.repositoryPath,
      refreshFromPersistence: true,
    });
    closeAutomationCenter();
  };

  return (
    <section className={sx(agentStyles.assign)} aria-label="Assign work">
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>Assign</h3>
        <span className={sx(styles.sectionAside)}>
          {agent.workspace === "new-worktree" ? "Creates a worktree and a task" : "Creates a task in this workspace"}
        </span>
      </div>
      <Textarea
        size="sm"
        aria-label="What should the agent do?"
        placeholder="Describe the work and when it counts as done."
        value={text}
        maxLength={20_000}
        autoResize
        disabled={Boolean(blocked) || busy}
        onChange={(event) => setText(event.target.value)}
      />
      <div className={sx(agentStyles.assignRow)}>
        <Select
          size="sm"
          aria-label="Runs on"
          value={fixedProvider ?? choice}
          disabled={Boolean(fixedProvider) || busy}
          options={[
            ...(fixedProvider ? [] : [{ value: "auto", label: "Auto-routing" }]),
            ...PROVIDERS.map((id) => ({ value: id, label: PROVIDER_LABELS[id] ?? id })),
          ]}
          onValueChange={(value) => setChoice(String(value) as "auto" | ProviderId)}
        />
        <span className={sx(styles.hint)} title={route.reason}>
          {PROVIDER_LABELS[route.providerId] ?? route.providerId} · {route.model ?? "default model"}
        </span>
        <Button size="sm" disabled={Boolean(blocked) || busy || !text.trim()} onClick={() => void submit()}>
          <Send aria-hidden />
          {busy ? "Assigning…" : "Assign"}
        </Button>
      </div>
      {blocked ? <p className={sx(styles.hint)}>{blocked}</p> : null}
      {message ? (
        <p className={sx(styles.hint)} role="status">
          {message}
        </p>
      ) : null}
      {started?.taskId ? (
        <div className={sx(agentStyles.assignRow)}>
          <Button size="sm" variant="secondary" onClick={() => void openTask()}>
            Open task
          </Button>
        </div>
      ) : null}
    </section>
  );
}
