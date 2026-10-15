import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { useCallback, useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ads/components/Badge";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
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
import { agentRunDecisionOf, describeAgentRunProgress, describeAgentRunStatus, formatAgentRunBadge } from "@/lib/agent-runs/agent-run-status";
import { useAgentRunProgress } from "../agent-runs/useAgentRunProgress";
import { workflowStyles as styles } from "../workflows/workflows.styles";
import { agentStyles } from "./agents.styles";

/**
 * Live Fleet status for a set of tasks, without an unstable selector: the
 * selector returns a JSON string, so a streamed token that changes no task's
 * status leaves it equal, and the parsed map is memoized here. Mirrors the
 * sidebar's `useAgentsWithWork` pattern. A task in another workspace is read
 * from that workspace's runtime cache, as its Fleet card reads it.
 */
function useStatusByTaskId(
  tasks: ReadonlyArray<{ taskId: string; workspaceId: string | null }>,
): Record<string, FleetTaskStatus> {
  const key = JSON.stringify(tasks.map((entry) => [entry.taskId, entry.workspaceId]));
  const entries = useMemo(() => JSON.parse(key) as Array<[string, string | null]>, [key]);
  const serialized = useAppStore(
    useCallback(
      (state: AppState) => {
        const byId: Record<string, FleetTaskStatus> = {};
        for (const [id, workspaceId] of entries) {
          const session = workspaceId && workspaceId !== state.activeWorkspaceId
            ? state.workspaceRuntimeCacheById[workspaceId]
            : state;
          if (!session) continue;
          const task = session.tasks.find((candidate) => candidate.id === id);
          if (!task) continue;
          byId[id] = classifyTaskStatus({
            task,
            messages: session.messagesByTask[id] ?? [],
            activeTurnId: session.activeTurnIdsByTask[id] ?? null,
            activity: state.providerTurnActivityByTask[id] ?? null,
          });
        }
        return JSON.stringify(byId);
      },
      [entries],
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
    i18n.t("agents:agentActivity.assignments", { count: summary.total }),
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
  const tasks = useMemo(
    () => props.assignments.flatMap((row) => (row.taskId ? [{ taskId: row.taskId, workspaceId: row.workspaceId }] : [])),
    [props.assignments],
  );
  const statusByTaskId = useStatusByTaskId(tasks);
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
        <div className={sx(agentStyles.workHeader)}>
          <h3 className={sx(styles.sectionTitle)}>
            {i18n.t("agents:agentActivity.agentActivity")}{" "}
            <span className={sx(agentStyles.workCount)}>{filtered.length}</span>
          </h3>
          <Select
            size="sm"
            xstyle={agentStyles.workFilter}
            aria-label={i18n.t("agents:agentActivity.ariaLabel3")}
            value={filter}
            options={AGENT_ACTIVITY_FILTERS.map((value) => ({ value, label: AGENT_ACTIVITY_FILTER_LABELS[value] }))}
            onValueChange={(value) => setFilter(String(value) as AgentActivityFilter)}
          />
        </div>
        {filtered.length === 0 ? (
          <p className={sx(styles.hint)}>{i18n.t("agents:agentActivity.agentActivity2")}</p>
        ) : (
          <ul className={sx(agentStyles.workList)}>
            {filtered.map((row) => {
              const live = row.taskId ? statusByTaskId[row.taskId] : undefined;
              // The run this agent is doing on the task, when Fleet has it.
              const run = row.taskId ? runByTaskId[row.taskId] : undefined;
              const ownRun = run && run.agentRun.workflow.name === row.agentName ? run : undefined;
              // `live` waits on the user exactly when the task's messages hold an
              // unanswered card (`findTaskPendingDecision`), as on every run surface.
              const runStatus = ownRun ? describeAgentRunStatus(ownRun, agentRunDecisionOf(live)) : null;
              const state = runStatus
                ? { label: formatAgentRunBadge(runStatus), tone: runStatus.tone }
                : live
                  ? { label: FLEET_STATUS_LABELS[live], tone: FLEET_STATUS_TONES[live] }
                  : { label: ASSIGNMENT_STATE_LABELS[row.state], tone: ASSIGNMENT_STATE_TONES[row.state] };
              const body = <WorkRowBody row={row} run={ownRun} state={state} />;
              return (
                <li key={row.id} className={sx(agentStyles.workItem)}>
                  {row.taskId ? (
                    <Button
                      layout="host"
                      variant="quiet"
                      press="none"
                      xstyle={[agentStyles.workRow, transition.colors, focusRing.ringInset]}
                      title={i18n.t("agents:agentActivity.title", { value1: row.assignment })}
                      onClick={() => openAssignmentTask(row)}
                    >
                      {body}
                    </Button>
                  ) : (
                    <div className={sx(agentStyles.workRow)} title={row.assignment}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

/**
 * One assignment: its first line and its state as a badge, then where the
 * run stands (plan or stage) and when it started. Each row subscribes only
 * to its task's live plan.
 */
function WorkRowBody(props: { row: AgentAssignment; run: AgentRunDetail | undefined; state: { label: string; tone: BadgeTone } }) {
  useTranslation();
  const plan = useAgentRunProgress(props.run);
  const progress = props.run ? describeAgentRunProgress(props.run, plan) : null;
  const started = new Date(props.row.createdAt);
  const startedValid = !Number.isNaN(started.getTime());
  return (
    <>
      <span className={sx(agentStyles.workLine)}>
        <span className={sx(agentStyles.workTitle)}>{props.row.assignment.split("\n")[0]}</span>
        <Badge size="sm" tone={props.state.tone} dot>{props.state.label}</Badge>
      </span>
      {progress || startedValid ? (
        // Where the run stands leads; without it the start time takes the line.
        <span className={sx(agentStyles.workLine)}>
          {progress ? <span className={sx(agentStyles.workMeta)}>{progress}</span> : null}
          {startedValid ? (
            <span className={sx(progress ? agentStyles.workWhen : agentStyles.workMeta)} title={formatDateTime(started)}>{formatRelativeTime(started)}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

const FLEET_STATUS_TONES: Readonly<Record<FleetTaskStatus, BadgeTone>> = {
  "waiting-input": "warning",
  "waiting-approval": "warning",
  error: "danger",
  running: "accent",
  idle: "neutral",
};

const ASSIGNMENT_STATE_TONES: Readonly<Record<AgentAssignment["state"], BadgeTone>> = {
  preparing: "accent",
  started: "neutral",
  failed: "danger",
  interrupted: "warning",
};

const FLEET_STATUS_LABELS: Readonly<Record<FleetTaskStatus, string>> = {
  get "waiting-input"() { return i18n.t("agents:agentActivity.waitingInput"); },
  get "waiting-approval"() { return i18n.t("agents:agentActivity.waitingApproval"); },
  get error() { return i18n.t("agents:agentActivity.error"); },
  get running() { return i18n.t("agents:agentActivity.running"); },
  get idle() { return i18n.t("agents:agentActivity.idle"); },
};
