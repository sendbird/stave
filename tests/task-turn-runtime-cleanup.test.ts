import { describe, expect, test } from "bun:test";
import type { AutoRoutingDecisionRecord } from "@/lib/routing/auto-routing";
import {
  removeTaskTurnRuntimeEntries,
  type TaskTurnRuntimeEntries,
} from "@/store/task-turn-runtime-cleanup";

function decisionRecord(): AutoRoutingDecisionRecord {
  return {
    decision: {} as AutoRoutingDecisionRecord["decision"],
    resolvedAt: "2026-10-17T00:00:00.000Z",
    promptPreview: "fix the bug",
  };
}

function emptyEntries(): TaskTurnRuntimeEntries {
  return {
    providerTurnActivityByTask: {},
    retainedTurnActivityByTask: {},
    hostOwnedTurnIdsByTask: {},
    failedSendsByTask: {},
    usageLimitPauseByTask: {},
    restoredQueueReleasedByTask: {},
    autoRoutingDecisionByTask: {},
  };
}

describe("removeTaskTurnRuntimeEntries", () => {
  test("drops the auto-routing decision of a removed task and keeps the others", () => {
    const kept = decisionRecord();
    const state = {
      ...emptyEntries(),
      autoRoutingDecisionByTask: {
        "task-gone": decisionRecord(),
        "task-live": kept,
      },
    };

    const patch = removeTaskTurnRuntimeEntries({
      state,
      taskIds: ["task-gone"],
    });

    expect(patch.autoRoutingDecisionByTask).toEqual({ "task-live": kept });
  });

  test("returns no patch for maps that hold none of the removed tasks", () => {
    const state = {
      ...emptyEntries(),
      autoRoutingDecisionByTask: { "task-live": decisionRecord() },
    };

    const patch = removeTaskTurnRuntimeEntries({
      state,
      taskIds: ["task-gone"],
    });

    expect(patch).toEqual({});
  });
});
