import { describe, expect, test } from "bun:test";
import { waitForSteerDelivery } from "@/lib/providers/steer-delivery";
import { submitSteerWithDeadline } from "@/store/steer-submit";

describe("waitForSteerDelivery", () => {
  test("returns a responder result received before the deadline", async () => {
    const result = await waitForSteerDelivery({
      response: Promise.resolve({ ok: true as const }),
      timeoutMs: 50,
    });

    expect(result).toEqual({
      status: "resolved",
      value: { ok: true },
    });
  });

  test("propagates responder failures", async () => {
    await expect(
      waitForSteerDelivery({
        response: Promise.reject(new Error("transport closed")),
        timeoutMs: 50,
      }),
    ).rejects.toThrow("transport closed");
  });

  test("returns delivery-unknown when the responder misses the deadline", async () => {
    const result = await waitForSteerDelivery({
      response: new Promise(() => {}),
      timeoutMs: 5,
    });

    expect(result).toEqual({ status: "timed-out" });
  });
});

describe("submitSteerWithDeadline", () => {
  const request = {
    turnId: "turn-1",
    text: "Steer this",
    clientMessageId: "client-1",
  };

  test("returns an accepted acknowledgement", async () => {
    const result = await submitSteerWithDeadline({
      request,
      send: async () => ({
        ok: true,
        delivery: "accepted",
        message: "accepted",
      }),
      timeoutMs: 50,
    });

    expect(result.delivery).toBe("accepted");
  });

  test("maps a transport rejection to rejected delivery", async () => {
    const result = await submitSteerWithDeadline({
      request,
      send: async () => {
        throw new Error("host unavailable");
      },
      timeoutMs: 50,
    });

    expect(result).toMatchObject({ ok: false, delivery: "rejected" });
  });

  test("bounds an unresponsive host call as delivery-unknown", async () => {
    const result = await submitSteerWithDeadline({
      request,
      send: async () => new Promise(() => {}),
      timeoutMs: 5,
    });

    expect(result).toMatchObject({ ok: false, delivery: "unknown" });
  });
});
