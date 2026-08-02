import { describe, expect, test } from "bun:test";
import {
  classifyFleetWorkspaceActivity,
  compareFleetWorkspaceActivity,
  FLEET_DORMANT_AFTER_MS,
  hasFleetLiveTask,
  isFleetBoardFilterActive,
  isPhantomDefaultWorkspace,
  matchesFleetBoardFilter,
  mergeWorkspaceActivityStamps,
  pruneWorkspaceActivityStamps,
  resolveFleetWorkspaceActivityAt,
  selectFleetOpenTasks,
  stampWorkspaceActive,
} from "@/lib/fleet/workspace-activity";
import type { Task } from "@/types/chat";

const NOW = Date.parse("2026-08-02T00:00:00.000Z");

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    provider: "claude-code",
    updatedAt: "2026-08-01T00:00:00.000Z",
    unread: false,
    controlMode: "interactive",
    controlOwner: "stave",
    ...overrides,
  };
}

describe("selectFleetOpenTasks", () => {
  test("drops archived and legacy branch tasks", () => {
    const open = buildTask({ id: "open" });
    const archived = buildTask({
      id: "archived",
      archivedAt: "2026-07-30T00:00:00.000Z",
    });
    const legacy = buildTask({ id: "legacy", coliseumParentTaskId: "parent" });

    expect(
      selectFleetOpenTasks([open, archived, legacy]).map((task) => task.id),
    ).toEqual(["open"]);
  });
});

describe("hasFleetLiveTask", () => {
  test("requires an active turn as well as a non-idle display status", () => {
    expect(
      hasFleetLiveTask({
        rows: [{ taskId: "task-1", status: "waiting-input" }],
        activeTurnIdsByTask: {},
      }),
    ).toBe(false);
    expect(
      hasFleetLiveTask({
        rows: [{ taskId: "task-1", status: "error" }],
        activeTurnIdsByTask: {},
      }),
    ).toBe(false);
    expect(
      hasFleetLiveTask({
        rows: [{ taskId: "task-1", status: "waiting-input" }],
        activeTurnIdsByTask: { "task-1": "turn-1" },
      }),
    ).toBe(true);
  });

  test("does not call an idle task live even if a stale turn id remains", () => {
    expect(
      hasFleetLiveTask({
        rows: [{ taskId: "task-1", status: "idle" }],
        activeTurnIdsByTask: { "task-1": "turn-1" },
      }),
    ).toBe(false);
  });
});

describe("resolveFleetWorkspaceActivityAt", () => {
  test("prefers the newest signal across the persisted stamp and open tasks", () => {
    expect(
      resolveFleetWorkspaceActivityAt({
        lastActiveAt: "2026-07-20T00:00:00.000Z",
        openTasks: [buildTask({ updatedAt: "2026-07-28T00:00:00.000Z" })],
      }),
    ).toBe("2026-07-28T00:00:00.000Z");
  });

  test("backfills from open tasks when no stamp was ever recorded", () => {
    expect(
      resolveFleetWorkspaceActivityAt({
        lastActiveAt: null,
        openTasks: [buildTask({ updatedAt: "2026-07-28T00:00:00.000Z" })],
      }),
    ).toBe("2026-07-28T00:00:00.000Z");
  });

  test("returns null when nothing usable is available", () => {
    expect(
      resolveFleetWorkspaceActivityAt({
        lastActiveAt: "not-a-date",
        openTasks: [],
      }),
    ).toBeNull();
  });

  test("ignores unparsable task timestamps instead of poisoning the max", () => {
    expect(
      resolveFleetWorkspaceActivityAt({
        lastActiveAt: "2026-07-20T00:00:00.000Z",
        openTasks: [buildTask({ updatedAt: "garbage" })],
      }),
    ).toBe("2026-07-20T00:00:00.000Z");
  });
});

