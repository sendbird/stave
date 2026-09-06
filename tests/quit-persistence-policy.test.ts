import { expect, test } from "bun:test";
import { confirmPersistenceBeforeQuit } from "../electron/main/quit-persistence-policy";
import { PersistenceFlushCompleteArgsSchema } from "../electron/main/ipc/schemas";

test("a failed save keeps the app open unless the user chooses to discard", async () => {
  expect(
    await confirmPersistenceBeforeQuit({
      flush: async () => "failed",
      choose: async () => "stay",
    }),
  ).toBe(false);
  expect(
    await confirmPersistenceBeforeQuit({
      flush: async () => "failed",
      choose: async () => "quit",
    }),
  ).toBe(true);
});

test("retry requires a new successful acknowledgement", async () => {
  let attempts = 0;
  let prompts = 0;
  expect(
    await confirmPersistenceBeforeQuit({
      flush: async () => (++attempts === 1 ? "failed" : "flushed"),
      choose: async () => {
        prompts += 1;
        return "retry";
      },
    }),
  ).toBe(true);
  expect(attempts).toBe(2);
  expect(prompts).toBe(1);
});

test("an unanswered flush quits without prompting", async () => {
  let prompted = false;
  expect(
    await confirmPersistenceBeforeQuit({
      flush: async () => "timeout",
      choose: async () => {
        prompted = true;
        return "stay";
      },
    }),
  ).toBe(true);
  expect(prompted).toBe(false);
});

test("malformed or unscoped flush replies cannot settle the current request", () => {
  expect(PersistenceFlushCompleteArgsSchema.safeParse({}).success).toBe(false);
  expect(
    PersistenceFlushCompleteArgsSchema.safeParse({ requestId: 1 }).success,
  ).toBe(false);
  expect(
    PersistenceFlushCompleteArgsSchema.safeParse({
      requestId: 1,
      success: false,
    }).success,
  ).toBe(true);
});
