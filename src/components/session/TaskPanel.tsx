import { TaskTurnPlan } from "./TaskTurnPlan";
import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { vars } from "../aui/tokens/tokens.stylex";
import { sx } from "../aui/utils/stylex";
import { focusRing } from "../aui/recipes/focus-ring";
import { RightRailPanelHeader, RightRailPanelTitle } from "@/components/layout/RightRailPanelShell";
import { formatWorkQueueWorkspaceLabel } from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { FlowPanel } from "@/components/agents/FlowPanel";
import { AgentRunPanel } from "@/components/agent-runs/AgentRunPanel";
import { WakeUpSection } from "@/components/agent-runs/WakeUpSection";
import { useNow } from "@/components/agent-runs/useAgentRun";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { untitledTaskTitle } from "@/lib/task-context/attached-task-context";
import { isTaskManaged } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { TaskResultReviews } from "./TaskResultReviews";
import { SubagentsSection } from "./SubagentsSection";
import { TaskPanelEmpty } from "./TaskPanelEmpty";
import { TaskPanelSummary } from "./TaskPanelSummary";
import { TurnActivityHistory, useTaskTurnHistory } from "./TurnActivityHistory";
import {
  buildTaskPanelStatus,
  parseTaskPendingRequests,
  taskPendingRequestsKey,
} from "./task-panel-state";
import type { ProviderTurnActivitySnapshot, RetainedTurnActivity } from "@/lib/providers/turn-status";
import type { ChatMessage } from "@/types/chat";

const NO_MESSAGES: ChatMessage[] = [];

type TaskPanelSettled = readonly [ChatMessage[], ProviderTurnActivitySnapshot | null, RetainedTurnActivity | null];
const NO_SETTLED: TaskPanelSettled = [NO_MESSAGES, null, null];

/**
 * What only a settled turn needs: the messages (its answer, files and ending)
 * and its activity snapshots. While a turn runs and the panel follows it, it
 * reads none of them, so a streaming turn's text deltas never re-render it;
 * the open requests and the live turn's prompt come from their own selectors.
 */
export function selectTaskPanelSettled(taskId: string, followsSettledTurn: boolean) {
  return (state: Pick<AppState, "messagesByTask" | "activeTurnIdsByTask" | "providerTurnActivityByTask" | "retainedTurnActivityByTask">): TaskPanelSettled =>
    followsSettledTurn || !state.activeTurnIdsByTask[taskId]
      ? [
          state.messagesByTask[taskId] ?? NO_MESSAGES,
          state.providerTurnActivityByTask[taskId] ?? null,
          state.retainedTurnActivityByTask[taskId] ?? null,
        ]
      : NO_SETTLED;
}

/**
 * The right rail's Task panel, one screen read top to bottom: where the task
 * stands (one line, from the one status function), what the user must do when
 * something waits on them, the result or why it stopped, the conditions still
 * open, then Details, collapsed, with the activity, steps, subagents and
 * outputs. A caption under the bar names the task and its workspace, so
 * switching tasks never leaves the panel ambiguous.
 */
export function TaskPanel() {
  useTranslation();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useAppStore((state) => state.activeTaskId);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const task = useAppStore((state) =>
    state.tasks.find((item) => item.id === state.activeTaskId),
  );
  const workspaceLabel = useAppStore(selectTaskPanelWorkspaceLabel);
  const agentRun = useTaskAgentRun(workspaceId, taskId);
  if (!workspaceId || !taskId || !task) {
    return <TaskPanelEmpty hasWorkspace={Boolean(workspaceId)} />;
  }
  return (
    <TaskPanelView
      key={`${workspaceId}:${taskId}`}
      workspaceId={workspaceId}
      taskId={taskId}
      repositoryPath={repositoryPath}
      managed={isTaskManaged(task)}
      taskTitle={untitledTaskTitle(task.title)}
      workspaceLabel={workspaceLabel}
      agentRun={agentRun}
    />
  );
}

/**
 * The caption's workspace: one identifier, as the work queue names it — the
 * name the user gave the workspace, else its branch.
 */