describe("classifyFleetWorkspaceActivity", () => {
  const base = {
    nowMs: NOW,
    hasLiveTask: false,
    hasNeeds: false,
    isActiveWorkspace: false,
  };

  test("a running turn makes the workspace live regardless of timestamps", () => {
    expect(
      classifyFleetWorkspaceActivity({
        ...base,
        activityAt: null,
        hasLiveTask: true,
      }),
    ).toBe("live");
  });

  test("keeps a workspace with needs out of the dormant bucket", () => {
    expect(
      classifyFleetWorkspaceActivity({
        ...base,
        activityAt: "2020-01-01T00:00:00.000Z",
        hasNeeds: true,
      }),
    ).toBe("recent");
  });

  test("keeps the workspace the user is standing in visible", () => {
    expect(
      classifyFleetWorkspaceActivity({
        ...base,
        activityAt: null,
        isActiveWorkspace: true,
      }),
    ).toBe("recent");
  });

  test("treats never-touched workspaces as dormant", () => {
    expect(classifyFleetWorkspaceActivity({ ...base, activityAt: null })).toBe(
      "dormant",
    );
  });

  test("ages out at the dormancy threshold", () => {
    const justInside = new Date(NOW - FLEET_DORMANT_AFTER_MS + 1).toISOString();
    const justOutside = new Date(
      NOW - FLEET_DORMANT_AFTER_MS - 1,
    ).toISOString();

    expect(
      classifyFleetWorkspaceActivity({ ...base, activityAt: justInside }),
    ).toBe("recent");
    expect(
      classifyFleetWorkspaceActivity({ ...base, activityAt: justOutside }),
    ).toBe("dormant");
  });
});

