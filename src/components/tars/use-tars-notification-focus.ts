import { useEffect, useState, type RefObject } from "react";
import type { TarsResponsibility } from "@/lib/tars/types";
import type { TarsSideViewTarget } from "@/lib/tars/side-view";
import { collectTarsAttention } from "@/lib/tars/attention";
import { isTarsPublishable } from "@/lib/tars/publish-model";
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
  openPublish?: (row: TarsResponsibility) => void;
  openSide?: (target: TarsSideViewTarget) => void;
  focusComposer: () => void;
}) {
  const { ready, busy, items, responsibilities, dock, openSide, openPublish, focusComposer } = args;
  const request = useTarsNotificationFocusStore((state) => state.request);
  const snapshot = useTarsSnapshotStore((state) => state.snapshot);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!request || !ready || busy || !snapshot) return;
    const row = responsibilities?.find(item => item.id === request.responsibilityId);
    const decisionId = request.decisionId;
    const waiting = decisionId && collectTarsAttention(snapshot).some(signal => signal.decisionId === decisionId);
    const card = waiting && items.some(item => item.id === decisionId);
    if (card && dock.current) {
      // Opening from a sheet lets its focus restoration finish before focusing the exact card.
      const frame = requestAnimationFrame(() => {
        dock.current?.show(decisionId);
        setUnavailable(false);
        clearTarsNotificationFocus(request.id);
      });
      return () => cancelAnimationFrame(frame);
    }
    // The snapshot can arrive before the conversation that carries the waiting card.
    if (waiting && (!request.destination || request.destination === "decision")) return;
    const unavailable = !row || request.destination === "decision" ||
      (request.destination === "publish" && !(openPublish && isTarsPublishable(row)));
    setUnavailable(unavailable);
    if (!unavailable && row) {
      if (request.destination === "publish") openPublish?.(row);
      else openSide?.({ responsibilityId: row.id, kind: request.destination === "brief" ? "brief" : "report" });
    } else focusComposer();
    clearTarsNotificationFocus(request.id);
  }, [request, snapshot, ready, busy, items, responsibilities, dock, openSide, openPublish, focusComposer]);
  return unavailable;
}
