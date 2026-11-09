import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  buildFleetAttentionProjection,
  FLEET_ATTENTION_TIER,
  type FleetAttentionItem,
  type FleetLiveWorkspaceInput,
} from "@/lib/fleet/attention-projection";
import { resolveFleetQueueStatus, resolveTarsSourceStatus } from "@/lib/fleet/fleet-queue-status";
import { describeFleetAttentionPrimaryAction, FLEET_ATTENTION_KIND_LABEL } from "@/lib/fleet/fleet-vocabulary";
import { buildFleetInbox, countUnansweredInteractions, selectBellEntries } from "@/lib/fleet/inbox-model";
import { isFleetAnswerNeed } from "@/lib/fleet/task-rows";
import { confirmFleetTarsDecision } from "@/lib/fleet/tars-decision-confirm";
import { classifyWorkQueueLane } from "@/lib/fleet/work-attention-order";
import { collectTarsAttention, selectTarsAttentionRows } from "@/lib/tars/attention";
import { tarsConfirmationRequestId, type TarsActInput, type TarsActionRecord } from "@/lib/tars/conversation";
import type { TarsBridgeApi, TarsPendingDecision, TarsResponsibility, TarsSnapshot } from "@/lib/tars/types";
import { readTarsSnapshot, useTarsSnapshotStore } from "@/store/tars-snapshot-store";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { ChatMessage, Task } from "@/types/chat";
import { TARS_AT, tarsResponsibility } from "./fixtures/tars-host-bridge";

const SINCE = "2026-11-05T00:10:00.000Z";

function snapshot(responsibilities: TarsResponsibility[], pendingDecisions: TarsPendingDecision[] = []): TarsSnapshot {
  return {
    identity: { id: "personal", name: "Tars", instructions: "", updatedAt: TARS_AT },
    responsibilities,
    pendingDecisions,
    runtime: "desktop",
  };
}

function decision(overrides: Partial<TarsPendingDecision> = {}): TarsPendingDecision {
  return { responsibilityId: "goal", messageId: "message-1", actionIndex: 0, operation: "resume", expectedRevision: 4, proposedAt: SINCE, ...overrides };
}

/** The live workspace `ws-1` with `task-1`, whose last turn failed. */
function failedLiveWorkspace(): FleetLiveWorkspaceInput {
  const task = { id: "task-1", title: "Verified result", provider: "codex", updatedAt: TARS_AT, unread: false, archivedAt: null,
    controlMode: "interactive", controlOwner: "stave" } as Task;
  const failed: ChatMessage = { id: "message-failed", role: "assistant", model: "gpt-5.5", providerId: "codex", content: "", turnId: "turn-1",
    isStreaming: false, completedAt: TARS_AT, terminalReceipt: { completedAt: TARS_AT, outcome: "failed", error: "Run failed" },
    parts: [{ type: "system_event", content: "[error] Run failed" }] } as ChatMessage;
  return { repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceId: "ws-1", workspaceName: "Checkout", tasks: [task],
    messagesByTask: { "task-1": [failed] }, activeTurnIdsByTask: {}, providerTurnActivityByTask: {} };
}

/** An unread finished turn of `task-1`: a review-tier row on the blocked task. */
function finishedTurn(): AppNotification {
  return { id: "notification-result", kind: "task.turn_completed", title: "Verified result", body: "Done.", repositoryPath: "/tmp/repo",
    repositoryName: "repo", workspaceId: "ws-1", workspaceName: "Checkout", taskId: "task-1", taskTitle: "Verified result", turnId: "turn-9",
    providerId: "codex", action: null, payload: {}, createdAt: SINCE, readAt: null, resolvedAt: null, expiresAt: null } as AppNotification;
}

function project(args: { tars: TarsSnapshot; live?: FleetLiveWorkspaceInput[]; snoozed?: string[]; known?: string[]; notifications?: AppNotification[] }) {
  return buildFleetAttentionProjection({
    notifications: args.notifications ?? [],
    liveWorkspaces: args.live ?? [],
    prWorkspaces: [],
    knownWorkspaceIds: args.known ? new Set(args.known) : undefined,
    tarsAttention: collectTarsAttention(args.tars),
    workspaceNamesById: new Map([["ws-1", { repositoryName: "repo", workspaceName: "Checkout" }]]),
    snoozedAttentionIds: args.snoozed ? new Set(args.snoozed) : undefined,
  });
}

