import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { ASSIGNMENT_STATE_LABELS, type AgentAssignment } from "@/lib/agents/assign";
import {
  AGENT_ACTIVITY_FILTERS,
  AGENT_ACTIVITY_FILTER_LABELS,
  matchesAgentActivityFilter,
  orderAgentActivityRows,
  summarizeAgentActivity,
  type AgentActivityFilter,
  type AgentActivitySummary,
} from "@/lib/agents/agent-activity";
import { formatRelativeTime } from "@/i18n/format";
import { classifyTaskStatus, type FleetTaskStatus } from "@/lib/fleet/task-status";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { useFleetAgentRunsStore } from "@/store/fleet-agent-runs-store";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import { describeAgentRunProgress, describeAgentRunStatus } from "@/lib/agent-runs/agent-run-status";
import { useAgentRunProgress } from "../agent-runs/useAgentRunProgress";
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
  useTranslation();
  const { summary } = props;
  if (summary.total === 0) return null;
  const quiet = [
    plural(summary.total, "assignment"),
    ...(summary.couldntStart > 0 ? [i18n.t("agents:agentActivity.extraCopy23", { value1: summary.couldntStart })] : []),
  ].join(" · ");
  const lastUsed = summary.lastUsedAt ? new Date(summary.lastUsedAt) : null;
  return (
    <div className={sx(agentStyles.summary)}>
      {summary.running > 0 ? <span className={sx(agentStyles.attention)}>{summary.running} {i18n.t("agents:agentActivity.activitySummary")}</span> : null}
      {summary.needsYou > 0 ? <span className={sx(agentStyles.attention)}>{i18n.t("agents:agentActivity.sentence9", { value1: summary.needsYou })}</span> : null}
      <span className={sx(styles.hint)}>
        {quiet}
        {lastUsed && !Number.isNaN(lastUsed.getTime()) ? (
          <>
            {" · "}
            <span title={formatDateTime(lastUsed)}>{i18n.t("agents:agentActivity.sentence10", { value1: formatRelativeTime(lastUsed) })}</span>
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
  useTranslation();
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
    () =>
      orderAgentActivityRows(
        props.assignments.filter((row) => matchesAgentActivityFilter(row.state, filter)),
        statusByTaskId,
      ),
    [props.assignments, filter, statusByTaskId],
  );

  // An agent that was never assigned has no activity to show; the page starts at its settings.
  if (props.assignments.length === 0) return null;
  return (
    <section aria-label={i18n.t("agents:agentActivity.ariaLabel")} className={sx(agentStyles.activity)}>
      <ActivitySummary summary={summary} />
      <section aria-label={i18n.t("agents:agentActivity.ariaLabel2")}>
        <div className={sx(styles.sectionHeader)}>
          <h3 className={sx(styles.sectionTitle)}>{i18n.t("agents:agentActivity.agentActivity")}</h3>
          <Select
            size="sm"
            aria-label={i18n.t("agents:agentActivity.ariaLabel3")}
            value={filter}
            options={AGENT_ACTIVITY_FILTERS.map((value) => ({ value, label: AGENT_ACTIVITY_FILTER_LABELS[value] }))}
            onValueChange={(value) => setFilter(String(value) as AgentActivityFilter)}
          />
        </div>
        {filtered.length === 0 ? (
          <p className={sx(styles.hint)}>{i18n.t("agents:agentActivity.agentActivity2")}</p>
        ) : (
          <ul className={sx(agentStyles.runs)}>
            {filtered.map((row) => {
              const live = row.taskId ? statusByTaskId[row.taskId] : undefined;
              // The run this agent is doing on the task, when Fleet has it.
              const run = row.taskId ? runByTaskId[row.taskId] : undefined;
              const ownRun = run && run.agentRun.workflow.name === row.agentName ? run : undefined;
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
                      title={i18n.t("agents:agentActivity.title", { value1: row.assignment })}
                      onClick={() => openAssignmentTask(row)}
                    >
                      {row.assignment.split("\n")[0]}
                    </Button>
                  ) : (
                    <span className={sx(agentStyles.runTitle)} title={row.assignment}>
                      {row.assignment.split("\n")[0]}
                    </span>
                  )}
                  <AssignmentProgress run={ownRun} stateLabel={stateLabel} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

/** Each row subscribes only to its task's live plan. */
function AssignmentProgress(props: { run: AgentRunDetail | undefined; stateLabel: string }) {
  useTranslation();
  const plan = useAgentRunProgress(props.run);
  const progress = props.run ? describeAgentRunProgress(props.run, plan) : null;
  return <span className={sx(agentStyles.runState)}>{progress ? `${progress} · ` : ""}{props.stateLabel}</span>;
}

const FLEET_STATUS_LABELS: Readonly<Record<FleetTaskStatus, string>> = {
  get "waiting-input"() { return i18n.t("agents:agentActivity.waitingInput"); },
  get "waiting-approval"() { return i18n.t("agents:agentActivity.waitingApproval"); },
  get error() { return i18n.t("agents:agentActivity.error"); },
  get running() { return i18n.t("agents:agentActivity.running"); },
  get idle() { return i18n.t("agents:agentActivity.idle"); },
};
