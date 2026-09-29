import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Checkbox } from "@/components/ads/components/Checkbox";
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
import { duplicateAgent, hiddenRepositoryAgents, listAgents, upsertCustomAgent } from "@/lib/agents/library";
import type { AgentImportNote } from "@/lib/agents/import";
import {
  AGENT_CONFIG_LIMITS,
  AGENT_PERMISSION_LABELS,
  AGENT_PERMISSIONS,
  AGENT_ROLE_LABELS,
  AGENT_ROLES,
  AGENT_SOURCE_LABELS,
  AGENT_WORKSPACE_LABELS,
  AGENT_WORKSPACES,
  type AgentConfig,
} from "@/lib/agents/schema";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { useAppStore } from "@/store/app.store";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { AssignPanel, PROVIDER_LABELS } from "./AssignPanel";
import { agentStyles } from "./agents.styles";
import { useRepositoryAgents } from "./useRepositoryAgents";

const PROVIDERS = listProviderIds();
const NO_NOTES: readonly AgentImportNote[] = [];

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
        <dt className={sx(styles.propertyLabel)}>Usable as</dt>
        <dd className={sx(styles.propertyValue)}>
          <div role="group" aria-label="Usable as" className={sx(agentStyles.roles)}>
            {AGENT_ROLES.map((role) => {
              const checked = draft.usableAs.includes(role);
              return (
                <Checkbox
                  key={role}
                  label={AGENT_ROLE_LABELS[role]}
                  checked={checked}
                  // At least one role stays on: an agent nothing can use is an archived one.
                  disabled={checked && draft.usableAs.length === 1}
                  onCheckedChange={(value) =>
                    setDraft({
                      ...draft,
                      usableAs: value === true
                        ? AGENT_ROLES.filter((candidate) => candidate === role || draft.usableAs.includes(candidate))
                        : draft.usableAs.filter((candidate) => candidate !== role),
                    })
                  }
                />
              );
            })}
          </div>
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

const IMPORT_OUTCOME_LABELS: Readonly<Record<AgentImportNote["outcome"], string>> = {
  refused: "Not imported",
  dropped: "Left out",
  changed: "Changed",
};

/** What reading the file did not carry over, so a repository agent never looks more capable than it is. */
function ImportNotes(props: { notes: readonly AgentImportNote[] }) {
  if (props.notes.length === 0) return null;
  return (
    <section aria-label="Read from the file">
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>Read from the file</h3>
        <span className={sx(styles.sectionAside)}>The file itself is not changed</span>
      </div>
      <ul className={sx(agentStyles.runs)}>
        {props.notes.map((note) => (
          <li key={`${note.outcome}:${note.field}`} className={sx(agentStyles.run)}>
            <span className={sx(agentStyles.runState)}>{IMPORT_OUTCOME_LABELS[note.outcome]}</span>
            <span className={sx(agentStyles.noteText)}>
              <code>{note.field}</code> — {note.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AgentDetail(props: {
  agent: AgentConfig;
  notes: readonly AgentImportNote[];
  onDuplicate: () => void;
  onSave: (agent: AgentConfig) => string | null;
}) {
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

        <ImportNotes notes={props.notes} />

        <section aria-label="Provider support">
          <div className={sx(styles.sectionHeader)}>
            <h3 className={sx(styles.sectionTitle)}>As a main agent</h3>
            <span className={sx(styles.sectionAside)}>
              {agent.permission === "auto"
                ? "Runs with your permission settings"
                : `Every turn stays within ${AGENT_PERMISSION_LABELS[agent.permission]}; narrower settings of yours are kept`}
            </span>
          </div>
          <table className={sx(agentStyles.support)}>
            <thead>
              <tr>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Provider</th>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Instructions</th>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>Tool limits</th>
                <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>{AGENT_PERMISSION_LABELS[agent.permission]}</th>
              </tr>
            </thead>
            <tbody>
              {support.map((row) => (
                <tr key={row.providerId}>
                  <td className={sx(agentStyles.supportCell)}>{PROVIDER_LABELS[row.providerId] ?? row.providerId}</td>
                  {row.refusal ? (
                    <td className={sx(agentStyles.supportCell, agentStyles.muted)} colSpan={3}>
                      {row.refusal}
                    </td>
                  ) : (
                    <>
                      <td className={sx(agentStyles.supportCell)}>{row.instructions ? SUPPORT_LEVEL_LABELS[row.instructions] : "—"}</td>
                      <td className={sx(agentStyles.supportCell)}>{row.tools ? SUPPORT_LEVEL_LABELS[row.tools] : "None set"}</td>
                      <td className={sx(agentStyles.supportCell)}>
                        {row.permission ? SUPPORT_LEVEL_LABELS[row.permission] : "Your settings"}
                      </td>
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
  const rootPath = useAppStore((state) =>
    state.activeWorkspaceId ? (state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath) : state.repositoryPath,
  );
  const repository = useRepositoryAgents(rootPath);
  const repositoryAgents = useMemo(() => repository.scan.agents.map((entry) => entry.agent), [repository.scan]);
  const agents = useMemo(() => listAgents({ custom, repository: repositoryAgents }), [custom, repositoryAgents]);
  const problems = useMemo(
    () => [...repository.scan.problems, ...hiddenRepositoryAgents({ custom, repository: repositoryAgents })],
    [repository.scan, custom, repositoryAgents],
  );
  const groups = useMemo(() => groupAgents(agents, query), [agents, query]);
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0] ?? null;
  const selectedNotes = useMemo(
    () =>
      selected?.source === "repository"
        ? (repository.scan.agents.find((entry) => entry.agent === selected)?.notes ?? NO_NOTES)
        : NO_NOTES,
    [selected, repository.scan],
  );

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
          <Button
            size="sm"
            variant="quiet"
            iconOnly
            aria-label="Read agent files again"
            title="Read agent files again"
            disabled={!rootPath || repository.loading}
            onClick={repository.reload}
          >
            <RefreshCw aria-hidden />
          </Button>
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
        {problems.length > 0 ? (
          <details className={sx(agentStyles.problems)}>
            <summary className={sx(styles.hint, styles.hintWarning)}>
              {problems.length === 1 ? "1 agent file was not used" : `${problems.length} agent files were not used`}
            </summary>
            <ul className={sx(agentStyles.runs)}>
              {problems.map((problem) => (
                <li key={`${problem.path}:${problem.message}`} className={sx(agentStyles.problem)}>
                  <code>{problem.path}</code>
                  <span>{problem.message}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {rootPath && repositoryAgents.length === 0 && problems.length === 0 && !query ? (
          <p className={sx(styles.hint)}>
            Agent files in this repository's .claude, .codex, .kiro, .cursor or .github agents folder are listed here too.
          </p>
        ) : null}
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
          <AgentDetail
            key={selected.id}
            agent={selected}
            notes={selectedNotes}
            onDuplicate={() => duplicate(selected)}
            onSave={save}
          />
        </div>
      ) : null}
    </div>
  );
}
