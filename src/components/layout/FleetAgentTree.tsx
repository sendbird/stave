import { fleetSelectionRowMarker } from "./fleet-selection.stylex";
import { FleetSelectionCheckbox, useFleetSelectionRows } from "./FleetSelection";
import { FleetGroupHeader } from "./FleetGrouping";
import { groupFleetTaskRows, type FleetStatusGroup } from "@/lib/fleet/status-groups";
import { useFleetGroupingStore } from "@/store/fleet-grouping-store";
import { i18n, useTranslation } from "@/i18n";
import { ArrowUpRight } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useMemo } from "react";
import { createFleetAgentFactsSelector } from "./fleet-agent-facts-selector";
import { AgentFleet, type AgentFleetAgent } from "@/components/aui/components/AgentFleet";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import {
  FleetTaskTableView,
  useFleetTaskRows,
  useFleetTaskRowsSummary,
  type FleetTaskTableRepository,
  type FleetTaskTableSummary,
} from "@/components/layout/FleetTaskTable";
import { FleetProviderIcon } from "@/components/layout/FleetWorkspaceCard";
import { getToolIcon } from "@/components/session/message/tool-icon";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
import { selectDelegationExchanges } from "@/lib/delegation/exchange";
import {
  buildMainAgent,
  buildSubagent,
  EMPTY_FLEET_AGENT_FACTS,
} from "@/lib/fleet/agent-tree";
import type { FleetTaskRow, FleetTaskTableFilter } from "@/lib/fleet/task-rows";
import type { FleetOwnerFilter } from "@/lib/fleet/task-owner";
import { selectDelegatedTaskBlockedKinds } from "@/lib/runs/delegated-task-view";
import { useAppStore } from "@/store/app.store";
import { useFleetViewStore } from "@/store/fleet-view-store";
import { sharedFilesParentKey, useSharedFilesStore } from "@/store/shared-files-store";
import { findActiveTaskRun, findTarsResponsibility, tarsTaskTarget } from "@/lib/tars/ownership";
import { FleetTarsOwnerLabel } from "@/components/tars/fleet-tars-owner";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import { useTarsResponsibilities } from "@/store/tars-snapshot-store";

type OpenTaskTarget = { repositoryPath: string; workspaceId: string; taskId: string };

/**
 * Fleet's Tree layout: every open task, with the same rows, filter, search
 * and unopened-workspace handling as the table, drawn as main agents. The
 * open agent's subagents (its delegated tasks and its turn's own subagents)
 * load only while it is open.
 */
export function FleetAgentTree(props: {
  suppressEmptyMessage?: boolean;
  repositories: readonly FleetTaskTableRepository[];
  filter: FleetTaskTableFilter;
  owner?: FleetOwnerFilter;
  searchQuery: string;
  nowMs: number;
  onOpenTask: (target: OpenTaskTarget) => void;
  onSummaryChange?: (summary: FleetTaskTableSummary) => void;
}) {
  const { rows, shownRows, load, retry } = useFleetTaskRows(props);
  useFleetTaskRowsSummary(shownRows, props.onSummaryChange);
  return (
    <FleetTaskTableView
      rows={shownRows}
      suppressEmptyMessage={props.suppressEmptyMessage}
      hasRows={rows.length > 0}
      load={load}
      onRetry={retry}
      nowMs={props.nowMs}
      onOpenTask={props.onOpenTask}
      renderRows={(shown) => (
        <FleetAgentTreeBoard rows={shown} nowMs={props.nowMs} onOpenTask={props.onOpenTask} />
      )}
    />
  );
}

