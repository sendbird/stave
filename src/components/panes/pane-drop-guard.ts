import { parsePanePanelId } from "@/lib/panes/types";

export interface PaneDropLocation {
  kind: "tab" | "header_space" | "content" | "edge";
  position: "top" | "bottom" | "left" | "right" | "center";
  group?: {
    panels: ReadonlyArray<{ id: string }>;
  };
}

/**
 * The primary task tab bar anchors the workspace. Panels may still be
 * reordered or split beside/below it, but cannot create a new row above it.
 */
export function shouldPreventPaneDropAboveTaskBar(
  location: PaneDropLocation,
): boolean {
  if (location.position !== "top") {
    return false;
  }
  if (location.kind === "edge") {
    return true;
  }
  return (
    location.group?.panels.some(
      (panel) => parsePanePanelId(panel.id)?.kind === "task",
    ) ?? false
  );
}
