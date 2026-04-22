import type { RightRailPanelId } from "@/lib/right-rail-panels";

const MOBILE_RIGHT_RAIL_WIDTH_PX = 48;
const DESKTOP_RIGHT_RAIL_WIDTH_PX = 56;
const LENS_OVERLAY_MAX_WIDTH_PX = 352;
const LENS_OVERLAY_VIEWPORT_RATIO = 0.56;
const ASSISTANT_LENS_GAP_PX = 12;

export function resolveStaveMuseRightInset(args: {
  hasProjectContext: boolean;
  isLargeViewport: boolean;
  sidebarOverlayVisible: boolean;
  sidebarOverlayTab: RightRailPanelId;
  showDesktopSidebar: boolean;
  desktopSidebarWidth: number;
  overlayRightPanelMode: "editor" | "sidebar" | null;
  viewportWidth: number;
}) {
  if (!args.hasProjectContext) {
    return 0;
  }

  const lensVisible = args.sidebarOverlayVisible && args.sidebarOverlayTab === "lens";
  if (!lensVisible) {
    return 0;
  }

  const rightRailWidth = args.isLargeViewport
    ? DESKTOP_RIGHT_RAIL_WIDTH_PX
    : MOBILE_RIGHT_RAIL_WIDTH_PX;

  if (args.showDesktopSidebar) {
    return rightRailWidth + args.desktopSidebarWidth + ASSISTANT_LENS_GAP_PX;
  }

  if (args.overlayRightPanelMode === "sidebar") {
    const overlayWidth = Math.min(
      LENS_OVERLAY_MAX_WIDTH_PX,
      Math.round(args.viewportWidth * LENS_OVERLAY_VIEWPORT_RATIO),
    );
    return rightRailWidth + overlayWidth + ASSISTANT_LENS_GAP_PX;
  }

  return 0;
}
