import { afterEach, describe, expect, test } from "bun:test";
import { resolveFleetFocus, stepFleetFocus, type FleetFocusResolution, type FleetFocusView } from "@/lib/fleet/fleet-focus";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import type { FleetTaskOwner } from "@/lib/fleet/task-owner";
import { clearFleetFocus, openFleetAt, useFleetFocusStore } from "@/store/fleet-focus-store";
import type { Task } from "@/types/chat";

const DEFAULT_VIEW: FleetFocusView = { filter: "active", owner: "all", query: "", collapsedRepositories: {} };

function row(taskId: string, overrides: Partial<FleetTaskRow> = {}): FleetTaskRow {
  return {
    key: JSON.stringify(["/tmp/repo", "ws-1", taskId]), repositoryPath: "/tmp/repo", repositoryName: "repo",
    workspaceId: "ws-1", workspaceName: "checkout", workspaceBranch: "feature/export", workspaceActivity: "recent",
    task: { id: taskId, title: `Task ${taskId}`, provider: "codex", updatedAt: "2026-11-05T00:00:00.000Z", unread: false, archivedAt: null,
      controlMode: "interactive", controlOwner: "stave" } as Task,
    status: "idle", need: null, waitingSince: null, activeTurnId: null, rank: { lane: "idle" }, ...overrides,
  };
}

function resolve(args: {
  rows?: readonly FleetTaskRow[] | null;
  view?: Partial<FleetFocusView>;
  layout?: "tree" | "cards" | "table";
  owner?: FleetTaskOwner | null;
  workspaceKnown?: boolean;
  blocking?: boolean;
}): FleetFocusResolution {
  return resolveFleetFocus({
    target: { workspaceId: "ws-1", taskId: "task-1" },
    layout: args.layout ?? "table",
    workspaceKnown: args.workspaceKnown ?? true,
    rows: args.rows === undefined ? [row("task-1"), row("task-2", { task: { ...row("task-2").task, title: "Billing export" } })] : args.rows,
    workspaceHasBlockingAttention: args.blocking ?? false,
    ownerOf: () => (args.owner === undefined ? "you" : args.owner),
    view: { ...DEFAULT_VIEW, ...args.view },
  });
}

const shown = (resolution: FleetFocusResolution) => {
  if (resolution.kind !== "show") throw new Error(`expected show, got ${resolution.kind}`);
  return resolution;
};

describe("where a focus request lands", () => {
  test("a visible row keeps every filter and opens", () => {
    const view = { filter: "active", owner: "you", query: "task-1", collapsedRepositories: { "/tmp/other": true } } as const;
    const result = shown(resolve({ view }));
    expect(result.taskKey).toBe(JSON.stringify(["/tmp/repo", "ws-1", "task-1"]));
    expect(result.view).toEqual({ ...view });
  });

  test("a hidden row becomes visible: only what hid it is reset", () => {
    // Running hides an idle task; Active shows it, the search that matches stays.
    expect(shown(resolve({ view: { filter: "running", query: "task-1" } })).view).toMatchObject({ filter: "active", query: "task-1" });
    // A dormant workspace needs All.
    expect(shown(resolve({ rows: [row("task-1", { workspaceActivity: "dormant" })], view: { filter: "needs-answer" } })).view.filter).toBe("all");
    // A search that misses the row is cleared; the owner filter that hides it returns to every owner.
    expect(shown(resolve({ view: { query: "billing", owner: "tars" }, owner: "you" })).view).toMatchObject({ query: "", owner: "all", filter: "active" });
    // An unknown owner is not "you": the owner filter is reset too.
    expect(shown(resolve({ view: { owner: "you" }, owner: null })).view.owner).toBe("all");
  });

  test("the cards board judges whole workspaces and opens a folded repository", () => {
    // A live workspace stays under Running even though this task is idle.
    expect(shown(resolve({ layout: "cards", rows: [row("task-1", { workspaceActivity: "live" })], view: { filter: "running" } })).view.filter).toBe("running");
    expect(shown(resolve({ layout: "cards", view: { filter: "blocked" }, blocking: true })).view.filter).toBe("blocked");
    expect(shown(resolve({ layout: "cards", view: { filter: "blocked" } })).view.filter).toBe("active");
    // Another task in the card matches the search, so the card shows and the search stays.
    expect(shown(resolve({ layout: "cards", view: { query: "billing" } })).view.query).toBe("billing");
    // Cards never narrow by owner.
    expect(shown(resolve({ layout: "cards", view: { owner: "tars" } })).view.owner).toBe("tars");
    expect(shown(resolve({ layout: "cards", view: { collapsedRepositories: { "/tmp/repo": true } } })).view.collapsedRepositories)
      .toEqual({ "/tmp/repo": false });
  });

  test("a task that is gone is missing; a list still being read or a workspace not loaded yet waits", () => {
    expect(resolve({ rows: [row("task-2")] }).kind).toBe("missing");
    expect(resolve({ rows: null }).kind).toBe("wait");
    // A Tars execution workspace the renderer has not loaded yet.
    expect(resolve({ workspaceKnown: false }).kind).toBe("waitWorkspace");
  });
});

