import type { ShortcutInput } from "./keyboard-shortcuts";

/** Page zoom bounds and step shared by the app window and Lens guest pages. */
export const MIN_ZOOM_FACTOR = 0.5;
export const MAX_ZOOM_FACTOR = 2;
export const ZOOM_STEP = 0.1;

export type ZoomAction = "in" | "out" | "reset";

/**
 * Map a Cmd/Ctrl +, -, or 0 key press to a zoom action. Returns null for any
 * other input so callers can let it through unchanged.
 */
export function zoomActionFromInput(input: ShortcutInput): ZoomAction | null {
  if (input.type !== "keyDown" || !(input.control || input.meta) || input.alt) {
    return null;
  }
  if (input.key === "+" || input.key === "=" || input.code === "NumpadAdd") {
    return "in";
  }
  if (input.key === "-" || input.code === "NumpadSubtract") {
    return "out";
  }
  if (input.key === "0" || input.code === "Numpad0") {
    return "reset";
  }
  return null;
}

/** The zoom factor after applying one action, clamped to the supported range. */
export function nextZoomFactor(current: number, action: ZoomAction): number {
  if (action === "reset") {
    return 1;
  }
  const raw = action === "in" ? current + ZOOM_STEP : current - ZOOM_STEP;
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, Number(raw.toFixed(2))));
}
