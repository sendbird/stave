import { create } from "zustand";
import { useAppStore } from "./app.store";

/** One task row Fleet should show with its control panel open. */
export interface FleetFocusTarget {
  workspaceId: string;
  taskId: string;
}

/**
 * A pending "open Fleet on this row" request from the Tars tray, a flow node
 * or another surface. FleetView consumes it once and clears it by id, so a
 * later request is never swallowed by an earlier one.
 */
export const useFleetFocusStore = create<{ request: (FleetFocusTarget & { id: number }) | null }>(() => ({ request: null }));

let nextRequestId = 0;

/** Opens Fleet on `target`; plain `openFleetView` keeps Fleet's current view. */
export function openFleetAt(target: FleetFocusTarget) {
  nextRequestId += 1;
  useFleetFocusStore.setState({ request: { ...target, id: nextRequestId } });
  useAppStore.getState().openFleetView();
}

/** Called by FleetView after it showed the row (or found it gone). */
export function clearFleetFocus(id: number) {
  if (useFleetFocusStore.getState().request?.id === id) useFleetFocusStore.setState({ request: null });
}
