import { describe, expect, test } from "bun:test";
import { workspaceHasActiveTurns } from "@/lib/notifications/notification.types";

describe("workspaceHasActiveTurns", () => {
  test("returns true when any task in the workspace still has an active turn", () => {
    expect(workspaceHasActiveTurns({
      activeTurnIdsByTask: {
        taskA: undefined,
        taskB: "turn-b",
      },
    })).toBe(true);
  });

  test("returns false once every workspace task has cleared its active turn", () => {
    expect(workspaceHasActiveTurns({
      activeTurnIdsByTask: {
        taskA: undefined,
        taskB: undefined,
      },
    })).toBe(false);
  });
});
