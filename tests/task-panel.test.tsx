import { beforeEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskPanel, TaskPanelView } from "@/components/session/TaskPanel";
import { openTaskInspection } from "@/components/session/task-inspection-navigation";
import type { MissionDetail } from "@/lib/missions/api";
import { DEFAULT_PLAYBOOK_PERMISSION_MODE } from "@/lib/playbooks/schema";
import {
  RIGHT_RAIL_PANEL_IDS,
  RIGHT_RAIL_PANEL_TITLES,
  TASK_PANEL_TABS,
  taskPanelLayoutPatch,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import { missionDetail, missionFixture } from "./fixtures/mission-fixtures";

const WORKSPACE_ID = "ws-1";
const TASK_ID = "task-1";

function render(
  overrides: Partial<Parameters<typeof TaskPanelView>[0]> & { tab: TaskPanelTab },
) {
  return renderToStaticMarkup(
    createElement(TaskPanelView, {
      workspaceId: WORKSPACE_ID,
      taskId: TASK_ID,
      repositoryPath: null,
      managed: false,
      mission: undefined,
      onTabChange: () => {},
      ...overrides,
    }),
  );
}

/** The label of the tab the strip marks selected. */
function selectedTab(html: string) {
  return /aria-selected="true"[^>]*>([A-Za-z]+)/.exec(html)?.[1] ?? null;
}

function mission(): MissionDetail {
  return missionDetail(missionFixture({ leadTaskId: TASK_ID }));
}

beforeEach(() => {
  useAppStore.setState({
    activeWorkspaceId: WORKSPACE_ID,
    activeTaskId: TASK_ID,
    tasks: [
      {
        id: TASK_ID,
        title: "Add CSV export",
        provider: "claude-code",
        updatedAt: "2026-09-26T10:00:00.000Z",
        unread: false,
        controlMode: "interactive",
        controlOwner: "stave",
      },
    ],
  } as never);
  useAppStore.getState().setLayout({
    patch: { sidebarOverlayVisible: false, taskPanelTab: "activity" },
  });
});

test("the rail has one Task entry whose tabs replace the five task panels", () => {
  expect(RIGHT_RAIL_PANEL_IDS).toEqual([
    "explorer",
    "changes",
    "information",
    "skills",
    "scripts",
    "task",
  ]);
  expect(RIGHT_RAIL_PANEL_TITLES.task).toBe("Task");
  expect(TASK_PANEL_TABS.map((tab) => tab.label)).toEqual([
    "Activity",
    "Progress",
    "Subagents",
    "Results",
  ]);
});

test("the panel is a tab strip that shows only the selected tab's view", () => {
  let html = render({ tab: "progress" });
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-label="Task sections"');
  expect(html.match(/role="tab"/g)).toHaveLength(4);
  expect(selectedTab(html)).toBe("Progress");
  expect(html).toContain('aria-label="Flow"');
  expect(html).not.toContain('aria-label="Task results"');

  html = render({ tab: "results" });
  expect(selectedTab(html)).toBe("Results");
  expect(html).toContain('aria-label="Task results"');
  expect(html).not.toContain('aria-label="Flow"');
});

test("the tab an opener names becomes layout state the panel reads", () => {
  // Every opener goes through the same patch, so the stored tab is what the
  // connected panel renders next.
  useAppStore.getState().setLayout({ patch: taskPanelLayoutPatch("results") });
  const layout = useAppStore.getState().layout;
  expect(layout).toMatchObject({
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "task",
    taskPanelTab: "results",
  });
  expect(selectedTab(render({ tab: layout.taskPanelTab }))).toBe("Results");

  // Closing the rail keeps the tab, so it reopens where it was left.
  useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: false } });
  expect(useAppStore.getState().layout.taskPanelTab).toBe("results");
});

test("Progress shows the mission when the task has one and the flow otherwise", () => {
  expect(render({ tab: "progress" })).toContain('aria-label="Flow"');

  const html = render({ tab: "progress", mission: mission() });
  expect(html).toContain('data-testid="mission-panel"');
  expect(html).toContain("Add CSV export to the billing page.");
  expect(html).not.toContain('aria-label="Flow"');
});

test("a direct task's Progress carries no mission upsell", () => {
  const html = render({ tab: "progress" });
  expect(html).not.toContain("Hand this task off");
  expect(html).not.toContain("Start a mission");
  expect(html).not.toContain("Manage playbooks");
});

test("Subagents lists the task's subagents for a repository task", () => {
  expect(render({ tab: "team" })).toContain("available in a local repository task");

  const html = render({ tab: "team", repositoryPath: "/tmp/repo" });
  expect(selectedTab(html)).toBe("Subagents");
  expect(html).toMatch(/Loading subagents|No subagents yet/);
  expect(html).not.toContain("Advisor");
});

test("Progress marks a mission that needs the user", () => {
  const needsYou = mission();
  needsYou.stages = needsYou.stages.map((stage, index) =>
    index === needsYou.mission.currentStageIndex
      ? { ...stage, status: "awaiting-sign-off" }
      : stage,
  );
  expect(render({ tab: "activity", mission: needsYou })).toContain(
    'aria-label="Needs you"',
  );
  expect(render({ tab: "activity", mission: mission() })).not.toContain(
    'aria-label="Needs you"',
  );
});

test("the connected panel asks for a task when none is open", () => {
  useAppStore.setState({ activeTaskId: "", tasks: [] } as never);
  expect(renderToStaticMarkup(createElement(TaskPanel))).toContain(
    "Open a task to see its activity, progress, subagents and results.",
  );
});

test("openTaskInspection opens the Task panel on the named tab for the active task", () => {
  openTaskInspection(WORKSPACE_ID, TASK_ID, "team");
  expect(useAppStore.getState().layout).toMatchObject({
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "task",
    taskPanelTab: "team",
  });

  // Another workspace's task is not opened in this one.
  openTaskInspection("ws-other", TASK_ID, "results");
  expect(useAppStore.getState().layout.taskPanelTab).toBe("team");
});

test("a playbook without a permission mode runs Auto", () => {
  expect(DEFAULT_PLAYBOOK_PERMISSION_MODE).toBe("auto");
});