function FleetAgentTreeBoard(props: {
  rows: readonly FleetTaskRow[];
  nowMs: number;
  onOpenTask: (target: OpenTaskTarget) => void;
}) {
  const { t } = useTranslation(["fleet", "shell"]);
  const grouping = useFleetGroupingStore((state) => state.grouping);
  const groupRuns = useFleetAgentRunsStore((state) => state.details);
  const groups = useMemo(() => groupFleetTaskRows(props.rows, grouping, groupRuns), [props.rows, grouping, groupRuns]);
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups]);
  const targets = useMemo(() => rows.map((row) => ({ ...row, taskId: row.task.id })), [rows]);
  useFleetSelectionRows("tree", targets);
  // A card names its owner beside the model when an active Tars responsibility holds the task.
  const tarsResponsibilities = useTarsResponsibilities();
  // Ownership needs the task's own active run, so a run you started there is never Tars's.
  const fleetRuns = useFleetAgentRunsStore((state) => state.details);
  const fleetRunsLoaded = useFleetAgentRunsStore((state) => state.loaded);
  const selectFacts = useMemo(() => createFleetAgentFactsSelector(rows), [rows, i18n.resolvedLanguage]);
  const facts = useAppStore(selectFacts);

  // The first agent opens until the user chooses; then the choice holds, also
  // across leaving Fleet and coming back.
  const chosen = useFleetViewStore((state) => state.openAgentKey);
  const setChosen = useFleetViewStore((state) => state.setOpenAgentKey);
  const firstKey = rows[0]?.key ?? null;
  useEffect(() => {
    if (chosen === undefined && firstKey !== null) setChosen(firstKey);
  }, [chosen, firstKey, setChosen]);
  const openKey = chosen === undefined ? firstKey : chosen;
  const openRow = rows.find((row) => row.key === openKey) ?? null;

  const children = useOpenAgentChildren(openRow, props.nowMs);
  // Shared files are read only where a task's Subagents tab was opened; a
  // card counts them when that read found any, and says nothing otherwise.
  const sharedFilesByParent = useSharedFilesStore((state) => state.byParent);

  const agents = useMemo<AgentFleetAgent[]>(
    () =>
      rows.map((row) => {
        const sharedFileCount = sharedFilesByParent[sharedFilesParentKey(row.workspaceId, row.task.id)]?.shared.length ?? 0;
        const main = buildMainAgent(row, facts[row.key] ?? EMPTY_FLEET_AGENT_FACTS);
        const run = findActiveTaskRun(fleetRuns, row.workspaceId, row.task.id) ?? (fleetRunsLoaded ? null : undefined);
        const tarsOwned = findTarsResponsibility(tarsResponsibilities, tarsTaskTarget(row.task.id, row.workspaceId, run)) !== null;
        const agent: AgentFleetAgent = {
          ...main,
          ...(tarsOwned
            ? { model: main.model ? t("shell:tars.owner.withModel", { model: main.model }) : t("shell:tars.owner.label") }
            : {}),
          avatar: <FleetProviderIcon provider={row.task.provider} />,
          ...(sharedFileCount > 0 ? { sharedFileCount } : {}),
        };
        return row.key === openRow?.key
          ? {
              ...agent,
              children: children.agents,
              childrenLoading: children.loading,
              childrenError: children.error,
            }
          : agent;
      }),
    // The agents carry translated words; a language switch rebuilds them.
    [children, facts, fleetRuns, fleetRunsLoaded, openRow?.key, rows, sharedFilesByParent, t, tarsResponsibilities, i18n.resolvedLanguage],
  );

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const rowsByKey = useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);

  const openChild = (agent: AgentFleetAgent) => {
    const ref = children.refs.get(agent.id);
    if (!openRow || !ref) return;
    props.onOpenTask({
      repositoryPath: openRow.repositoryPath,
      workspaceId: ref.workspaceId,
      taskId: ref.taskId,
    });
  };

  return (
    <div className={sx(styles.board)} data-fleet-agent-tree="true" onKeyDownCapture={(event) => {
      if (event.defaultPrevented || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("[data-agent-fleet-card]")) return;
      const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-agent-fleet-card]")];
      const index = cards.indexOf(target);
      if (index < 0) return;
      const next = event.key === "ArrowDown" ? (index + 1) % cards.length
        : event.key === "ArrowUp" ? (index - 1 + cards.length) % cards.length
        : event.key === "Home" ? 0 : event.key === "End" ? cards.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation(); cards[next]?.focus();
    }}>
      {groups.map((group) => <section key={group.id}>
        {group.title ? <FleetGroupHeader title={grouping === "status" ? t(`fleet:grouping.${group.title as FleetStatusGroup}`) : group.title} keys={group.rows.map((row) => row.key)} /> : null}
      <AgentFleet
        agents={group.rows.map((row) => agentsById.get(row.key)!)}
        renderMainCard={(agent, card) => <div data-fleet-select-key={agent.id} className={sx(styles.selectionRow, fleetSelectionRowMarker)}>
          <FleetSelectionCheckbox itemKey={agent.id} title={agent.name} />{card}
        </div>}
        open={openRow?.key ?? null}
        onOpenChange={(id) => setChosen(id)}
        // A delegated task opens as its own task; an in-turn subagent shows its steps.
        onSelect={openChild}
        onResolve={openChild}
        renderToolIcon={(tool) => getToolIcon(tool.id)}
        renderTreeActions={(agent) => {
          const row = rowsByKey.get(agent.id);
          if (!row) return null;
          return (
            <>
              <FleetTarsOwnerLabel workspaceId={row.workspaceId} taskId={row.task.id} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={t("fleet:taskTable.openTask", { title: agent.name, workspace: row.workspaceName })}
                onClick={() =>
                  props.onOpenTask({
                    repositoryPath: row.repositoryPath,
                    workspaceId: row.workspaceId,
                    taskId: row.task.id,
                  })
                }
              >
                {t("fleet:agentTree.openTask")}
                <ArrowUpRight aria-hidden="true" />
              </Button>
            </>
          );
        }}
      />
      </section>)}
    </div>
  );
}

