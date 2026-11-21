import { useAppStore } from "./app.store";
import { create } from "zustand";
import type { TarsNotificationTarget } from "@/lib/tars/notifications";

export const useTarsNotificationFocusStore = create<{
  request: (TarsNotificationTarget & { id: number; destination?: "brief" | "report" | "publish" | "decision" }) | null;
}>(() => ({ request: null }));

let nextId = 0;

export function requestTarsNotificationFocus(target: TarsNotificationTarget) {
  useTarsNotificationFocusStore.setState({ request: { ...target, id: ++nextId } });
}

export function clearTarsNotificationFocus(id: number) {
  if (useTarsNotificationFocusStore.getState().request?.id === id) useTarsNotificationFocusStore.setState({ request: null });
}

export function openTarsAt(target: { kind: "brief" | "report" | "publish"; responsibilityId: string } | { kind: "decision"; responsibilityId: string; decisionId: string }) {
  useTarsNotificationFocusStore.setState({ request: {
    id: ++nextId, responsibilityId: target.responsibilityId, destination: target.kind,
    ...(target.kind === "decision" ? { decisionId: target.decisionId } : {}),
  } });
  useAppStore.getState().openTars();
}
