import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildMissionCommandActions } from "../src/components/missions/useMissionCommands";
import { ProjectHome } from "../src/components/projects/ProjectHome";
import { ProjectList, ProjectsEmpty } from "../src/components/projects/ProjectsView";
import { missionNeedsYou } from "../src/components/projects/ProjectRows";
import { createPlaybookFromStarter, findPlaybookStarter } from "../src/lib/playbooks/starters";
import type { ProjectDetail, ProjectMissionView } from "../src/lib/projects/api";
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_PROJECT_TRIGGERS, type Project } from "../src/lib/projects/domain";
import { countProjectNeeds } from "../src/store/projects-store";

const NOW = "2026-09-26T10:00:00.000Z";

const PROJECT: Project = {
  id: "project-1",
  name: "Dashboard move",
  goal: "Every dashboard screen uses the new components.",
  repositoryPath: "/tmp/acme",
  coordinator: { workspaceId: "ws", taskId: "coordinator" },
  settings: { ...DEFAULT_PROJECT_SETTINGS, parallelLimit: 3 },
  state: "active",
  summary: "Billing and Settings run in parallel.",
  reasonDetail: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function mission(patch: Partial<ProjectMissionView>): ProjectMissionView {
  return {
    missionId: "m",
    workspaceId: "ws-m",
    taskId: "t",
    playbookName: "Request → PR",
    assignment: "Move the billing table.",
    state: "running",
    currentStageIndex: 2,
    stageCount: 6,
    stageTitle: "Verify",
    currentStageStatus: "running",
    providerId: "claude-code",
    updatedAt: NOW,
    report: null,
    ...patch,
  };
}

const DETAIL: ProjectDetail = {
  project: PROJECT,
  proposals: [
    {
      id: "proposal-1",
      projectId: PROJECT.id,
      startKey: "nav",
      playbook: createPlaybookFromStarter(findPlaybookStarter("request-to-pr")!, { now: new Date(NOW), id: "pb" }),
      assignment: "Move the navigation bar.",
      providerId: "codex",
      model: null,
      worktreeName: "navigation",
      state: "pending",
      workspaceId: null,
      taskId: null,
      missionId: null,
      detail: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  missions: [
    mission({ missionId: "waiting", assignment: "Move the settings form.", currentStageStatus: "awaiting-sign-off", stageTitle: "Ready for review" }),
    mission({ missionId: "running" }),
    mission({ missionId: "done", assignment: "Replace tokens.", state: "completed", currentStageIndex: 5 }),
  ],
  memories: [
    { id: "memory-1", projectId: PROJECT.id, kind: "decision", content: "Use the shared Table.", status: "candidate", sourceMissionId: "done", createdAt: NOW },
  ],
  library: [],
  events: [],
};

test("a project home groups missions by what they need and aligns their stage tracks", () => {
  const html = renderToStaticMarkup(createElement(ProjectHome, { detail: DETAIL }));
  expect(html).toContain('aria-label="Needs you"');
  expect(html).toContain('aria-label="Running"');
  expect(html).toContain('aria-label="Done"');
  // The proposal: its playbook, stage count and provider, with both decisions.
  expect(html).toContain("Proposed");
  expect(html).toContain("6 stages");
  expect(html).toContain("Start mission");
  expect(html).toContain("Dismiss");
  // The mission that waits for a sign-off asks for a review, not an open.
  expect(html).toContain("waits for your sign-off");
  expect(html).toContain("Review");
  expect(html).toContain('aria-label="Stage 3 of 6"');
  expect(html).toMatch(/>2<\/span> need you/);
  expect(html).toContain("You start each mission · up to 3 at once");
  expect(html).toContain("Billing and Settings run in parallel.");
  // Memory tab: the decision names the mission it came from.
  expect(html).toContain("To review");
  expect(html).toContain("from “Replace tokens.”");
});

test("counting what a project needs covers proposals, sign-offs and stuck missions", () => {
  expect(countProjectNeeds(DETAIL)).toBe(2);
  expect(countProjectNeeds(undefined)).toBe(0);
  expect(missionNeedsYou(mission({ currentStageStatus: "stuck" }))).toBe(true);
  expect(missionNeedsYou(mission({ state: "paused", currentStageStatus: "awaiting-sign-off" }))).toBe(false);
});

test("the projects view explains itself when empty and lists open projects before ended ones", () => {
  const empty = renderToStaticMarkup(createElement(ProjectsEmpty, { onCreate: () => {} }));
  expect(empty).toContain("Hand Stave a goal, not just a task");
  expect(empty).toContain("Brief the goal");

  const listed = renderToStaticMarkup(
    createElement(ProjectList, {
      projects: [{ ...PROJECT, id: "ended", name: "Old move", state: "completed" }, PROJECT],
      details: { [PROJECT.id]: DETAIL },
      selectedId: PROJECT.id,
      onSelect: () => {},
    }),
  );
  expect(listed.indexOf("Dashboard move")).toBeLessThan(listed.indexOf("Ended"));
  expect(listed.indexOf("Ended")).toBeLessThan(listed.indexOf("Old move"));
  expect(listed).toContain('aria-label="2 need you"');
  expect(listed).toContain('aria-current="true"');
});

test("the command palette opens projects and starts a new one", () => {
  const ids = buildMissionCommandActions().map((action) => action.id);
  expect(ids).toContain("projects.open");
  expect(ids).toContain("projects.new");
});

test("the collapsed sidebar keeps Projects one click away", async () => {
  const { SidebarPrimaryNavCollapsed } = await import("../src/components/layout/SidebarPrimaryNav");
  const html = renderToStaticMarkup(createElement(SidebarPrimaryNavCollapsed, { showFleetView: true }));
  expect(html).toContain('aria-label="open-fleet-view"');
  expect(html).toContain('aria-label="Projects"');
});

test("the coordinator conversation shows what you wrote, what woke it and its answers, never tool calls", async () => {
  const { toDockEntries } = await import("../src/components/projects/CoordinatorDock");
  const { buildCoordinatorKickoffPrompt, buildCoordinatorWakePrompt } = await import("../src/lib/projects/policy");
  const message = (id: string, role: "user" | "assistant", content: string, extra: Record<string, unknown> = {}) =>
    ({ id, role, content, model: "m", providerId: role === "user" ? "user" : "claude-code", parts: [], ...extra }) as never;
  const entries = toDockEntries([
    message("1", "user", buildCoordinatorKickoffPrompt()),
    message("2", "assistant", "I proposed two missions."),
    message("3", "assistant", ""),
    message("4", "user", "Split billing in two."),
    message(
      "5",
      "user",
      buildCoordinatorWakePrompt([], [
        { id: "a", kind: "issue-assigned", summary: "ACME-1 · Fix login" },
        { id: "b", kind: "schedule", summary: "Weekdays at 09:00" },
      ]),
    ),
    message("6", "assistant", "Working on it", { isStreaming: true }),
  ]);
  expect(entries.map((entry) => [entry.author, entry.text])).toEqual([
    ["stave", "Asked the coordinator to plan the project from its goal."],
    ["coordinator", "I proposed two missions."],
    ["you", "Split billing in two."],
    ["stave", "Woke the coordinator: Issue assigned to the user: ACME-1 · Fix login and 1 more."],
    ["coordinator", "Working on it"],
  ]);
  expect(entries.at(-1)?.streaming).toBe(true);
});

test("Starts when names each trigger and what it watches", async () => {
  const { ProjectStartsWhen, describeTriggers, countActiveTriggers } = await import("../src/components/projects/ProjectStartsWhen");
  const triggers = { ...DEFAULT_PROJECT_TRIGGERS, issueAssigned: true, issueFilter: "dashboard", schedule: "weekdays" as const };
  expect(countActiveTriggers(triggers)).toBe(3);
  expect(describeTriggers(triggers)).toBe("Issues matching “dashboard” · PR feedback · Weekdays at 09:00");
  expect(describeTriggers({ ...DEFAULT_PROJECT_TRIGGERS, pullRequestFeedback: false })).toBeNull();
  const html = renderToStaticMarkup(createElement(ProjectStartsWhen, { triggers, onChange: () => {} }));
  expect(html).toContain("An issue is assigned to me");
  expect(html).toContain("A mission&#x27;s pull request gets feedback");
  expect(html).toContain("Scheduled check-in");
  expect(html).toContain('value="dashboard"');
});

test("the library filters by name, mission, address or kind, and a workspace finds the project it works for", async () => {
  const { libraryItemMatches } = await import("../src/components/projects/ProjectDetailTabs");
  const { findWorkspaceProject } = await import("../src/components/projects/ProjectInformationCard");
  const item = {
    label: "PR #605",
    url: "https://github.com/acme/app/pull/605",
    kind: "pull-request" as const,
    missionId: "done",
    missionTitle: "Replace tokens.",
    verified: true,
  };
  expect(libraryItemMatches(item, "")).toBe(true);
  expect(libraryItemMatches(item, "pr tokens")).toBe(true);
  expect(libraryItemMatches(item, "605")).toBe(true);
  expect(libraryItemMatches(item, "preview")).toBe(false);

  const details = { [PROJECT.id]: DETAIL };
  expect(findWorkspaceProject(details, "ws")?.role).toBe("coordinator");
  expect(findWorkspaceProject(details, "ws-m")?.role).toBe("mission");
  expect(findWorkspaceProject(details, "elsewhere")).toBeNull();
  expect(findWorkspaceProject({ [PROJECT.id]: { ...DETAIL, project: { ...PROJECT, state: "completed" } } }, "ws")).toBeNull();
});
