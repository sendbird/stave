import { describe, expect, test } from "bun:test";
import type { ProviderSteerTurnResponse } from "@/lib/providers/provider.types";
import { createSteerQueueReservations } from "@/store/steer-queue-reservations";

const REQUEST = {
  turnId: "turn-1",
  text: "Steered follow-up",
  enabled: true,
};

const TARGET = { taskId: "task-1", queuedTurnId: "queued-1" };

function createDeferredSteer() {
  let resolveSteer: (value: ProviderSteerTurnResponse) => void = () => {};
  const pending = new Promise<ProviderSteerTurnResponse>((resolve) => {
    resolveSteer = resolve;
  });
  return {
    send: () => pending,
    settle: (value: ProviderSteerTurnResponse) => resolveSteer(value),
  };
}

describe("steer queue reservations", () => {
  test("holds a queued item against every dispatch path until delivery resolves", async () => {
    const reservations = createSteerQueueReservations();
    const steer = createDeferredSteer();

    const submission = reservations.submitSteer({
      taskId: TARGET.taskId,
      queuedTurnId: TARGET.queuedTurnId,
      request: REQUEST,
      send: steer.send,
    });

    // The reservation must exist BEFORE the acknowledgement lands: the running
    // turn can finish inside the ack window, and turn completion drains the
    // queue — the item being steered has to be invisible to that drain.
    expect(reservations.blocksDispatch(TARGET)).toBe(true);
    // "wait", not "skip": the ack has a deadline, so the queue keeps FIFO
    // order and holds this item's place instead of starting the one behind it.
    expect(reservations.getAutoDispatchHold(TARGET)).toBe("wait");
    // Other items are untouched.
    expect(
      reservations.getAutoDispatchHold({
        taskId: TARGET.taskId,
        queuedTurnId: "queued-2",
      }),
    ).toBeUndefined();
    // So are same-id items in another task.
    expect(
      reservations.getAutoDispatchHold({
        taskId: "task-2",
        queuedTurnId: TARGET.queuedTurnId,
      }),
    ).toBeUndefined();

    steer.settle({ ok: true, delivery: "accepted" });
    await expect(submission).resolves.toMatchObject({ ok: true });

    // Accepted: the caller drops the item from the queue in the same tick, so
    // the hold is done.
    expect(reservations.blocksDispatch(TARGET)).toBe(false);
    expect(reservations.getAutoDispatchHold(TARGET)).toBeUndefined();
  });

  test("releases the hold when the provider rejects, so the item queues normally again", async () => {
    const reservations = createSteerQueueReservations();

    const result = await reservations.submitSteer({
      taskId: TARGET.taskId,
      queuedTurnId: TARGET.queuedTurnId,
      request: REQUEST,
      send: async () => ({
        ok: false,
        delivery: "rejected",
        message: "turn not steerable",
      }),
    });

    expect(result).toMatchObject({ ok: false, delivery: "rejected" });
    expect(reservations.blocksDispatch(TARGET)).toBe(false);
    expect(reservations.getAutoDispatchHold(TARGET)).toBeUndefined();
  });

  test("keeps an unconfirmed steer out of automatic dispatch while leaving manual sends open", async () => {
    const reservations = createSteerQueueReservations();

    const result = await reservations.submitSteer({
      taskId: TARGET.taskId,
      queuedTurnId: TARGET.queuedTurnId,
      request: REQUEST,
      send: async () => ({ ok: false, delivery: "unknown" }),
    });

    expect(result).toMatchObject({ ok: false, delivery: "unknown" });
    // The provider may have taken the text, so turn completion must not run it
    // a second time — but the user, who was told delivery is unconfirmed, can
    // still send or re-steer it deliberately.
    // "skip", not "wait": nothing will resolve this on its own, so the rest of
    // the queue must not be stalled behind it.
    expect(reservations.getAutoDispatchHold(TARGET)).toBe("skip");
    expect(reservations.blocksDispatch(TARGET)).toBe(false);
  });

  test("steering the composer reserves nothing, since no queue item is at stake", async () => {
    const reservations = createSteerQueueReservations();
    const steer = createDeferredSteer();

    const submission = reservations.submitSteer({
      taskId: TARGET.taskId,
      request: REQUEST,
      send: steer.send,
    });

    expect(reservations.getAutoDispatchHold(TARGET)).toBeUndefined();
    steer.settle({ ok: true, delivery: "accepted" });
    await expect(submission).resolves.toMatchObject({ ok: true });
  });
});
