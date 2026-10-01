import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";

/**
 * One send that is waiting on Auto's classifier before its turn can start.
 *
 * The composer has already taken the draft, but the user row only enters the
 * transcript once the turn starts. This entry lets the transcript draw that
 * row — and the route status under it — in the meantime, so the prompt never
 * simply vanishes while the classifier runs.
 *
 * Kept outside the persisted app store on purpose: an entry lives for seconds,
 * must never reach disk, and only the transcript tail and the composer read it.
 */
export interface PendingAutoRoute {
  /** The turn id this send will start; a late `end` for another send is ignored. */
  id: string;
  taskId: string;
  startedAt: number;
  /** The user row the turn will insert, drawn early with the same content. */
  userMessage: ChatMessage;
  /** `classifying` until the router answers, `starting` while the turn is assembled. */
  phase: "classifying" | "starting";
  /** The user chose to start on local rules instead of waiting. */
  skipped: boolean;
  /** `Opus 5 · High` once the router has answered. */
  routedLabel?: string;
}

interface PendingAutoRoutingState {
  byTaskId: Record<string, PendingAutoRoute>;
}

export const usePendingAutoRoutingStore = create<PendingAutoRoutingState>()(
  () => ({ byTaskId: {} }),
);

/** Returns false when another send for the task already holds the slot. */
export function beginPendingAutoRoute(
  entry: Omit<PendingAutoRoute, "phase" | "skipped">,
): boolean {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  if (current[entry.taskId]) {
    return false;
  }
  usePendingAutoRoutingStore.setState({
    byTaskId: {
      ...current,
      [entry.taskId]: { ...entry, phase: "classifying", skipped: false },
    },
  });
  return true;
}

export function updatePendingAutoRoute(args: {
  taskId: string;
  id: string;
  patch: Partial<Pick<PendingAutoRoute, "phase" | "skipped" | "routedLabel">>;
}) {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  const entry = current[args.taskId];
  if (!entry || entry.id !== args.id) {
    return;
  }
  usePendingAutoRoutingStore.setState({
    byTaskId: { ...current, [args.taskId]: { ...entry, ...args.patch } },
  });
}

export function endPendingAutoRoute(args: { taskId: string; id: string }) {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  if (current[args.taskId]?.id !== args.id) {
    return;
  }
  const { [args.taskId]: _ended, ...rest } = current;
  usePendingAutoRoutingStore.setState({ byTaskId: rest });
}
