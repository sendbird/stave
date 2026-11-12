import { useEffect, type RefObject } from "react";
import type { TarsResponsibility } from "@/lib/tars/types";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import { describeTarsNotifications } from "@/lib/tars/notifications";
import { useTarsSnapshotStore } from "@/store/tars-snapshot-store";
import { clearTarsNotificationFocus, useTarsNotificationFocusStore } from "@/store/tars-notification-focus-store";
import type { TarsDecisionDockController, TarsDockItem } from "./TarsDecisionDock";

/** Wait for hydration, then use the dock's existing selection and keyboard focus. */
export function useTarsNotificationFocus(args: {
  ready: boolean;
  busy: boolean;
  items: readonly TarsDockItem[];
  responsibilities: readonly TarsResponsibility[] | null | undefined;
  dock: RefObject<TarsDecisionDockController | null>;
  openSide?: (target: TarsSideViewTarget) => void;
  focusComposer: () => void;
}) {
  const { ready, busy, items, responsibilities, dock, openSide, focusComposer } = args;
  const request = useTarsNotificationFocusStore((state) => state.request);
  const snapshot = useTarsSnapshotStore((state) => state.snapshot);
  useEffect(() => {
    if (!request || !ready || busy || !snapshot) return;
    const waiting = request.decisionId && describeTarsNotifications(snapshot).some((row) => row.payload.decisionId === request.decisionId);
    if (waiting) {
      // The snapshot may arrive before the conversation that owns this card.
      if (!items.some((item) => item.id === request.decisionId) || !dock.current) return;
      dock.current.show(request.decisionId!);
    } else if (responsibilities?.some((row) => row.id === request.responsibilityId) && openSide) {
      // A result, blocker or a decision that settled since the click opens its work.
      openSide({ responsibilityId: request.responsibilityId, kind: "report" });
    } else focusComposer();
    clearTarsNotificationFocus(request.id);
  }, [request, snapshot, ready, busy, items, responsibilities, dock, openSide, focusComposer]);
}
