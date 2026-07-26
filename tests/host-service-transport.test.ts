import { describe, expect, test } from "bun:test";
import {
  HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS,
  shouldBypassOutboundQueueLimit,
  truncateHostServiceErrorMessage,
} from "../electron/shared/host-service-transport";

describe("shouldBypassOutboundQueueLimit", () => {
  test("lets an error response through so a waiting caller always settles", () => {
    // The regression this guards: a saturated outbound queue rejected the
    // success response, the replacement error response hit the same cap, the
    // failure was swallowed, and the caller's promise never settled at all.
    expect(
      shouldBypassOutboundQueueLimit({ type: "response", ok: false }),
    ).toBe(true);
  });

  test("keeps success responses and events subject to backpressure", () => {
    expect(shouldBypassOutboundQueueLimit({ type: "response", ok: true })).toBe(
      false,
    );
    expect(shouldBypassOutboundQueueLimit({ type: "event" })).toBe(false);
    expect(shouldBypassOutboundQueueLimit({ type: "ready" })).toBe(false);
  });
});

describe("truncateHostServiceErrorMessage", () => {
  test("leaves ordinary messages untouched", () => {
    expect(truncateHostServiceErrorMessage("boom")).toBe("boom");
  });

  test("bounds the payload so bypassing the queue cap stays safe", () => {
    const truncated = truncateHostServiceErrorMessage(
      "x".repeat(HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS * 2),
    );

    expect(truncated).toHaveLength(HOST_SERVICE_ERROR_MESSAGE_MAX_CHARS + 1);
    expect(truncated.endsWith("…")).toBe(true);
  });
});
