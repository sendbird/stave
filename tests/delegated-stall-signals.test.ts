import { expect, test } from "bun:test";
import { delegatedStallReceipt } from "../electron/host-service/delegated-task-signals";

const receipt = (code: string, key: string, executionId = "exec-1") => ({ type: "waiting", executionId, idempotencyKey: key, detail: { code } });

test("only the latest child wait decides whether a waiting step is a stall", () => {
  const waiting = { status: "waiting", executionId: "exec-1" };
  const person = receipt("child-agent-run-waiting", "child:exec-1:waiting:3");
  expect(delegatedStallReceipt([person], waiting)).toBe(person);
  // Reported in review: a child that resumed and now waits for a usage reset was read as the earlier stall.
  expect(delegatedStallReceipt([person, { type: "resumed", executionId: "exec-1", idempotencyKey: "r", detail: null },
    receipt("child-agent-run-usage-reset", "child:exec-1:waiting:5")], waiting)).toBeNull();
  // A later stall after the reset is a new one with its own key.
  const again = receipt("child-agent-run-waiting", "child:exec-1:waiting:8");
  expect(delegatedStallReceipt([person, receipt("child-agent-run-usage-reset", "child:exec-1:waiting:5"), again], waiting)).toBe(again);
  // Another execution's wait, or a step that is not waiting, is no stall.
  expect(delegatedStallReceipt([receipt("child-agent-run-waiting", "k", "exec-0")], waiting)).toBeNull();
  expect(delegatedStallReceipt([person], { status: "running", executionId: "exec-1" })).toBeNull();
});
