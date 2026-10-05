import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { getAgentDisplayName, getAgentDisplayAvoidWhen } from "@/lib/agents/display";
import { i18n, useTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAgentsViewStore } from "@/store/agents-view-store";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { ExportAgent } from "./ExportAgent";
import { AgentAvatar } from "./AgentAvatar";
import { AgentEditor } from "./AgentEditor";
import { AgentActivity } from "./AgentActivity";
import { AgentHistory } from "./AgentHistory";
import { AgentProfileHeader } from "./AgentProfileHeader";
import { AgentsListResizeHandle, useAgentsListWidthStyle } from "./AgentsListResizeHandle";
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
  get refused() { return i18n.t("agents:agentsTab.refused"); },
  get dropped() { return i18n.t("agents:agentsTab.dropped"); },
  get changed() { return i18n.t("agents:agentsTab.changed"); },
};

/** What reading the file did not carry over, so a repository agent never looks more capable than it is. */
function ImportNotes(props: { notes: readonly AgentImportNote[] }) {
  useTranslation();
  if (props.notes.length === 0) return null;
  return (
    <section aria-label={i18n.t("agents:agentsTab.ariaLabel")}>
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>{i18n.t("agents:agentsTab.importNotes")}</h3>
        <span className={sx(styles.sectionAside)}>{i18n.t("agents:agentsTab.importNotes2")}</span>
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

/** How each provider runs the agent as a main agent; absent for an agent that cannot be one. */
export function ProviderSupport(props: { agent: AgentConfig }) {
  useTranslation();
  const { agent } = props;
  const support = useMemo(() => describeProviderSupport(agent, PROVIDERS), [agent]);
  // Every row would only say it can't be used as a main agent; "Usable as" already does.
  if (!isUsableAs(agent, "primary")) return null;
  return (
    <section aria-label={i18n.t("agents:agentsTab.ariaLabel2")}>
      <div className={sx(styles.sectionHeader)}>
        <h3 className={sx(styles.sectionTitle)}>{i18n.t("agents:agentsTab.providerSupport")}</h3>
        <span className={sx(styles.sectionAside)}>
          {agent.permission === "auto"
            ? i18n.t("agents:agentsTab.providerSupport2")
            : i18n.t("agents:agentsTab.providerSupport3", { value1: AGENT_PERMISSION_LABELS[agent.permission] })}
        </span>
      </div>
      <table className={sx(agentStyles.support)}>
        <thead>
          <tr>
            <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>{i18n.t("agents:agentsTab.providerSupport4")}</th>
            <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>{i18n.t("agents:agentsTab.providerSupport5")}</th>
            <th className={sx(agentStyles.supportCell, agentStyles.supportHead)}>{i18n.t("agents:agentsTab.providerSupport6")}</th>
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
                  <td className={sx(agentStyles.supportCell)}>{row.tools ? SUPPORT_LEVEL_LABELS[row.tools] : i18n.t("agents:agentsTab.copy")}</td>
                  <td className={sx(agentStyles.supportCell)}>
                    {row.permission ? SUPPORT_LEVEL_LABELS[row.permission] : i18n.t("agents:agentsTab.copy2")}
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
  useTranslation();
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
    <div className={sx(agentStyles.pane, agentStyles.tabPane)}>
      {editable ? (
        <AgentEditor key={agent.id} agent={agent} onSave={props.onSave} embedded />
      ) : (
        <div>
          <dl className={sx(styles.properties)}>
            <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentsTab.settingsTab")}</dt>
            <dd className={sx(styles.propertyValue)}>{i18n.t("agents:agentsTab.sentence14", { value1: AGENT_SOURCE_LABELS[agent.source], value2: agent.origin ? ` · ${agent.origin.path}` : "", value3: describeUsableAs(agent) })}</dd>
            {getAgentDisplayAvoidWhen(agent) ? (
              <>
                <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentsTab.settingsTab3")}</dt>
                <dd className={sx(styles.propertyValue)}>{getAgentDisplayAvoidWhen(agent)}</dd>
              </>
            ) : null}
            <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentsTab.settingsTab4")}</dt>
            <dd className={sx(styles.propertyValue)}>{describeAgent(agent)}</dd>
            {agent.workflow && agent.workflow.length > 1 ? (
              <>
                <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentsTab.settingsTab5")}</dt>
                <dd className={sx(styles.propertyValue)}>{i18n.t("agents:agentsTab.sentence15", { value1: agent.workflow.map((stage) => getStageDisplayTitle(stage)).join(" → "), value2: " ", value3: AGENT_CHECK_IN_LABELS[agent.checkIns ?? DEFAULT_AGENT_CHECK_INS] })}</dd>
              </>
            ) : null}
            <dt className={sx(styles.propertyLabel)}>{i18n.t("agents:agentsTab.settingsTab7")}</dt>
            <dd className={sx(styles.propertyValue)}>
              <pre className={sx(agentStyles.instructions)}>{agent.instructions}</pre>
              <span className={sx(styles.hint)}>{i18n.t("agents:agentsTab.settingsTab8")}</span>
            </dd>
          </dl>
        </div>
      )}
      {editable ? (
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
      ) : null}
      <ProviderSupport agent={agent} />
      <ImportNotes notes={props.notes} />
      <ExportAgent agent={agent} rootPath={props.rootPath} />
    </div>
  );

  // Only custom agents keep a history, so the others have nothing to tab between.
  const tabs = editable
    ? [
        { value: "settings", label: i18n.t("agents:agentsTab.label"), content: settingsTab },
        {
          value: "history",
          label: i18n.t("agents:agentsTab.label2"),
          content: (
            <div className={sx(agentStyles.pane, agentStyles.tabPane)}>
              <AgentHistory
                agent={agent}
                revisions={props.revisions}
                ranContentHashes={ranContentHashes}
                onRestore={props.onRestore}
              />
            </div>
          ),
        },
      ]
    : null;

  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.editor, agentStyles.detail)}>
        <div className={sx(styles.heading)}>
          <AgentProfileHeader agent={agent} />
          <div className={sx(styles.headingActions)}>
            {isUsableAs(agent, "primary") && !agent.archived ? (
              <Button
                size="sm"
                onClick={() => useAgentsUiStore.getState().openKickoffWithAgent({ agentConfigId: agent.id })}
              >
                <Rocket aria-hidden />
                {i18n.t("agents:agentsTab.agentDetail")}</Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={props.onDuplicate}>
              <Copy aria-hidden />
              {editable ? i18n.t("agents:agentsTab.agentDetail2") : i18n.t("agents:agentsTab.agentDetail3")}
            </Button>
            {editable ? (
              <>
                <Button size="sm" variant="quiet" onClick={() => props.onSave({ ...agent, archived: !agent.archived })}>
                  {agent.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                  {agent.archived ? i18n.t("agents:agentsTab.agentDetail4") : i18n.t("agents:agentsTab.agentDetail5")}
                </Button>
                <Button size="sm" variant="quiet" tone="danger" onClick={props.onDelete}>
                  <Trash2 aria-hidden />
                  {i18n.t("agents:agentsTab.agentDetail6")}</Button>
              </>
            ) : null}
          </div>
        </div>
        <AgentActivity assignments={assignments} />
        {tabs ? <Tabs variant="line" items={tabs} defaultValue={initialAgentDetailTab()} /> : settingsTab}
      </div>
    </div>
  );
}

/** Agent files that were not used, with why; shown under the list and, in a narrow window, under the picker. */
function UnusedFiles(props: { problems: ReadonlyArray<{ path: string; message: string }> }) {
  useTranslation();
  if (props.problems.length === 0) return null;
  return (
    <details className={sx(agentStyles.problems)}>
      <summary className={sx(styles.hint, styles.hintWarning)}>
        {props.problems.length === 1 ? i18n.t("agents:agentsTab.unusedFiles") : i18n.t("agents:agentsTab.unusedFiles2", { value1: props.problems.length })}
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
  useTranslation();
  const custom = useAppStore((state) => state.settings.customAgents);
  const customAgentRevisions = useAppStore((state) => state.settings.customAgentRevisions);
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
    [repository.scan, custom, repositoryAgents, i18n.language],
  );
  const groups = useMemo(() => groupAgents(agents, query), [agents, query, i18n.language]);
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
      return error instanceof Error ? error.message : i18n.t("agents:agentsTab.extraCopy28");
    }
    const stored = useAppStore.getState().settings.customAgents.find((candidate) => candidate.id === agent.id);
    if (!stored) return i18n.t("agents:agentsTab.extraCopy29");
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
        ? findAgentReferences({ agentConfigId: deleteTarget.id, agents })
        : { blocking: [], soft: [] },
    [deleteTarget, agents],
  );

  const tabRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const listWidthStyle = useAgentsListWidthStyle();

  return (
    <div
      ref={tabRef}
      className={sx(styles.tab, agentStyles.tabResizable)}
      style={listWidthStyle}
      data-testid="agents-tab"
    >
      <aside ref={listRef} className={sx(styles.master, agentStyles.masterResizable)} aria-label={i18n.t("agents:agentsTab.ariaLabel3")}>
        <div className={sx(styles.masterHeader)}>
          <div className={sx(styles.masterSearch)}>
            <TextField
              size="sm"
              controlOnly
              aria-label={i18n.t("agents:agentsTab.ariaLabel4")}
              placeholder={i18n.t("agents:agentsTab.placeholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button size="sm" variant="quiet" iconOnly aria-label={i18n.t("agents:agentsTab.ariaLabel5")} title={i18n.t("agents:agentsTab.title")} onClick={() => setNewOpen(true)}>
            <Plus aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="quiet"
            iconOnly
            aria-label={i18n.t("agents:agentsTab.ariaLabel6")}
            title={i18n.t("agents:agentsTab.title2")}
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
                        <span className={sx(styles.cardTitle, agent.archived && agentStyles.archived)}>{getAgentDisplayName(agent)}</span>
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
            <p className={sx(styles.emptyText)}>{i18n.t("agents:agentsTab.agentsTab")}</p>
            <div className={sx(styles.emptyActions)}>
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus aria-hidden />
                {i18n.t("agents:agentsTab.agentsTab2")}</Button>
            </div>
          </div>
        ) : null}
        {groups.length === 0 && query ? <p className={sx(styles.hint)}>{i18n.t("agents:agentsTab.sentence16", { value1: query })}</p> : null}
        <UnusedFiles problems={problems} />
        {rootPath && repositoryAgents.length === 0 && problems.length === 0 && !query ? (
          <p className={sx(styles.hint)}>
            {i18n.t("agents:agentsTab.agentsTab4")}</p>
        ) : null}
      </aside>
      <AgentsListResizeHandle tabRef={tabRef} listRef={listRef} />
      {selected ? (
        <div className={sx(styles.detail)}>
          <div className={sx(styles.compactPicker)}>
            <Select
              size="sm"
              aria-label={i18n.t("agents:agentsTab.ariaLabel7")}
              value={selected.id}
              options={agents.map((agent) => ({ value: agent.id, label: getAgentDisplayName(agent) }))}
              onValueChange={(value) => setSelectedId(String(value))}
            />
            <Button size="sm" variant="quiet" iconOnly aria-label={i18n.t("agents:agentsTab.ariaLabel8")} title={i18n.t("agents:agentsTab.title3")} onClick={() => setNewOpen(true)}>
              <Plus aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="quiet"
              iconOnly
              aria-label={i18n.t("agents:agentsTab.ariaLabel9")}
              title={i18n.t("agents:agentsTab.title4")}
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
  useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      width="lg"
      title={i18n.t("agents:agentsTab.title5")}
      description={i18n.t("agents:agentsTab.description")}
    >
      <div data-testid="agents-new-draft">
        <AgentEditor agent={props.draft} onSave={props.onSave} onCancel={props.onCancel} saveLabel={i18n.t("agents:agentsTab.saveLabel")} embedded />
      </div>
    </Dialog>
  );
}