describe("consuming focus requests", () => {
  afterEach(() => useFleetFocusStore.setState({ request: null }));

  test("a request is consumed once", () => {
    const request = { id: 7 };
    let resolved = 0;
    const show = (): FleetFocusResolution => { resolved += 1; return { kind: "show", taskKey: "k", view: DEFAULT_VIEW }; };
    const first = stepFleetFocus({ request, handledId: null, resolve: show });
    expect(first).toMatchObject({ handledId: 7, clearId: 7, show: { taskKey: "k" }, notice: null });
    const again = stepFleetFocus({ request, handledId: first.handledId, resolve: show });
    expect(again).toEqual({ handledId: 7, show: null, clearId: null, notice: null });
    expect(resolved).toBe(1);
  });

  test("a waiting request is not marked handled; a missing one is cleared without showing", () => {
    expect(stepFleetFocus({ request: { id: 3 }, handledId: null, resolve: () => ({ kind: "wait" }) }))
      .toEqual({ handledId: null, show: null, clearId: null, notice: null });
    expect(stepFleetFocus({ request: { id: 3 }, handledId: null, resolve: () => ({ kind: "missing" }) }))
      .toEqual({ handledId: 3, show: null, clearId: 3, notice: null });
  });

  test("a workspace that has not loaded is waited for, then the request ends with a notice, never silently", () => {
    const waiting = () => ({ kind: "waitWorkspace" }) as const;
    // Still waiting: nothing is cleared, so the workspace appearing later still shows the row.
    expect(stepFleetFocus({ request: { id: 4 }, handledId: null, resolve: waiting }))
      .toEqual({ handledId: null, show: null, clearId: null, notice: null });
    const shownLater = stepFleetFocus({ request: { id: 4 }, handledId: null,
      resolve: () => ({ kind: "show", taskKey: "k", view: DEFAULT_VIEW }) });
    expect(shownLater.show?.taskKey).toBe("k");
    // The wait ran out: the request is cleared and says why.
    expect(stepFleetFocus({ request: { id: 4 }, handledId: null, workspaceWaitOver: true, resolve: waiting }))
      .toEqual({ handledId: 4, show: null, clearId: 4, notice: "workspaceNotLoaded" });
  });

  test("a newer request wins: clearing the older one never swallows it", () => {
    openFleetAt({ workspaceId: "ws-1", taskId: "task-1" });
    const older = useFleetFocusStore.getState().request!;
    openFleetAt({ workspaceId: "ws-1", taskId: "task-2" });
    const newer = useFleetFocusStore.getState().request!;
    expect(newer.id).toBeGreaterThan(older.id);
    expect(newer.taskId).toBe("task-2");
    // The older request settling late leaves the newer one in place.
    clearFleetFocus(older.id);
    expect(useFleetFocusStore.getState().request).toEqual(newer);
    // And the newer one is consumed even right after the older one was handled.
    expect(stepFleetFocus({ request: newer, handledId: older.id, resolve: () => ({ kind: "missing" }) }).clearId).toBe(newer.id);
    clearFleetFocus(newer.id);
    expect(useFleetFocusStore.getState().request).toBeNull();
  });
});
