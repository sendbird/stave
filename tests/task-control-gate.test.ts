import { expect, test } from "bun:test";
import { TaskControlGate } from "../electron/host-service/task-control-gate";

test("takeover blocks new managed starts and invalidates an already prepared start", async () => {
  const gate = new TaskControlGate();
  const release = gate.acquireStart("task");
  const generation = gate.capture("task");
  expect(() => gate.acquireStart("task")).toThrow("already being prepared");
  const finish = gate.beginTakeover("task");
  expect(() => gate.acquireStart("task")).toThrow("takeover is in progress");
  expect(() => gate.assertCurrent("task", generation)).toThrow(
    "control changed",
  );
  let drained = false;
  const waiting = gate.waitForStart("task").then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  release();
  await waiting;
  expect(drained).toBe(true);
  finish();
  expect(() => gate.assertCurrent("task", generation)).toThrow(
    "control changed",
  );
  expect(() => gate.assertCurrent("other-task", 0)).not.toThrow();
});
