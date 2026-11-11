import { createTarsWithdrawal, tarsContinuationRunPatch } from "./tars-withdrawal";
import { tarsExecutionScope } from "../../src/lib/tars/continuation";
import { randomUUID } from "node:crypto";
import {
  CreateTarsResponsibilityInputSchema, isTarsRunCommandOperation, isTarsTaskOperation,
  UpdateTarsIdentityInputSchema, tarsSnapshotForWindow,
  type TarsDetailCode, type TarsDetailParams, type TarsPendingRequest, type TarsQueueWait, type TarsResponsibility, type TarsResponsibilityPatch, type TarsRunControlOperation,
  type TarsStageWait, type TarsWorkRequest, type TarsContinuation,
} from "../../src/lib/tars/types";
import { buildTarsBrief, resolveTarsWorkRequest, TarsBriefInputSchema } from "../../src/lib/tars/brief";
import { tarsDetailFromError, TarsDetailError, TarsOwnershipLostError, TarsRunEndedError } from "./tars-ownership";
import type { TarsStore } from "../persistence/tars-store";
import { isTarsStorageBusy, type TarsConversationStore } from "../persistence/tars-conversation-store";
import { TARS_WAIT_FOLLOW_UP_MS } from "../../src/lib/tars/events";
import type { TarsActionRecord, TarsControlReason, TarsMessageDelivery } from "../../src/lib/tars/conversation";
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
  /** Waiting because the run's own stage stopped, judged at once; absent for a plain wait. */
  stageAsksUser?: boolean;
  /** With `stageAsksUser`: whether that stage asks the user or one of Stave's own checks stopped it. */
  stageWait?: TarsStageWait;
  /** The run's turn count, reported with a wait; a new turn restarts the quiet wait. */
  runTurns?: number;
  /** The run's current stage attempt (`stageId#attempt`), reported with a wait. */
  runStage?: string;
  /** The helper's task when a helper of the run, not the run's own task, waits on the user. */
  waitingTaskId?: string;
  /** The run's own current stage attempt (`stageId#attempt`) while it is running or waiting. */
  activeStage?: string;
  /** Approvals and questions waiting in the work's task or a helper's task, bounded. */
  pendingRequests?: TarsPendingRequest[];
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
  /**
   * Answers a request in the work's task, or sends the user's words to its run
   * (`TarsTaskOperation`), after rechecking ownership. With `canQueue`, a
   * `message` to a task with a running turn sends nothing and returns
   * "queued": the words wait in the request's record (`deliverMessage`).
   * `queueBehind` says words are already kept for the work: the new ones then
   * wait behind them even when the task is free ("queued", or refused as busy
   * without `canQueue`), so they are never said before older words.
   */
  respondTask: (row: TarsResponsibility, request: TarsControlRequest, options?: { canQueue?: boolean; queueBehind?: boolean }) => Promise<void | "queued">;
  /** The delivery queue: messages kept for a busy task, on their records. Absent, a busy task refuses a message. */
  messages?: Pick<TarsConversationStore, "getAction" | "listDeliveryHeads" | "listOpenDeliveryResponsibilityIds" | "hasOpenDelivery" | "transitionDelivery" | "cancelOpenDeliveries" | "withdrawDelivery" | "requestDeliveryWithdrawal">;
  /**
   * Says one queued message in the work's task as the user's reply, started as
   * the user turn `turnId`, after rechecking ownership, once no turn runs and
   * nothing waits there: "busy" when it must wait (it says nothing then).
   */
  deliverMessage?: (row: TarsResponsibility, text: string, turnId: string) => Promise<"sent" | "busy">;
  /** Reconcile or start one confirmed follow-up after completion, in the existing task only. */
  continueWork?: (row: TarsResponsibility, continuation: TarsContinuation, assertAdmitted?: () => void) => Promise<string | "busy">;
  /** Read-only exact continuation lookup. Null proves no matching new run was committed. */
  reconcileContinuation?: (row: TarsResponsibility, continuation: TarsContinuation) => Promise<string | null>;
  /**
   * Whether the run recorded the user turn `turnId`. A message under way
   * reached its task only if its own turn is there; the run's other user turns
   * (the user typing in the task) say nothing about it.
   */
  hasUserTurn?: (agentRunId: string, turnId: string) => boolean;
  /**
   * Reads one conversation message as a work request, without its
   * attachments; the brief of work admitted before Stave saved its request
   * recovers it this way (`resolveTarsWorkRequest`).
   */
  readRequest?: (messageId: string) => TarsWorkRequest | null;
  now?: () => string;
  onError?: (error: unknown) => void;
}