beforeEach(async () => {
  await applyAppLocale("en");
});

describe("Tars attention in Fleet's projection", () => {
  test("a run that ended without meeting its criteria is a blocking row until Tars settles it", () => {
    const projection = project({ tars: snapshot([tarsResponsibility({ state: "blocked" })]) });
    expect(projection.blockingItems).toHaveLength(1);
    const [row] = projection.blockingItems;
    expect(row).toMatchObject({
      id: "tars:blocked:goal:4", kind: "tars-blocked", source: "tars", tarsResponsibilityId: "goal",
      workspaceId: "ws-1", workspaceName: "Checkout", repositoryName: "repo", taskId: "task-1", taskTitle: "Verified result",
      waitingSince: TARS_AT,
    });
    expect(row!.detail).toBe("Tars stopped this work and waits for your decision.");
    // It never ages out: the same snapshot keeps the row.
    expect(project({ tars: snapshot([tarsResponsibility({ state: "blocked" })]) }).items.map((item) => item.id)).toEqual(["tars:blocked:goal:4"]);
    expect(project({ tars: snapshot([tarsResponsibility({ state: "running" })]) }).items).toEqual([]);
  });

  test("a proposed control waits as a decision with what Confirm needs", () => {
    const projection = project({ tars: snapshot([tarsResponsibility({ state: "paused" })], [decision()]) });
    expect(projection.blockingItems.map((item) => item.kind)).toEqual(["tars-decision"]);
    expect(projection.blockingItems[0]).toMatchObject({
      id: "tars:decision:message-1:0", tarsResponsibilityId: "goal",
      tarsDecision: { messageId: "message-1", actionIndex: 0, operation: "resume", expectedRevision: 4 },
      waitingSince: SINCE,
      detail: "Tars proposes to resume this work.",
    });
  });

  test("one fact, one row: a blocked row gives way to another row on its task, a decision never does", () => {
    const blockedWithFailure = project({ tars: snapshot([tarsResponsibility({ state: "blocked" })]), live: [failedLiveWorkspace()] });
    expect(blockedWithFailure.items.map((item) => item.kind)).toEqual(["run-failed"]);

    const blockedWithDecision = project({ tars: snapshot([tarsResponsibility({ state: "blocked" })], [decision()]) });
    expect(blockedWithDecision.items.map((item) => item.kind)).toEqual(["tars-decision"]);

    const decisionWithFailure = project({ tars: snapshot([tarsResponsibility({ state: "paused" })], [decision()]), live: [failedLiveWorkspace()] });
    expect(decisionWithFailure.items.map((item) => item.kind).sort()).toEqual(["run-failed", "tars-decision"]);

    // Work without a task yet has no other row to speak for it.
    const noTask = project({ tars: snapshot([tarsResponsibility({ state: "blocked", taskId: null })]) });
    expect(noTask.items.map((item) => [item.kind, item.taskId])).toEqual([["tars-blocked", undefined]]);
  });

  test("a review row never speaks for blocked work, snoozed or not", () => {
    const tars = snapshot([tarsResponsibility({ state: "blocked" })]);
    const withResult = project({ tars, notifications: [finishedTurn()] });
    expect(withResult.blockingItems.map((item) => item.kind)).toEqual(["tars-blocked"]);
    expect(withResult.reviewItems.map((item) => item.kind)).toEqual(["result-ready"]);
    // Snoozing the result hides only the result; the stopped work still waits.
    const resultSnoozed = project({ tars, notifications: [finishedTurn()], snoozed: ["turn:result-ready:ws-1:task-1:turn-9"] });
    expect(resultSnoozed.items.map((item) => item.kind)).toEqual(["tars-blocked"]);
    // So the tray keeps the card under "needs you".
    expect([...selectTarsAttentionRows(resultSnoozed.items, tars.responsibilities).responsibilityIds]).toEqual(["goal"]);
  });

  test("snoozing works by id and a snoozed row still speaks for its task", () => {
    const tars = snapshot([tarsResponsibility({ state: "blocked" })]);
    const snoozed = project({ tars, snoozed: ["tars:blocked:goal:4"] });
    expect(snoozed.items).toEqual([]);
    expect(snoozed.snoozedItems.map((item) => item.id)).toEqual(["tars:blocked:goal:4"]);
    // The failure is snoozed; the blocked row does not bring the same fact back.
    const failureSnoozed = project({ tars, live: [failedLiveWorkspace()], snoozed: ["turn:run-failed:ws-1:task-1:turn-1"] });
    expect(failureSnoozed.items).toEqual([]);
  });

  test("Tars rows are Tars's own truth, not filtered by the workspace inventory", () => {
    const projection = project({ tars: snapshot([tarsResponsibility({ state: "blocked" })]), known: ["another"] });
    expect(projection.items.map((item) => item.kind)).toEqual(["tars-blocked"]);
  });

  test("the tray reads the same rows as Fleet", () => {
    const tars = snapshot([tarsResponsibility({ state: "paused" })], [decision()]);
    const projection = project({ tars });
    const selected = selectTarsAttentionRows(projection.items, tars.responsibilities);
    expect(selected.rows).toEqual(projection.items);
    expect([...selected.responsibilityIds]).toEqual(["goal"]);
  });
});

