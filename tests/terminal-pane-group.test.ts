import { describe, expect, test } from "bun:test";
import {
  TERMINAL_GROUP_MIN_HEIGHT,
  findTerminalPanelIds,
  resolveTerminalGroupHeight,
  resolveTerminalPanelPosition,
} from "../src/components/panes/terminal-pane-group";

describe("findTerminalPanelIds", () => {
  test("keeps only terminal panel ids, preserving order", () => {
    expect(
      findTerminalPanelIds([
        "task:t-1",
        "term:a",
        "cli:c-1",
        "term:b",
        "editor:file:/x.ts",
      ]),
    ).toEqual(["term:a", "term:b"]);
  });

  test("ignores unparsable panel ids", () => {
    expect(findTerminalPanelIds(["nonsense", ":", "term:"])).toEqual([]);
  });
});

describe("resolveTerminalPanelPosition", () => {
  test("splits a new bottom group when no terminal panel exists", () => {
    expect(
      resolveTerminalPanelPosition(["task:t-1", "cli:c-1"]),
    ).toEqual({ direction: "below" });
  });

  test("splits a new bottom group for an empty dock", () => {
    expect(resolveTerminalPanelPosition([])).toEqual({ direction: "below" });
  });

  test("joins the most recent terminal panel's group when one exists", () => {
    expect(
      resolveTerminalPanelPosition(["task:t-1", "term:a", "term:b"]),
    ).toEqual({ referencePanelId: "term:b", direction: "within" });
  });
});

describe("resolveTerminalGroupHeight", () => {
  test("targets ~30% of the dock height", () => {
    expect(resolveTerminalGroupHeight(1000)).toBe(300);
  });

  test("clamps small docks to the minimum without exceeding the dock", () => {
    expect(resolveTerminalGroupHeight(400)).toBe(TERMINAL_GROUP_MIN_HEIGHT);
    expect(resolveTerminalGroupHeight(100)).toBe(100);
  });

  test("returns null before the dock has been laid out", () => {
    expect(resolveTerminalGroupHeight(0)).toBeNull();
    expect(resolveTerminalGroupHeight(Number.NaN)).toBeNull();
    expect(resolveTerminalGroupHeight(-50)).toBeNull();
  });
});
