import { beforeEach, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskPanel, TaskPanelView } from "@/components/session/TaskPanel";
import { TaskPanelEmpty } from "@/components/session/TaskPanelEmpty";
import { openTaskInspection } from "@/components/session/task-inspection-navigation";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { DEFAULT_WORKFLOW_PERMISSION_MODE } from "@/lib/workflows/schema";
import {
  RIGHT_RAIL_PANEL_IDS,
  RIGHT_RAIL_PANEL_TITLES,
  TASK_PANEL_TABS,
  taskPanelLayoutPatch,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import { useAppStore } from "@/store/app.store";
import { agentRunDetail, agentRunFixture } from "./fixtures/agent-run-fixtures";

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
      agentRun: undefined,
      onTabChange: () => {},
      ...overrides,
    }),
  );
}

/** The label of the tab the strip marks selected. */
function selectedTab(html: string) {
  return /aria-selected="true"[^>]*>([A-Za-z]+)/.exec(html)?.[1] ?? null;
}

function agentRun(): AgentRunDetail {
  return agentRunDetail(agentRunFixture({ leadTaskId: TASK_ID }));
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
    "Outputs",
  ]);
});

test("the panel is a tab strip that shows only the selected tab's view", () => {
  let html = render({ tab: "progress" });
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-label="Task sections"');
  expect(html.match(/role="tab"/g)).toHaveLength(4);
  expect(selectedTab(html)).toBe("Progress");
  expect(html).toContain('aria-label="Flow"');
  expect(html).not.toContain('aria-label="Task outputs"');

  html = render({ tab: "results" });
  expect(selectedTab(html)).toBe("Outputs");
  expect(html).toContain('aria-label="Task outputs"');
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
  expect(selectedTab(render({ tab: layout.taskPanelTab }))).toBe("Outputs");

  // Closing the rail keeps the tab, so it reopens where it was left.
  useAppStore.getState().setLayout({ patch: { sidebarOverlayVisible: false } });
  expect(useAppStore.getState().layout.taskPanelTab).toBe("results");
});

test("Progress shows the run when the task has one and the flow otherwise", () => {
  expect(render({ tab: "progress" })).toContain('aria-label="Flow"');

  const html = render({ tab: "progress", agentRun: agentRun() });
  expect(html).toContain('data-testid="agent-run-panel"');
  expect(html).toContain("Add CSV export to the billing page.");
  expect(html).not.toContain('aria-label="Flow"');
});

test("a direct task's Progress carries no run upsell", () => {
  const html = render({ tab: "progress" });
  expect(html).not.toContain("Hand this task off");
  expect(html).not.toContain("Start a run");
  expect(html).not.toContain("Manage workflows");
});

test("Subagents lists the task's subagents for a repository task", () => {
  expect(render({ tab: "team" })).toContain("available in a local repository task");

  const html = render({ tab: "team", repositoryPath: "/tmp/repo" });
  expect(selectedTab(html)).toBe("Subagents");
  expect(html).toMatch(/Loading subagents|No subagents yet/);
  expect(html).not.toContain("Advisor");
});

test("Progress marks a run that needs the user", () => {
  const needsYou = agentRun();
  needsYou.stages = needsYou.stages.map((stage, index) =>
    index === needsYou.agentRun.currentStageIndex
      ? { ...stage, status: "awaiting-sign-off" }
      : stage,
  );
  expect(render({ tab: "activity", agentRun: needsYou })).toContain(
    'aria-label="Needs you"',
  );
  expect(render({ tab: "activity", agentRun: agentRun() })).not.toContain(
    'aria-label="Needs you"',
  );
});

test("the connected panel with no task names its sections and starts one", () => {
  useAppStore.setState({ activeTaskId: "", tasks: [] } as never);
  expect(renderToStaticMarkup(createElement(TaskPanel))).toContain("No task open");

  const html = renderToStaticMarkup(createElement(TaskPanelEmpty, { hasWorkspace: true }));
  for (const tab of TASK_PANEL_TABS) {
    expect(html).toContain(tab.label);
    expect(html).toContain(tab.description.replace(/'/g, "&#x27;"));
  }
  expect(html).toContain("New task");

  // Without a workspace there is nothing to start a task in, so the panel
  // says why instead of offering the action.
  const none = renderToStaticMarkup(createElement(TaskPanelEmpty, { hasWorkspace: false }));
  expect(none).toContain("Select a workspace in the sidebar");
  expect(none).not.toContain("New task");
});

test("the tabs share the rail's one panel bar instead of a second bar", () => {
  const html = render({ tab: "activity" });
  // One header, holding the heading and the tab strip.
  expect(html.match(/<header/g)).toHaveLength(1);
  expect(html).toMatch(/<header[^>]*>.*<h2[^>]*>Task<\/h2>.*role="tablist"/s);
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

test("a workflow without a permission mode runs Auto", () => {
  expect(DEFAULT_WORKFLOW_PERMISSION_MODE).toBe("auto");
});
