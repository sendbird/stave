import { describe, expect, test } from "bun:test";
import { buildRunProgress, formatRunProgressLabel } from "../src/lib/fleet/run-progress";
import {
  markProviderTurnStalled,
  type ProviderTurnActivitySnapshot,
} from "../src/lib/providers/turn-status";
import {
  adoptRestoredTurnsIntoStallNet,
  collectAdoptedTurnsWithoutStallNet,
  createProviderTurnLivenessReporter,
  resolvePersistedTurnStartedAt,
} from "../src/store/provider-turn-stall-rearm";
import type { Task } from "../src/types/chat";

function buildActivity(args: {
  turnId: string;
}): ProviderTurnActivitySnapshot {
  return {
    turnId: args.turnId,
    providerId: "claude-code",
    startedAt: 1000,
    lastEventAt: 2000,
    stalledAt: null,
    pendingInteraction: null,
    workItemsById: {},
    orderedWorkItemIds: [],
  };
}

function buildTask(args: {
  id: string;
  provider?: Task["provider"];
}): Pick<Task, "id" | "provider"> {
  return {
    id: args.id,
    provider: args.provider ?? "claude-code",
  };
}

describe("createProviderTurnLivenessReporter", () => {
  test("re-arms the stall timer for the turn that is actually live", () => {
    const scheduled: Array<{ taskId: string; turnId: string; lastEventAt: number }> =
      [];
    const report = createProviderTurnLivenessReporter({
      getActivityByTask: () => ({ "task-a": buildActivity({ turnId: "turn-a" }) }),
      scheduleStallTimer: (target) => scheduled.push(target),
      now: () => 5000,
    });

    report({ taskId: "task-a", turnId: "turn-a" });

    expect(scheduled).toEqual([
      { taskId: "task-a", turnId: "turn-a", lastEventAt: 5000 },
    ]);
  });

  test("ignores an event for a turn that is no longer tracked", () => {
    // A late event arriving after the turn was cleared (done / abort) must not
    // resurrect a stray timer for it.
    const scheduled: string[] = [];
    const report = createProviderTurnLivenessReporter({
      getActivityByTask: () => ({ "task-a": buildActivity({ turnId: "turn-new" }) }),
      scheduleStallTimer: (target) => scheduled.push(target.turnId),
    });

    report({ taskId: "task-a", turnId: "turn-old" });
    report({ taskId: "task-b", turnId: "turn-new" });

    expect(scheduled).toEqual([]);
  });
});

describe("collectAdoptedTurnsWithoutStallNet", () => {
  test("reports in-flight turns restored from persistence with nothing watching them", () => {
    // Regression: a session rebuilt from the database restores
    // `activeTurnIdsByTask` from every turn row without a `completedAt`, but the
    // stall / auto-abort timers live only in renderer memory. Such a turn was
    // displayed as active while nothing watched it — if its owner died mid-turn
    // the task stayed "active" forever and pinned its workspace in the sidebar.
    const adopted = collectAdoptedTurnsWithoutStallNet({
      tasks: [
        buildTask({ id: "task-a", provider: "codex" }),
        buildTask({ id: "task-b" }),
      ],
      activeTurnIdsByTask: {
        "task-a": "turn-a",
        "task-b": "turn-b",
      },
      activityByTask: {},
    });

    expect(adopted).toEqual([
      { taskId: "task-a", turnId: "turn-a", providerId: "codex" },
      { taskId: "task-b", turnId: "turn-b", providerId: "claude-code" },
    ]);
  });

  test("skips turns already covered by a live activity snapshot", () => {
    // Re-seeding one of these would reset a stall marker that is legitimately
    // set, and whatever created the snapshot already armed a timer with it.
    const adopted = collectAdoptedTurnsWithoutStallNet({
      tasks: [buildTask({ id: "task-a" })],
      activeTurnIdsByTask: { "task-a": "turn-a" },
      activityByTask: {
        "task-a": { ...buildActivity({ turnId: "turn-a" }), stalledAt: 3000 },
      },
    });

    expect(adopted).toEqual([]);
  });

  test("adopts a turn whose snapshot belongs to a superseded turn", () => {
    const adopted = collectAdoptedTurnsWithoutStallNet({
      tasks: [buildTask({ id: "task-a" })],
      activeTurnIdsByTask: { "task-a": "turn-new" },
      activityByTask: {
        "task-a": buildActivity({ turnId: "turn-old" }),
      },
    });

    expect(adopted).toEqual([
      { taskId: "task-a", turnId: "turn-new", providerId: "claude-code" },
    ]);
  });

  test("ignores tasks with no in-flight turn", () => {
    expect(
      collectAdoptedTurnsWithoutStallNet({
        tasks: [buildTask({ id: "task-a" }), buildTask({ id: "task-b" })],
        activeTurnIdsByTask: { "task-a": undefined },
        activityByTask: {},
      }),
    ).toEqual([]);
  });
});

