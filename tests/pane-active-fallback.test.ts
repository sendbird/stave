import { describe, expect, test } from "bun:test";
import { resolveFallbackActivePanelId } from "../src/components/panes/pane-active-fallback";

describe("resolveFallbackActivePanelId", () => {
  test("keeps the panel Dockview already activated", () => {
    expect(
      resolveFallbackActivePanelId({
        activePanelId: "term:a",
        panelIds: ["task:t-1", "term:a"],
      }),
    ).toBe("term:a");
  });

  test("prefers a non-terminal panel when nothing is active", () => {
    expect(
      resolveFallbackActivePanelId({
        activePanelId: null,
        panelIds: ["term:a", "cli:c-1", "task:t-1"],
      }),
    ).toBe("cli:c-1");
  });

  test("falls back to the first panel when only terminals remain", () => {
    expect(
      resolveFallbackActivePanelId({
        activePanelId: null,
        panelIds: ["term:a", "term:b"],
      }),
    ).toBe("term:a");
  });

  test("skips unparsable panel ids when looking for a non-terminal", () => {
    expect(
      resolveFallbackActivePanelId({
        activePanelId: null,
        panelIds: ["nonsense", "term:a", "task:t-1"],
      }),
    ).toBe("task:t-1");
  });

  test("returns null for an empty dock", () => {
    expect(
      resolveFallbackActivePanelId({ activePanelId: null, panelIds: [] }),
    ).toBeNull();
  });
});
