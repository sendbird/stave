import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo } from "react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StateIcon } from "@/components/ads/components/StateIcon";
import { RightRailPanelHeader } from "@/components/layout/RightRailPanelShell";
import { FlowPanel } from "@/components/agents/FlowPanel";
import { MissionPanel } from "@/components/missions/MissionPanel";
import { WakeUpSection } from "@/components/missions/WakeUpSection";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import { isAgentRun } from "@/lib/missions/agent-run";
import { describeAgentRunStatus } from "@/lib/missions/agent-run-view";
import { describeMissionBadge } from "@/lib/missions/mission-view";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import {
  isTaskPanelTab,
  RIGHT_RAIL_PANEL_TITLES,
  TASK_PANEL_TABS,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import { isTaskManaged } from "@/lib/tasks";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import { useAppStore } from "@/store/app.store";
import { useTaskMission } from "@/store/missions-store";
import { TaskResultReviews } from "./TaskResultReviews";
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
 * a tab bar.
 */
export function TaskPanel() {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useAppStore((state) => state.activeTaskId);
  const repositoryPath = useAppStore((state) => state.repositoryPath);
  const task = useAppStore((state) =>
    state.tasks.find((item) => item.id === state.activeTaskId),
  );
  const tab = useAppStore((state) => state.layout.taskPanelTab);
  const setLayout = useAppStore((state) => state.setLayout);
  const mission = useTaskMission(workspaceId, taskId);
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
      mission={mission}
      tab={tab}
      onTabChange={handleTabChange}
    />
  );
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
  mission: MissionDetail | undefined;
  tab: TaskPanelTab;
  onTabChange: (tab: TaskPanelTab) => void;
}) {
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
        <TabsList aria-label="Task sections" xstyle={styles.tabList}>
          {TASK_PANEL_TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} xstyle={styles.tab}>
              {item.label}
              <span className={sx(styles.markSlot)}>
                <TaskTabMark
                  tab={item.id}
                  workspaceId={workspaceId}
                  taskId={taskId}
                  mission={props.mission}
                />
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </RightRailPanelHeader>
      <TabsContent value="activity" xstyle={[styles.panel, styles.panelFill]}>
        <TurnActivityPanel />
      </TabsContent>
      <TabsContent value="progress" xstyle={[styles.panel, styles.panelScroll]}>
        <div key={scopeKey} className={sx(styles.progress)}>
          {props.mission ? (
            <MissionPanel taskId={taskId} detail={props.mission} />
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
            Subagents are available in a local repository task.
          </p>
        )}
      </TabsContent>
      <TabsContent value="results" xstyle={[styles.panel, styles.panelScroll]}>
        <TaskResultReviews key={scopeKey} workspaceId={workspaceId} taskId={taskId} />
      </TabsContent>
    </Tabs>
  );
}

/*
 * Tab marks read data the app already holds for other surfaces — the turn's
 * pending interaction, the mission's state, the work graph's running agents
 * and the task's unreviewed runs — one narrow subscription per tab, so a
 * change in one tab's mark re-renders that mark alone.
 */
function TaskTabMark(props: {
  tab: TaskPanelTab;
  workspaceId: string;
  taskId: string;
  mission: MissionDetail | undefined;
}) {
  switch (props.tab) {
    case "activity":
      return <ActivityMark taskId={props.taskId} />;
    case "progress":
      return <ProgressMark mission={props.mission} />;
    case "team":
      return <SubagentsMark taskId={props.taskId} />;
    case "results":
      return <ResultsMark workspaceId={props.workspaceId} taskId={props.taskId} />;
  }
}

function ActivityMark(props: { taskId: string }) {
  const running = useAppStore((state) =>
    Boolean(state.activeTurnIdsByTask[props.taskId]),
  );
  const pending = useAppStore(
    (state) =>
      state.providerTurnActivityByTask[props.taskId]?.pendingInteraction ?? null,
  );
  return <Mark mark={resolveActivityTabMark({ running, pendingInteraction: pending })} />;
}

function ProgressMark(props: { mission: MissionDetail | undefined }) {
  const { mission } = props;
  if (!mission || !isActiveMissionState(mission.mission.state)) return null;
  const badge = isAgentRun(mission.mission) ? describeAgentRunStatus(mission) : describeMissionBadge(mission);
  return <Mark mark={resolveProgressTabMark(badge)} />;
}

function SubagentsMark(props: { taskId: string }) {
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
 * A state is its shared glyph, a quantity is a count. Both hang at the
 * label's end outside the tab's layout, so neither moves a label when it
 * comes or goes.
 */
function Mark(props: { mark: TaskTabMark | null }) {
  const { mark } = props;
  if (!mark) return null;
  if (mark.kind === "state") {
    return (
      <span title={mark.label} className={sx(styles.markGlyph)}>
        <StateIcon state={mark.state} size="xs" label={mark.label} />
      </span>
    );
  }
  return (
    <span role="img" title={mark.label} aria-label={mark.label} className={sx(styles.count)}>
      {mark.text}
    </span>
  );
}

/** Room after the last tab for its mark: the 12px glyph or a one-digit count. */
const MARK_OVERHANG = 14;

const styles = stylex.create({
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  // Only the selected tab's view is mounted, so the root has exactly two
  // children: the bar and the one panel that fills the rest.
  tabs: {
    gap: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height: "100%",
    minHeight: 0,
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
  // active underline covers the bar's own rule. Its end padding is the room
  // the last tab's mark hangs into. A rail narrower than the four labels
  // scrolls the strip sideways instead of clipping Results.
  tabList: {
    borderRadius: 0,
    boxShadow: "none",
    gap: vars["--ads-space-16"],
    marginBlockEnd: `calc(-1 * ${vars["--ads-border-width-hairline"]})`,
    minWidth: 0,
    overflowX: "auto",
    overflowY: "hidden",
    padding: 0,
    paddingInlineEnd: MARK_OVERHANG,
    scrollbarWidth: "none",
  },
  tab: { flex: "none", overflow: "visible", paddingInline: 0, position: "relative" },
  // A mark sits like a superscript at the label's end, in the gap before the
  // next tab, so it takes no width: a mark arriving or leaving never moves a
  // label, and the strip still fits the default 300px rail. It is a fixed
  // size whatever it says.
  markSlot: {
    alignItems: "center",
    display: "inline-flex",
    height: 14,
    insetBlockStart: "calc(50% - 15px)",
    insetInlineStart: "calc(100% + 1px)",
    pointerEvents: "none",
    position: "absolute",
  },
  markGlyph: { display: "inline-flex" },
  panel: { minHeight: 0, minWidth: 0 },
  // Activity hosts the live list with its own scroll and floor; the record
  // views scroll as one column. Their text starts on the tab labels' edge.
  panelFill: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  panelScroll: {
    height: "100%",
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
