import { describe, expect, test } from "bun:test";
import {
  EMPTY_SURFACE_HISTORY,
  findSurfaceHistoryStep,
  moveSurfaceHistory,
  recordSurfaceVisit,
  type SurfaceHistory,
  type SurfaceHistoryLocation,
} from "@/lib/panes/surface-history";

const at = (workspaceId: string, taskId: string): SurfaceHistoryLocation => ({
  repositoryPath: "/tmp/repo",
  workspaceId,
  surface: { kind: "task", taskId },
});

function visitAll(locations: SurfaceHistoryLocation[], limit?: number) {
  return locations.reduce<SurfaceHistory>(
    (history, location) => recordSurfaceVisit(history, location, limit),
    EMPTY_SURFACE_HISTORY,
  );
}

describe("surface history", () => {
  test("records visits and ignores a repeat of the current entry", () => {
    const history = visitAll([at("ws", "a"), at("ws", "a"), at("ws", "b")]);
    expect(history.entries).toEqual([at("ws", "a"), at("ws", "b")]);
    expect(history.index).toBe(1);
  });

  test("goes back and forward across workspaces", () => {
    let history = visitAll([at("ws-1", "a"), at("ws-2", "b"), at("ws-2", "c")]);
    const back = findSurfaceHistoryStep(history, "back", () => true);
    expect(back?.location).toEqual(at("ws-2", "b"));
    history = moveSurfaceHistory(history, back!.index);
    history = moveSurfaceHistory(history, findSurfaceHistoryStep(history, "back", () => true)!.index);
    expect(history.entries[history.index]).toEqual(at("ws-1", "a"));
    expect(findSurfaceHistoryStep(history, "back", () => true)).toBeNull();
    expect(findSurfaceHistoryStep(history, "forward", () => true)?.location).toEqual(at("ws-2", "b"));
  });

  test("a new visit after going back drops the forward entries", () => {
    let history = visitAll([at("ws", "a"), at("ws", "b"), at("ws", "c")]);
    history = moveSurfaceHistory(history, 0);
    history = recordSurfaceVisit(history, at("ws", "d"));
    expect(history.entries).toEqual([at("ws", "a"), at("ws", "d")]);
    expect(findSurfaceHistoryStep(history, "forward", () => true)).toBeNull();
  });

  test("skips entries that can no longer be reached", () => {
    const history = visitAll([at("ws", "a"), at("ws", "deleted"), at("ws", "c")]);
    const step = findSurfaceHistoryStep(
      history,
      "back",
      (location) => location.surface.kind !== "task" || location.surface.taskId !== "deleted",
    );
    expect(step).toEqual({ index: 0, location: at("ws", "a") });
  });

  test("is bounded and keeps the newest entries", () => {
    const history = visitAll(
      Array.from({ length: 8 }, (_, index) => at("ws", `t${index}`)),
      5,
    );
    expect(history.entries.map((entry) => (entry.surface as { taskId: string }).taskId)).toEqual([
      "t3",
      "t4",
      "t5",
      "t6",
      "t7",
    ]);
    expect(history.index).toBe(4);
  });

  test("an empty history has nowhere to go", () => {
    expect(findSurfaceHistoryStep(EMPTY_SURFACE_HISTORY, "back", () => true)).toBeNull();
    expect(moveSurfaceHistory(EMPTY_SURFACE_HISTORY, 3)).toBe(EMPTY_SURFACE_HISTORY);
  });
});
