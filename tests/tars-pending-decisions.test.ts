import { collectTarsAttention } from "../src/lib/tars/attention";
import { collectFleetTarsAttentionItems } from "../src/lib/fleet/attention-projection";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { buildReturnSummary } from "../src/lib/task-context/return-summary";
import { describeReturnSummary } from "../src/components/session/return-summary/return-summary.utils";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { tarsConfirmationRequestId, type TarsActSource, type TarsControlOperation, type TarsDecisionAction } from "../src/lib/tars/conversation";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const LATER = "2026-11-05T00:05:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function fixture(options: { validScope?: boolean } = {}) {
  const database = new Database(":memory:"); databases.push(database);
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  let clock = NOW;
  let requests = 0;
  let validScope = options.validScope !== false;
  const controls: TarsControlOperation[] = [];
  const runtime = createTarsRuntime({
    store, now: () => clock,
    validateScope: async () => { if (!validScope) throw new Error("The source workspace does not belong to this registered repository."); },
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }),
    controlRun: async (_row, operation) => { controls.push(operation); },
  });
  const responsibility = (state: TarsState, completionGoal?: TarsResponsibility["completionGoal"]): TarsResponsibility => {
    const row = store.create({ requestId: `responsibility-${requests++}`, title: "Fix search", instruction: "Fix and verify search.",
      acceptanceCriteria: ["Search works"], completionGoal, workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
    return store.patch(row.id, row.revision, { state, taskId: `tars-${row.id}`, executionWorkspaceId: "execution", agentRunId: "owned-run" }, NOW);
  };
  const submit = async (actions: TarsDecisionAction[]) => {
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6, autonomy: "careful" });
    const queued = conversations.create({ requestId: `message-${requests++}`, text: "다시 맡아줘" }, clock);
    const claimed = conversations.claim(queued.id, queued.revision, clock);
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Confirm to continue.", actions }, clock);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: store, readRegistry: () => [], now: () => clock,
      requestTick: () => runtime.requestTick(), control: runtime.act });
    return message;
  };
  const propose = (row: TarsResponsibility, operation: TarsControlOperation, ...alternatives: TarsControlOperation[]) =>
    submit([operation, ...alternatives].map((each) => ({ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: each })));
  const confirm = (row: TarsResponsibility, messageId: string, operation: TarsControlOperation, source: TarsActSource = "click") =>
    actTars({ requestId: tarsConfirmationRequestId(messageId, 0), responsibilityId: row.id, expectedRevision: row.revision, operation,
      source }, { conversations, runtime, now: () => clock });
  return { database, store, conversations, runtime, responsibility, submit, propose, confirm, controls,
    setClock: (value: string) => { clock = value; }, setValidScope: (value: boolean) => { validScope = value; } };
}

