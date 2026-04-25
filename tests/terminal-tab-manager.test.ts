import { describe, expect, test } from "bun:test";
import {
  pruneTerminalTabManagerRecord,
  resolveMountedTerminalTabKeys,
} from "../src/components/layout/useTerminalTabManager";

describe("pruneTerminalTabManagerRecord", () => {
  test("drops state for tabs that are no longer live", () => {
    expect(pruneTerminalTabManagerRecord(
      {
        "ws-a:tab-1": 1,
        "ws-a:tab-2": 2,
        "ws-b:tab-3": 3,
      },
      new Set(["ws-a:tab-1", "ws-b:tab-3"]),
    )).toEqual({
      "ws-a:tab-1": 1,
      "ws-b:tab-3": 3,
    });
  });
});

describe("resolveMountedTerminalTabKeys", () => {
  test("mounts the active tab once the surface becomes visible", () => {
    expect(resolveMountedTerminalTabKeys({
      mountedTabKeys: {},
      liveTabKeys: new Set(["ws-a:tab-1"]),
      activeTabKey: "ws-a:tab-1",
      isVisible: true,
    })).toEqual({
      "ws-a:tab-1": true,
    });
  });

  test("does not eagerly mount hidden tabs", () => {
    expect(resolveMountedTerminalTabKeys({
      mountedTabKeys: {},
      liveTabKeys: new Set(["ws-a:tab-1"]),
      activeTabKey: "ws-a:tab-1",
      isVisible: false,
    })).toEqual({});
  });

  test("preserves existing mounted tabs while pruning removed ones", () => {
    expect(resolveMountedTerminalTabKeys({
      mountedTabKeys: {
        "ws-a:tab-1": true,
        "ws-a:tab-2": true,
      },
      liveTabKeys: new Set(["ws-a:tab-2", "ws-a:tab-3"]),
      activeTabKey: "ws-a:tab-3",
      isVisible: true,
    })).toEqual({
      "ws-a:tab-2": true,
      "ws-a:tab-3": true,
    });
  });
});
