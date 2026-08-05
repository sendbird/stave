import { describe, expect, test } from "bun:test";
import type { ProviderTurnActivitySnapshot } from "../src/lib/providers/turn-status";
import {
  collectAdoptedTurnsWithoutStallNet,
  createProviderTurnLivenessReporter,
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
