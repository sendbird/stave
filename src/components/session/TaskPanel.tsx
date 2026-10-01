import * as stylex from "@stylexjs/stylex";
import { useCallback, useMemo } from "react";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlowPanel } from "@/components/agents/FlowPanel";
import { MissionPanel } from "@/components/missions/MissionPanel";
import { WakeUpSection } from "@/components/missions/WakeUpSection";
import { TeamSection } from "@/components/team/TeamSection";
import type { MissionDetail } from "@/lib/missions/api";
import { isActiveMissionState } from "@/lib/missions/domain";
import { describeMissionBadge } from "@/lib/missions/mission-view";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import {
  isTaskPanelTab,
  TASK_PANEL_TABS,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import { isTaskManaged } from "@/lib/tasks";
import { summarizeWorkGraph } from "@/lib/work-graph/work-graph-tree";
import { useAppStore } from "@/store/app.store";
import { useTaskMission } from "@/store/missions-store";
import { TaskResultReviews } from "./TaskResultReviews";
import { TurnActivityPanel } from "./TurnActivityPanel";

/**
 * The right rail's Task panel: what the active task is doing, what it needs
 * from the user and what it produced, as four tabs. The selected tab is layout
 * state, so every opener names the tab it wants and a reopened rail returns to
 * the tab it left.
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
    return (
      <p className={sx(styles.empty)}>
        Open a task to see its activity, progress, team and results.
      </p>
    );
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
  /** A managed task's Team is read-only until the user takes over. */
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
      <div className={sx(styles.bar)}>
        <TabsList aria-label="Task sections" xstyle={styles.tabList}>
          {TASK_PANEL_TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id} xstyle={styles.tab}>
              {item.label}
              <TaskTabMark
                tab={item.id}
                workspaceId={workspaceId}
                taskId={taskId}
                mission={props.mission}
              />
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
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
          <TeamSection
            key={scopeKey}
            target={{ workspaceId, taskId, repositoryPath }}
            readOnly={props.managed}
          />
        ) : (
          <p className={sx(styles.notice)}>
            Advisor, workers and delegated tasks are available in a local repository task.
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
      return <TeamMark taskId={props.taskId} />;
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
  if (pending === "approval") return <Mark tone="warning" label="Approval needed" />;
  if (pending === "user_input") return <Mark tone="warning" label="Input needed" />;
  if (running) return <Mark tone="accent" label="Running" />;
  return null;
}

function ProgressMark(props: { mission: MissionDetail | undefined }) {
  const { mission } = props;
  if (!mission || !isActiveMissionState(mission.mission.state)) return null;
  const badge = describeMissionBadge(mission);
  if (badge.tone === "warning") return <Mark tone="warning" label={badge.label} />;
  if (badge.tone === "danger") return <Mark tone="danger" label={badge.label} />;
  return null;
}

function TeamMark(props: { taskId: string }) {
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
  return running > 0 ? (
    <Mark tone="accent" count={running} label={`${running} running`} />
  ) : null;
}

function ResultsMark(props: { workspaceId: string; taskId: string }) {
  const { page } = useResultReviews({
    workspaceId: props.workspaceId,
    taskId: props.taskId,
    pendingOnly: true,
    includeEvidence: false,
    limit: 1,
  });
  return page.total > 0 ? (
    <Mark tone="accent" count={page.total} label={`${page.total} to review`} />
  ) : null;
}

/** A dot says a state; a count says how many. Either reads as part of the tab. */
function Mark(props: {
  tone: "accent" | "warning" | "danger";
  label: string;
  count?: number;
}) {
  if (props.count === undefined) {
    return (
      <span
        role="img"
        aria-label={props.label}
        title={props.label}
        className={sx(styles.dot, dotTones[props.tone])}
      />
    );
  }
  return (
    <span title={props.label} className={sx(styles.count, countTones[props.tone])}>
      {props.count > 99 ? "99+" : props.count}
    </span>
  );
}

const styles = stylex.create({
  empty: {
    padding: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  tabs: { height: "100%", minHeight: 0, gap: 0 },
  // The bar owns the rule so it spans the panel; a `line` list is shrink-wrapped
  // and its own inset hairline would stop after the last label.
  bar: {
    flexShrink: 0,
    paddingInline: vars["--ads-space-12"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  tabList: {
    borderRadius: 0,
    boxShadow: "none",
    gap: vars["--ads-space-16"],
    height: 36,
    marginBlockEnd: `calc(-1 * ${vars["--ads-border-width-hairline"]})`,
    padding: 0,
  },
  tab: { flex: "none", gap: vars["--ads-space-4"], paddingInline: 0 },
  panel: { minHeight: 0, minWidth: 0 },
  // Activity hosts the live list with its own scroll and floor; the record
  // views scroll as one column.
  panelFill: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  panelScroll: { height: "100%", overflowY: "auto", padding: vars["--ads-space-16"] },
  progress: { display: "flex", flexDirection: "column", gap: vars["--ads-space-20"] },
  dot: {
    flex: "none",
    width: 6,
    height: 6,
    borderRadius: vars["--ads-radius-full"],
  },
  count: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: vars["--ads-radius-full"],
    borderStyle: "solid",
    borderWidth: vars["--ads-border-width-hairline"],
    display: "inline-flex",
    flex: "none",
    fontSize: vars["--ads-font-size-micro"],
    fontVariantNumeric: "tabular-nums",
    fontWeight: vars["--ads-font-weight-semibold"],
    justifyContent: "center",
    lineHeight: 1,
    minBlockSize: 16,
    minInlineSize: 16,
    paddingInline: vars["--ads-space-4"],
  },
});

const dotTones = stylex.create({
  accent: { backgroundColor: vars["--ads-color-accent"] },
  warning: { backgroundColor: vars["--ads-color-warning"] },
  danger: { backgroundColor: vars["--ads-color-danger"] },
});

// The same pairs `CountBadge` settled on: the one declared foreground for a
// solid accent fill, and the soft warning fill whose text step is legible in
// every theme where body ink on saturated amber was not.
const countTones = stylex.create({
  accent: {
    backgroundColor: vars["--ads-color-accent"],
    color: vars["--ads-color-accent-text"],
  },
  warning: {
    backgroundColor: vars["--ads-color-warning-soft"],
    borderColor: vars["--ads-color-warning-border"],
    color: vars["--ads-color-warning-text"],
  },
  danger: {
    backgroundColor: vars["--ads-color-danger"],
    color: vars["--ads-color-accent-text"],
  },
});
