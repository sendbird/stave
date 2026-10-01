import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, Plus, RefreshCw, Rocket, Trash2 } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Dialog } from "@/components/ads/components/Dialog";
import { Select } from "@/components/ads/components/Select";
import { Tabs } from "@/components/ads/components/Tabs";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import { type AgentAssignment } from "@/lib/agents/assign";
import {
  SUPPORT_LEVEL_LABELS,
  describeAgent,
  describeProviderSupport,
  describeUsableAs,
  groupAgents,
} from "@/lib/agents/agents-view";
import {
  duplicateAgent,
  hiddenRepositoryAgents,
  listAgents,
  removeCustomAgent,
  upsertCustomAgent,
} from "@/lib/agents/library";
import { findAgentReferences } from "@/lib/agents/agent-references";
import {
  dropAgentRevisions,
  pushAgentRevision,
  type AgentRevision,
} from "@/lib/agents/revisions";
import type { AgentImportNote } from "@/lib/agents/import";
import {
  dropAgentSuggestions,
  removeAgentSuggestion,
  type AgentSuggestion,
} from "@/lib/agents/learned-suggestions";
import {
  AGENT_CHECK_IN_LABELS,
  AGENT_PERMISSION_LABELS,
  DEFAULT_AGENT_CHECK_INS,
  AGENT_SOURCE_LABELS,
  isUsableAs,
  type AgentConfig,
} from "@/lib/agents/schema";
import { listProviderIds } from "@/lib/providers/model-catalog";
import { PROVIDER_LABELS } from "@/lib/agents/provider-labels";
import { useAgentsUiStore } from "@/store/agents-ui-store";
import { useAppStore } from "@/store/app.store";
import { useProjectsStore } from "@/store/projects-store";
import { useAgentsViewStore } from "@/store/agents-view-store";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { ExportAgent } from "./ExportAgent";
import { AgentAvatar } from "./AgentAvatar";
import { AgentEditor } from "./AgentEditor";
import { AgentActivity } from "./AgentActivity";
import { AgentHistory } from "./AgentHistory";
import { AgentProfileHeader } from "./AgentProfileHeader";
import { AgentSuggestions } from "./AgentSuggestions";
import { DeleteAgentDialog } from "./DeleteAgentDialog";
import { NewAgentDialog } from "./NewAgentDialog";
import { agentStyles } from "./agents.styles";
import { useRepositoryAgents } from "./useRepositoryAgents";

const PROVIDERS = listProviderIds();
const NO_NOTES: readonly AgentImportNote[] = [];
const NO_REVISIONS: readonly AgentRevision[] = [];
const NO_SUGGESTIONS: readonly AgentSuggestion[] = [];

const AGENT_DETAIL_TABS = ["settings", "history"] as const;

/**
 * The detail tab to open first. Defaults to Settings; the dev preview may
 * request History with `?tab=history` so a screenshot can
 * land straight on it. A stray value falls back to Settings.
 */
