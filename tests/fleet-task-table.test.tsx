import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FleetTaskTableView } from "@/components/layout/FleetTaskTable";
import { applyAppLocale } from "@/i18n";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { fleetSearchMatches, normalizeFleetSearchQuery } from "@/lib/fleet/card-task-rows";
import {
  buildFleetTaskRows,
  fleetTaskRowSearchText,
  FLEET_TABLE_FILTER_OPTIONS,
  isTableOnlyFilter,
  matchesFleetTaskTableFilter,
  type FleetTaskRow,
  type FleetTaskTableFilter,
  type FleetTaskTableWorkspace,
} from "@/lib/fleet/task-rows";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { createWorkGraph } from "@/lib/work-graph/work-graph-reducer";
import { normalizeFleetBoardLayout } from "@/store/app-settings";
import { createAppStorePersistenceOptions } from "@/store/app-store-persistence";
import type { AppState } from "@/store/app-store.types";
import { useAppStore } from "@/store/app.store";
import {
  requestFleetWorkspaceShell,
  resetFleetWorkspaceShells,
  useFleetWorkspaceShellsStore,
} from "@/store/fleet-workspace-shells-store";
import type { WorkspaceShellSummary } from "@/lib/db/workspaces.db";
import type { Task } from "@/types/chat";

const NOW = Date.parse("2026-10-22T02:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id, title: id, provider: "codex", updatedAt: minutesAgo(1), unread: false, archivedAt: null,
    controlMode: "interactive", controlOwner: "stave", ...overrides,
  } as Task;
}

function activity(turnId: string, stalled: boolean): ProviderTurnActivitySnapshot {
  return {
    turnId, providerId: "codex", startedAt: NOW - 20 * 60_000, lastEventAt: NOW - 12 * 60_000,
    stalledAt: stalled ? NOW - 7 * 60_000 : null, pendingInteraction: null, workItemsById: {}, orderedWorkItemIds: [],
    workGraph: createWorkGraph({ turnId, providerId: "codex", startedAt: NOW - 20 * 60_000 }),
  };
}

function need(workspaceId: string, taskId: string, kind: FleetAttentionItem["kind"], waitedMinutes?: number): FleetAttentionItem {
  return {
    id: `${kind}:${workspaceId}:${taskId}`, kind, priority: kind === "approval" ? 1 : 2,
    repositoryPath: "/tmp/project", repositoryName: "project", workspaceId, workspaceName: workspaceId, taskId,
    createdAt: minutesAgo(1), source: "live",
    ...(waitedMinutes === undefined ? {} : { waitingSince: minutesAgo(waitedMinutes) }),
  } as FleetAttentionItem;
}

function workspace(id: string, overrides: Partial<FleetTaskTableWorkspace>): FleetTaskTableWorkspace {
  return {
    repositoryPath: "/tmp/project", repositoryName: "project", workspaceId: id, workspaceName: id,
    isActive: false, lastActiveAt: minutesAgo(5), hasAttentionItems: false, session: null, storedTasks: null, ...overrides,
  };
}

/** The open workspace, one loaded by another surface, and one nobody opened. */
function fixture() {
  const workspaces = [
    workspace("ws-open", {
      isActive: true, hasAttentionItems: true,
      session: {
        tasks: [task("approve-new"), task("running"), task("idle", { updatedAt: minutesAgo(30) }), task("closed-tab")],
        messagesByTask: {
          "approve-new": [{
            id: "m-approve", role: "assistant", model: "gpt-5.5", providerId: "codex", content: "", turnId: "turn-approve",
            parts: [{ type: "approval", toolName: "Bash", description: "Publish", requestId: "approval-new", state: "approval-requested" }],
          }] as never,
        },
        activeTurnIdsByTask: { "approve-new": "turn-approve", running: "turn-running" },
        openTaskTabIds: ["approve-new", "running", "idle"],
      },
    }),
    workspace("ws-cached", {
      hasAttentionItems: true, workspaceBranch: "feature/quiet-index",
      session: {
        tasks: [task("quiet"), task("archived", { archivedAt: minutesAgo(5) })],
        messagesByTask: {},
        activeTurnIdsByTask: { quiet: "turn-quiet" },
        openTaskTabIds: null,
      },
    }),
    workspace("ws-cold", {
      hasAttentionItems: true,
      storedTasks: [task("approve-old"), task("delegated", { parentTaskId: "approve-old" })],
    }),
    // Untouched for a month and asking for nothing.
    workspace("ws-dormant", { lastActiveAt: null, storedTasks: [task("forgotten", { updatedAt: minutesAgo(30 * 24 * 60) })] }),
  ];
  const attentionItems = [
    need("ws-open", "approve-new", "approval", 3),
    need("ws-cached", "quiet", "turn-stalled", 12),
    need("ws-cold", "approve-old", "approval", 45),
    // A lesser item on the same task never replaces the most urgent one.
    need("ws-cold", "approve-old", "result-ready", 1),
  ];
  return buildFleetTaskRows({
    workspaces,
    attentionItems,
    providerTurnActivityByTask: { running: activity("turn-running", false), quiet: activity("turn-quiet", true) },
    nowMs: NOW,
  });
}

