import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";

/**
 * One send whose user row has not entered the transcript yet: a send waiting
 * on Auto's classifier before its turn can start, or an Agent-mode send
 * waiting on the run it started to write its first prompt.
 *
 * The composer has already taken the draft, but the user row only enters the
 * transcript once the turn starts. This entry lets the transcript draw that
 * row — and, for Auto, the route status under it — in the meantime, so the
 * prompt never simply vanishes while the classifier or the run starts.
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
  /**
   * Set for an Agent-mode send. The run, not this send, starts the turn and
   * writes the row, so the composer keeps its Send button: the run bar owns
   * Stop. `missionId` is null until the host has started the run.
   */
  agentRun?: { missionId: string | null };
}

interface PendingAutoRoutingState {
  byTaskId: Record<string, PendingAutoRoute>;
}

/** Whether the task has a send drawn before it is a message, of either kind. */
export function selectHasPendingSend(state: PendingAutoRoutingState, taskId: string): boolean {
  return Boolean(state.byTaskId[taskId]);
}

export const usePendingAutoRoutingStore = create<PendingAutoRoutingState>()(
  () => ({ byTaskId: {} }),
);

/**
 * Returns false when another send for the task already holds the slot. The
 * same send may begin again: a refused agent run hands its row over this way.
 */
export function beginPendingAutoRoute(
  entry: Omit<PendingAutoRoute, "phase" | "skipped">,
): boolean {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  if (current[entry.taskId] && current[entry.taskId]!.id !== entry.id) {
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

/**
 * Draws an Agent-mode send's prompt until its run writes the row. Returns
 * false when another send for the task already holds the slot.
 */
export function beginPendingAgentRun(
  entry: Pick<PendingAutoRoute, "id" | "taskId" | "startedAt" | "userMessage">,
): boolean {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  if (current[entry.taskId]) {
    return false;
  }
  usePendingAutoRoutingStore.setState({
    byTaskId: {
      ...current,
      [entry.taskId]: { ...entry, phase: "starting", skipped: false, agentRun: { missionId: null } },
    },
  });
  return true;
}

/**
 * A run the host refused to start leaves its prompt to a single turn: the row
 * becomes that send's (keyed by its turn id), so it stays in place until the
 * turn's own rows land instead of blinking out in between.
 */
export function handOverPendingAgentRun(args: { taskId: string; id: string; turnId: string }) {
  const current = usePendingAutoRoutingStore.getState().byTaskId;
  const entry = current[args.taskId];
  if (!entry || entry.id !== args.id) {
    return;
  }
  const { agentRun: _agentRun, ...plain } = entry;
  usePendingAutoRoutingStore.setState({
    byTaskId: { ...current, [args.taskId]: { ...plain, id: args.turnId } },
  });
}

/**
 * Whether the pending send holds the composer's turn: Stop and Esc reach a
 * send waiting on Auto. An Agent-mode send belongs to its run, whose bar owns
 * Stop, so the composer keeps Send.
 */
export function holdsComposerTurn(entry: PendingAutoRoute | undefined): boolean {
  return Boolean(entry && !entry.agentRun);
}

/** Whether an Agent-mode send for the task is still waiting on its run. */
export function hasPendingAgentRun(taskId: string): boolean {
  return Boolean(usePendingAutoRoutingStore.getState().byTaskId[taskId]?.agentRun);
}

export function updatePendingAutoRoute(args: {
  taskId: string;
  id: string;
  patch: Partial<Pick<PendingAutoRoute, "phase" | "skipped" | "routedLabel" | "agentRun">>;
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
