import { z } from "zod";

export const TurnAdmissionWaitSchema = z.object({ taskId: z.string().min(1).max(200), waiting: z.boolean() }).strict();
export const TurnAdmissionWaitResultSchema = z.object({ ok: z.literal(true) }).strict();
export type TurnAdmissionState = { state: "queued" | "running"; ahead: number };
export interface AdmissionIntent { turnId: string; taskId?: string; priority: "user" | "automatic" }
interface Pending {
  intent: AdmissionIntent;
  resolve: () => void;
  reject: (error: Error) => void;
  changed?: (state: TurnAdmissionState) => void;
  ahead?: number;
  /** A turn that already ran and is taking its slot back after a wait; never a fresh start. */
  reacquire?: boolean;
}

/** One host-owned semaphore shared by all primary provider entry points. */
export function createTurnAdmission(deps: {
  limit: () => number | null;
  /**
   * `queued` holds fresh starts only. `started` holds every turn that already
   * ran: running, suspended by a wait, or waiting to take its slot back.
   */
  save: (queued: AdmissionIntent[], started: string[]) => void;
}) {
  const running = new Map<string, AdmissionIntent>();
  const suspended = new Map<string, AdmissionIntent>();
  /** Open waits per suspended turn; its slot comes back only when the last one ends. */
  const waits = new Map<string, number>();
  const queue: Pending[] = [];
  const observers = new Map<string, NonNullable<Pending["changed"]>>();
  let frozen = false;
  const persist = () => deps.save(
    queue.filter(row => !row.reacquire).map(row => row.intent),
    [...running.keys(), ...suspended.keys(), ...queue.filter(row => row.reacquire).map(row => row.intent.turnId)],
  );
  function notify() { queue.forEach((row, ahead) => { if (row.ahead !== ahead) { row.ahead = ahead; row.changed?.({ state: "queued", ahead }); } }); }
  function drain() {
    const limit = deps.limit();
    while (!frozen && queue.length && (limit === null || running.size < limit)) {
      const row = queue.shift()!;
      running.set(row.intent.turnId, row.intent);
      persist();
      row.changed?.({ state: "running", ahead: 0 });
      row.resolve();
    }
    persist();
    notify();
  }
  function enqueue(pending: Pending) {
    const firstAutomatic = queue.findIndex(row => row.intent.priority === "automatic");
    if (pending.intent.priority === "user" && firstAutomatic >= 0) queue.splice(firstAutomatic, 0, pending);
    else queue.push(pending);
  }
  function acquire(intent: AdmissionIntent, changed?: Pending["changed"]) {
    if (running.has(intent.turnId) || suspended.has(intent.turnId) || queue.some(row => row.intent.turnId === intent.turnId)) return Promise.reject(new Error("duplicateTurnAdmission"));
    return new Promise<void>((resolve, reject) => {
      if (changed) observers.set(intent.turnId, changed);
      const pending: Pending = { intent, resolve, reject, changed: changed ?? observers.get(intent.turnId) };
      enqueue(pending);
      try { persist(); drain(); } catch (error) {
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
        running.delete(intent.turnId);
        observers.delete(intent.turnId);
        reject(error);
      }
    });
  }
  /** Take a suspended turn's slot back. Settles when admitted, or when the turn ends or waits again first. */
  function reacquire(intent: AdmissionIntent) {
    return new Promise<void>((resolve) => {
      enqueue({ intent, resolve, reject: () => resolve(), changed: observers.get(intent.turnId), reacquire: true });
      drain();
    });
  }
  function cancel(turnId: string) {
    const index = queue.findIndex(row => row.intent.turnId === turnId && !row.reacquire);
    if (index < 0) return false;
    const [row] = queue.splice(index, 1);
    observers.delete(turnId);
    persist();
    row!.reject(new Error("turnAdmissionCancelled"));
    drain();
    return true;
  }
  return {
    acquire,
    /**
     * Every end of a turn lands here, including one whose wait is still
     * taking its slot back: that pending re-acquire leaves the queue too.
     */
    release(turnId: string) {
      running.delete(turnId); suspended.delete(turnId); waits.delete(turnId); observers.delete(turnId);
      for (let index = queue.length - 1; index >= 0; index--) {
        if (queue[index]!.intent.turnId !== turnId) continue;
        const [row] = queue.splice(index, 1);
        row!.reject(new Error("turnAdmissionCancelled"));
      }
      drain();
    },
    cancel,
    cancelTask(taskId: string) { for (const row of [...queue]) if (row.intent.taskId === taskId && !row.reacquire) cancel(row.intent.turnId); },
    async wait(taskId: string, waiting: boolean) {
      if (waiting) {
        for (const [id, intent] of suspended) if (intent.taskId === taskId) waits.set(id, (waits.get(id) ?? 0) + 1);
        for (const [id, intent] of running) if (intent.taskId === taskId) { suspended.set(id, intent); running.delete(id); waits.set(id, 1); }
        // A wait that starts while an earlier one is still taking the slot back suspends the turn again.
        for (let index = queue.length - 1; index >= 0; index--) {
          const row = queue[index]!;
          if (!row.reacquire || row.intent.taskId !== taskId) continue;
          queue.splice(index, 1);
          suspended.set(row.intent.turnId, row.intent);
          waits.set(row.intent.turnId, 1);
          row.resolve();
        }
        drain();
        return;
      }
      const ready: AdmissionIntent[] = [];
      for (const [id, intent] of [...suspended]) {
        if (intent.taskId !== taskId) continue;
        const open = (waits.get(id) ?? 1) - 1;
        if (open > 0) { waits.set(id, open); continue; }
        waits.delete(id); suspended.delete(id); ready.push(intent);
      }
      await Promise.all(ready.map(reacquire));
    },
    refresh: drain,
    freeze: () => { frozen = true; },
    /** A fresh start still waiting for its first slot. */
    isQueued: (id: string) => queue.some(row => row.intent.turnId === id && !row.reacquire),
    snapshot: () => ({
      running: [...running.keys()],
      queued: queue.map(row => ({ ...row.intent, ...(row.reacquire ? { reacquire: true } : {}) })),
      suspended: [...suspended.keys()],
    }),
  };
}