describe("Tars kinds across Fleet's consumers", () => {
  test("both kinds are blocking, labeled in English and Korean, and lead the work queue", async () => {
    expect(FLEET_ATTENTION_TIER["tars-decision"]).toBe("blocking");
    expect(FLEET_ATTENTION_TIER["tars-blocked"]).toBe("blocking");
    expect(FLEET_ATTENTION_KIND_LABEL["tars-decision"]).toBe("Tars decision");
    expect(FLEET_ATTENTION_KIND_LABEL["tars-blocked"]).toBe("Tars blocked");
    expect(describeFleetAttentionPrimaryAction("tars-decision")).toBe("Review Tars decision");
    await applyAppLocale("ko");
    expect(FLEET_ATTENTION_KIND_LABEL["tars-decision"]).toBe("Tars 결정");
    expect(FLEET_ATTENTION_KIND_LABEL["tars-blocked"]).toBe("Tars 진행 불가");
    expect(describeFleetAttentionPrimaryAction("tars-blocked")).toBe("진행이 멈춘 Tars 작업 열기");
    expect(classifyWorkQueueLane({ attentionKind: "tars-blocked" })).toBe("action-required");
    expect(classifyWorkQueueLane({ attentionKind: "tars-decision", status: "running" })).toBe("action-required");
  });

  test("the inbox and the bell carry Tars rows; a decision is an answer, blocked work an error", () => {
    const projection = project({ tars: snapshot([tarsResponsibility({ state: "paused" }), tarsResponsibility({ id: "other", taskId: "task-2", state: "blocked" })], [decision()]) });
    const inbox = buildFleetInbox({ items: projection.items, notifications: [] });
    // Same urgency, so the longer wait (the blocked work) comes first.
    expect(inbox.itemEntries.map((entry) => [entry.kind, entry.tier, entry.error, entry.unread])).toEqual([
      ["tars-blocked", "blocking", true, false],
      ["tars-decision", "blocking", false, false],
    ]);
    expect(selectBellEntries(inbox, "errors").map((entry) => entry.kind)).toEqual(["tars-blocked"]);
    expect(countUnansweredInteractions(projection.items)).toBe(1);
    expect(projection.items.map((item) => isFleetAnswerNeed(item))).toEqual([false, true]);
  });

  test("the queue is not all clear before the Tars snapshot answers", () => {
    const base = { blockingCount: 0, itemCount: 0, resultReviews: { tracked: false, loaded: true, error: "" }, notifications: "ready" as const };
    expect(resolveFleetQueueStatus({ ...base, tars: "pending" })).toBe("checking");
    expect(resolveFleetQueueStatus({ ...base, tars: "error" })).toBe("incomplete");
    expect(resolveFleetQueueStatus({ ...base, tars: "ready" })).toBe("clear");
    expect(resolveFleetQueueStatus({ ...base, blockingCount: 1, itemCount: 1, tars: "pending" })).toBe("next");
  });

  test("a Tars read that never settles stops holding the queue, and a snapshot recovers it", () => {
    const status = (overrides: Partial<Parameters<typeof resolveTarsSourceStatus>[0]>) =>
      resolveTarsSourceStatus({ hasBridge: true, hasSnapshot: false, failed: false, waitedOut: false, ...overrides });
    // No Tars at all: nothing to wait for.
    expect(status({ hasBridge: false })).toBe("ready");
    expect(status({})).toBe("pending");
    // The wait ran out or the read failed: not fully checked, never clear.
    expect(status({ waitedOut: true })).toBe("error");
    expect(status({ failed: true })).toBe("error");
    // A snapshot from any read or push answers it.
    expect(status({ waitedOut: true, failed: true, hasSnapshot: true })).toBe("ready");
  });
});

