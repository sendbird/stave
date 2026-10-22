import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo } from "react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StateMark } from "@/components/ads/components/StateMark";
import { RightRailPanelHeader } from "@/components/layout/RightRailPanelShell";
import { formatWorkQueueWorkspaceLabel } from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { FlowPanel } from "@/components/agents/FlowPanel";
import { AgentRunPanel } from "@/components/agent-runs/AgentRunPanel";
import { WakeUpSection } from "@/components/agent-runs/WakeUpSection";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState } from "@/lib/agent-runs/domain";
import { describeAgentRunStatus } from "@/lib/agent-runs/agent-run-status";
import { useAgentRunDecision } from "@/components/agent-runs/useAgentRun";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import {
  isTaskPanelTab,
  RIGHT_RAIL_PANEL_TITLES,
  TASK_PANEL_TABS,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import { untitledTaskTitle } from "@/lib/task-context/attached-task-context";
import { isTaskManaged } from "@/lib/tasks";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import { useAppStore } from "@/store/app.store";
import type { AppState } from "@/store/app-store.types";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { TaskResultReviews } from "./TaskResultReviews";
import { TaskHandoffPanel } from "./TaskHandoffPanel";
import { SubagentsSection } from "./SubagentsSection";
import { TaskPanelEmpty } from "./TaskPanelEmpty";
import { TurnActivityPanel } from "./TurnActivityPanel";
import {
  resolveActivityTabMark,
  resolveProgressTabMark,
  resolveResultsTabMark,
  resolveSubagentsTabMark,
  type TaskTabMark,
} from "./task-panel-marks";

/**
 * The right rail's Task panel: what the active task is doing, what it needs
 * from the user and what it produced, as four tabs. The selected tab is layout
 * state, so every opener names the tab it wants and a reopened rail returns to
 * the tab it left. The tabs sit in the rail's one panel bar (the shell is told
 * `ownHeader`), so the panel spends 46px on chrome instead of a title bar plus
 * a tab bar. A one-line caption under the bar names the task the tabs
 * describe and its workspace, so switching tasks, or to an editor tab, never
 * leaves the panel ambiguous.
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
  const tab = useAppStore((state) => state.layout.taskPanelTab);
  const setLayout = useAppStore((state) => state.setLayout);
  const agentRun = useTaskAgentRun(workspaceId, taskId);
  const handleTabChange = useCallback(
    (next: TaskPanelTab) => setLayout({ patch: { taskPanelTab: next } }),
    [setLayout],
  );
  if (!workspaceId || !taskId || !task) {
    return <TaskPanelEmpty hasWorkspace={Boolean(workspaceId)} />;
  }
  return (
    <TaskPanelView
      workspaceId={workspaceId}
      taskId={taskId}
      repositoryPath={repositoryPath}
      managed={isTaskManaged(task)}
      taskTitle={untitledTaskTitle(task.title)}
      workspaceLabel={workspaceLabel}
      agentRun={agentRun}
      tab={tab}
      onTabChange={handleTabChange}
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
 * The panel itself, free of the store so a test can render each tab. Only the
 * selected tab's view is mounted; each record view loads while it is on screen
 * and remounts when the task changes.
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
  tab: TaskPanelTab;
  onTabChange: (tab: TaskPanelTab) => void;
}) {
  useTranslation();
  const { workspaceId, taskId, repositoryPath } = props;
  const scopeKey = `${workspaceId}:${taskId}`;
  return (
    <Tabs
      variant="line"
      size="xs"
      value={props.tab}
      onValueChange={(value) => {
        if (isTaskPanelTab(value)) props.onTabChange(value);
      }}
      xstyle={styles.tabs}
    >
      <RightRailPanelHeader>
        <h2 className={sx(styles.srOnly)}>{RIGHT_RAIL_PANEL_TITLES.task}</h2>
        <TabsList aria-label={i18n.t("session:taskPanel.ariaLabel")} xstyle={styles.tabList}>
          {TASK_PANEL_TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} xstyle={styles.tab}>
              {item.label}
              <span className={sx(styles.markSlot)}>
                <TaskTabMark
                  tab={item.id}
                  workspaceId={workspaceId}
                  taskId={taskId}
                  agentRun={props.agentRun}
                />
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </RightRailPanelHeader>
      <div className={sx(styles.body)}>
        {/*
          Under the bar rather than above it: the bar lines up with the sidebar
          and editor bars beside it, and every tab still opens on this line.
        */}
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
        <TabsContent value="activity" xstyle={[styles.panel, styles.panelFill]}>
          <TurnActivityPanel />
        </TabsContent>
        <TabsContent value="progress" xstyle={[styles.panel, styles.panelScroll]}>
          <div key={scopeKey} className={sx(styles.progress)}>
            {props.agentRun ? (
              <AgentRunPanel taskId={taskId} detail={props.agentRun} />
            ) : (
              <FlowPanel
                workspaceId={workspaceId}
                taskId={taskId}
                repositoryPath={repositoryPath}
              />
            )}
            <WakeUpSection workspaceId={workspaceId} taskId={taskId} />
          </div>
        </TabsContent>
        <TabsContent value="team" xstyle={[styles.panel, styles.panelScroll]}>
          {repositoryPath ? (
            <SubagentsSection
              key={scopeKey}
              workspaceId={workspaceId}
              taskId={taskId}
              repositoryPath={repositoryPath}
              readOnly={props.managed}
            />
          ) : (
            <p className={sx(styles.notice)}>
              {i18n.t("session:taskPanel.taskPanelView")}</p>
          )}
        </TabsContent>
        <TabsContent value="results" xstyle={[styles.panel, styles.panelScroll]}>
          <TaskResultReviews key={scopeKey} workspaceId={workspaceId} taskId={taskId} />
        </TabsContent>
        <TabsContent value="handoff" xstyle={[styles.panel, styles.panelScroll]}>
          <TaskHandoffPanel key={scopeKey} workspaceId={workspaceId} taskId={taskId} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

