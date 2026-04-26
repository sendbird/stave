import { describe, expect, test } from "bun:test";
import { resolveStaveMuseRightInset } from "@/components/layout/stave-muse-widget.utils";

describe("resolveStaveMuseRightInset", () => {
  test("returns zero when Lens is not visible", () => {
    expect(resolveStaveMuseRightInset({
      hasProjectContext: true,
      isLargeViewport: true,
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "information",
      showDesktopSidebar: true,
      desktopSidebarWidth: 320,
      overlayRightPanelMode: null,
      viewportWidth: 1440,
    })).toBe(0);
  });

  test("offsets the assistant past the desktop Lens panel and right rail", () => {
    expect(resolveStaveMuseRightInset({
      hasProjectContext: true,
      isLargeViewport: true,
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "lens",
      showDesktopSidebar: true,
      desktopSidebarWidth: 320,
      overlayRightPanelMode: null,
      viewportWidth: 1440,
    })).toBe(388);
  });

  test("offsets the assistant past the compact Lens overlay and right rail", () => {
    expect(resolveStaveMuseRightInset({
      hasProjectContext: true,
      isLargeViewport: false,
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "lens",
      showDesktopSidebar: false,
      desktopSidebarWidth: 320,
      overlayRightPanelMode: "sidebar",
      viewportWidth: 600,
    })).toBe(396);
  });

  test("does not offset when the overlay is showing the editor instead of Lens", () => {
    expect(resolveStaveMuseRightInset({
      hasProjectContext: true,
      isLargeViewport: false,
      sidebarOverlayVisible: true,
      sidebarOverlayTab: "lens",
      showDesktopSidebar: false,
      desktopSidebarWidth: 320,
      overlayRightPanelMode: "editor",
      viewportWidth: 600,
    })).toBe(0);
  });
});
