import {
  CreateTarsResponsibilityInputSchema,
  UpdateTarsIdentityInputSchema, tarsSnapshotForWindow,
  type TarsQueueWait, type TarsDetailCode, type TarsDetailParams, type TarsResponsibility, type TarsResponsibilityPatch, type TarsRunControlOperation,
} from "../../src/lib/tars/types";
import { tarsDetailFromError, TarsDetailError, TarsOwnershipLostError } from "./tars-ownership";
import type { TarsStore } from "../persistence/tars-store";
import { isTarsStorageBusy } from "../persistence/tars-conversation-store";
import { TARS_WAIT_FOLLOW_UP_MS } from "../../src/lib/tars/events";
import {
  admitTarsControl, tarsControlRejection, TarsControlRejection, TARS_CONTROL_STALE, TARS_GRANTING_OPERATIONS, TARS_STOPPING_OPERATIONS,
  type TarsControlLedger, type TarsControlRequest,
} from "./tars-control";

export interface TarsExecutionObservation {
  state: "running" | "waiting" | "completed" | "blocked" | "cancelled" | "takenOver";
  detail: string | null;
  /** Set when `detail` is a sentence Tars wrote; absent, `detail` is the run's own words. */
  detailCode?: TarsDetailCode | null;
  detailParams?: TarsDetailParams | null;
  /** Waiting because the run's own stage asks the user; absent for a plain wait. */
  stageAsksUser?: boolean;
  /** The run's turn count, reported with a wait; a new turn restarts the quiet wait. */
  runTurns?: number;
  /** The run's current stage attempt (`stageId#attempt`), reported with a wait. */
  runStage?: string;
  /** The helper's task when a helper of the run, not the run's own task, waits on the user. */
  waitingTaskId?: string;
}

export interface TarsRuntimePorts {
  store: Pick<TarsStore, "snapshot" | "create" | "patch" | "get" | "updateIdentity" | "recordEvent">;
  validateScope: (row: Pick<TarsResponsibility, "workspaceId" | "repositoryPath">) => Promise<void>;
  prepareWorkspace: (row: TarsResponsibility) => Promise<string>;
  prepareTask: (row: TarsResponsibility) => Promise<void>;
  /** Reconciles ALL prior runs for this task, including terminal ones. */
  findRun: (row: TarsResponsibility) => Promise<string | null>;
  startRun: (row: TarsResponsibility, assertAdmitted: () => void) => Promise<string>;
  observe: (row: TarsResponsibility) => Promise<TarsExecutionObservation>;
  controlRun: (row: TarsResponsibility, operation: TarsRunControlOperation) => Promise<void>;
  /** Live persisted setting: 0 or absent admits all independent responsibilities. */
  concurrencyLimit?: () => number;
  onQueueChanged?: () => void;
  now?: () => string;
  onError?: (error: unknown) => void;
}

const OWNED = new Set(["preparing", "running", "waiting", "blocked"]);