function initialAgentDetailTab(): (typeof AGENT_DETAIL_TABS)[number] {
  if (typeof window === "undefined") return "settings";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return (AGENT_DETAIL_TABS as readonly string[]).includes(requested ?? "")
    ? (requested as (typeof AGENT_DETAIL_TABS)[number])
    : "settings";
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

function ProviderSupport(props: { agent: AgentConfig }) {
  const { agent } = props;
  const support = useMemo(() => describeProviderSupport(agent, PROVIDERS), [agent]);
  return (
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
  );
}

function AgentDetail(props: {
  agent: AgentConfig;
  notes: readonly AgentImportNote[];
  rootPath: string | null;
  revisions: readonly AgentRevision[];
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: (agent: AgentConfig) => string | null;
  onRestore: (agent: AgentConfig) => void;
}) {
  const { agent } = props;
  const assignments = useAssignments(agent.id);
  const editable = agent.source === "custom";
  const storedSuggestions = useAppStore((state) => state.settings.agentSuggestions[agent.id]);
  const suggestions = storedSuggestions ?? NO_SUGGESTIONS;
  const learningDisabled = useAppStore((state) => state.settings.agentLearningDisabled);
  const learning = !learningDisabled.includes(agent.id);
  const dismissSuggestion = (suggestion: AgentSuggestion) => {
    const state = useAppStore.getState();
    state.updateSettings({
      patch: { agentSuggestions: removeAgentSuggestion(state.settings.agentSuggestions, agent.id, suggestion.id) },
    });
  };
  const setLearning = (on: boolean) => {
    const current = useAppStore.getState().settings.agentLearningDisabled.filter((id) => id !== agent.id);
    useAppStore.getState().updateSettings({ patch: { agentLearningDisabled: on ? current : [...current, agent.id] } });
  };
  const ranContentHashes = useMemo(
    () => new Set(assignments.map((row) => row.agentContentHash)),
    [assignments],
  );

  const settingsTab = (
    <>
      {editable ? (
        <AgentEditor key={agent.id} agent={agent} onSave={props.onSave} />
      ) : (
        <div className={sx(styles.editor)}>
          <dl className={sx(styles.properties)}>
            <dt className={sx(styles.propertyLabel)}>Source</dt>
            <dd className={sx(styles.propertyValue)}>
              {AGENT_SOURCE_LABELS[agent.source]}
              {agent.origin ? ` · ${agent.origin.path}` : ""} · Usable as {describeUsableAs(agent)}
            </dd>
            {agent.avoidWhen ? (
              <>
                <dt className={sx(styles.propertyLabel)}>Don't use when</dt>
                <dd className={sx(styles.propertyValue)}>{agent.avoidWhen}</dd>
              </>
            ) : null}
            <dt className={sx(styles.propertyLabel)}>Runs with</dt>
            <dd className={sx(styles.propertyValue)}>{describeAgent(agent)}</dd>
            {agent.workflow && agent.workflow.length > 1 ? (
              <>
                <dt className={sx(styles.propertyLabel)}>Workflow</dt>
                <dd className={sx(styles.propertyValue)}>
                  {agent.workflow.map((stage) => stage.title).join(" → ")} · Check in:{" "}
                  {AGENT_CHECK_IN_LABELS[agent.checkIns ?? DEFAULT_AGENT_CHECK_INS]}
                </dd>
              </>
            ) : null}
            <dt className={sx(styles.propertyLabel)}>Instructions</dt>
            <dd className={sx(styles.propertyValue)}>
              <pre className={sx(agentStyles.instructions)}>{agent.instructions}</pre>
              <span className={sx(styles.hint)}>Duplicate this agent to change it.</span>
            </dd>
          </dl>
        </div>
      )}
      <div className={sx(styles.editor)}>
        <ProviderSupport agent={agent} />
        <ImportNotes notes={props.notes} />
        <ExportAgent agent={agent} rootPath={props.rootPath} />
      </div>
    </>
  );

  const tabs = [
    { value: "settings", label: "Settings", content: settingsTab },
    {
      value: "history",
      label: "History",
      content: (
        <div className={sx(styles.editor)}>
          {editable ? (
            <AgentHistory
              agent={agent}
              revisions={props.revisions}
              ranContentHashes={ranContentHashes}
              onRestore={props.onRestore}
            />
          ) : (
            <p className={sx(styles.hint)}>Only custom agents keep a version history. Duplicate this agent to edit and track it.</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.editor)}>
        <div className={sx(styles.heading)}>
          <AgentProfileHeader agent={agent} />
          <div className={sx(styles.headingActions)}>
            {isUsableAs(agent, "primary") && !agent.archived ? (
              <Button
                size="sm"
                onClick={() => useAgentsUiStore.getState().openKickoffWithAgent({ agentConfigId: agent.id })}
              >
                <Rocket aria-hidden />
                Start work…
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={props.onDuplicate}>
              <Copy aria-hidden />
              {editable ? "Duplicate" : "Duplicate and edit"}
            </Button>
            {editable ? (
              <>
                <Button size="sm" variant="quiet" onClick={() => props.onSave({ ...agent, archived: !agent.archived })}>
                  {agent.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {agent.archived ? "Restore" : "Archive"}
                </Button>
                <Button size="sm" variant="quiet" tone="danger" onClick={props.onDelete}>
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {editable ? (
        <div className={sx(styles.editor)}>
          <AgentSuggestions
            agent={agent}
            suggestions={suggestions}
            learning={learning}
            onLearningChange={setLearning}
            onApply={(suggestion, instructions) => {
              if (!props.onSave({ ...agent, instructions })) dismissSuggestion(suggestion);
            }}
            onDismiss={dismissSuggestion}
          />
        </div>
      ) : null}
      <div className={sx(styles.editor)}>
        <AgentActivity assignments={assignments} />
      </div>
      <div className={sx(styles.editor)}>
        <Tabs variant="line" items={tabs} defaultValue={initialAgentDetailTab()} />
      </div>
    </div>
  );
}

/** Agent files that were not used, with why; shown under the list and, in a narrow window, under the picker. */
function UnusedFiles(props: { problems: ReadonlyArray<{ path: string; message: string }> }) {
  if (props.problems.length === 0) return null;
  return (
    <details className={sx(agentStyles.problems)}>
      <summary className={sx(styles.hint, styles.hintWarning)}>
        {props.problems.length === 1 ? "1 agent file was not used" : `${props.problems.length} agent files were not used`}
      </summary>
      <ul className={sx(agentStyles.runs)}>
        {props.problems.map((problem) => (
          <li key={`${problem.path}:${problem.message}`} className={sx(agentStyles.problem)}>
            <code>{problem.path}</code>
            <span>{problem.message}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * The Agents tab: saved agents on the left, one agent's profile and editor on
 * the right. Custom agents are created ("New agent"), edited in a sectioned
 * editor, and deleted; built-in and repository agents are read only, and
 * Duplicate makes an editable custom copy.
 */
export function AgentsTab() {
  const custom = useAppStore((state) => state.settings.customAgents);
  const customAgentRevisions = useAppStore((state) => state.settings.customAgentRevisions);
  const projects = useProjectsStore((state) => state.projects);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentConfig | null>(null);
  const selectedId = useAgentsViewStore((state) => state.selectedAgentId);
  const setSelectedId = useAgentsViewStore((state) => state.selectAgent);
  const newAgentNonce = useAgentsUiStore((state) => state.newAgentNonce);
  useEffect(() => {
    if (newAgentNonce > 0) setNewOpen(true);
  }, [newAgentNonce]);
  const rootPath = useAppStore((state) =>
    state.activeWorkspaceId ? (state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath) : state.repositoryPath,
  );
  const repository = useRepositoryAgents(rootPath);
  const repositoryAgents = useMemo(() => repository.scan.agents.map((entry) => entry.agent), [repository.scan]);
  const agents = useMemo(() => listAgents({ custom, repository: repositoryAgents }), [custom, repositoryAgents]);
  // Worker presets are narrow, worker-only roles: not a useful place to start a new agent.
  const templates = useMemo(() => agents.filter((agent) => agent.source !== "custom" && !agent.workerPresetId), [agents]);
  const takenIds = useMemo(() => agents.map((agent) => agent.id), [agents]);
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
    const state = useAppStore.getState();
    const previous = state.settings.customAgents.find((candidate) => candidate.id === agent.id) ?? null;
    try {
      updateSettings({ patch: { customAgents: upsertCustomAgent(state.settings.customAgents, agent) } });
    } catch (error) {
      return error instanceof Error ? error.message : "Stave could not save this agent.";
    }
    const stored = useAppStore.getState().settings.customAgents.find((candidate) => candidate.id === agent.id);
    if (!stored) return "Stave could not save this agent. Check the fields and try again.";
    // A revision is only pushed when an existing agent's behaviour changed;
    // creating one, or a no-op save, adds nothing (pushAgentRevision decides).
    if (previous) {
      const revisions = pushAgentRevision({
        revisions: useAppStore.getState().settings.customAgentRevisions,
        agentId: agent.id,
        previous,
        next: stored,
        savedAt: new Date().toISOString(),
      });
      if (revisions !== useAppStore.getState().settings.customAgentRevisions) {
        updateSettings({ patch: { customAgentRevisions: revisions } });
      }
    }
    return null;
  };

  const duplicate = (agent: AgentConfig) => {
    const copy = duplicateAgent(agent, agents.map((candidate) => candidate.id));
    if (!save(copy)) setSelectedId(copy.id);
  };

  const remove = (agent: AgentConfig) => {
    const state = useAppStore.getState();
    updateSettings({
      patch: {
        customAgents: removeCustomAgent(state.settings.customAgents, agent.id),
        customAgentRevisions: dropAgentRevisions(state.settings.customAgentRevisions, agent.id),
        agentSuggestions: dropAgentSuggestions(state.settings.agentSuggestions, agent.id),
        agentLearningDisabled: state.settings.agentLearningDisabled.filter((id) => id !== agent.id),
      },
    });
    if (selectedId === agent.id) setSelectedId(null);
  };

  // Restore saves an old version as the current agent. `save` pushes the
  // version it replaces onto history, so a restore is itself recorded and can
  // be undone by restoring again.
  const restore = (revision: AgentConfig) => {
    save(revision);
    setSelectedId(revision.id);
  };

  const deleteReferences = useMemo(
    () =>
      deleteTarget
        ? findAgentReferences({ agentConfigId: deleteTarget.id, agents, projects })
        : { blocking: [], soft: [] },
    [deleteTarget, agents, projects],
  );

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
          <Button size="sm" variant="quiet" iconOnly aria-label="New agent" title="New agent" onClick={() => setNewOpen(true)}>
            <Plus aria-hidden />
          </Button>
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
                    <span className={sx(agentStyles.rowLead)}>
                      <AgentAvatar agent={agent} size="sm" aria-label={null} />
                      <span className={sx(agentStyles.rowText)}>
                        <span className={sx(styles.cardTitle, agent.archived && agentStyles.archived)}>{agent.name}</span>
                        <span className={sx(styles.cardMeta)}>{describeAgent(agent)}</span>
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {groups.length === 0 && !query ? (
          <div className={sx(styles.empty)} style={{ padding: 0 }}>
            <p className={sx(styles.emptyText)}>No agents yet. Create one to hand work to it.</p>
            <div className={sx(styles.emptyActions)}>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus aria-hidden />
                New agent
              </Button>
            </div>
          </div>
        ) : null}
        {groups.length === 0 && query ? <p className={sx(styles.hint)}>No agent matches “{query}”.</p> : null}
        <UnusedFiles problems={problems} />
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
            <Button size="sm" variant="quiet" iconOnly aria-label="New agent" title="New agent" onClick={() => setNewOpen(true)}>
              <Plus aria-hidden />
            </Button>
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
          <div className={sx(styles.compactPicker)}>
            <UnusedFiles problems={problems} />
          </div>
          <AgentDetail
            key={selected.id}
            agent={selected}
            notes={selectedNotes}
            rootPath={rootPath}
            revisions={customAgentRevisions[selected.id] ?? NO_REVISIONS}
            onDuplicate={() => duplicate(selected)}
            onDelete={() => setDeleteTarget(selected)}
            onSave={save}
            onRestore={restore}
          />
        </div>
      ) : null}
      <NewAgentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        templates={templates}
        takenIds={takenIds}
        onCreate={(created) => {
          setDraft(created);
          setSelectedId(null);
        }}
      />
      {draft ? (
        <NewAgentDraftEditor
          draft={draft}
          onSave={(agent) => {
            const error = save(agent);
            if (!error) {
              setDraft(null);
              setSelectedId(agent.id);
            }
            return error;
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteAgentDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          agent={deleteTarget}
          references={deleteReferences}
          onDelete={() => remove(deleteTarget)}
          onArchive={() => save({ ...deleteTarget, archived: true })}
        />
      ) : null}
    </div>
  );
}

/** The unsaved-draft editor for a new agent, shown in a dialog over the tab. */
function NewAgentDraftEditor(props: {
  draft: AgentConfig;
  onSave: (agent: AgentConfig) => string | null;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      width="lg"
      title="New agent"
      description="Nothing is saved until you save."
    >
      <div data-testid="agents-new-draft">
        <AgentEditor agent={props.draft} onSave={props.onSave} onCancel={props.onCancel} saveLabel="Save agent" />
      </div>
    </Dialog>
  );
}
