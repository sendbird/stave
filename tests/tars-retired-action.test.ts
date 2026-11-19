import { afterEach, expect, spyOn, test } from "bun:test";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { followUpFixture, START } from "./tars-follow-up-fixture";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

const retired = { kind: "retired" as const };
const clear = { kind: "clear" as const, scopes: ["conversation" as const] };
const delegate = { kind: "delegate" as const, workspaceId: "source", title: "Repair search", instruction: "Repair search and verify it.",
  acceptanceCriteria: ["Search works"], priority: 50 };

/** A saved reply whose first action was of a kind Stave removed, stopped after each remaining intent was saved and before either settled. */
function interrupted() {
  const f = followUpFixture(); cleanup.push(f.close);
  const queued = f.conversations.create({ requestId: "interrupted", text: "Clear the conversation and repair search." }, START);
  const message = f.conversations.answer(queued.id, f.conversations.claim(queued.id, queued.revision, START).revision,
    { reply: "On it.", actions: [retired, clear, delegate] }, START);
  f.conversations.recordReceipt(message.id, message.revision, 1, clear, START);
  f.conversations.recordReceipt(message.id, message.revision, 2, delegate, START);
  const receipts = () => f.conversations.listReceipts(message.id).map((receipt) => [receipt.actionIndex, receipt.action.kind, receipt.status]);
  return { ...f, message, receipts };
}

test("a restart resumes the actions after a retired position on the positions they already had", async () => {
  const f = interrupted();
  expect(f.conversations.listPendingActions().map((message) => message.id)).toEqual([f.message.id]);
  const fenced = spyOn(f.conversations, "rejectUnsettledActions");

  f.service.start(); await f.service.whenIdle();

  // Each settles the receipt it had; the retired position takes none and is not waited for.
  expect(f.receipts()).toEqual([[1, "clear", "proposed"], [2, "delegate", "applied"]]);
  // The work keeps the name its position gave it, so it is the same work after any restart.
  expect(f.responsibilities.snapshot().responsibilities.map((row) => row.requestId)).toEqual([`tars-message:${f.message.id}:2`]);
  expect(f.conversations.listPendingActions()).toEqual([]);
  // The reply counted as settled, so nothing was fenced as a failed delivery.
  expect(fenced).not.toHaveBeenCalled();
  expect(f.planner).toEqual([]);
  expect(f.errors).toEqual([]);
});

test("a failed delivery refuses the actions after a retired position and gives that position no receipt", () => {
  const f = interrupted();
  expect(f.conversations.rejectUnsettledActions(f.message.id, f.message.revision, "The host did not answer.", START)).toBe(false);
  expect(f.receipts()).toEqual([[1, "clear", "rejected"], [2, "delegate", "rejected"]]);
  expect(f.conversations.listPendingActions()).toEqual([]);
});

test("the planner cannot return a retired position", () => {
  const decision = parseTarsDecisionOutput(JSON.stringify({ reply: "Done.", actions: [retired] }));
  expect(decision.actions).toEqual([]);
  expect(decision.dropped).toMatchObject([{ index: 0, kind: null, reason: "invalid" }]);
});