export function selectTaskPanelWorkspaceLabel(
  state: Pick<AppState, "activeWorkspaceId" | "workspaces" | "workspaceBranchById" | "workspaceDefaultById">,
) {
  const id = state.activeWorkspaceId;
  return formatWorkQueueWorkspaceLabel({
    name: state.workspaces.find((workspace) => workspace.id === id)?.name ?? "",
    branch: state.workspaceBranchById[id],
    isDefault: Boolean(state.workspaceDefaultById[id]),
  });
}

/**
 * The panel for one task. It owns the turn the panel follows: picking an
 * earlier turn in Details moves the title and the state to that turn. Details
 * start collapsed, except on a task whose last work failed, which opens on
 * that failure.
 */
export function TaskPanelView(props: {
  workspaceId: string;
  taskId: string;
  repositoryPath: string | null;
  /** A managed task's subagents are read-only until the user takes over. */
  managed: boolean;
  /** The caption: the task's title and its workspace's one-word name. */
  taskTitle: string;
  workspaceLabel: string;
  agentRun: AgentRunDetail | undefined;
}) {
  useTranslation();
  const { workspaceId, taskId, repositoryPath, agentRun } = props;
  const history = useTaskTurnHistory(workspaceId, taskId);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null);
  const liveTurnId = useAppStore((state) => state.activeTurnIdsByTask[taskId] ?? null);
  const prInfo = useAppStore((state) => state.workspacePrInfoById[workspaceId]);
  // Strings and a primitive: equal across text deltas, so they re-render nothing.
  const pendingKey = useAppStore((state) =>
    taskPendingRequestsKey(state.messagesByTask[taskId] ?? NO_MESSAGES, state.activeTurnIdsByTask[taskId] ?? null),
  );
  const livePending = useAppStore((state) => {
    const live = state.activeTurnIdsByTask[taskId];
    const snapshot = state.providerTurnActivityByTask[taskId];
    return live && snapshot?.turnId === live ? (snapshot.pendingInteraction ?? null) : null;
  });
  const [messages, activity, retained] = useAppStore(
    useShallow(selectTaskPanelSettled(taskId, selectedTurnId !== null)),
  );
  const pending = useMemo(() => parseTaskPendingRequests(pendingKey), [pendingKey]);
  const now = useNow(Boolean(agentRun && isActiveAgentRunState(agentRun.agentRun.state)));
  const turns = history.state.status === "ready" ? history.state.data.turns : null;
  const view = useMemo(
    () => buildTaskPanelStatus({
      messages,
      liveTurnId,
      activity,
      retained,
      history: turns,
      agentRun,
      prInfo,
      selectedTurnId,
      now,
      pending,
      livePending,
    }),
    // The state's reasons and labels are translated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, liveTurnId, activity, retained, turns, agentRun, prInfo, selectedTurnId, now, pending, livePending, i18n.language],
  );
  const open = detailsOpen ?? view.focusDetails;
  return (
    <div className={sx(styles.root)}>
      <RightRailPanelHeader>
        <RightRailPanelTitle panelId="task" />
      </RightRailPanelHeader>
      <div className={sx(styles.body)}>
        <p
          className={sx(styles.caption)}
          title={[props.taskTitle, props.workspaceLabel].filter(Boolean).join(" · ")}
        >
          <span className={sx(styles.captionTitle)}>{props.taskTitle}</span>
          {props.workspaceLabel ? (
            <>
              {" "}
              <span aria-hidden="true" className={sx(styles.captionSeparator)}>·</span>
              {" "}
              <span className={sx(styles.captionWorkspace)}>{props.workspaceLabel}</span>
            </>
          ) : null}
        </p>
        <TaskPanelSummary
          workspaceId={workspaceId}
          taskId={taskId}
          view={view}
          agentRun={agentRun}
          onShowLatest={() => setSelectedTurnId(null)}
        />
        <details
          className={sx(styles.details)}
          data-testid="task-details"
          open={open}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary className={sx(styles.detailsSummary, focusRing.ring)}>
            <ChevronRight aria-hidden className={sx(styles.chevron, open && styles.chevronOpen)} />
            {i18n.t("session:taskPanel.details")}
          </summary>
          {/* Mounted only while open: each part reads its own records. */}
          {open ? (
            <div className={sx(styles.detailsBody)}>
              <DetailsPart label={i18n.t("session:taskPanel.activity")}>
                <TurnActivityHistory
                  workspaceId={workspaceId}
                  taskId={taskId}
                  history={history}
                  selected={selectedTurnId}
                  onSelect={setSelectedTurnId}
                />
              </DetailsPart>
              <DetailsPart label={i18n.t("session:taskPanel.steps")} padded>
                {agentRun ? (
                  <AgentRunPanel taskId={taskId} detail={agentRun} />
                ) : (
                  <>
                    <TaskTurnPlan taskId={taskId} />
                    <FlowPanel workspaceId={workspaceId} taskId={taskId} repositoryPath={repositoryPath} />
                  </>
                )}
                <WakeUpSection workspaceId={workspaceId} taskId={taskId} />
              </DetailsPart>
              <DetailsPart label={i18n.t("session:taskPanel.subagents")} padded>
                {repositoryPath ? (
                  <SubagentsSection
                    workspaceId={workspaceId}
                    taskId={taskId}
                    repositoryPath={repositoryPath}
                    readOnly={props.managed}
                  />
                ) : (
                  <p className={sx(styles.notice)}>{i18n.t("session:taskPanel.taskPanelView")}</p>
                )}
              </DetailsPart>
              <DetailsPart label={i18n.t("session:taskPanel.outputs")} padded>
                <TaskResultReviews workspaceId={workspaceId} taskId={taskId} />
              </DetailsPart>
            </div>
          ) : null}
        </details>
      </div>
    </div>
  );
}