describe("adoptRestoredTurnsIntoStallNet", () => {
  const TURN_CREATED_AT = "2026-10-28T10:00:00.000Z";
  const RESTORED_AT = Date.parse(TURN_CREATED_AT) + 10 * 60_000;

  function restore(provider: Task["provider"], latestTurns?: Array<{ id: string; createdAt: string }>) {
    let activityByTask: Record<string, ProviderTurnActivitySnapshot | undefined> = {};
    const scheduled: Array<{ taskId: string; turnId: string; lastEventAt: number }> = [];
    adoptRestoredTurnsIntoStallNet({
      tasks: [buildTask({ id: "task-a", provider })],
      activeTurnIdsByTask: { "task-a": "turn-a" },
      getActivityByTask: () => activityByTask,
      applyActivityPatch: (updater) => {
        activityByTask = updater(activityByTask).providerTurnActivityByTask;
      },
      scheduleStallTimer: (target) => scheduled.push(target),
      latestTurns,
      now: RESTORED_AT,
    });
    return { activityByTask, scheduled };
  }

  test.each(["claude-code", "codex"] as const)(
    "%s: a reload keeps the turn's run time and measures quiet time from the restore",
    (provider) => {
      const { activityByTask, scheduled } = restore(provider, [{ id: "turn-a", createdAt: TURN_CREATED_AT }]);
      const activity = activityByTask["task-a"]!;
      expect(activity.providerId).toBe(provider);
      const working = buildRunProgress({ activity, activeTurnId: "turn-a", now: RESTORED_AT })!;
      expect(formatRunProgressLabel(working)).toBe("Working · 10m");

      // The stall net still starts at the restore: nothing has been heard
      // since then, not since the turn began.
      expect(activity.lastEventAt).toBe(RESTORED_AT);
      expect(scheduled).toEqual([{ taskId: "task-a", turnId: "turn-a", lastEventAt: RESTORED_AT }]);
      const stalled = markProviderTurnStalled({
        activityByTask,
        taskId: "task-a",
        turnId: "turn-a",
        now: RESTORED_AT + 5 * 60_000,
      })["task-a"]!;
      const quiet = buildRunProgress({ activity: stalled, activeTurnId: "turn-a", now: RESTORED_AT + 6 * 60_000 })!;
      expect(formatRunProgressLabel(quiet)).toBe("No output · 6m");
    },
  );

  test("without a readable turn row the run time starts at the restore", () => {
    for (const latestTurns of [undefined, [{ id: "turn-other", createdAt: TURN_CREATED_AT }], [{ id: "turn-a", createdAt: "not a date" }]]) {
      expect(restore("claude-code", latestTurns).activityByTask["task-a"]?.startedAt).toBe(RESTORED_AT);
    }
  });

  test("a turn row dated after the restore never makes the run time negative", () => {
    const future = new Date(RESTORED_AT + 60_000).toISOString();
    expect(resolvePersistedTurnStartedAt([{ id: "turn-a", createdAt: future }], "turn-a")).toBe(RESTORED_AT + 60_000);
    expect(restore("codex", [{ id: "turn-a", createdAt: future }]).activityByTask["task-a"]?.startedAt).toBe(RESTORED_AT);
  });
});
