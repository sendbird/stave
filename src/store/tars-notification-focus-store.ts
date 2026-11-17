import { create } from "zustand";
import type { TarsNotificationTarget } from "@/lib/tars/notifications";

export const useTarsNotificationFocusStore = create<{
  request: (TarsNotificationTarget & { id: number }) | null;
}>(() => ({ request: null }));

let nextId = 0;

export function requestTarsNotificationFocus(target: TarsNotificationTarget) {
  useTarsNotificationFocusStore.setState({ request: { ...target, id: ++nextId } });
}

export function clearTarsNotificationFocus(id: number) {
  if (useTarsNotificationFocusStore.getState().request?.id === id) useTarsNotificationFocusStore.setState({ request: null });
}