/*
 * Tab marks read data the app already holds for other surfaces — the turn's
 * pending interaction, the agent run's state, the work graph's running agents
 * and the task's unreviewed runs — one narrow subscription per tab, so a
 * change in one tab's mark re-renders that mark alone.
 */
function TaskTabMark(props: {
  tab: TaskPanelTab;
  workspaceId: string;
  taskId: string;
  agentRun: AgentRunDetail | undefined;
}) {
  useTranslation();
  switch (props.tab) {
    case "activity":
      return <ActivityMark taskId={props.taskId} />;
    case "progress":
      return <ProgressMark agentRun={props.agentRun} />;
    case "team":
      return <SubagentsMark taskId={props.taskId} />;
    case "results":
      return <ResultsMark workspaceId={props.workspaceId} taskId={props.taskId} />;
    case "handoff":
      return null;
  }
}

function ActivityMark(props: { taskId: string }) {
  useTranslation();
  const running = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[props.taskId]),
  );
  const pending = useAppStore(
    (state) =>
      state.providerTurnActivityByTask[props.taskId]?.pendingInteraction ?? null,
  );
  return <Mark mark={resolveActivityTabMark({ running, pendingInteraction: pending })} />;
}

function ProgressMark(props: { agentRun: AgentRunDetail | undefined }) {
  useTranslation();
  const { agentRun } = props;
  const active = Boolean(agentRun && isActiveAgentRunState(agentRun.agentRun.state));
  const decision = useAgentRunDecision(active ? agentRun?.agentRun.leadTaskId : null);
  if (!agentRun || !active) return null;
  return <Mark mark={resolveProgressTabMark(describeAgentRunStatus(agentRun, decision))} />;
}

