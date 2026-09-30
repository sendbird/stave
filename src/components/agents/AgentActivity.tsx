import { useCallback, useMemo, useState } from "react";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import {
  AGENT_ACTIVITY_FILTERS,
  AGENT_ACTIVITY_FILTER_LABELS,
  matchesAgentActivityFilter,
  summarizeAgentActivity,
  type AgentActivityFilter,
} from "@/lib/agents/agent-activity";
import { classifyTaskStatus, type FleetTaskStatus } from "@/lib/fleet/task-status";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { playbookStyles as styles } from "../playbooks/playbooks.styles";
import { agentStyles } from "./agents.styles";

/**
 * Live Fleet status for a set of task ids, without an unstable selector: the
 * selector returns a JSON string, so a streamed token that changes no task's
 * status leaves it equal, and the parsed map is memoized here. Mirrors the
 * sidebar's `useAgentsWithWork` pattern.
 */
function useStatusByTaskId(taskIds: readonly string[]): Record<string, FleetTaskStatus> {
  const key = taskIds.join(",");
  const serialized = useAppStore(
    useCallback(
      (state: AppState) => {
        const ids = key ? key.split(",") : [];
        const byId: Record<string, FleetTaskStatus> = {};
        for (const id of ids) {
          const task = state.tasks.find((candidate) => candidate.id === id);
          if (!task) continue;
          byId[id] = classifyTaskStatus({
            task,
            messages: state.messagesByTask[id] ?? [],
            activeTurnId: state.activeTurnIdsByTask[id] ?? null,
            activity: state.providerTurnActivityByTask[id] ?? null,
          });
        }
        return JSON.stringify(byId);
      },
      [key],
    ),
  );
  return useMemo(() => JSON.parse(serialized) as Record<string, FleetTaskStatus>, [serialized]);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function Stat(props: { label: string; value: number | string }) {
  return (
    <div className={sx(agentStyles.stat)}>
      <span className={sx(agentStyles.statValue)}>{props.value}</span>
      <span className={sx(styles.hint)}>{props.label}</span>
    </div>
  );
}

/**
 * Activity, shown on the agent page above Settings and History: headline counts from the assignment rows joined with live
 * Fleet status (running, needs you, couldn't start), last used, and the Work
 * list with a state filter. Counts are derived in pure `summarizeAgentActivity`
 * so they are tested once; the live status map avoids an unstable selector.
 */
export function AgentActivity(props: { assignments: readonly AgentAssignment[] }) {
  const [filter, setFilter] = useState<AgentActivityFilter>("all");
  const taskIds = useMemo(
    () => props.assignments.flatMap((row) => (row.taskId ? [row.taskId] : [])),
    [props.assignments],
  );
  const statusByTaskId = useStatusByTaskId(taskIds);
  const summary = useMemo(
    () => summarizeAgentActivity({ assignments: props.assignments, statusByTaskId }),
    [props.assignments, statusByTaskId],
  );
  const filtered = useMemo(
    () => props.assignments.filter((row) => matchesAgentActivityFilter(row.state, filter)),
    [props.assignments, filter],
  );

  return (
    <section aria-label="Activity" className={sx(styles.editor)}>
      <div className={sx(agentStyles.stats)}>
        <Stat label="Assignments" value={summary.total} />
        <Stat label="Running" value={summary.running} />
        <Stat label="Needs you" value={summary.needsYou} />
        <Stat label="Couldn't start" value={summary.couldntStart} />
        <Stat label="Last used" value={formatWhen(summary.lastUsedAt)} />
      </div>
      <section aria-label="Work">
        <div className={sx(styles.sectionHeader)}>
          <h3 className={sx(styles.sectionTitle)}>Work</h3>
          <Select
            size="sm"
            aria-label="Filter by state"
            value={filter}
            options={AGENT_ACTIVITY_FILTERS.map((value) => ({ value, label: AGENT_ACTIVITY_FILTER_LABELS[value] }))}
            onValueChange={(value) => setFilter(String(value) as AgentActivityFilter)}
          />
        </div>
        {filtered.length === 0 ? (
          <p className={sx(styles.hint)}>Nothing here yet.</p>
        ) : (
          <ul className={sx(agentStyles.runs)}>
            {filtered.map((row) => {
              const live = row.taskId ? statusByTaskId[row.taskId] : undefined;
              return (
                <li key={row.id} className={sx(agentStyles.run)}>
                  <span className={sx(agentStyles.runTitle)} title={row.assignment}>
                    {row.assignment.split("\n")[0]}
                  </span>
                  <span className={sx(agentStyles.runState)}>
                    {live ? FLEET_STATUS_LABELS[live] : ASSIGNMENT_STATE_LABELS[row.state]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

const FLEET_STATUS_LABELS: Readonly<Record<FleetTaskStatus, string>> = {
  "waiting-input": "Needs you",
  "waiting-approval": "Needs approval",
  error: "Couldn't finish",
  running: "Running",
  idle: "Idle",
};