describe("isPhantomDefaultWorkspace", () => {
  const phantom = {
    isDefault: true,
    isCurrentProject: false,
    isActiveWorkspace: false,
    openTaskCount: 0,
    messageCount: 0,
    hasNeeds: false,
    lastActiveAt: null,
    hasResolvedState: true,
  };

  test("suppresses a fabricated default with nothing behind it", () => {
    expect(isPhantomDefaultWorkspace(phantom)).toBe(true);
  });

  test("keeps non-default workspaces", () => {
    expect(isPhantomDefaultWorkspace({ ...phantom, isDefault: false })).toBe(
      false,
    );
  });

  test("keeps a default that has ever been worked in", () => {
    expect(
      isPhantomDefaultWorkspace({
        ...phantom,
        lastActiveAt: "2026-07-30T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  test.each([
    ["the current project", { isCurrentProject: true }],
    ["the active workspace", { isActiveWorkspace: true }],
    ["open tasks", { openTaskCount: 2 }],
    ["pending needs", { hasNeeds: true }],
  ])("keeps a default backed by %s", (_label, overrides) => {
    expect(isPhantomDefaultWorkspace({ ...phantom, ...overrides })).toBe(false);
  });

  test("keeps a default whose tasks are all archived but which has history", () => {
    // messageCount spans archived tasks too, so this is the case the guard
    // exists for: no open work left, but the workspace is clearly not a
    // fabricated row.
    expect(
      isPhantomDefaultWorkspace({
        ...phantom,
        openTaskCount: 0,
        messageCount: 42,
      }),
    ).toBe(false);
  });

  test("never suppresses while the workspace state is unresolved", () => {
    expect(
      isPhantomDefaultWorkspace({ ...phantom, hasResolvedState: false }),
    ).toBe(false);
  });
});

describe("matchesFleetBoardFilter", () => {
  const base = {
    activity: "recent" as const,
    hasBlockingNeed: false,
    searchableText: ["checkout", "Project", "fix/checkout"],
  };

  test("active hides dormant workspaces", () => {
    expect(
      matchesFleetBoardFilter({
        ...base,
        filter: "active",
        activity: "dormant",
      }),
    ).toBe(false);
    expect(matchesFleetBoardFilter({ ...base, filter: "active" })).toBe(true);
  });

  test("all includes dormant workspaces", () => {
    expect(
      matchesFleetBoardFilter({ ...base, filter: "all", activity: "dormant" }),
    ).toBe(true);
  });

  test("running only keeps live workspaces", () => {
    expect(matchesFleetBoardFilter({ ...base, filter: "running" })).toBe(false);
    expect(
      matchesFleetBoardFilter({ ...base, filter: "running", activity: "live" }),
    ).toBe(true);
  });

  test("blocked only keeps workspaces waiting on the user", () => {
    expect(matchesFleetBoardFilter({ ...base, filter: "blocked" })).toBe(false);
    expect(
      matchesFleetBoardFilter({
        ...base,
        filter: "blocked",
        hasBlockingNeed: true,
      }),
    ).toBe(true);
  });

  test("search matches any searchable field, case-insensitively", () => {
    expect(
      matchesFleetBoardFilter({ ...base, filter: "all", query: "FIX/CHECK" }),
    ).toBe(true);
    expect(
      matchesFleetBoardFilter({ ...base, filter: "all", query: "nomatch" }),
    ).toBe(false);
  });

  test("search still respects the active filter", () => {
    expect(
      matchesFleetBoardFilter({
        ...base,
        filter: "active",
        activity: "dormant",
        query: "checkout",
      }),
    ).toBe(false);
  });
});

describe("isFleetBoardFilterActive", () => {
  test("active with no query is the resting state", () => {
    expect(isFleetBoardFilterActive({ filter: "active" })).toBe(false);
    expect(isFleetBoardFilterActive({ filter: "active", query: "   " })).toBe(
      false,
    );
  });

  test("any other filter or a real query counts as active", () => {
    expect(isFleetBoardFilterActive({ filter: "all" })).toBe(true);
    expect(isFleetBoardFilterActive({ filter: "active", query: "x" })).toBe(
      true,
    );
  });
});

describe("compareFleetWorkspaceActivity", () => {
  test("orders live first, then recent, then dormant", () => {
    const entries = [
      { id: "dormant", activity: "dormant" as const, activityAt: null },
      {
        id: "recent",
        activity: "recent" as const,
        activityAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "live",
        activity: "live" as const,
        activityAt: "2020-01-01T00:00:00.000Z",
      },
    ];

    expect(
      [...entries].sort(compareFleetWorkspaceActivity).map((entry) => entry.id),
    ).toEqual(["live", "recent", "dormant"]);
  });

  test("breaks ties on recency, newest first", () => {
    const older = {
      id: "older",
      activity: "recent" as const,
      activityAt: "2026-07-01T00:00:00.000Z",
    };
    const newer = {
      id: "newer",
      activity: "recent" as const,
      activityAt: "2026-07-20T00:00:00.000Z",
    };

    expect(
      [older, newer].sort(compareFleetWorkspaceActivity).map((e) => e.id),
    ).toEqual(["newer", "older"]);
  });

  test("sorts a workspace with no recorded activity after one with a stamp", () => {
    const stamped = {
      activity: "recent" as const,
      activityAt: "2026-07-01T00:00:00.000Z",
    };
    const unstamped = { activity: "recent" as const, activityAt: null };

    expect(compareFleetWorkspaceActivity(stamped, unstamped)).toBeLessThan(0);
  });
});

describe("stampWorkspaceActive", () => {
  test("records a stamp for the workspace", () => {
    expect(
      stampWorkspaceActive({
        current: {},
        workspaceId: "ws-1",
        at: "2026-08-01T00:00:00.000Z",
      }),
    ).toEqual({ "ws-1": "2026-08-01T00:00:00.000Z" });
  });

  test("returns the same reference when nothing changes", () => {
    const current = { "ws-1": "2026-08-01T00:00:00.000Z" };
    expect(
      stampWorkspaceActive({
        current,
        workspaceId: "ws-1",
        at: "2026-08-01T00:00:00.000Z",
      }),
    ).toBe(current);
  });

  test("ignores a missing or blank workspace id", () => {
    const current = {};
    expect(stampWorkspaceActive({ current, workspaceId: "  " })).toBe(current);
    expect(stampWorkspaceActive({ current, workspaceId: null })).toBe(current);
  });
});

describe("mergeWorkspaceActivityStamps", () => {
  test("keeps the newest stamp per workspace regardless of argument order", () => {
    const older = { "ws-1": "2026-07-01T00:00:00.000Z" };
    const newer = { "ws-1": "2026-07-20T00:00:00.000Z" };

    expect(mergeWorkspaceActivityStamps(older, newer)).toEqual(newer);
    expect(mergeWorkspaceActivityStamps(newer, older)).toEqual(newer);
  });

  test("unions disjoint maps and tolerates undefined", () => {
    expect(
      mergeWorkspaceActivityStamps(
        { "ws-1": "2026-07-01T00:00:00.000Z" },
        undefined,
        { "ws-2": "2026-07-02T00:00:00.000Z" },
      ),
    ).toEqual({
      "ws-1": "2026-07-01T00:00:00.000Z",
      "ws-2": "2026-07-02T00:00:00.000Z",
    });
  });
});

describe("pruneWorkspaceActivityStamps", () => {
  test("drops stamps for workspaces the app forgot", () => {
    expect(
      pruneWorkspaceActivityStamps({
        current: {
          "ws-1": "2026-07-01T00:00:00.000Z",
          "ws-gone": "2026-07-01T00:00:00.000Z",
        },
        knownWorkspaceIds: new Set(["ws-1"]),
      }),
    ).toEqual({ "ws-1": "2026-07-01T00:00:00.000Z" });
  });

  test("returns the same reference when every stamp is still known", () => {
    const current = { "ws-1": "2026-07-01T00:00:00.000Z" };
    expect(
      pruneWorkspaceActivityStamps({
        current,
        knownWorkspaceIds: new Set(["ws-1"]),
      }),
    ).toBe(current);
  });
});