const ids = (rows: readonly FleetTaskRow[]) => rows.map((row) => row.task.id);

describe("one row per open task across every workspace", () => {
  test("lanes first, then the longest wait: the oldest approval leads, the quiet turn follows", () => {
    const rows = fixture();
    expect(ids(rows)).toEqual(["approve-old", "quiet", "approve-new", "running", "idle", "forgotten"]);
    expect(rows.map((row) => row.rank.lane)).toEqual([
      "action-required", "action-required", "action-required", "in-progress", "idle", "idle",
    ]);
  });

  test("a workspace nobody opened shows its stored tasks with an unknown state and its need", () => {
    const old = fixture()[0]!;
    expect(old).toMatchObject({ workspaceId: "ws-cold", status: "unknown", activity: null, activeTurnId: null });
    expect(old.need?.kind).toBe("approval");
    expect(old.waitingSince).toBe(minutesAgo(45));
  });

  test("a workspace is live, recent or dormant exactly as its card decides", () => {
    const activityById = Object.fromEntries(fixture().map((row) => [row.workspaceId, row.workspaceActivity]));
    expect(activityById).toEqual({ "ws-open": "live", "ws-cached": "live", "ws-cold": "recent", "ws-dormant": "dormant" });
  });

  test("live state comes from the session; a turn's activity counts only for its own turn", () => {
    const byId = new Map(fixture().map((row) => [row.task.id, row]));
    expect(byId.get("quiet")).toMatchObject({ status: "stalled", activeTurnId: "turn-quiet" });
    expect(byId.get("running")).toMatchObject({ status: "running" });
    expect(byId.get("running")!.activity?.turnId).toBe("turn-running");
    expect(byId.get("idle")).toMatchObject({ status: "idle", need: null, waitingSince: null });
    expect(byId.get("approve-new")).toMatchObject({ status: "waiting-approval" });
    // Closed tabs, archived and delegated tasks are not open tasks.
    expect(byId.has("closed-tab") || byId.has("archived") || byId.has("delegated")).toBe(false);
  });

  test("100 tasks in 30 workspaces: the oldest approval is first and Stalled finds every quiet turn", () => {
    const workspaces: FleetTaskTableWorkspace[] = [];
    const attentionItems: FleetAttentionItem[] = [];
    const providerTurnActivityByTask: Record<string, ProviderTurnActivitySnapshot> = {};
    let count = 0;
    for (let index = 0; index < 30; index += 1) {
      const workspaceId = `ws-${index}`;
      const tasks = Array.from({ length: index < 10 ? 4 : 3 }, (_, slot) => task(`task-${index}-${slot}`));
      count += tasks.length;
      const live = index % 3 === 0;
      const activeTurnIdsByTask: Record<string, string> = {};
      if (live) {
        const quiet = tasks[0]!.id;
        activeTurnIdsByTask[quiet] = `turn-${quiet}`;
        providerTurnActivityByTask[quiet] = activity(`turn-${quiet}`, index % 6 === 0);
      }
      if (index % 4 === 1) attentionItems.push(need(workspaceId, tasks[1]!.id, "approval", 10 + index));
      workspaces.push(workspace(workspaceId, live
        ? { session: { tasks, messagesByTask: {}, activeTurnIdsByTask, openTaskTabIds: null } }
        : { storedTasks: tasks, hasAttentionItems: index % 4 === 1 }));
    }
    expect(count).toBe(100);
    const rows = buildFleetTaskRows({ workspaces, attentionItems, providerTurnActivityByTask, nowMs: NOW });
    expect(rows).toHaveLength(100);
    // ws-29 raised its approval 39 minutes ago, the longest wait.
    expect(rows[0]!.task.id).toBe("task-29-1");
    const stalled = rows.filter((row) => matchesFleetTaskTableFilter(row, "stalled"));
    expect(ids(stalled).sort()).toEqual(["task-0-0", "task-12-0", "task-18-0", "task-24-0", "task-6-0"]);
    expect(rows.filter((row) => matchesFleetTaskTableFilter(row, "needs-answer"))).toHaveLength(8);
  });
});

describe("table filters", () => {
  const rows = fixture();
  const shown = (filter: FleetTaskTableFilter) => ids(rows.filter((row) => matchesFleetTaskTableFilter(row, filter)));

  test("the board's chips plus Needs answer and Stalled", () => {
    expect(FLEET_TABLE_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      "active", "running", "blocked", "all", "needs-answer", "stalled",
    ]);
    expect(isTableOnlyFilter("stalled") && isTableOnlyFilter("needs-answer")).toBe(true);
    expect(isTableOnlyFilter("blocked")).toBe(false);
  });

  test("each chip keeps exactly its rows", () => {
    expect(shown("all")).toEqual(ids(rows));
    expect(shown("active")).toEqual(["approve-old", "quiet", "approve-new", "running", "idle"]);
    // A turn waiting on you, or gone quiet, is still in flight.
    expect(shown("running")).toEqual(["quiet", "approve-new", "running"]);
    expect(shown("blocked")).toEqual(["approve-old", "quiet", "approve-new"]);
    expect(shown("needs-answer")).toEqual(["approve-old", "approve-new"]);
    expect(shown("stalled")).toEqual(["quiet"]);
  });

  test("the search finds a task by its title, workspace, branch or repository", () => {
    const find = (query: string) =>
      ids(rows.filter((row) => fleetSearchMatches(fleetTaskRowSearchText(row), normalizeFleetSearchQuery(query))));
    expect(find("quiet-index")).toEqual(["quiet"]);
    expect(find("ws-cold")).toEqual(["approve-old"]);
    expect(find("approve")).toEqual(["approve-old", "approve-new"]);
    expect(find("project")).toEqual(ids(rows));
  });
});