function SubagentsMark(props: { taskId: string }) {
  useTranslation();
  const graph = useAppStore(
    (state) =>
      state.providerTurnActivityByTask[props.taskId]?.workGraph ??
      state.retainedTurnActivityByTask[props.taskId]?.snapshot.workGraph ??
      null,
  );
  const running = useMemo(
    () => (graph ? summarizeWorkGraph(graph).runningCount : 0),
    [graph],
  );
  return <Mark mark={resolveSubagentsTabMark(running)} />;
}

function ResultsMark(props: { workspaceId: string; taskId: string }) {
  useTranslation();
  const { page } = useResultReviews({
    workspaceId: props.workspaceId,
    taskId: props.taskId,
    pendingOnly: true,
    includeEvidence: false,
    limit: 1,
  });
  return <Mark mark={resolveResultsTabMark(page.total)} />;
}

/**
 * A state is its shared glyph, a quantity is a count. Both sit inline right
 * after the label, vertically centered on it.
 */
function Mark(props: { mark: TaskTabMark | null }) {
  useTranslation();
  const { mark } = props;
  if (!mark) return null;
  if (mark.kind === "state") {
    return (
      <span title={mark.label} className={sx(styles.markGlyph)}>
        <StateMark state={mark.state} size="xs" label={mark.label} />
      </span>
    );
  }
  return (
    <span role="img" title={mark.label} aria-label={mark.label} className={sx(styles.count)}>
      {mark.text}
    </span>
  );
}

const styles = stylex.create({
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  // The root has exactly two children, the bar and the body that fills the
  // rest (the rows the Tabs shim states too). The body stacks the caption
  // over the selected tab's view, the only one mounted.
  tabs: {
    gap: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
  },
  body: { display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 },
  // One line, starting on the tab labels' edge. The workspace gives way
  // first when the rail is narrow; the title keeps the room it can.
  caption: {
    alignItems: "baseline",
    display: "flex",
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    gap: vars["--ads-space-4"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
    minWidth: 0,
    paddingBlockStart: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    whiteSpace: "nowrap",
  },
  captionTitle: {
    color: vars["--ads-color-text"],
    fontWeight: vars["--ads-font-weight-medium"],
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  captionSeparator: { color: vars["--ads-color-text-muted"], flexShrink: 0 },
  captionWorkspace: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 4,
    minWidth: "6ch",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  srOnly: {
    blockSize: 1,
    borderWidth: 0,
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    insetBlockStart: 0,
    insetInlineStart: 0,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  // The list fills the bar's height and runs one hairline past it, so the
  // active underline covers the bar's own rule. A rail narrower than the four
  // labels scrolls the strip sideways instead of clipping Results.
  tabList: {
    borderRadius: 0,
    boxShadow: "none",
    gap: vars["--ads-space-16"],
    marginBlockEnd: `calc(-1 * ${vars["--ads-border-width-hairline"]})`,
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    padding: 0,
    scrollbarWidth: "none",
  },
  tab: { flex: "none", gap: vars["--ads-space-4"], paddingInline: 0 },
  // A mark is a flex item of the tab, right after the label and centered on
  // it. A tab without a mark drops the slot, so the tab's gap adds no
  // trailing space and the active underline stays the label's width.
  markSlot: {
    alignItems: "center",
    display: { default: "inline-flex", ":empty": "none" },
    flexShrink: 0,
    pointerEvents: "none",
  },
  markGlyph: { display: "inline-flex" },
  panel: { flex: "1 1 0", minHeight: 0, minWidth: 0 },
  // Activity hosts the live list with its own scroll and floor; the record
  // views scroll as one column. Their text starts on the tab labels' edge.
  panelFill: { display: "flex", flexDirection: "column", overflow: "hidden" },
  panelScroll: {
    overflowY: "auto",
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-12"],
  },
  progress: { display: "flex", flexDirection: "column", gap: vars["--ads-space-20"] },
  // A count is a figure, not a pill: in the accent ink, at the micro step,
  // with tabular digits, so it reads as the tab's number and fits the gap.
  count: {
    color: vars["--ads-color-accent"],
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
    lineHeight: 1,
  },
});