const OWNED = new Set(["preparing", "running", "waiting", "blocked"]);
/**
 * Controls that take the work from Tars or end it; a message still open for it
 * (queued, or under way and not confirmed said) is then cancelled with the
 * control. A hand-back ends a takeover: words still kept then were confirmed
 * before it (none are admitted while the user holds the work), so they go too.
 */
const ENDS_QUEUED_MESSAGES: ReadonlyMap<string, "takenOver" | "ended"> = new Map([
  ["takeover", "takenOver"], ["handBack", "takenOver"], ["cancel", "ended"], ["acceptCompletion", "ended"]]);
// i18n-ignore: persisted diagnostic; the interface translates the reason code
const QUEUED_MESSAGE_CANCELLED = "The work was taken over, cancelled or completed before its task's turn ended, so the message was not sent.";
/** Works' next messages read per page, and pages per pass: each pass is bounded, and passes take turns through every work's. */
const DELIVERY_PAGE = 32;
const DELIVERY_PAGES_MAX = 32;

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
  // Retain already-sent task effects until their ledger outcome is saved, so retries never send twice.
  const sentEffects = new Set<string>();
  // Queued words said in this process whose record does not say so yet (a lock wait), so they are never said twice.
  const saidDeliveries = new Set<string>();
  // Works with a delivery attempt waiting in or running on their queue: one at a time, in the work's order.
  const deliveringWorks = new Set<string>();
  // Where the next pass goes on reading works' next messages: the last head read, or the start once the end was read.
  let deliveryCursor: string | undefined;
  // Only mutations of the same responsibility wait for its Git/run I/O.
  function enqueue<T>(key: string, work: () => Promise<T> | T): Promise<T> {
    const next = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
    operations.set(key, next);
    void next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => {});
    return next;
  }
  const withdrawal = createTarsWithdrawal({ ports, enqueue, patch, reachedTask, now, requestTick });
  function snapshot() {
    const value = tarsSnapshotForWindow(ports.store.snapshot());
    const open = new Set(ports.messages?.listOpenDeliveryResponsibilityIds() ?? []);
    const limit = ports.concurrencyLimit?.() ?? 0;
    const active = value.responsibilities.filter((row) => occupiesSlot(row) || row.state === "queued" && operations.has(row.id)).length;
    return { ...value, responsibilities: value.responsibilities.map((row) => row.state === "queued" || row.state === "completed" && open.has(row.id)
      ? { ...row, queueWait: limit > 0 && active >= limit && !occupiesSlot(row) && !operations.has(row.id) ? { code: "capacity" as const, active, limit }
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
  /**
   * After a task operation: the answered request leaves the list, and the run
   * goes on once nothing else waits; the next observation says exactly where.
   */
  function taskAnswered(row: TarsResponsibility, request: TarsControlRequest): TarsResponsibilityPatch {
    const rest = (row.pendingRequests ?? []).filter((entry) => entry.ref !== request.input?.requestRef);
    if (rest.length && (request.operation === "approve" || request.operation === "deny" || request.operation === "answer"))
      return { pendingRequests: rest };
    return { state: "running", detail: null, stageAsksUser: undefined, stageWait: undefined, pendingRequests: undefined };
  }
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
      // Absent means a plain wait, so a stage that stopped asking clears the mark.
      const { runTurns, runStage, waitingTaskId, activeStage, pendingRequests, stageWait, ...change } = observed;
      const waiting = observed.state === "waiting";
      const going = waiting || observed.state === "running";
      const asks = waiting && observed.stageAsksUser === true;
      // An unchanged observation must not reset an existing wait just to add scheduler metadata.
      noteExpiredWait(patch(initial, { ...change, executionPending: initial.executionPending === true || initial.state === "blocked" ? false : initial.executionPending,
        stageAsksUser: asks || undefined, stageWait: asks ? stageWait : undefined,
        activeStage: going ? activeStage : undefined,
        pendingRequests: waiting && pendingRequests?.length ? pendingRequests : undefined,
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
    (row.state === "completed" && row.executionPending === true && Boolean(row.continuation)) ||
    (row.state === "blocked" && row.executionPending !== false && Boolean(row.agentRunId || row.taskId && row.executionWorkspaceId));
  function tick() {
    if (stopped) return;
    const rows = ports.store.snapshot().responsibilities;
    const previousWaits = JSON.stringify([...queueWaits]);
    const open = new Set(ports.messages?.listOpenDeliveryResponsibilityIds() ?? []);
    const queuedIds = new Set(rows.filter((row) => row.state === "queued" || row.state === "completed" && open.has(row.id)).map((row) => row.id));
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
    // Words kept for a busy task: each work's next one, said on that work's own queue after this tick's observation.
    deliverQueuedMessages();
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
  /**
   * Says each message kept for a busy task once that task's turn has ended.
   * Only each work's oldest open message is looked at, so the next waits for
   * the turn the last one started. A pass reads a bounded number of pages,
   * going on from where the last pass stopped and starting over after the end,
   * so every work's is read in turn however many others must wait (paused or
   * busy work), and each is said on its own work's queue, so one work's slow
   * observation or control never holds back another work's words.
   */
  function deliverQueuedMessages() {
    const queue = ports.messages;
    if (!queue || !ports.deliverMessage || !ports.hasUserTurn) return;
    for (let page = 0; page < DELIVERY_PAGES_MAX; page++) {
      let heads: TarsActionRecord[];
      try { heads = queue.listDeliveryHeads(DELIVERY_PAGE, deliveryCursor); }
      catch (error) { if (!isTarsStorageBusy(error)) ports.onError?.(error); return; }
      for (const head of heads) {
        const id = head.action.responsibilityId;
        if (deliveringWorks.has(id)) continue;
        deliveringWorks.add(id);
        // Said inside the work's own queue, so it never overlaps that work's observation, preparation or control.
        void enqueue(id, () => deliverOne(queue, head.requestId)).catch((error) => ports.onError?.(error))
          .finally(() => deliveringWorks.delete(id));
      }
      // The end was read: the next pass starts over from the oldest head.
      if (heads.length < DELIVERY_PAGE) { deliveryCursor = undefined; return; }
      deliveryCursor = heads.at(-1)!.requestId;
    }
  }
  /** Whether a message under way reached its task, by its own turn only; null when that cannot be read now. */
  function reachedTask(requestId: string, delivery: TarsMessageDelivery): boolean | null {
    if (saidDeliveries.has(requestId)) return true;
    if (!delivery.turnId) return false;
    try { return ports.hasUserTurn?.(delivery.agentRunId, delivery.turnId) ?? null; } catch { return null; }
  }
  /** Why words for this run can never be said: the work ended or left Tars, or its run is not the one they were for. */
  function deliveryEnded(row: TarsResponsibility | null, delivery: TarsMessageDelivery): TarsControlReason | null {
    if (row?.state === "takenOver") return "takenOver";
    if (!row || !row.agentRunId || (row.agentRunId !== delivery.agentRunId && !row.previousRunIds?.includes(delivery.agentRunId))) return "ownershipLost";
    return row.state === "cancelled" || row.state === "completed" && !ports.continueWork ? "ended" : null;
  }
  /** Cancels every open message of a work at once; one under way is recorded as said only if its own turn is there. */
  function cancelOpenDeliveries(responsibilityId: string, reason: TarsControlReason) {
    ports.messages?.cancelOpenDeliveries(responsibilityId, reason, QUEUED_MESSAGE_CANCELLED, now(),
      (record) => record.delivery ? reachedTask(record.requestId, record.delivery) === true : false);
  }
  /**
   * Says one work's next message. One under way when it was read (Stave
   * stopped, or a lock wait after it was said) counts as said only if the run
   * recorded its own turn; otherwise it is queued again, but only for work
   * that still owns that run, so it is said exactly once and never after the
   * work was taken over, cancelled or completed. Paused work keeps it.
   */
  async function deliverOne(queue: NonNullable<TarsRuntimePorts["messages"]>, requestId: string) {
    if (stopped) return;
    try {
      const record = queue.getAction(requestId);
      const action = record?.action;
      const delivery = record?.delivery;
      if (action?.kind !== "control" || !delivery || !action.input?.text ||
          !["queued", "delivering"].includes(delivery.status) || withdrawal.requested(requestId)) return;
      if (delivery.withdrawRequestedAt) {
        await withdrawal.withdraw({ requestId, expectedRevision: record!.revision }, true); return;
      }
      const id = action.responsibilityId;
      let row = ports.store.get(id);
      const move = (from: Parameters<typeof queue.transitionDelivery>[1], next: Parameters<typeof queue.transitionDelivery>[2], effect?: () => void) =>
        queue.transitionDelivery(requestId, from, next, now(), effect);
      // Settle a reply already recorded by its old run before considering a completed-work continuation.
      if (delivery.status === "delivering") {
        const reached = reachedTask(requestId, delivery);
        if (reached === null) return;
        if (reached) { move(["delivering"], { status: "delivered" }); saidDeliveries.delete(requestId); return; }
      }
      const ended = deliveryEnded(row, delivery);
      // Starting the same scope is recoverable by its saved identity, including a lost run-start acknowledgement.
      if (!ended && ports.continueWork && row && (row.state === "completed" ||
          row.continuation?.requestId === requestId && row.agentRunId === row.continuation.previousRunId)) {
        if (held.has(id) || inflight.has(id) || row.state === "paused" || row.state === "takenOver") return;
        const limit = ports.concurrencyLimit?.() ?? 0;
        const active = ports.store.snapshot().responsibilities.filter((item) => occupiesSlot(item) || item.state === "queued" && operations.has(item.id)).length;
        if (!occupiesSlot(row) && limit > 0 && active >= limit) {
          queueWaits.set(id, { code: "capacity", active, limit });
          ports.onQueueChanged?.(); return;
        }
        queueWaits.delete(id);
        if (!row.taskId || !row.executionWorkspaceId || !row.agentRunId) throw new TarsOwnershipLostError("The execution location is unavailable.");
        const continuation = row.continuation?.requestId === requestId ? row.continuation
          : { requestId, previousRunId: row.agentRunId, previousInstruction: tarsExecutionScope(row).instruction, previousCriteria: tarsExecutionScope(row).acceptanceCriteria, text: action.input.text, requestedAt: now() };
        let uncertainStart = row.executionPending === true;
        // Reserve synchronously before host I/O. An uncertain start keeps this slot after restart.
        row = patch(row, { continuation, executionPending: true });
        let runId: string;
        try {
          const result = await ports.continueWork(row, continuation, () => withdrawal.assertAdmitted(requestId));
          if (result === "busy") { patch(row, { executionPending: false }); return; }
          runId = result;
        } catch (error) {
          if (withdrawal.requested(requestId) || isTarsStorageBusy(error)) return;
          const rejection = tarsControlRejection(error);
          // A prior failed receipt may have rolled back with its reservation release. Reconcile before retaining that slot.
          if (uncertainStart && rejection.reason === "runRefused" && ports.reconcileContinuation) {
            let existing: string | null;
            try { existing = await ports.reconcileContinuation(row, continuation); }
            catch { ports.onError?.(error); return; }
            if (existing) {
              row = patch(row, tarsContinuationRunPatch(row, continuation, existing));
              move(["queued", "delivering"], { status: "delivered", agentRunId: existing }); return;
            }
            uncertainStart = false;
          }
          // An unknown acknowledgement failure may follow a committed run start. Keep the saved scope retryable.
          if (rejection.reason === "unknown" && !(error instanceof TarsDetailError) || uncertainStart && rejection.reason === "runRefused") {
            // The request's uncertain outcome cannot rewrite the completed result's verification or detail.
            ports.onError?.(error); return;
          }
          move(["queued", "delivering"], { status: "failed", ...rejection }, () => patch(row!, { executionPending: false }));
          return;
        }
        // A persisted scope and the run's own identity reconcile a crash before this acknowledgement.
        row = patch(row, tarsContinuationRunPatch(row, continuation, runId));
        move(["queued", "delivering"], { status: "delivered", agentRunId: runId });
        return;
      }
      // The new run was saved but the delivery acknowledgement was lost.
      if (!ended && row?.continuation?.requestId === requestId && row.agentRunId !== row.continuation.previousRunId) {
        move(["queued", "delivering"], { status: "delivered", agentRunId: row.agentRunId! }); return;
      }
      if (delivery.status === "delivering") {
        const reached = reachedTask(requestId, delivery);
        // An unreadable turn leaves it under way: never said twice, never dropped on a guess.
        if (reached === null) return;
        if (reached) { move(["delivering"], { status: "delivered" }); saidDeliveries.delete(requestId); }
        else if (ended) cancelOpenDeliveries(id, ended);
        else move(["delivering"], { status: "queued" });
        return;
      }
      if (delivery.status !== "queued") return;
      if (ended) { cancelOpenDeliveries(id, ended); return; }
      // A control in flight, or work the user paused through Tars, waits.
      if (row!.state === "paused" || held.has(id) || inflight.has(id)) return;
      // The turn is named before it starts, so after a restart its own record says whether these words reached the task.
      const turnId = randomUUID();
      const started = move(["queued"], { status: "delivering", turnId, agentRunId: row!.agentRunId! });
      if (!started?.delivery) return;
      let result: "sent" | "busy";
      try { result = await ports.deliverMessage!(row!, action.input.text, turnId); }
      catch (error) {
        // A lock wait after the effect leaves it under way; the next pass settles it from its own turn.
        if (isTarsStorageBusy(error)) return;
        if (error instanceof TarsRunEndedError && ports.continueWork) {
          // Re-read the actual outcome: an ended run may be blocked rather than eligible for continuation.
          await reconcile(row!);
          const observed = ports.store.get(id);
          if (observed?.executionPending) return;
          if (observed?.state === "completed") { move(["delivering"], { status: "queued" }); return; }
        }
        if (reachedTask(requestId, started.delivery) === true) { move(["delivering"], { status: "delivered" }); return; }
        const { reason, error: text } = tarsControlRejection(error);
        // A run that ended or changed owner cannot take it any more; anything else the run refused.
        const gone = error instanceof TarsOwnershipLostError || error instanceof TarsRunEndedError;
        move(["delivering"], { status: gone ? "cancelled" : "failed", reason, error: text });
        return;
      }
      if (result === "sent") saidDeliveries.add(requestId);
      move(["delivering"], result === "sent" ? { status: "delivered" } : { status: "queued" });
      saidDeliveries.delete(requestId);
    } catch (error) {
      if (!isTarsStorageBusy(error)) ports.onError?.(error);
    }
  }
  function requestTick() {
    if (scheduled || stopped) return;
    scheduled = Promise.resolve().then(() => { scheduled = null; tick(); }).catch((error) => ports.onError?.(error));
  }
  return {
    start() { if (timer) return; stopped = false; requestTick(); timer = setInterval(requestTick, 5_000); timer.unref?.(); },
    stop() { stopped = true; if (timer) clearInterval(timer); timer = null; },
    requestTick,
    withdrawDelivery: withdrawal.withdraw,
    /** Tests and orderly shutdown await all work admitted before they become idle. */
    drain: async () => {
      while (scheduled || operations.size) {
        await scheduled;
        await Promise.allSettled([...operations.values()]);
      }
    },
    /** A local reversal waits for all preparation/controls already admitted for this work. */
    serializeUndo<T>(id: string, restore: () => T): Promise<T> {
      return enqueue(id, () => {
        const result = restore();
        // Refusals leave a paused/taken-over hold intact. A successful local restore is queued again.
        if (ports.store.get(id)?.state === "queued") held.delete(id);
        requestTick();
        return result;
      });
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
    /** One responsibility's saved message and instruction, read from its row; like `get`, it need not queue. */
    brief: async (raw: unknown) => {
      const { responsibilityId } = TarsBriefInputSchema.parse(raw);
      const row = ports.store.get(responsibilityId);
      if (!row) throw new Error("The responsibility was not found.");
      return buildTarsBrief(row, resolveTarsWorkRequest(row, ports.readRequest)?.request ?? null);
    },
    /**
     * The one admitted control path for words and clicks. Admission is
     * deterministic and rechecked at dispatch; the run is controlled before the
     * effect and the request's outcome commit together, so a replay applies once.
     */
    act: function act<R>(request: TarsControlRequest, ledger: TarsControlLedger<R>): Promise<R> {
      const id = request.responsibilityId;
      const running = inflight.get(id);
      if (running?.key === ledger.key) return running.promise as Promise<R>;
      if (running && request.operation === "message")
        return running.promise.catch(() => {}).then(() => act(request, ledger));
      const settle = (error: unknown): R => {
        const settled = ledger.settled();
        if (settled) return settled;
        // A lock wait changed nothing; the pending request stays retryable.
        if (isTarsStorageBusy(error)) throw error;
        return ledger.reject(tarsControlRejection(error));
      };
      // The effect already ran for this very request: only its outcome is left to save.
      const sent = sentEffects.has(ledger.key);
      try {
        const settled = ledger.settled();
        if (settled) return Promise.resolve(settled);
        if (running) throw new TarsControlRejection("stale", TARS_CONTROL_STALE);
        // A stale or inadmissible stop must not freeze newer work.
        if (!sent) { admitTarsControl(ports.store.get(id), request); ledger.admit?.(); }
      } catch (error) {
        try { return Promise.resolve(settle(error)); } catch (busy) { return Promise.reject(busy); }
      }
      if (TARS_STOPPING_OPERATIONS.has(request.operation)) held.add(id);
      const promise = enqueue(id, async () => {
        const replay = ledger.settled();
        if (replay) return replay;
        const current = ports.store.get(id);
        if (sent && !current) throw new TarsControlRejection("notOwned", "The responsibility is not owned by the personal representative.");
        let row = sent ? current! : admitTarsControl(current, request, "dispatch");
        // Rechecked before the run is controlled: a proposal superseded while this waited is refused.
        if (!sent) ledger.admit?.();
        // Taken before the run continues, so its fresh verification always starts after it.
        const handedBackAt = now();
        let ownershipLoss: TarsOwnershipLostError | null = null;
        let queued = false;
        try {
          // Preparation may have recorded an execution identity while this control waited.
          if (!row.agentRunId && row.taskId && row.executionWorkspaceId) {
            const agentRunId = await ports.findRun(row);
            if (agentRunId) row = patch(row, { agentRunId });
          }
          if (TARS_GRANTING_OPERATIONS.has(request.operation) && !sent) {
            try { await ports.validateScope({ ...row, workspaceId: row.executionWorkspaceId ?? row.workspaceId }); }
            catch (error) {
              throw new TarsControlRejection("outOfScope", error instanceof Error ? error.message : "The registered scope could not be verified.");
            }
          }
          // Accepting completion settles the responsibility; the run has already ended.
          // Starting queued work has no run to control yet; a run found above is adopted below.
          // A task operation answers in the task once; a retry of the same request only records it.
          // Words for a task whose turn is running are kept with the request and said once the turn ends.
          // New words wait behind words already kept for the work, so they are never said before them.
          if (row.agentRunId && isTarsTaskOperation(request.operation)) {
            if (!sent) {
              const message = request.operation === "message";
              // Persist every message before dispatch, even when the task looks idle. Crash recovery uses its own turn identity.
              queued = message && Boolean(ledger.queue && ports.messages);
              if (!queued) queued = await ports.respondTask(row, request, { canQueue: false,
                queueBehind: message && ports.messages?.hasOpenDelivery(id) === true }) === "queued";
              if (!queued) sentEffects.add(ledger.key);
            }
          }
          else if (row.agentRunId && request.operation !== "acceptCompletion" && request.operation !== "startNow")
            await ports.controlRun(row, request.operation as TarsRunControlOperation);
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
              // Preparation interrupted by a restart or lock wait resumes like any other preparation.
              : request.operation === "startNow" && !row.agentRunId ? { state: "preparing", taskId: row.taskId ?? `tars-${row.id}`, detail: null }
                // A retry only records an answer already given: a pause, takeover or end decided since stays as it is.
                : isTarsTaskOperation(request.operation) ? (sent && row.state !== "waiting" && row.state !== "running" ? {} : taskAnswered(row, request))
                // The run continues after its command (paused work refuses one); the next observation says exactly where,
                // including a run the command completed.
                : isTarsRunCommandOperation(request.operation)
                  ? { state: "running", detail: null, stageAsksUser: undefined, stageWait: undefined }
                  : { state: row.agentRunId ? "running" : "queued", detail: null,
                    ...(request.operation === "handBack" ? { reverifyAfter: handedBackAt } : {}) };
        const effect = () => {
          // Recheck inside the transaction that writes both the effect and its outcome.
          const latest = ports.store.get(id);
          if (!latest || latest.revision !== row.revision) throw new TarsControlRejection("stale", TARS_CONTROL_STALE);
          // An answer already given in the task is recorded as given, whatever was observed since.
          if (!sentEffects.has(ledger.key)) admitTarsControl(latest, request, "dispatch");
          // A queued message changes nothing about the work until it is said, so other decisions on it stay current.
          if (!queued) ports.store.patch(id, row.revision, value, now());
          const ends = ENDS_QUEUED_MESSAGES.get(request.operation);
          if (ends) cancelOpenDeliveries(id, ends);
        };
        const outcome = queued ? ledger.queue!(effect, row.agentRunId!) : ledger.apply(effect);
        if (TARS_GRANTING_OPERATIONS.has(request.operation)) held.delete(id);
        // Start now prepares and starts the run next on its responsibility queue, bypassing
        // the configured admission limit. It runs after this control settles, so a pause or cancel clicked
        // during preparation is admitted (it holds the work) instead of refused as in flight.
        if (request.operation === "startNow") void enqueue(id, async () => {
          const started = ports.store.get(id);
          if (started?.state === "preparing" && !started.agentRunId && !stopped && !held.has(id)) await prepare(started);
        }).catch((error) => ports.onError?.(error));
        requestTick();
        return outcome;
      }).catch(settle).finally(() => {
        inflight.delete(id);
        // Kept only while the outcome is unsaved (a lock wait), so that request's retry saves it without a second effect.
        try { if (ledger.settled()) sentEffects.delete(ledger.key); } catch { /* An unreadable outcome keeps the mark: a retry must not send twice. */ }
        const state = ports.store.get(id)?.state;
        if (state !== "paused" && state !== "takenOver") held.delete(id);
      });
      inflight.set(id, { key: ledger.key, promise });
      return promise;
    },
  };
}
