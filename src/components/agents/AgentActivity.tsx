import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import {
  AGENT_ACTIVITY_FILTERS,
  AGENT_ACTIVITY_FILTER_LABELS,
  matchesAgentActivityFilter,
  summarizeAgentActivity,
  type AgentActivityFilter,
  type AgentActivitySummary,
} from "@/lib/agents/agent-activity";
import { formatRelativeTime } from "@/components/layout/automation-center/automation-center.utils";
import { classifyTaskStatus, type FleetTaskStatus } from "@/lib/fleet/task-status";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { describeAgentRunProgress, describeAgentRunStatus } from "@/lib/agent-runs/agent-run-status";
import { workflowStyles as styles } from "../workflows/workflows.styles";
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

/**
 * The newest agent run of each task Fleet knows (active, or ended in the last
 * half hour), keyed by task id. Selects the stable `details` map and derives
 * the index in a memo, never a new object in the selector.
 */
function useRunByTaskId(): Record<string, AgentRunDetail> {
  const details = useFleetAgentRunsStore((state) => state.details);
  return useMemo(() => {
    const byTask: Record<string, AgentRunDetail> = {};
    for (const detail of Object.values(details)) {
      if (!hasAgentOrigin(detail.agentRun)) continue;
      const current = byTask[detail.agentRun.leadTaskId];
      if (!current || current.agentRun.createdAt < detail.agentRun.createdAt) byTask[detail.agentRun.leadTaskId] = detail;
    }
    return byTask;
  }, [details]);
}

function openAssignmentTask(row: AgentAssignment) {
  if (!row.taskId) return;
  const state = useAppStore.getState();
  state.closeAgents();
  void state.focusTaskAttention({
    repositoryPath: row.repositoryPath,
    ...(row.workspaceId ? { workspaceId: row.workspaceId } : {}),
    taskId: row.taskId,
  });
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The summary line under the header. Only what drives a decision is loud:
 * "N running" and "N need you" appear when non-zero. Everything else is one
 * quiet line: how many assignments, how many couldn't start, last used as a
 * relative time (the full timestamp is its title).
 */
function ActivitySummary(props: { summary: AgentActivitySummary }) {
  const { summary } = props;
  if (summary.total === 0) return null;
  const quiet = [
    plural(summary.total, "assignment"),
    ...(summary.couldntStart > 0 ? [`${summary.couldntStart} couldn't start`] : []),
  ].join(" · ");
  const lastUsed = summary.lastUsedAt ? new Date(summary.lastUsedAt) : null;
  return (
    <div className={sx(agentStyles.summary)}>
      {summary.running > 0 ? <span className={sx(agentStyles.attention)}>{summary.running} running</span> : null}
      {summary.needsYou > 0 ? <span className={sx(agentStyles.attention)}>{summary.needsYou} need you</span> : null}
      <span className={sx(styles.hint)}>
        {quiet}
        {lastUsed && !Number.isNaN(lastUsed.getTime()) ? (
          <>
            {" · "}
            <span title={lastUsed.toLocaleString()}>Last used {formatRelativeTime(summary.lastUsedAt)}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Activity, shown on the agent page above Settings and History: a short summary from the assignment rows joined with live
 * Fleet status (running and needs you when non-zero, then totals and last
 * used as one quiet line), and the Work list with a state filter. Counts are derived in pure `summarizeAgentActivity`
 * so they are tested once; the live status map avoids an unstable selector.
 */
export function AgentActivity(props: { assignments: readonly AgentAssignment[] }) {
  const [filter, setFilter] = useState<AgentActivityFilter>("all");
  const taskIds = useMemo(
    () => props.assignments.flatMap((row) => (row.taskId ? [row.taskId] : [])),
    [props.assignments],
  );
  const statusByTaskId = useStatusByTaskId(taskIds);
  const runByTaskId = useRunByTaskId();
  const summary = useMemo(
    () => summarizeAgentActivity({ assignments: props.assignments, statusByTaskId }),
    [props.assignments, statusByTaskId],
  );
  const filtered = useMemo(
    () => props.assignments.filter((row) => matchesAgentActivityFilter(row.state, filter)),
    [props.assignments, filter],
  );

  // An agent that was never assigned has no activity to show; the page starts at its settings.
  if (props.assignments.length === 0) return null;
  return (
    <section aria-label="Activity" className={sx(agentStyles.activity)}>
      <ActivitySummary summary={summary} />
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
          <p className={sx(styles.hint)}>Nothing in this state.</p>
        ) : (
          <ul className={sx(agentStyles.runs)}>
            {filtered.map((row) => {
              const live = row.taskId ? statusByTaskId[row.taskId] : undefined;
              // The run this agent is doing on the task, when Fleet has it.
              const run = row.taskId ? runByTaskId[row.taskId] : undefined;
              const ownRun = run && run.agentRun.workflow.name === row.agentName ? run : undefined;
              const progress = ownRun ? describeAgentRunProgress(ownRun) : null;
              const stateLabel = ownRun
                ? describeAgentRunStatus(ownRun).label
                : live
                  ? FLEET_STATUS_LABELS[live]
                  : ASSIGNMENT_STATE_LABELS[row.state];
              return (
                <li key={row.id} className={sx(agentStyles.run)}>
                  {row.taskId ? (
                    <Button
                      layout="host"
                      variant="quiet"
                      press="none"
                      xstyle={[agentStyles.runTitle, agentStyles.runLink]}
                      title={`${row.assignment}\nOpen the task`}
                      onClick={() => openAssignmentTask(row)}
                    >
                      {row.assignment.split("\n")[0]}
                    </Button>
                  ) : (
                    <span className={sx(agentStyles.runTitle)} title={row.assignment}>
                      {row.assignment.split("\n")[0]}
                    </span>
                  )}
                  <span className={sx(agentStyles.runState)}>
                    {progress ? `${progress} · ` : ""}
                    {stateLabel}
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