describe("Confirm on a Tars decision row", () => {
  const initial = useTarsSnapshotStore.getState();
  afterEach(() => useTarsSnapshotStore.setState(initial, true));

  function record(input: TarsActInput, status: TarsActionRecord["status"], reason: TarsActionRecord["reason"] = null): TarsActionRecord {
    return { requestId: input.requestId, source: input.source, requestHash: "a".repeat(64),
      action: { kind: "control", responsibilityId: input.responsibilityId, expectedRevision: input.expectedRevision, operation: input.operation },
      status, error: status === "rejected" ? "refused" : null, reason, revision: 5, createdAt: TARS_AT, updatedAt: TARS_AT };
  }

  function bridge(args: { current: TarsSnapshot; after?: TarsSnapshot; status?: TarsActionRecord["status"]; reason?: TarsActionRecord["reason"]; throws?: Error }) {
    const acts: TarsActInput[] = [];
    let state = args.current;
    const api: TarsBridgeApi = {
      get: async () => state,
      create: () => Promise.reject(new Error("unexpected")),
      updateIdentity: () => Promise.reject(new Error("unexpected")),
      act: async (input) => {
        acts.push(input);
        if (args.throws) throw args.throws;
        state = args.after ?? state;
        return { record: record(input, args.status ?? "applied", args.reason ?? null), snapshot: state };
      },
    };
    return { api, acts };
  }

  const waiting = snapshot([tarsResponsibility({ state: "paused" })], [decision()]);
  const item = (): FleetAttentionItem => project({ tars: waiting }).items[0]!;

  test("sends the proposal's own request id through Tars, from Fleet, and publishes what the host settled", async () => {
    const settled = snapshot([tarsResponsibility({ state: "running", revision: 5 })]);
    const { api, acts } = bridge({ current: waiting, after: settled });
    expect(await confirmFleetTarsDecision(item(), api)).toEqual({ ok: true });
    expect(acts).toEqual([{ requestId: tarsConfirmationRequestId("message-1", 0), responsibilityId: "goal", expectedRevision: 4,
      operation: "resume", source: "fleet" }]);
    expect(useTarsSnapshotStore.getState().snapshot).toEqual(settled);
    expect(collectTarsAttention(useTarsSnapshotStore.getState().snapshot)).toEqual([]);
  });

  test("checks with a fresh read, not one that started before the proposal existed", async () => {
    const { api, acts } = bridge({ current: waiting });
    // A read already in flight answers with the snapshot from before the proposal.
    let releaseOld!: (value: TarsSnapshot) => void;
    const realGet = api.get;
    let calls = 0;
    api.get = () => (calls++ === 0 ? new Promise<TarsSnapshot>((resolve) => { releaseOld = resolve; }) : realGet());
    const inFlight = readTarsSnapshot(api);
    expect(await confirmFleetTarsDecision(item(), api)).toEqual({ ok: true });
    expect(acts).toHaveLength(1);
    releaseOld(snapshot([tarsResponsibility({ state: "paused" })]));
    await inFlight;
  });

  test("re-reads the proposal first and never sends a stale one", async () => {
    const moved = snapshot([tarsResponsibility({ state: "running", revision: 5 })], [decision()]);
    const { api, acts } = bridge({ current: moved });
    expect(await confirmFleetTarsDecision(item(), api)).toEqual({ ok: false, reasonKey: "shell:tars.controlReasons.stale" });
    expect(acts).toEqual([]);
  });

  test("a refusal and a failed request come back as translation keys", async () => {
    const refused = bridge({ current: waiting, status: "rejected", reason: "notResumable" });
    expect(await confirmFleetTarsDecision(item(), refused.api)).toEqual({ ok: false, reasonKey: "shell:tars.controlReasons.notResumable" });
    const failed = bridge({ current: waiting, throws: new Error("transport") });
    expect(await confirmFleetTarsDecision(item(), failed.api)).toEqual({ ok: false, reasonKey: "shell:tars.controlReasons.unknown" });
    expect(await confirmFleetTarsDecision(item(), undefined)).toEqual({ ok: false, reasonKey: "shell:tars.controlReasons.unknown" });
  });
});
