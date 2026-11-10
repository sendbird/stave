import { expect, test } from "bun:test";
import { canUndoTarsAction } from "../src/lib/tars/action-undo";
import { TarsActionRecordSchema } from "../src/lib/tars/conversation";

const at = "2026-11-12T00:00:00.000Z";
test("the existing action Undo contract offers withdrawal for a recorded pending message", () => {
  const record = TarsActionRecordSchema.parse({ requestId: "follow-up", requestHash: "a".repeat(64), source: "click",
    action: { kind: "control", responsibilityId: "work", expectedRevision: 1, operation: "message", input: { text: "Correct the result" } },
    status: "applied", reason: null, error: null, revision: 2, createdAt: at, updatedAt: at,
    delivery: { status: "queued", agentRunId: "completed-run", reason: null, error: null, queuedAt: at, updatedAt: at } });
  expect(canUndoTarsAction(record)).toBe(true);
});
