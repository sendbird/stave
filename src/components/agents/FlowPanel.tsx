import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { useDelegatedTasks } from "@/components/session/useDelegatedTasks";
import { buildFlow, deriveFlowBase, FLOW_STATE_LABELS, type FlowNode } from "@/lib/agents/flow-view";
import { buildTaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { describeAssignmentReceived } from "@/lib/agents/agents-view";
import { listAgents } from "@/lib/agents/library";
import { useAgentAssignmentsStore, useAgentAssignmentsSync, type TaskAgent } from "@/store/agent-assignments-store";
import { useAppStore } from "@/store/app.store";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import type { ChatMessage } from "@/types/chat";

const EMPTY_MESSAGES: readonly ChatMessage[] = [];

const EVIDENCE_LABEL = (evidence: NonNullable<FlowNode["evidence"]>) =>
  [
    evidence.verified ? `${evidence.verified} verified by Stave` : null,
    evidence.reported ? `${evidence.reported} agent reported` : null,
  ]
    .filter(Boolean)
    .join(" · ");

function FlowNodeRow(props: { node: FlowNode; last: boolean; depth: number }) {
  const { node } = props;
  const [open, setOpen] = useState(false);
  const focusTaskAttention = useAppStore((state) => state.focusTaskAttention);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const hasTimeline = node.events.length > 0;
  return (
    <li className={sx(styles.item)}>
      <div className={sx(styles.rail)} aria-hidden>
        <span className={sx(styles.dot, dotStyles[node.state])} />
        {!props.last || node.children.length > 0 ? <span className={sx(styles.line)} /> : null}
      </div>
      <div className={sx(styles.body)}>
        <div className={sx(styles.head)}>
          {node.agent ? <AgentAvatar agent={node.agent} size="xs" aria-label={null} /> : null}
          <span className={sx(styles.title)} title={node.title}>
            {node.title}
          </span>
          <span className={sx(styles.state, stateStyles[node.state])}>{FLOW_STATE_LABELS[node.state]}</span>
        </div>
        {node.detail ? <p className={sx(styles.detail)}>{node.detail}</p> : null}
        {node.evidence && (node.evidence.verified || node.evidence.reported) ? (
          <p className={sx(styles.detail)}>{EVIDENCE_LABEL(node.evidence)}</p>
        ) : null}
        <div className={sx(styles.actions)}>
          {hasTimeline ? (
            <Button size="xs" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
              <ChevronRight aria-hidden className={sx(styles.chevron, open && styles.chevronOpen)} />
              Timeline
            </Button>
          ) : null}
          {node.target ? (
            <Button
              size="xs"
              variant="quiet"
              onClick={() =>
                void focusTaskAttention({
                  taskId: node.target!.taskId,
                  workspaceId: node.target!.workspaceId,
                  repositoryPath: repositoryPath ?? undefined,
                  refreshFromPersistence: true,
                })
              }
            >
              Open task
            </Button>
          ) : null}
        </div>
        {open ? (
          <ol className={sx(styles.timeline)}>
            {node.events.map((event, index) => (
              <li key={`${event.at}:${index}`} className={sx(styles.event)}>
                {event.at ? (
                  <time dateTime={event.at} className={sx(styles.eventTime)}>
                    {new Date(event.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </time>
                ) : null}
                {event.label}
              </li>
            ))}
          </ol>
        ) : null}
        {node.children.length > 0 ? (
          <ol className={sx(styles.list, styles.nested)} aria-label={`Delegated from ${node.title}`}>
            {node.children.map((child, index) => (
              <FlowNodeRow key={child.id} node={child} last={index === node.children.length - 1} depth={props.depth + 1} />
            ))}
          </ol>
        ) : null}
      </div>
    </li>
  );
}

/**
 * "What it received" for the task's assignment, and whether the agent changed
 * since. The current agent is looked up among custom and built-in agents; a
 * repository agent's file is not read here, so its edits are not flagged.
 */
function AssignmentReceived(props: { assignment: TaskAgent }) {
  const custom = useAppStore((state) => state.settings.customAgents);
  const [open, setOpen] = useState(false);
  const view = useMemo(() => {
    const current = listAgents({ custom }).find((agent) => agent.id === props.assignment.agentConfigId) ?? null;
    return describeAssignmentReceived({ ...props.assignment, current });
  }, [custom, props.assignment]);
  return (
    <section aria-label="What it received" className={sx(styles.received)}>
      {view.changedSince ? <p className={sx(styles.detail, styles.changed)}>{view.changedSince}</p> : null}
      <Button size="xs" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight aria-hidden className={sx(styles.chevron, open && styles.chevronOpen)} />
        What it received · version {view.version}
      </Button>
      {open ? (
        <dl className={sx(styles.receivedList)}>
          {view.lines.map((line) => (
            <div key={line.label} className={sx(styles.receivedRow)}>
              <dt className={sx(styles.eventTime)}>{line.label}</dt>
              <dd className={sx(styles.receivedValue)}>{line.detail}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/**
 * The Flow panel: one task's assignment, stages and delegated tasks as a
 * vertical flow, each with its Timeline. Read-only; every state comes from the
 * record that owns it.
 */
export function FlowPanel(props: { workspaceId: string; taskId: string; repositoryPath: string | null }) {
  useAgentAssignmentsSync();
  const assignment = useAgentAssignmentsStore((state) => state.byTaskId[props.taskId]);
  const agentRun = useTaskAgentRun(props.workspaceId, props.taskId);
  const taskTitle = useAppStore((state) => state.tasks.find((task) => task.id === props.taskId)?.title ?? "Task");
  const taskProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === props.taskId)?.provider ?? state.draftProvider,
  );
  const taskRunning = useAppStore((state) => Boolean(state.activeTurnIdsByTask[props.taskId]));
  const activeTurnIds = useAppStore((state) => state.activeTurnIdsByTask);
  const runtimeCache = useAppStore((state) => state.workspaceRuntimeCacheById);
  // Stable subscriptions only: each selector returns a stored reference or a
  // primitive, never a fresh container. The base flow is derived below with
  // `useMemo`, outside every selector.
  const messages = useAppStore((state) => state.messagesByTask[props.taskId] ?? EMPTY_MESSAGES);
  const activity = useAppStore((state) => state.providerTurnActivityByTask[props.taskId] ?? null);
  const verification = useAppStore((state) => state.turnVerificationByWorkspace[props.workspaceId] ?? null);
  const rateLimits = useAppStore((state) => state.rateLimitsSnapshot);
  const prInfo = useAppStore((state) => state.workspacePrInfoById[props.workspaceId] ?? null);
  const delegates = useDelegatedTasks({
    parentTaskId: props.taskId,
    parentWorkspaceId: props.workspaceId,
    repositoryPath: props.repositoryPath,
    enabled: Boolean(props.repositoryPath),
  });
  const base = useMemo(() => {
    const summary = buildTaskExecutionSummary({
      taskId: props.taskId,
      providerId: taskProvider,
      messages: messages as ChatMessage[],
      activity,
      verification,
      rateLimits,
    });
    return deriveFlowBase({ messages, summary, prInfo, taskRunning });
  }, [activity, messages, prInfo, props.taskId, rateLimits, taskProvider, taskRunning, verification]);
  const nodes = useMemo(
    () =>
      buildFlow({
        taskTitle,
        assignment: assignment ? { id: assignment.assignmentId, ...assignment } : null,
        agentRun: agentRun ?? null,
        delegates: delegates.children,
        runningDelegateTaskIds: new Set(delegates.children.filter((child) => Boolean(
          activeTurnIds[child.delegatedTaskId] ?? runtimeCache[child.delegatedWorkspaceId]?.activeTurnIdsByTask[child.delegatedTaskId],
        )).map((child) => child.delegatedTaskId)),
        base,
      }),
    [taskTitle, assignment, agentRun, delegates.children, base, activeTurnIds, runtimeCache],
  );
  return (
    <section aria-label="Flow">
      {assignment ? <AssignmentReceived assignment={assignment} /> : null}
      <ol className={sx(styles.list)}>
        {nodes.map((node, index) => (
          <FlowNodeRow key={node.id} node={node} last={index === nodes.length - 1} depth={0} />
        ))}
      </ol>
      {delegates.error ? <p className={sx(styles.detail)}>{delegates.error}</p> : null}
    </section>
  );
}

const styles = stylex.create({
  received: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], marginBottom: vars["--ads-space-8"] },
  changed: { color: vars["--ads-color-warning-text"] },
  receivedList: { margin: 0, display: "flex", flexDirection: "column", gap: 2, paddingInlineStart: vars["--ads-space-16"] },
  receivedRow: { display: "flex", gap: vars["--ads-space-8"], fontSize: vars["--ads-font-size-caption"] },
  receivedValue: { margin: 0, minWidth: 0, overflowWrap: "anywhere" },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" },
  nested: { marginTop: vars["--ads-space-8"] },
  item: { display: "flex", gap: vars["--ads-space-8"], minWidth: 0 },
  rail: { display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 12px", paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: vars["--ads-radius-full"], flex: "0 0 auto" },
  line: {
    flex: "1 1 auto",
    width: vars["--ads-border-width-hairline"],
    marginBlock: 2,
    backgroundColor: vars["--ads-color-border-subtle"],
  },
  body: { flex: "1 1 auto", minWidth: 0, paddingBottom: vars["--ads-space-12"] },
  head: { display: "flex", alignItems: "baseline", gap: vars["--ads-space-8"], minWidth: 0 },
  title: {
    flex: "1 1 auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  state: { flex: "0 0 auto", fontSize: vars["--ads-font-size-caption"] },
  detail: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
    overflowWrap: "anywhere",
  },
  actions: { display: "flex", gap: vars["--ads-space-4"], marginTop: 2 },
  chevron: { width: 12, height: 12 },
  chevronOpen: { transform: "rotate(90deg)" },
  timeline: {
    margin: 0,
    marginTop: vars["--ads-space-4"],
    paddingInlineStart: vars["--ads-space-12"],
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  event: { display: "flex", gap: vars["--ads-space-8"] },
  eventTime: { flex: "0 0 auto", color: vars["--ads-color-text-subtle"], fontVariantNumeric: "tabular-nums" },
});

const dotStyles = stylex.create({
  waiting: { backgroundColor: vars["--ads-color-border-subtle"] },
  running: { backgroundColor: vars["--ads-color-accent"] },
  "action-required": { backgroundColor: vars["--ads-color-warning"] },
  done: { backgroundColor: vars["--ads-color-success"] },
  failed: { backgroundColor: vars["--ads-color-danger"] },
  skipped: { backgroundColor: vars["--ads-color-text-subtle"] },
  cancelled: { backgroundColor: vars["--ads-color-text-subtle"] },
});

const stateStyles = stylex.create({
  waiting: { color: vars["--ads-color-text-subtle"] },
  running: { color: vars["--ads-color-text"] },
  "action-required": { color: vars["--ads-color-warning-text"] },
  done: { color: vars["--ads-color-text-muted"] },
  failed: { color: vars["--ads-color-danger-text"] },
  skipped: { color: vars["--ads-color-text-subtle"] },
  cancelled: { color: vars["--ads-color-text-subtle"] },
});
