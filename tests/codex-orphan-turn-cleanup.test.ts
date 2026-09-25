import { expect, test } from "bun:test";
import {
  beginCodexInterruptedThreadCleanup,
  canResumeCodexThreadAfterInterrupt,
  createCodexOrphanTurnCleanup,
} from "../electron/providers/codex-orphan-turn-cleanup";

test("interrupted thread waits for matching native completion, not interrupt RPC ack", async () => {
  let notify: (message: { method: string; params: unknown }) => void = () => {};
  let interrupted = false;
  const cleanup = createCodexOrphanTurnCleanup({
    threadId: "test-native-wait",
    subscribe: (listener) => { notify = listener; return () => {}; },
    interrupt: async () => { interrupted = true; },
    graceMs: 100,
  });
  const finish = beginCodexInterruptedThreadCleanup("test-native-wait");
  const settled = cleanup.settle(Promise.resolve({ turn: { id: "turn-active" } }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(interrupted).toBe(true);
  let admitted = false;
  const admission = canResumeCodexThreadAfterInterrupt("test-native-wait").then(() => { admitted = true; });
  notify({ method: "turn/completed", params: { threadId: "test-native-wait", turn: { id: "turn-other" } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(admitted).toBe(false);
  notify({ method: "turn/completed", params: { threadId: "test-native-wait", turn: { id: "turn-active" } } });
  finish(await settled);
  await admission;
  expect(admitted).toBe(true);
  cleanup.dispose();
});

test("unresolved turn/start times out and quarantines its native thread", async () => {
  const cleanup = createCodexOrphanTurnCleanup({
    threadId: "test-native-timeout",
    subscribe: () => () => {},
    interrupt: async () => {},
    graceMs: 20,
  });
  const finish = beginCodexInterruptedThreadCleanup("test-native-timeout");
  const safe = await cleanup.settle(new Promise<{ turn: { id: string } }>(() => {}));
  finish(safe);
  expect(safe).toBe(false);
  expect(await canResumeCodexThreadAfterInterrupt("test-native-timeout")).toBe(false);
  cleanup.dispose();
});

test("overlapping cleanup barriers remain closed until every interruption settles", async () => {
  const first = beginCodexInterruptedThreadCleanup("test-native-overlap");
  const admission = canResumeCodexThreadAfterInterrupt("test-native-overlap");
  const second = beginCodexInterruptedThreadCleanup("test-native-overlap");
  let admitted = false;
  void admission.then(() => { admitted = true; });
  second(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(admitted).toBe(false);
  first(true);
  expect(await admission).toBe(true);
  expect(await canResumeCodexThreadAfterInterrupt("test-native-overlap")).toBe(true);
});