describe("Tars pending decisions in the snapshot", () => {
  test("Tars, Fleet and return summaries use the saved question until its revision moves", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const priorEvidence = "Workspace check: the release command is still waiting for staging.";
    const options = [
      { label: "Cancel", rationale: "Stop this release attempt.",
        effect: { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "cancel" } },
      { label: "Wait", rationale: "Keep the current run paused.", effect: { kind: "reply" } },
    ] satisfies Extract<TarsDecisionAction, { kind: "ask" }>["options"];
    const question = "What should happen to the release?";
    const message = await f.submit([{ kind: "ask", question, priorEvidence, options, recommended: 0 }]);
    const preview = { question, priorEvidence, options: options.map(({ label, rationale }) => ({ label, rationale })), recommended: null };
    const snapshot = await f.runtime.get();
    const signal = collectTarsAttention(snapshot)[0]!;
    const fleet = collectFleetTarsAttentionItems([signal])[0]!;
    const receipt = f.conversations.getReceipt(message.id, 0)!;
    const card = projectTarsDecisions({ messages: [message], receipts: [receipt], records: [], answers: [], activity: [], responsibilities: snapshot.responsibilities })[0]!;
    expect(card).toMatchObject({ ...preview, id: signal.decisionId, state: "waiting" });
    expect(fleet.tarsQuestionPreview).toEqual(preview);
    const summary = buildReturnSummary({ messages: [], record: null, need: fleet, running: false, baseline: { partsByMessage: {}, finished: [] } });
    expect(describeReturnSummary(summary, Date.parse(LATER)).rows[0]).toMatchObject({
      tarsQuestionPreview: preview,
      action: { target: { kind: "tars-decision", responsibilityId: row.id, decisionId: card.id } },
    });
    expect(f.controls).toEqual([]);
    f.store.patch(row.id, row.revision, { state: "running" }, LATER);
    expect(collectTarsAttention(await f.runtime.get())).toEqual([]);
  });

  test.each(["implementation", "pullRequest"] as const)("Fleet shows the same unverified completion choices for %s", async (completionGoal) => {
    const f = fixture();
    const row = f.responsibility("running", completionGoal);
    f.store.patch(row.id, row.revision, { state: "blocked", detailCode: "unverifiedCompletion" }, NOW);
    const snapshot = f.store.snapshot();
    const fleet = collectFleetTarsAttentionItems(collectTarsAttention(snapshot))[0]!;
    const options = fleet.tarsQuestionPreview?.options;
    expect(fleet.tarsQuestionPreview?.recommended).toBeNull();
    expect(options?.map(({ label }) => label)).toEqual(completionGoal === "implementation"
      ? ["Accept as done", "Cancel work", "Ask Tars for new verification work"]
      : ["Cancel work", "Ask Tars for new verification work"]);
    expect(options?.map(({ rationale }) => rationale)).toEqual([
      ...(completionGoal === "implementation" ? ["Completes it without a Stave-verified check."] : []),
      "Ends its supervision. Changes already made stay.",
      "Puts a request for a fresh check in the message box. Nothing runs until you send it.",
    ]);
  });

  test("a proposed control waits in the snapshot with its identity, revision and time", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    f.setClock(LATER);
    const message = await f.propose(row, "resume");
    expect(f.store.snapshot().pendingDecisions).toEqual([{
      responsibilityId: row.id, messageId: message.id, actionIndex: 0, operation: "resume", expectedRevision: row.revision, proposedAt: LATER,
    }]);
    // The runtime's reads carry the same list, so a control result never drops it.
    expect((await f.runtime.get()).pendingDecisions).toHaveLength(1);
  });

  test("controls that apply at once and refused proposals never wait", async () => {
    const f = fixture();
    const running = f.responsibility("running");
    await f.propose(running, "pause");
    await f.runtime.drain();
    // A hand-back of work the user never took over is refused at proposal time.
    await f.propose(f.store.get(running.id)!, "handBack");
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("a confirmed proposal stops waiting", async () => {
    const f = fixture();
    const row = f.responsibility("takenOver");
    const message = await f.propose(row, "handBack");
    expect(f.store.snapshot().pendingDecisions).toHaveLength(1);
    expect((await f.confirm(row, message.id, "handBack")).record.status).toBe("applied");
    expect(f.conversations.getReceipt(message.id, 0)?.status).toBe("applied");
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("a proposal refused at confirmation stops waiting", async () => {
    const f = fixture({ validScope: false });
    const row = f.responsibility("paused");
    const message = await f.propose(row, "resume");
    expect((await f.confirm(row, message.id, "resume")).record).toMatchObject({ status: "rejected", reason: "outOfScope" });
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("a newer proposal for the same responsibility supersedes the older one", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    await f.propose(row, "resume");
    f.setClock(LATER);
    const newer = await f.propose(row, "cancel");
    expect(f.store.snapshot().pendingDecisions).toEqual([expect.objectContaining({ messageId: newer.id, operation: "cancel" })]);
  });

  test("a proposal stops waiting when its responsibility moved on or ended", async () => {
    // Exercise revision changes and ended work independently.
    const f = fixture();
    const moved = f.responsibility("paused");
    await f.propose(moved, "resume");
    expect(f.store.snapshot().pendingDecisions).toHaveLength(1);
    f.store.patch(moved.id, moved.revision, { priority: 80 }, LATER);
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
    const g = fixture();
    const ended = g.responsibility("paused");
    await g.propose(ended, "resume");
    expect(g.store.snapshot().pendingDecisions).toHaveLength(1);
    g.store.patch(ended.id, ended.revision, { state: "cancelled" }, LATER);
    expect(g.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("an unrelated newer message keeps a proposal waiting and confirmable", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const message = await f.propose(row, "resume");
    expect(f.store.snapshot().pendingDecisions).toHaveLength(1);
    // The user says something newer, unrelated to the proposal.
    f.conversations.create({ requestId: "later", text: "What is the release doing now?" }, LATER);
    expect(f.store.snapshot().pendingDecisions).toEqual([expect.objectContaining({ messageId: message.id, responsibilityId: row.id })]);
    expect(f.conversations.isCurrentProposal({ messageId: message.id, actionIndex: 0 })).toBe(true);
    expect((await f.confirm(row, message.id, "resume")).record).toMatchObject({ status: "applied" });
    expect(f.controls).toEqual(["resume"]);
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("a store without the conversation tables has no pending decisions", () => {
    const database = new Database(":memory:"); databases.push(database);
    const store = new TarsStore(database);
    store.create({ requestId: "alone", title: "Fix search", instruction: "Fix and verify search.", acceptanceCriteria: ["Search works"],
      workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
    expect(store.snapshot().pendingDecisions).toEqual([]);
    // The conversation store may open later on the same connection.
    const conversations = new TarsConversationStore(database);
    expect(conversations.list()).toEqual([]);
    expect(store.snapshot().pendingDecisions).toEqual([]);
  });

  test("only the current proposal can be confirmed; a superseded one is refused as stale before the run is touched", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const older = await f.propose(row, "resume");
    const newer = await f.propose(row, "cancel");
    const refused = await f.confirm(row, older.id, "resume");
    expect(refused.record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.controls).toEqual([]);
    expect(f.store.get(row.id)).toEqual(row);
    // The superseded proposal settles with that reason; the current one still waits and applies.
    expect(f.conversations.getReceipt(older.id, 0)).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.store.snapshot().pendingDecisions).toEqual([expect.objectContaining({ messageId: newer.id })]);
    expect((await f.confirm(row, newer.id, "cancel")).record.status).toBe("applied");
    expect(f.controls).toEqual(["cancel"]);
  });

  test("a refused newer proposal never brings the older one back", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const older = await f.propose(row, "resume");
    const newer = await f.propose(row, "resume");
    // Refused at confirmation: the registered scope is gone for this click.
    f.setValidScope(false);
    expect((await f.confirm(row, newer.id, "resume")).record).toMatchObject({ status: "rejected", reason: "outOfScope" });
    f.setValidScope(true);
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
    expect((await f.confirm(row, older.id, "resume")).record).toMatchObject({ status: "rejected", reason: "stale" });
    // Refused when proposed: hand-back of work the user never took over.
    const other = f.responsibility("paused");
    await f.propose(other, "resume");
    await f.propose(other, "handBack");
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("alternatives offered in one message both wait; confirming one retires the other", async () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const message = await f.propose(row, "resume", "cancel");
    expect(f.store.snapshot().pendingDecisions.map((decision) => [decision.actionIndex, decision.operation])).toEqual([[0, "resume"], [1, "cancel"]]);
    expect((await f.confirm(row, message.id, "resume")).record.status).toBe("applied");
    expect(f.store.snapshot().pendingDecisions).toEqual([]);
  });

  test("a confirmation is one decision whichever surface sends it", async () => {
    const f = fixture();
    const row = f.responsibility("takenOver");
    const message = await f.propose(row, "handBack");
    // Fleet and the tray confirm the same proposal while the first is still in flight.
    const [fromFleet, fromTray] = await Promise.all([f.confirm(row, message.id, "handBack", "fleet"), f.confirm(row, message.id, "handBack")]);
    expect(fromFleet.record).toEqual(fromTray.record);
    expect(fromFleet.record).toMatchObject({ status: "applied", source: "fleet" });
    expect(f.controls).toEqual(["handBack"]);
    // A later retry from another surface replays the settled record.
    expect((await f.confirm(row, message.id, "handBack", "task")).record).toEqual(fromFleet.record);
    expect(f.controls).toEqual(["handBack"]);
  });

  test("a pending confirmation joins a retry from another surface but never a different action", () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const requestId = tarsConfirmationRequestId("message", 0);
    const input = { requestId, responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" as const };
    const first = f.conversations.recordAction({ ...input, source: "fleet" }, NOW);
    expect(f.conversations.recordAction({ ...input, source: "click" }, LATER)).toEqual(first);
    expect(() => f.conversations.recordAction({ ...input, operation: "cancel", source: "click" }, LATER)).toThrow("different action");
    expect(() => f.conversations.recordAction({ ...input, expectedRevision: row.revision + 1, source: "fleet" }, LATER)).toThrow("different action");
    // Ordinary clicks keep their source in the identity.
    f.conversations.recordAction({ ...input, requestId: "click-1", source: "click" }, NOW);
    expect(() => f.conversations.recordAction({ ...input, requestId: "click-1", source: "fleet" }, NOW)).toThrow("different action");
  });

  test("a confirmation saved with the earlier source-bound identity still accepts a retry from another surface", () => {
    const f = fixture();
    const row = f.responsibility("paused");
    const requestId = tarsConfirmationRequestId("legacy", 0);
    const action = { kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" as const };
    const record = { requestId, source: "fleet", requestHash: createHash("sha256").update(JSON.stringify({ source: "fleet", action })).digest("hex"),
      action, status: "pending", error: null, reason: null, revision: 1, createdAt: NOW, updatedAt: NOW };
    f.database.prepare("INSERT INTO tars_action_records (request_id, request_hash, revision, created_at, body_json) VALUES (?, ?, ?, ?, ?)")
      .run(requestId, record.requestHash, 1, NOW, JSON.stringify(record));
    expect(f.conversations.recordAction({ requestId, responsibilityId: row.id, expectedRevision: row.revision, operation: "resume", source: "click" }, LATER))
      .toMatchObject({ source: "fleet", status: "pending" });
  });
});
