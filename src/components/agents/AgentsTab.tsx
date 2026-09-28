import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, Send } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { sx } from "@/components/ads/utils/stylex";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import {
  SUPPORT_LEVEL_LABELS,
  describeAgent,
  describeProviderSupport,
  describeUsableAs,
  groupAgents,
} from "@/lib/agents/agents-view";
import { duplicateAgent, listAgents, upsertCustomAgent } from "@/lib/agents/library";
import {
  AGENT_CONFIG_LIMITS,
  AGENT_PERMISSION_LABELS,
  AGENT_PERMISSIONS,
  AGENT_SOURCE_LABELS,
  AGENT_WORKSPACE_LABELS,
  AGENT_WORKSPACES,
  isUsableAs,
  type AgentConfig,
} from "@/lib/agents/schema";
import { listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

const PROVIDERS = listProviderIds();
const PROVIDER_LABELS: Record<string, string> = {
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

/** Recent assignments of one agent, refreshed when the host reports a change. */
function useAssignments(agentConfigId: string | null) {
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const load = useCallback(async () => {
    const api = window.api?.agents;
    if (!api || !agentConfigId) {
      setAssignments([]);
      return;
    }
    const result = await api.listAssignments({ agentConfigId, limit: 10 });
    setAssignments(result.ok ? result.value : []);
  }, [agentConfigId]);
  useEffect(() => {
    void load();
    return window.api?.agents?.subscribeChanged(() => void load());
  }, [load]);
  return assignments;
}

function AssignPanel(props: { agent: AgentConfig }) {
  const { agent } = props;
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? null,
  );
  const fixedProvider = agent.model.mode === "fixed" ? agent.model.providerId : null;
  const [providerId, setProviderId] = useState<ProviderId>(fixedProvider ?? activeProvider ?? "claude-code");
  const [text, setText] = useState("");
  // One request id per attempt: a double click or a retried call starts the work once.
  const [requestId, setRequestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const usable = isUsableAs(agent, "primary") && !agent.archived;
  const needsWorkspace = agent.workspace === "same-workspace" && !activeWorkspaceId;
  const blocked = !usable
    ? agent.archived
      ? "This agent is archived. Restore it to assign work."
      : "This agent works only as a Worker or a delegated task."
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
      providerId,
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
          aria-label="Provider"
          value={providerId}
          disabled={Boolean(fixedProvider) || busy}
          options={PROVIDERS.map((id) => ({ value: id, label: PROVIDER_LABELS[id] ?? id }))}
          onValueChange={(value) => setProviderId(String(value) as ProviderId)}
        />
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
    </section>
  );
}

function CustomAgentFields(props: { agent: AgentConfig; onSave: (agent: AgentConfig) => string | null }) {
  const [draft, setDraft] = useState(props.agent);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(props.agent), [props.agent]);
  const changed = JSON.stringify(draft) !== JSON.stringify(props.agent);
  return (
    <>
      <dl className={sx(styles.properties)}>
        <dt className={sx(styles.propertyLabel)}>Name</dt>
        <dd className={sx(styles.propertyValue)}>
          <TextField
            size="sm"
            controlOnly
            aria-label="Name"
            value={draft.name}
            maxLength={AGENT_CONFIG_LIMITS.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </dd>
        <dt className={sx(styles.propertyLabel)}>Use when</dt>
        <dd className={sx(styles.propertyValue)}>
          <Textarea
            size="sm"
            aria-label="Use when"
            value={draft.description}
            maxLength={AGENT_CONFIG_LIMITS.description}
            autoResize
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </dd>
        <dt className={sx(styles.propertyLabel)}>Permission</dt>
        <dd className={sx(styles.propertyValue)}>
          <Select
            size="sm"
            aria-label="Permission"
            value={draft.permission}
            options={AGENT_PERMISSIONS.map((value) => ({ value, label: AGENT_PERMISSION_LABELS[value] }))}
            onValueChange={(value) => setDraft({ ...draft, permission: String(value) as AgentConfig["permission"] })}
          />
        </dd>
        <dt className={sx(styles.propertyLabel)}>Works in</dt>
        <dd className={sx(styles.propertyValue)}>
          <Select
            size="sm"
            aria-label="Works in"
            value={draft.workspace}
            options={AGENT_WORKSPACES.map((value) => ({ value, label: AGENT_WORKSPACE_LABELS[value] }))}
            onValueChange={(value) => setDraft({ ...draft, workspace: String(value) as AgentConfig["workspace"] })}
          />
        </dd>
        <dt className={sx(styles.propertyLabel)}>Instructions</dt>
        <dd className={sx(styles.propertyValue)}>
          <Textarea
            size="sm"
            aria-label="Instructions"
            value={draft.instructions}
            maxLength={AGENT_CONFIG_LIMITS.instructions}
            autoResize
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
          />
        </dd>
      </dl>
      {error ? <p className={sx(styles.hint, styles.hintWarning)}>{error}</p> : null}
      <div className={sx(styles.footer)}>
        <Button size="sm" disabled={!changed} onClick={() => setError(props.onSave(draft))}>
          Save
        </Button>
        <Button size="sm" variant="quiet" disabled={!changed} onClick={() => setDraft(props.agent)}>
          Discard
        </Button>
      </div>
    </>
  );
}

function AgentDetail(props: { agent: AgentConfig; onDuplicate: () => void; onSave: (agent: AgentConfig) => string | null }) {
  const { agent } = props;
  const assignments = useAssignments(agent.id);
  const support = useMemo(() => describeProviderSupport(agent, PROVIDERS), [agent]);
  const editable = agent.source === "custom";
  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.editor)}>
        <div className={sx(styles.heading)}>
          <div className={sx(styles.headingText)}>
            <h2 className={sx(styles.emptyTitle)}>{agent.name}</h2>
            <p className={sx(styles.hint)}>
              {AGENT_SOURCE_LABELS[agent.source]}
              {agent.origin ? ` · ${agent.origin.path}` : ""} · Usable as {describeUsableAs(agent)}
            </p>
          </div>
          <div className={sx(styles.headingActions)}>
            <Button size="sm" variant="quiet" onClick={props.onDuplicate}>
              <Copy aria-hidden />
              Duplicate
            </Button>
            {editable ? (
              <Button size="sm" variant="quiet" onClick={() => props.onSave({ ...agent, archived: !agent.archived })}>
                {agent.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {agent.archived ? "Restore" : "Archive"}
              </Button>
            ) : null}
          </div>
        </div>

        <AssignPanel agent={agent} />

        {editable ? (
          <CustomAgentFields agent={agent} onSave={props.onSave} />
        ) : (
          <dl className={sx(styles.properties)}>
            <dt className={sx(styles.propertyLabel)}>Use when</dt>
            <dd className={sx(styles.propertyValue)}>{agent.description}</dd>
            {agent.avoidWhen ? (
              <>
                <dt className={sx(styles.propertyLabel)}>Don't use when</dt>
                <dd className={sx(styles.propertyValue)}>{agent.avoidWhen}</dd>
              </>
            ) : null}
            <dt className={sx(styles.propertyLabel)}>Runs with</dt>
            <dd className={sx(styles.propertyValue)}>{describeAgent(agent)}</dd>
            <dt className={sx(styles.propertyLabel)}>Instructions</dt>
            <dd className={sx(styles.propertyValue)}>
              <pre className={sx(agentStyles.instructions)}>{agent.instructions}</pre>
              <span className={sx(styles.hint)}>Duplicate this agent to change it.</span>
            </dd>
          </dl>
        )}

        <section aria-label="Provider support">
          <div className={sx(styles.sectionHeader)}>
            <h3 className={sx(styles.sectionTitle)}>As a main agent</h3>
          </div>
          <table className={sx(agentStyles.support)}>
            <thead>
              <tr>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Provider</th>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Instructions</th>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Tool limits</th>
              </tr>
            </thead>
            <tbody>
              {support.map((row) => (
                <tr key={row.providerId}>
                  <td className={sx(agentStyles.supportCell)}>{PROVIDER_LABELS[row.providerId] ?? row.providerId}</td>
                  {row.refusal ? (
                    <td className={sx(agentStyles.supportCell, agentStyles.muted)} colSpan={2}>
                      {row.refusal}
                    </td>
                  ) : (
                    <>
                      <td className={sx(agentStyles.supportCell)}>{row.instructions ? SUPPORT_LEVEL_LABELS[row.instructions] : "—"}</td>
                      <td className={sx(agentStyles.supportCell)}>{row.tools ? SUPPORT_LEVEL_LABELS[row.tools] : "None set"}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-label="Recent assignments">
          <div className={sx(styles.sectionHeader)}>
            <h3 className={sx(styles.sectionTitle)}>Recent work</h3>
          </div>
          {assignments.length === 0 ? (
            <p className={sx(styles.hint)}>Nothing assigned yet.</p>
          ) : (
            <ul className={sx(agentStyles.runs)}>
              {assignments.map((row) => (
                <li key={row.id} className={sx(agentStyles.run)}>
                  <span className={sx(agentStyles.runTitle)} title={row.assignment}>
                    {row.assignment.split("\n")[0]}
                  </span>
                  <span className={sx(agentStyles.runState)}>
                    {ASSIGNMENT_STATE_LABELS[row.state]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The Agents tab of the Automations center: saved agents on the left, one
 * agent's details and the Assign panel on the right. Built-in and repository
 * agents are read only; Duplicate makes an editable custom copy.
 */
export function AgentsTab() {
  const custom = useAppStore((state) => state.settings.customAgents);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const agents = useMemo(() => listAgents({ custom }), [custom]);
  const groups = useMemo(() => groupAgents(agents, query), [agents, query]);
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0] ?? null;

  const save = (agent: AgentConfig): string | null => {
    try {
      updateSettings({ patch: { customAgents: upsertCustomAgent(useAppStore.getState().settings.customAgents, agent) } });
    } catch (error) {
      return error instanceof Error ? error.message : "Stave could not save this agent.";
    }
    const stored = useAppStore.getState().settings.customAgents.find((candidate) => candidate.id === agent.id);
    return stored ? null : "Stave could not save this agent. Check the fields and try again.";
  };

  const duplicate = (agent: AgentConfig) => {
    const copy = duplicateAgent(agent, agents.map((candidate) => candidate.id));
    if (!save(copy)) setSelectedId(copy.id);
  };

  return (
    <div className={sx(styles.tab)} data-testid="agents-tab">
      <aside className={sx(styles.master)} aria-label="Agents">
        <div className={sx(styles.masterHeader)}>
          <div className={sx(styles.masterSearch)}>
            <TextField
              size="sm"
              controlOnly
              aria-label="Search agents"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {groups.map((group) => (
          <div key={group.source}>
            <p className={sx(styles.listLabel)}>{group.label}</p>
            <ul className={sx(styles.list)}>
              {group.agents.map((agent) => (
                <li key={agent.id}>
                  <Button
                    layout="host"
                    variant="quiet"
                    press="none"
                    aria-current={agent.id === selected?.id ? "true" : undefined}
                    xstyle={[styles.card, agent.id === selected?.id && styles.cardActive]}
                    onClick={() => setSelectedId(agent.id)}
                  >
                    <span className={sx(styles.cardTitleRow)}>
                      <span className={sx(styles.cardTitle, agent.archived && agentStyles.archived)}>{agent.name}</span>
                    </span>
                    <span className={sx(styles.cardMeta)}>{describeAgent(agent)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 ? <p className={sx(styles.hint)}>No agent matches “{query}”.</p> : null}
      </aside>
      {selected ? (
        <div className={sx(styles.detail)}>
          <div className={sx(styles.compactPicker)}>
            <Select
              size="sm"
              aria-label="Agent"
              value={selected.id}
              options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
              onValueChange={(value) => setSelectedId(String(value))}
            />
          </div>
          <AgentDetail key={selected.id} agent={selected} onDuplicate={() => duplicate(selected)} onSave={save} />
        </div>
      ) : null}
    </div>
  );
}
