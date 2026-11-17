import { z } from "zod";

export const TurnAdmissionWaitSchema = z.object({ taskId: z.string().min(1).max(200), waiting: z.boolean() }).strict();
export const TurnAdmissionWaitResultSchema = z.object({ ok: z.literal(true) }).strict();
export type TurnAdmissionState = { state: "queued" | "running"; ahead: number };
export interface AdmissionIntent { turnId: string; taskId?: string; priority: "user" | "automatic" }
interface Pending { intent: AdmissionIntent; resolve: () => void; reject: (error: Error) => void; changed?: (state: TurnAdmissionState) => void; ahead?: number }

/** One host-owned semaphore shared by all primary provider entry points. */
export function createTurnAdmission(deps: {
  limit: () => number | null;
  save: (queued: AdmissionIntent[], running: string[]) => void;
}) {
  const running = new Map<string, AdmissionIntent>();
  const suspended = new Map<string, AdmissionIntent>();
  const queue: Pending[] = [];
  const observers = new Map<string, NonNullable<Pending["changed"]>>();
  let frozen = false;
  const persist = () => deps.save(queue.map(row => row.intent), [...running.keys()]);
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
  function acquire(intent: AdmissionIntent, changed?: Pending["changed"]) {
    if (running.has(intent.turnId) || queue.some(row => row.intent.turnId === intent.turnId)) return Promise.reject(new Error("duplicateTurnAdmission"));
    return new Promise<void>((resolve, reject) => {
      if (changed) observers.set(intent.turnId, changed);
      const pending = { intent, resolve, reject, changed: changed ?? observers.get(intent.turnId) };
      const firstAutomatic = queue.findIndex(row => row.intent.priority === "automatic");
      if (intent.priority === "user" && firstAutomatic >= 0) queue.splice(firstAutomatic, 0, pending);
      else queue.push(pending);
      try { persist(); drain(); } catch (error) {
        const index = queue.indexOf(pending);
        if (index >= 0) queue.splice(index, 1);
        running.delete(intent.turnId);
        observers.delete(intent.turnId);
        reject(error);
      }
    });
  }
  function cancel(turnId: string) {
    const index = queue.findIndex(row => row.intent.turnId === turnId);
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
    release(turnId: string) { running.delete(turnId); suspended.delete(turnId); observers.delete(turnId); drain(); },
    cancel,
    cancelTask(taskId: string) { for (const row of [...queue]) if (row.intent.taskId === taskId) cancel(row.intent.turnId); },
    async wait(taskId: string, waiting: boolean) {
      if (waiting) {
        for (const [id, intent] of running) if (intent.taskId === taskId) { suspended.set(id, intent); running.delete(id); }
        drain();
      } else {
        const rows = [...suspended.values()].filter(intent => intent.taskId === taskId);
        for (const intent of rows) { suspended.delete(intent.turnId); await acquire(intent); }
      }
    },
    refresh: drain,
    freeze: () => { frozen = true; },
    isQueued: (id: string) => queue.some(row => row.intent.turnId === id),
    snapshot: () => ({ running: [...running.keys()], queued: queue.map(row => ({ ...row.intent })), suspended: [...suspended.keys()] }),
  };
}
