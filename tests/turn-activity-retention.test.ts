import { describe, expect, test } from "bun:test";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { startProviderTurnActivity } from "@/lib/providers/turn-status";
import { buildTurnActivityFlushPatch } from "@/store/turn-activity-retention";

const TOOL_CALL: NormalizedProviderEvent = {
  type: "tool",
  toolUseId: "tool-1",
  toolName: "Bash",
  input: JSON.stringify({ command: "bun test" }),
  state: "input-available",
};
const TOOL_RESULT: NormalizedProviderEvent = {
  type: "tool_result",
  tool_use_id: "tool-1",
  output: "ok",
};
const DONE: NormalizedProviderEvent = { type: "done" };

function armedTurn() {
  return startProviderTurnActivity({
    activityByTask: {},
    taskId: "task-1",
    turnId: "turn-1",
    providerId: "codex",
    now: 1_000,
  });
}

function flush(args: {
  activityByTask: ReturnType<typeof armedTurn>;
  events: NormalizedProviderEvent[];
  retainedByTask?: Parameters<
    typeof buildTurnActivityFlushPatch
  >[0]["retainedByTask"];
  now: number;
}) {
  return buildTurnActivityFlushPatch({
    activityByTask: args.activityByTask,
    retainedByTask: args.retainedByTask ?? {},
    taskId: "task-1",
    turnId: "turn-1",
    providerId: "codex",
    events: args.events,
    now: args.now,
  });
}

describe("turn activity flush patch", () => {
  test("skips the store write when the flush carried nothing", () => {
    // Provider events flush once per animation frame. A patch here would
    // publish a new state object ~60x/second for turns that changed nothing.
    expect(
      flush({ activityByTask: armedTurn(), events: [], now: 2_000 }),
    ).toBeNull();
  });

  test("publishes the live map alone while the turn is still running", () => {
    const patch = flush({
      activityByTask: armedTurn(),
      events: [TOOL_CALL],
      now: 2_000,
    });

    expect(
      patch?.providerTurnActivityByTask?.["task-1"]?.orderedWorkItemIds,
    ).toEqual(["tool-1"]);
    expect(patch).not.toHaveProperty("retainedTurnActivityByTask");
  });

  test("publishes both maps in the one flush that ends the turn", () => {
    const running = flush({
      activityByTask: armedTurn(),
      events: [TOOL_CALL, TOOL_RESULT],
      now: 2_000,
    })!.providerTurnActivityByTask!;

    const patch = flush({
      activityByTask: running,
      events: [DONE],
      now: 3_000,
    });

    // Both or neither: a separate commit for the replay copy would let the
    // panel render once with the live turn already gone and nothing to replay.
    expect(patch?.providerTurnActivityByTask?.["task-1"]).toBeUndefined();
    expect(
      patch?.retainedTurnActivityByTask?.["task-1"]?.snapshot
        .orderedWorkItemIds,
    ).toEqual(["tool-1"]);
    expect(patch?.retainedTurnActivityByTask?.["task-1"]?.outcome).toBe(
      "completed",
    );
  });

  test("keeps a whole turn that arrived in one batch with its own `done`", () => {
    // The runtime cancels the pending animation-frame flush when `done` lands
    // and drains everything queued behind it, and rAF is paused entirely while
    // the window is hidden — so this batch really can be the whole turn.
    // Reading the retired snapshot back off the live map would replay nothing.
    const patch = flush({
      activityByTask: armedTurn(),
      events: [TOOL_CALL, TOOL_RESULT, DONE],
      now: 3_000,
    });

    const retained = patch?.retainedTurnActivityByTask?.["task-1"];
    expect(retained?.snapshot.orderedWorkItemIds).toEqual(["tool-1"]);
    expect(retained?.snapshot.workItemsById["tool-1"]?.status).toBe(
      "completed",
    );
    expect(retained?.snapshot.completedAt).toBe(3_000);
  });

  test("a failed turn is retained as failed and lingers in the live map", () => {
    const patch = flush({
      activityByTask: armedTurn(),
      events: [
        TOOL_CALL,
        { type: "error", message: "stream closed" },
        DONE,
      ],
      now: 3_000,
    });

    // The failure surface reads the live snapshot for a few seconds before it
    // is cleared, so that entry stays while the replay copy is already taken.
    expect(patch?.providerTurnActivityByTask?.["task-1"]?.turnError).toBe(
      "stream closed",
    );
    expect(patch?.retainedTurnActivityByTask?.["task-1"]?.outcome).toBe(
      "failed",
    );
    expect(
      patch?.retainedTurnActivityByTask?.["task-1"]?.snapshot
        .orderedWorkItemIds,
    ).toEqual(["tool-1"]);
  });
});