function DetailsPart(props: { label: string; padded?: boolean; children: ReactNode }) {
  return (
    <section aria-label={props.label} className={sx(styles.part)}>
      <h3 className={sx(styles.partLabel)}>{props.label}</h3>
      <div className={sx(styles.partBody, props.padded && styles.partBodyPadded)}>{props.children}</div>
    </section>
  );
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  // One scrolling column: the summary on top, then Details.
  body: {
    display: "flex",
    flex: "1 1 0",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
  },
  // One line, starting on the panel title's edge. The workspace gives way
  // first when the rail is narrow; the title keeps the room it can.
  caption: {
    alignItems: "baseline",
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--aui-font-size-caption"],
    gap: vars["--aui-space-4"],
    lineHeight: vars["--aui-line-height-tight"],
    margin: 0,
    minWidth: 0,
    paddingBlockStart: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
    whiteSpace: "nowrap",
  },
  captionTitle: {
    color: vars["--aui-color-text"],
    fontWeight: vars["--aui-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  captionSeparator: { color: vars["--aui-color-text-muted"], flexShrink: 0 },
  captionWorkspace: {
    color: vars["--aui-color-text-muted"],
    flexShrink: 4,
    minWidth: "6ch",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  notice: {
    margin: 0,
    fontSize: vars["--aui-font-size-caption"],
    lineHeight: vars["--aui-line-height-normal"],
    color: vars["--aui-color-text-muted"],
  },
  details: {
    borderTopColor: vars["--aui-color-border-subtle"],
    borderTopStyle: "solid",
    borderTopWidth: vars["--aui-border-width-hairline"],
    flexShrink: 0,
  },
  detailsSummary: {
    alignItems: "center",
    color: vars["--aui-color-text-muted"],
    cursor: "pointer",
    display: "flex",
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-medium"],
    gap: vars["--aui-space-4"],
    listStyle: "none",
    paddingBlock: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
  chevron: {
    blockSize: vars["--aui-space-12"],
    flexShrink: 0,
    inlineSize: vars["--aui-space-12"],
    transitionDuration: vars["--aui-motion-duration-fast"],
    transitionProperty: "transform",
  },
  chevronOpen: { transform: "rotate(90deg)" },
  detailsBody: { display: "flex", flexDirection: "column", gap: vars["--aui-space-16"], paddingBlockEnd: vars["--aui-space-16"] },
  part: { display: "flex", flexDirection: "column", minWidth: 0 },
  partLabel: {
    color: vars["--aui-color-text"],
    fontSize: vars["--aui-font-size-caption"],
    fontWeight: vars["--aui-font-weight-semibold"],
    margin: 0,
    paddingInline: vars["--aui-space-12"],
  },
  partBody: { display: "flex", flexDirection: "column", minWidth: 0 },
  partBodyPadded: {
    gap: vars["--aui-space-20"],
    paddingBlockStart: vars["--aui-space-8"],
    paddingInline: vars["--aui-space-12"],
  },
});