describe("the table", () => {
  afterEach(() => applyAppLocale("en"));
  const render = (rows: readonly FleetTaskRow[]) =>
    renderToStaticMarkup(createElement(FleetTaskTableView, { rows, nowMs: NOW, onOpenTask: () => {} }));

  test("names each column, the state, the need and how long it has waited", () => {
    const html = render(fixture());
    for (const column of ["Task", "Workspace", "State", "Needs", "Waiting", "Activity"]) {
      expect(html).toContain(`>${column}</th>`);
    }
    expect(html.match(/data-fleet-task-table-row=/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Open approve-old in ws-cold"');
    expect(html).toContain("No updates");
    expect(html).toContain(">45m<");
    // Fleet's clock ticks each minute, so a fresh wait is not counted in seconds.
    const fresh = { ...fixture()[0]!, waitingSince: new Date(NOW - 20_000).toISOString() };
    expect(render([fresh])).toContain(">Under 1m<");
  });

  test("an empty filter says so, in Korean too", () => {
    expect(render([])).toContain("No tasks match this filter.");
    applyAppLocale("ko");
    expect(render([])).toContain("이 필터에 맞는 작업이 없습니다.");
    expect(render(fixture())).toContain(">대기 시간</th>");
  });
});

describe("unopened workspaces' task lists", () => {
  beforeEach(() => resetFleetWorkspaceShells());

  const shell = { tasks: [task("stored")], openTaskTabIds: ["stored"] } as unknown as WorkspaceShellSummary;

  test("each workspace is read once per visit, and a failed read stays failed", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return shell;
    };
    requestFleetWorkspaceShell("ws-a", load);
    requestFleetWorkspaceShell("ws-a", load);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(useFleetWorkspaceShellsStore.getState().byWorkspaceId["ws-a"]).toEqual({ status: "loaded", shell });

    requestFleetWorkspaceShell("ws-b", async () => { throw new Error("db closed"); });
    await Promise.resolve();
    await Promise.resolve();
    requestFleetWorkspaceShell("ws-b", load);
    expect(useFleetWorkspaceShellsStore.getState().byWorkspaceId["ws-b"]).toEqual({ status: "failed" });
    expect(calls).toBe(1);
  });

  test("leaving Fleet forgets every read, and a read still in flight cannot land afterwards", async () => {
    let finish: (value: WorkspaceShellSummary) => void = () => {};
    requestFleetWorkspaceShell("ws-a", () => new Promise((resolve) => { finish = resolve; }));
    resetFleetWorkspaceShells();
    finish(shell);
    await Promise.resolve();
    expect(useFleetWorkspaceShellsStore.getState().byWorkspaceId).toEqual({});
  });
});

describe("the Cards/Table choice", () => {
  const initial = useAppStore.getInitialState();
  // Restored exactly: later files tell a bridge-less test run by the key's absence.
  const globalWithWindow = globalThis as { window?: unknown };
  const hadWindow = "window" in globalWithWindow;
  const originalWindow = globalWithWindow.window;
  beforeEach(() => {
    globalWithWindow.window = { api: {} };
  });
  afterEach(() => {
    useAppStore.setState(initial, true);
    if (hadWindow) globalWithWindow.window = originalWindow;
    else delete globalWithWindow.window;
  });

  test("defaults to cards, persists table, and reads anything else as cards", () => {
    expect(initial.settings.fleetBoardLayout).toBe("cards");
    expect(normalizeFleetBoardLayout("table")).toBe("table");
    expect(normalizeFleetBoardLayout("grid")).toBe("cards");
    useAppStore.getState().updateSettings({ patch: { fleetBoardLayout: "table" } });
    expect(useAppStore.getState().settings.fleetBoardLayout).toBe("table");

    const options = createAppStorePersistenceOptions();
    const restore = (settings: Record<string, unknown>) => {
      const state = { ...initial, settings } as unknown as AppState;
      options.onRehydrateStorage()(state);
      return state;
    };
    const written = options.partialize(useAppStore.getState());
    expect(restore(JSON.parse(JSON.stringify(written.settings))).settings.fleetBoardLayout).toBe("table");
    expect(restore({ fleetBoardLayout: 3 }).settings.fleetBoardLayout).toBe("cards");
    expect(restore({}).settings.fleetBoardLayout).toBe("cards");
  });
});