/** Owns responsibilities, not provider turns. All execution crosses existing Run admission. */
export function createTarsRuntime(ports: TarsRuntimePorts) {
  const now = ports.now ?? (() => new Date().toISOString());
  const operations = new Map<string, Promise<unknown>>();
  const queueWaits = new Map<string, TarsQueueWait>();
  let scheduled: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  // Invalidate pending dispatch synchronously, even while preparation awaits I/O.
  const held = new Set<string>();
  // One control per responsibility at a time; a duplicate request joins its attempt.
  const inflight = new Map<string, { key: string; promise: Promise<unknown> }>();
  // Only mutations of the same responsibility wait for its Git/run I/O.
  function enqueue<T>(key: string, work: () => Promise<T> | T): Promise<T> {
    const next = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    operations.set(key, next);
    void next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => {});
    return next;
  }
  function snapshot() {
    const value = tarsSnapshotForWindow(ports.store.snapshot());
    const limit = ports.concurrencyLimit?.() ?? 0;
    const active = value.responsibilities.filter((row) => occupiesSlot(row) || row.state === "queued" && operations.has(row.id)).length;
    return { ...value, responsibilities: value.responsibilities.map((row) => row.state === "queued"
      ? { ...row, queueWait: limit > 0 && active >= limit && !operations.has(row.id) ? { code: "capacity" as const, active, limit }
        : queueWaits.get(row.id)?.code === "storageBusy" ? { code: "storageBusy" as const } : { code: "unknown" as const } } : row) };
  }
  function patch(row: TarsResponsibility, raw: TarsResponsibilityPatch, options: { recovered?: boolean } = {}) {
    // A detail written without a code is free text: it clears any earlier code.
    const value: TarsResponsibilityPatch = "detail" in raw ? { ...raw, detailCode: raw.detailCode ?? null, detailParams: raw.detailParams ?? null } : raw;
    const changed = Object.entries(value).some(([key, val]) =>
      JSON.stringify(row[key as keyof TarsResponsibility] ?? null) !== JSON.stringify(val ?? null));
    return changed ? ports.store.patch(row.id, row.revision, value, now(), options) : row;
  }
  /**
   * Work that waited a full interval without any saved change gets one
   * `waitExpired` event for that wait. Its key is the waiting revision, so
   * later ticks find it already recorded and nothing new happens.
   */
  function noteExpiredWait(row: TarsResponsibility) {
    // An asking stage is recorded too; the inbox settles it at once when its ask was already followed up.
    if (row.state !== "waiting" || Date.parse(now()) - Date.parse(row.updatedAt) < TARS_WAIT_FOLLOW_UP_MS) return;
    ports.store.recordEvent({ responsibilityId: row.id, kind: "waitExpired", episode: String(row.revision),
      observedRevision: row.revision, observedState: row.state, attempt: row.agentRunId }, now());
  }
  const blocked = (row: TarsResponsibility, error: unknown) => patch(row, { state: "blocked", ...tarsDetailFromError(error) });
  async function prepare(initial: TarsResponsibility) {
    let row = initial;
    try {
      if (row.state === "preparing" && row.taskId && row.executionWorkspaceId) {
        const existing = await ports.findRun(row);
        if (existing) {
          row = patch(row, { agentRunId: existing, state: "running", detail: null, executionPending: false }, { recovered: true });
          await reconcile(row);
          return;
        }
      }
      await ports.validateScope({ ...row, workspaceId: row.executionWorkspaceId ?? row.workspaceId });
      if (stopped || held.has(row.id)) return;
      row = patch(row, { state: "preparing", taskId: row.taskId ?? `tars-${row.id}`, detail: null });
      if (!row.executionWorkspaceId) {
        const executionWorkspaceId = await ports.prepareWorkspace(row);
        row = patch(row, { executionWorkspaceId });
      }
      if (stopped || held.has(row.id)) return;
      await ports.prepareTask(row);
      if (stopped || held.has(row.id)) return;
      // Task identity was persisted before task/run creation. A lost response must not mint another run.
      const existing = await ports.findRun(row);
      if (stopped || held.has(row.id)) return;
      if (!existing) row = patch(row, { executionPending: true });
      const agentRunId = existing ?? await ports.startRun(row, () => {
        if (stopped || held.has(row.id)) throw new TarsDetailError("admissionWithdrawn", "Responsibility execution was paused or cancelled before admission.");
      });
      // A run found here was created before a lost acknowledgement: adopt it and record the recovery.
      row = patch(row, { agentRunId, state: "running", detail: null, executionPending: false }, { recovered: existing !== null });
      // A pause/cancel that raced startRun is applied by the queued control next.
    } catch (error) {
      // A lock wait is not a verdict on the work: leave the row for the next tick,
      // whose reconciliation finds any run created before the wait.
      if (isTarsStorageBusy(error)) { queueWaits.set(row.id, { code: "storageBusy" }); return; }
      blocked(row, error);
    }
  }
  async function reconcile(initial: TarsResponsibility) {
    try {
      if ((initial.state === "blocked" || initial.state === "preparing") && !initial.agentRunId && initial.taskId && initial.executionWorkspaceId) {
        // A lost start acknowledgement is reconciled only for its own task.
        const agentRunId = await ports.findRun(initial);
        if (agentRunId) initial = patch(initial, { agentRunId, state: "running", detail: null, executionPending: false }, { recovered: true });
        else initial = patch(initial, { executionPending: false });
      }
      if (!initial.agentRunId || !OWNED.has(initial.state) || held.has(initial.id)) return;
      const observed = await ports.observe(initial);
      if (stopped || held.has(initial.id)) return;
      const { runTurns, runStage, waitingTaskId, ...change } = observed;
      const waiting = observed.state === "waiting";
      noteExpiredWait(patch(initial, { ...change, executionPending: false, stageAsksUser: observed.stageAsksUser === true || undefined,
        observedTurns: waiting ? runTurns : undefined, observedStage: waiting ? runStage : undefined,
        waitingTaskId: waiting ? waitingTaskId : undefined }));
    } catch (error) {
      if (!isTarsStorageBusy(error)) {
        if (error instanceof TarsOwnershipLostError) patch(initial, { state: "takenOver", ...tarsDetailFromError(error) });
        else patch(initial, { state: "blocked", executionPending: true, ...tarsDetailFromError(error) });
      }
    }
  }
  // Unknown outcomes retain one reservation (also after restart), never the whole portfolio.
  const occupiesSlot = (row: TarsResponsibility) => row.state === "running" || row.state === "preparing" ||
    (row.state === "blocked" && row.executionPending !== false && Boolean(row.agentRunId || row.taskId && row.executionWorkspaceId));
  function tick() {
    if (stopped) return;
    const rows = ports.store.snapshot().responsibilities;
    const previousWaits = JSON.stringify([...queueWaits]);
    const queuedIds = new Set(rows.filter((row) => row.state === "queued").map((row) => row.id));
    for (const id of queueWaits.keys()) if (!queuedIds.has(id)) queueWaits.delete(id);
    const limit = ports.concurrencyLimit?.() ?? 0;
    let active = rows.filter((row) => occupiesSlot(row) || row.state === "queued" && operations.has(row.id)).length;
    for (const row of rows) {
      if (operations.has(row.id) || held.has(row.id)) continue;
      if (!row.agentRunId && row.state !== "blocked") continue;
      if (!OWNED.has(row.state)) continue;
      const before = JSON.stringify([row.state, row.agentRunId, row.executionPending]);
      void enqueue(row.id, () => reconcile(row)).catch((error) => ports.onError?.(error)).finally(() => {
        const current = ports.store.get(row.id);
        if (current && before !== JSON.stringify([current.state, current.agentRunId, current.executionPending])) requestTick();
      });
    }
    const queued = rows.filter((row) => row.state === "queued" || row.state === "preparing" && !row.agentRunId)
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    for (const row of queued) {
      if (operations.has(row.id) || held.has(row.id)) continue;
      const reserved = occupiesSlot(row);
      if (!reserved && limit > 0 && active >= limit) {
        queueWaits.set(row.id, { code: "capacity", active, limit });
        continue;
      }
      if (!reserved) active++;
      queueWaits.delete(row.id);
      void enqueue(row.id, () => prepare(ports.store.get(row.id)!)).catch((error) => ports.onError?.(error)).finally(() => {
        const current = ports.store.get(row.id);
        if (current && current.state !== "running" && current.state !== "preparing" && current.state !== "queued") requestTick();
        ports.onQueueChanged?.();
      });
    }
    if (previousWaits !== JSON.stringify([...queueWaits])) ports.onQueueChanged?.();
  }
  function requestTick() {
    if (scheduled || stopped) return;
    scheduled = Promise.resolve().then(() => { scheduled = null; tick(); }).catch((error) => ports.onError?.(error));
  }
  return {
    start() { if (timer) return; stopped = false; requestTick(); timer = setInterval(requestTick, 5_000); timer.unref?.(); },
    stop() { stopped = true; if (timer) clearInterval(timer); timer = null; },
    requestTick,
    /** Tests and orderly shutdown await all work admitted before they become idle. */
    drain: async () => {
      while (scheduled || operations.size) {
        await scheduled;
        await Promise.allSettled([...operations.values()]);
      }
    },
    get: () => Promise.resolve(snapshot()),
    create: async (raw: unknown) => {
      const input = CreateTarsResponsibilityInputSchema.parse(raw);
      return enqueue(`create:${input.requestId}`, async () => {
        await ports.validateScope(input);
        ports.store.create(input, now());
        requestTick();
        return snapshot();
      });
    },
    updateIdentity: (raw: unknown) => enqueue("identity", () => {
      ports.store.updateIdentity(UpdateTarsIdentityInputSchema.parse(raw), now());
      return snapshot();
    }),
    /**
     * The one admitted control path for words and clicks. Admission is
     * deterministic and rechecked at dispatch; the run is controlled before the
     * effect and the request's outcome commit together, so a replay applies once.
     */
    act<R>(request: TarsControlRequest, ledger: TarsControlLedger<R>): Promise<R> {
      const id = request.responsibilityId;
      const running = inflight.get(id);
      if (running?.key === ledger.key) return running.promise as Promise<R>;
      const settle = (error: unknown): R => {
        const settled = ledger.settled();
        if (settled) return settled;
        // A lock wait changed nothing; the pending request stays retryable.
        if (isTarsStorageBusy(error)) throw error;
        return ledger.reject(tarsControlRejection(error));
      };
      try {
        const settled = ledger.settled();
        if (settled) return Promise.resolve(settled);
        if (running) throw new TarsControlRejection("stale", TARS_CONTROL_STALE);
        // A stale or inadmissible stop must not freeze newer work.
        admitTarsControl(ports.store.get(id), request);
        ledger.admit?.();
      } catch (error) {
        try { return Promise.resolve(settle(error)); } catch (busy) { return Promise.reject(busy); }
      }
      if (TARS_STOPPING_OPERATIONS.has(request.operation)) held.add(id);
      const promise = enqueue(id, async () => {
        const replay = ledger.settled();
        if (replay) return replay;
        let row = admitTarsControl(ports.store.get(id), request, "dispatch");
        // Rechecked before the run is controlled: a proposal superseded while this waited is refused.
        ledger.admit?.();
        // Taken before the run continues, so its fresh verification always starts after it.
        const handedBackAt = now();
        let ownershipLoss: TarsOwnershipLostError | null = null;
        try {
          // Preparation may have recorded an execution identity while this control waited.
          if (!row.agentRunId && row.taskId && row.executionWorkspaceId) {
            const agentRunId = await ports.findRun(row);
            if (agentRunId) row = patch(row, { agentRunId });
          }
          if (TARS_GRANTING_OPERATIONS.has(request.operation)) {
            try { await ports.validateScope({ ...row, workspaceId: row.executionWorkspaceId ?? row.workspaceId }); }
            catch (error) {
              throw new TarsControlRejection("outOfScope", error instanceof Error ? error.message : "The registered scope could not be verified.");
            }
          }
          // Accepting completion settles the responsibility; the run has already ended.
          if (row.agentRunId && request.operation !== "acceptCompletion") await ports.controlRun(row, request.operation);
        } catch (error) {
          if (!(error instanceof TarsOwnershipLostError) || TARS_GRANTING_OPERATIONS.has(request.operation)) throw error;
          // Confirmed transfer relinquishes only this responsibility. Never send
          // a control to the new owner, and never treat a read failure as transfer.
          ownershipLoss = error;
        }
        const detail = ownershipLoss ? tarsDetailFromError(ownershipLoss) : { detail: null };
        const value: TarsResponsibilityPatch = request.operation === "pause" ? { state: "paused", ...detail }
          : request.operation === "acceptCompletion"
            ? { state: "completed", detail: "You accepted this work as done without a Stave-verified check.", detailCode: "acceptedWithoutVerification" }
          : request.operation === "cancel" ? { state: "cancelled", ...detail }
            : request.operation === "takeover" ? { state: "takenOver", ...detail }
              : { state: row.agentRunId ? "running" : "queued", detail: null,
                ...(request.operation === "handBack" ? { reverifyAfter: handedBackAt } : {}) };
        const outcome = ledger.apply(() => {
          // Recheck inside the transaction that writes both the effect and its outcome.
          const current = ports.store.get(id);
          if (!current || current.revision !== row.revision) throw new TarsControlRejection("stale", TARS_CONTROL_STALE);
          admitTarsControl(current, request, "dispatch");
          ports.store.patch(id, row.revision, value, now());
        });
        if (TARS_GRANTING_OPERATIONS.has(request.operation)) held.delete(id);
        requestTick();
        return outcome;
      }).catch(settle).finally(() => {
        inflight.delete(id);
        const state = ports.store.get(id)?.state;
        if (state !== "paused" && state !== "takenOver") held.delete(id);
      });
      inflight.set(id, { key: ledger.key, promise });
      return promise;
    },
  };
}