interface OpenAgentChildren {
  agents: AgentFleetAgent[];
  loading: boolean;
  error: string | null;
  /** Delegated tasks the user can open, by subagent id. */
  refs: ReadonlyMap<string, { workspaceId: string; taskId: string }>;
}

/**
 * The open task's subagents, read the way its Subagents tab reads them: the
 * delegation ledger plus the live (or retained) turn's work graph, derived in
 * a memo from stable store references.
 */
function useOpenAgentChildren(row: FleetTaskRow | null, nowMs: number): OpenAgentChildren {
  const taskId = row?.task.id ?? null;
  const graph = useAppStore((state) =>
    taskId
      ? (state.providerTurnActivityByTask[taskId]?.workGraph ??
        state.retainedTurnActivityByTask[taskId]?.snapshot.workGraph ??
        null)
      : null,
  );
  const listing = useDelegatedTasks({
    parentTaskId: taskId,
    parentWorkspaceId: row?.workspaceId ?? null,
    repositoryPath: row?.repositoryPath ?? null,
  });
  // The stable store array; blocked kinds are derived below, never in the selector.
  const notifications = useAppStore((state) => state.notifications);
  return useMemo(() => {
    const childBlockedByDelegationKey = selectDelegatedTaskBlockedKinds({
      children: listing.children,
      notifications,
    });
    const exchanges = selectDelegationExchanges({
      delegatedTasks: listing.children,
      childBlockedByDelegationKey,
      workGraph: graph,
      includeSubagents: true,
    });
    const refs = new Map<string, { workspaceId: string; taskId: string }>();
    for (const exchange of exchanges) {
      const { delegatedWorkspaceId, delegatedTaskId } = exchange.ref;
      if (exchange.kind === "delegated-task" && delegatedWorkspaceId && delegatedTaskId) {
        refs.set(exchange.id, { workspaceId: delegatedWorkspaceId, taskId: delegatedTaskId });
      }
    }
    return {
      agents: exchanges.map((exchange) => buildSubagent(exchange, nowMs)),
      loading: listing.loading,
      error: listing.error,
      refs,
    };
    // The subagents carry translated words; a language switch rebuilds them.
  }, [graph, listing.children, listing.error, listing.loading, notifications, nowMs, i18n.resolvedLanguage]);
}

const styles = stylex.create({
  selectionRow: { gridColumn: "1", display: "flex", alignItems: "center", gap: vars["--aui-space-4"], minInlineSize: 0 },
  // The cards' grid inset, so the agents line up under the toolbar.
  board: {
    minWidth: 0,
    paddingBlock: vars["--aui-space-12"],
    paddingInline: vars["--aui-space-16"],
  },
});
