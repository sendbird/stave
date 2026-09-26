import { expect, test } from "bun:test";
import { RIGHT_RAIL_PANEL_TITLES } from "../src/lib/right-rail-panels";
import { normalizeSidebarOverlayTab } from "../src/store/layout.utils";

test("a saved layout that names the old collaboration panel opens the Mission panel", () => {
  expect(normalizeSidebarOverlayTab("collaboration")).toBe("mission");
  expect(RIGHT_RAIL_PANEL_TITLES.mission).toBe("Mission");
  expect(normalizeSidebarOverlayTab("results")).toBe("results");
  expect(normalizeSidebarOverlayTab("something-else")).toBe("explorer");
  expect(normalizeSidebarOverlayTab(undefined)).toBe("explorer");
});
